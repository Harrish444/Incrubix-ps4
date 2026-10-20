import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DbValue = string | number | boolean | null | Date | DbValue[] | Record<string, unknown>;
export type DbRow = Record<string, unknown>;
export type DbResult<T extends DbRow = DbRow> = { rows: T[]; rowCount: number };

export type QueryRunner = {
  query<T extends DbRow = DbRow>(text: string, values?: DbValue[]): Promise<DbResult<T>>;
};

export type Database = {
  query<T extends DbRow = DbRow>(text: string, values?: DbValue[]): Promise<DbResult<T>>;
  getRunner(): QueryRunner;
  backend: 'postgres' | 'supabase-rest';
  available: boolean;
};

/**
 * Build a unified database access layer. Prefers a direct PostgreSQL pool
 * (DATABASE_URL / SUPABASE_DB_URL) when one is reachable, and falls back to
 * the Supabase REST API (anon-key, RLS allows full CRUD for this single-tenant
 * app). This avoids ECONNREFUSED when no local postgres is running.
 */
export async function createDatabase(): Promise<Database> {
  const pgConn = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? '';
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';

  if (pgConn) {
    try {
      const pg = (await import('pg')).default;
      const pool = new pg.Pool({ connectionString: pgConn, connectionTimeoutMillis: 2500 });
      await pool.query('select 1');
      return makePgDatabase(pool);
    } catch {
      // pg configured but unreachable — fall through to supabase if available
    }
  }

  if (supabaseUrl && supabaseAnonKey) {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await client.from('connectors').select('key').limit(1);
    if (!error) return makeSupabaseDatabase(client);
  }

  return makeNoopDatabase();
}

function makePgDatabase(pool: import('pg').Pool): Database {
  const runner: QueryRunner = {
    async query<T extends DbRow = DbRow>(text: string, values: DbValue[] = []): Promise<DbResult<T>> {
      const result = await pool.query<T>(text, values as unknown[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
  return {
    ...runner,
    getRunner() { return runner; },
    backend: 'postgres',
    available: true,
  };
}

function makeSupabaseDatabase(client: SupabaseClient): Database {
  const runner: QueryRunner = {
    async query<T extends DbRow = DbRow>(text: string, values: DbValue[] = []): Promise<DbResult<T>> {
      return supabaseQuery<T>(client, text, values);
    },
  };
  return {
    ...runner,
    getRunner() { return runner; },
    backend: 'supabase-rest',
    available: true,
  };
}

function makeNoopDatabase(): Database {
  const err = () => Promise.reject(new Error('Database is not configured'));
  const runner: QueryRunner = { query: err as never };
  return {
    query: err as never,
    getRunner() { return runner; },
    backend: 'postgres',
    available: false,
  };
}

// --- Supabase REST SQL-over-RPC bridge ---

async function supabaseQuery<T extends DbRow = DbRow>(client: SupabaseClient, sql: string, values: DbValue[] = []): Promise<DbResult<T>> {
  // Try the native PostgREST RPC endpoint first (executes raw SQL server-side).
  // The Supabase project exposes a `query` RPC via the sql-over-rpc pattern only
  // if a SECURITY DEFINER function exists. Since we cannot assume that, we use
  // the table-level REST API for the specific patterns the server uses.
  // Fall back to a structured translation for known query shapes.
  const translated = translateQuery(client, sql, values);
  if (translated) return await translated as DbResult<T>;
  throw new Error(`Unsupported query for supabase-rest backend: ${sql.slice(0, 120)}`);
}

/**
 * Translate the specific SQL patterns used by the server/worker/rules into
 * Supabase REST client calls. Each branch returns the equivalent result shape.
 */
function translateQuery(client: SupabaseClient, sql: string, values: DbValue[]): PromiseLike<DbResult> | null {
  const normalized = sql.trim().replace(/\s+/g, ' ').toLowerCase();

  // --- Worker: claim next queued job ---
  // update publishing_jobs j set status = 'running' ... where j.id = (select id from publishing_jobs where status = 'queued' order by queued_at for update skip locked limit 1) returning ...
  if (normalized.startsWith('update publishing_jobs j set status = \'running\'')) {
    return claimQueuedJob(client);
  }

  // --- Worker: fetch job details ---
  // select j.id, j.destination_id, ... from publishing_jobs j join destinations d ... join destination_renditions r ... join content_items c ... where j.id = $1
  if (normalized.startsWith('select j.id, j.destination_id') && normalized.includes('from publishing_jobs j join')) {
    const jobId = String(values[0]);
    return fetchJobDetails(client, jobId);
  }

  // --- Worker: update job progress/status ---
  if (normalized.startsWith('update publishing_jobs set progress = 45')) {
    const jobId = String(values[0]);
    return client.from('publishing_jobs').update({ progress: 45 }).eq('id', jobId).select('id').then(({ data, error }) => wrapResult(data, error));
  }
  if (normalized.startsWith('update publishing_jobs set status = \'succeeded\'')) {
    const [jobId, platformPostId, liveUrl, result] = values;
    return client.from('publishing_jobs').update({ status: 'succeeded', progress: 100, platform_post_id: platformPostId, live_url: liveUrl, result, completed_at: new Date().toISOString() }).eq('id', String(jobId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }
  if (normalized.startsWith('update publishing_jobs set status = $2')) {
    // Generic status update with error_code/error_message (worker failure/blocked)
    const [jobId, status, errorCode, errorMessage, result] = values;
    const update: Record<string, unknown> = { status, progress: 100, error_code: errorCode, error_message: errorMessage, completed_at: new Date().toISOString() };
    if (result !== undefined) update.result = result;
    return client.from('publishing_jobs').update(update).eq('id', String(jobId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }
  if (normalized.startsWith('update publishing_jobs set status = \'failed\'')) {
    const [jobId, code, message] = values;
    return client.from('publishing_jobs').update({ status: 'failed', progress: 100, error_code: code, error_message: message, completed_at: new Date().toISOString() }).eq('id', String(jobId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Worker: update idempotency outcome ---
  if (normalized.startsWith('update idempotency_records set outcome = $2')) {
    const [jobId, outcome] = values;
    return client.from('idempotency_records').update({ outcome }).eq('job_id', String(jobId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Rules: fetch destination rules ---
  if (normalized.startsWith('select frequency_cap, frequency_window_hours') && normalized.includes('from destination_rules where destination_id = $1')) {
    const destinationId = String(values[0]);
    return client.from('destination_rules').select('frequency_cap,frequency_window_hours,cooldown_hours,self_promo_allowed,link_policy,disclosure_required,automation_allowed,max_title_chars,max_body_chars,allowed_media_types').eq('destination_id', destinationId).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Rules: frequency cap check ---
  if (normalized.startsWith('select count(*) from publishing_jobs where destination_id = $1 and status = \'succeeded\'')) {
    const destinationId = String(values[0]);
    const windowStart = String(values[1]);
    return client.from('publishing_jobs').select('id', { count: 'exact', head: true }).eq('destination_id', destinationId).eq('status', 'succeeded').gte('created_at', windowStart).then(({ count, error }) => wrapResult([{ count: String(count ?? 0) }], error));
  }

  // --- Rules: cooldown check ---
  if (normalized.startsWith('select created_at from publishing_jobs where destination_id = $1 and status = \'succeeded\' order by created_at desc limit 1')) {
    const destinationId = String(values[0]);
    return client.from('publishing_jobs').select('created_at').eq('destination_id', destinationId).eq('status', 'succeeded').order('created_at', { ascending: false }).limit(1).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: select 1 (health) ---
  if (normalized === 'select 1') {
    return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 });
  }

  // --- Server: count from destinations/publishing_jobs ---
  if (normalized === 'select count(*) from destinations') {
    return client.from('destinations').select('id', { count: 'exact', head: true }).then(({ count, error }) => wrapResult([{ count: String(count ?? 0) }], error));
  }
  if (normalized.startsWith("select count(*) from publishing_jobs where created_at >= now() - interval '30 days'")) {
    return client.from('publishing_jobs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).then(({ count, error }) => wrapResult([{ count: String(count ?? 0) }], error));
  }
  if (normalized.startsWith("select count(*) from destinations where certification_status in ('certified','simulated')")) {
    return client.from('destinations').select('id', { count: 'exact', head: true }).in('certification_status', ['certified', 'simulated']).then(({ count, error }) => wrapResult([{ count: String(count ?? 0) }], error));
  }
  if (normalized.startsWith("select count(*) from publishing_jobs where status = 'succeeded' and created_at >= now() - interval '30 days'")) {
    return client.from('publishing_jobs').select('id', { count: 'exact', head: true }).eq('status', 'succeeded').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).then(({ count, error }) => wrapResult([{ count: String(count ?? 0) }], error));
  }

  // --- Server: destinations list with rules join ---
  // SQL: select d.*, r.frequency_cap, r.frequency_window_hours, r.cooldown_hours,
  // r.self_promo_allowed, r.link_policy, r.disclosure_required, r.automation_allowed,
  // r.max_title_chars, r.max_body_chars from destinations d left join destination_rules r ...
  // Only the listed r.* columns should be merged — NOT r.id, r.destination_id, r.created_at, r.updated_at.
  const RULE_FIELDS = ['frequency_cap', 'frequency_window_hours', 'cooldown_hours', 'self_promo_allowed', 'link_policy', 'disclosure_required', 'automation_allowed', 'max_title_chars', 'max_body_chars'];
  function pickRules(raw: unknown): DbRow {
    const ruleRow: DbRow = Array.isArray(raw) ? (raw as DbRow[])[0] ?? {} : (raw as DbRow) ?? {};
    const picked: DbRow = {};
    for (const field of RULE_FIELDS) if (field in ruleRow) picked[field] = ruleRow[field];
    return picked;
  }
  if (normalized.startsWith('select d.*, r.frequency_cap') && normalized.includes('from destinations d left join destination_rules r')) {
    return client.from('destinations').select('*, destination_rules(*)').order('relevance_score', { ascending: false, nullsFirst: false }).then(({ data, error }) => wrapResult((data ?? []).map((item: DbRow) => {
      const rules = pickRules(item.destination_rules);
      const rest = { ...item };
      delete rest.destination_rules;
      return { ...rest, ...rules };
    }), error));
  }

  // --- Server: single destination with rules ---
  if (normalized.startsWith('select d.*, r.* from destinations d left join destination_rules r on r.destination_id = d.id where d.id = $1')) {
    const id = String(values[0]);
    return client.from('destinations').select('*, destination_rules(*)').eq('id', id).then(({ data, error }): DbResult => {
      if (error) return wrapResult([], error);
      const item = (data as DbRow[] | null | undefined)?.[0];
      if (!item) return { rows: [], rowCount: 0 };
      const rules = pickRules(item.destination_rules);
      const rest = { ...item };
      delete rest.destination_rules;
      return { rows: [{ ...rest, ...rules }], rowCount: 1 };
    });
  }

  // --- Server: insert destination ---
  if (normalized.startsWith('insert into destinations (')) {
    return client.from('destinations').insert({
      name: values[0], url: values[1], normalized_url: values[2], platform_key: values[3], surface: values[4],
      category: values[5], audience_tags: values[6], language: values[7], geo: values[8], est_audience: values[9],
      rules_url: values[10], connector_key: values[11], relevance_score: values[12], relevance_reason: values[13], level: values[14],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: insert destination_rules ---
  if (normalized.startsWith('insert into destination_rules (destination_id, frequency_cap')) {
    return client.from('destination_rules').insert({
      destination_id: values[0], frequency_cap: values[1], frequency_window_hours: values[2], cooldown_hours: values[3],
      self_promo_allowed: values[4], link_policy: values[5], disclosure_required: values[6], automation_allowed: values[7],
      max_title_chars: values[8], max_body_chars: values[9], allowed_media_types: values[10],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: update destination (generic) ---
  if (normalized.startsWith('update destinations set ')) {
    // Handled generically — extract set values from the values array.
    // The server builds: update destinations set <fields>, updated_at = now() where id = $N returning id
    // values = [...fieldValues, id] — but we can't parse fields generically from SQL here.
    // This branch is handled in the server's PATCH route via direct supabase calls when pg is down.
    return null;
  }

  // --- Server: upsert destination_rules ---
  if (normalized.startsWith('insert into destination_rules (destination_id, frequency_cap') && normalized.includes('on conflict')) {
    return client.from('destination_rules').upsert({
      destination_id: values[0], frequency_cap: values[1], frequency_window_hours: values[2], cooldown_hours: values[3],
      self_promo_allowed: values[4], link_policy: values[5], disclosure_required: values[6], automation_allowed: values[7],
      max_title_chars: values[8], max_body_chars: values[9], allowed_media_types: values[10],
    }, { onConflict: 'destination_id' }).select('*').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: content_items insert ---
  if (normalized.startsWith('insert into content_items (')) {
    return client.from('content_items').insert({
      title: values[0], body: values[1], canonical_url: values[2], media: values[3], ai_generated: values[4], ai_disclosure: values[5],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: renditions upsert ---
  if (normalized.startsWith('insert into destination_renditions (')) {
    return client.from('destination_renditions').upsert({
      content_item_id: values[0], destination_id: values[1], title: values[2], body: values[3], changes: values[4], validation: values[5],
    }, { onConflict: 'content_item_id,destination_id' }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: publish (insert publishing_jobs) ---
  if (normalized.startsWith('insert into publishing_jobs (destination_id, rendition_id, idempotency_key, simulated)')) {
    return client.from('publishing_jobs').insert({
      destination_id: values[0], rendition_id: values[1], idempotency_key: values[2], simulated: values[3], status: 'queued', progress: 0,
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: idempotency_records insert ---
  if (normalized.startsWith('insert into idempotency_records (')) {
    return client.from('idempotency_records').insert({
      idempotency_key: values[0], request_fingerprint: values[1], job_id: values[2], outcome: values[3],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: idempotency_records lookup ---
  if (normalized.startsWith('select request_fingerprint, job_id from idempotency_records where idempotency_key = $1')) {
    return client.from('idempotency_records').select('request_fingerprint,job_id').eq('idempotency_key', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: get job by id ---
  if (normalized.startsWith('select * from publishing_jobs where id = $1')) {
    return client.from('publishing_jobs').select('*').eq('id', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: certification_runs insert ---
  if (normalized.startsWith('insert into certification_runs (destination_id, connector_key, mode, status, started_at)')) {
    return client.from('certification_runs').insert({
      destination_id: values[0], connector_key: values[1], mode: values[2], status: values[3], started_at: new Date().toISOString(),
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: certification_runs update (success) ---
  if (normalized.startsWith('update certification_runs set status = $2, outcomes = $3, redacted_response = $4, live_url = $5, cleanup_confirmed = $6')) {
    const [runId, status, outcomes, redactedResponse, liveUrl, cleanupConfirmed] = values;
    return client.from('certification_runs').update({ status, outcomes, redacted_response: redactedResponse, live_url: liveUrl, cleanup_confirmed: cleanupConfirmed, completed_at: new Date().toISOString() }).eq('id', String(runId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: certification_runs update (failure) ---
  if (normalized.startsWith('update certification_runs set status = $2, outcomes = $3, failure_reason = $4')) {
    const [runId, status, outcomes, failureReason] = values;
    return client.from('certification_runs').update({ status, outcomes, failure_reason: failureReason, completed_at: new Date().toISOString() }).eq('id', String(runId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: certification_evidence insert ---
  if (normalized.startsWith('insert into certification_evidence (certification_run_id, kind, uri, details)')) {
    return client.from('certification_evidence').insert({
      certification_run_id: values[0], kind: values[1], uri: values[2], details: values[3],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: destinations certification status update ---
  if (normalized.startsWith("update destinations set certification_status = 'simulated'")) {
    const destinationId = String(values[0]);
    return client.from('destinations').update({ certification_status: 'simulated', last_certified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', destinationId).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: certifications list ---
  if (normalized.startsWith('select cr.*, d.name destination_name from certification_runs cr join destinations d')) {
    return client.from('certification_runs').select('*,destinations(name)').order('created_at', { ascending: false }).then(({ data, error }) => wrapResult((data ?? []).map((item: DbRow) => {
      const destName = (item.destinations as DbRow)?.name;
      const rest = { ...item };
      delete rest.destinations;
      return { ...rest, destination_name: destName };
    }), error));
  }

  // --- Server: certification detail with evidence ---
  if (normalized.startsWith('select cr.*, d.name destination_name, ce.kind evidence_kind')) {
    const runId = String(values[0]);
    return client.from('certification_runs').select('*,destinations(name),certification_evidence(kind,uri,details)').eq('id', runId).then(({ data, error }): DbResult => {
      if (error) return wrapResult([], error);
      const item = (data as DbRow[] | null | undefined)?.[0];
      if (!item) return { rows: [], rowCount: 0 };
      const rest = { ...item };
      delete rest.destinations;
      delete rest.certification_evidence;
      const row: DbRow = {
        ...rest,
        destination_name: (item.destinations as DbRow)?.name,
        evidence_kind: (item.certification_evidence as DbRow)?.kind,
        evidence_uri: (item.certification_evidence as DbRow)?.uri,
        evidence_details: (item.certification_evidence as DbRow)?.details,
      };
      return { rows: [row], rowCount: 1 };
    });
  }

  // --- Server: catalogue_imports insert ---
  if (normalized.startsWith('insert into catalogue_imports (filename, status)')) {
    return client.from('catalogue_imports').insert({ filename: values[0], status: values[1] }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: catalogue_imports update (success) ---
  if (normalized.startsWith('update catalogue_imports set status = $2, accepted_rows = $3')) {
    const [importId, status, accepted, duplicates, rejected, duration, manifest] = values;
    return client.from('catalogue_imports').update({ status, accepted_rows: accepted, duplicate_rows: duplicates, rejected_rows: rejected, duration_ms: duration, output_manifest: manifest, completed_at: new Date().toISOString() }).eq('id', String(importId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: catalogue_imports update (failure) ---
  if (normalized.startsWith('update catalogue_imports set status = $2, completed_at = now() where id = $1')) {
    const [importId, status] = values;
    return client.from('catalogue_imports').update({ status, completed_at: new Date().toISOString() }).eq('id', String(importId)).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: catalogue_import_errors insert ---
  if (normalized.startsWith('insert into catalogue_import_errors (import_id,row_number,field,code,message,raw_row)')) {
    return client.from('catalogue_import_errors').insert({
      import_id: values[0], row_number: values[1], field: values[2], code: values[3], message: values[4], raw_row: values[5],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: catalogue import insert destinations (bulk row) ---
  if (normalized.startsWith('insert into destinations (name,url,normalized_url,platform_key,surface,category,audience_tags,language,geo,est_audience,rules_url,connector_key,relevance_score,relevance_reason,level,last_certified_at)')) {
    return client.from('destinations').insert({
      name: values[0], url: values[1], normalized_url: values[2], platform_key: values[3], surface: values[4],
      category: values[5], audience_tags: values[6], language: values[7], geo: values[8], est_audience: values[9],
      rules_url: values[10], connector_key: values[11], relevance_score: values[12], relevance_reason: values[13], level: values[14], last_certified_at: values[15],
    }).select('id').then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: catalogue_imports get ---
  if (normalized.startsWith('select * from catalogue_imports where id = $1')) {
    return client.from('catalogue_imports').select('*').eq('id', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }
  if (normalized.startsWith('select * from catalogue_import_errors where import_id = $1 order by row_number')) {
    return client.from('catalogue_import_errors').select('*').eq('import_id', String(values[0])).order('row_number', { ascending: true }).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: activity logs ---
  if (normalized.startsWith('select * from activity_logs order by created_at desc limit 100')) {
    return client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: connectors ---
  if (normalized.startsWith('select key, name, version, tier, auth, surfaces, capabilities, enabled, simulated, manifest from connectors order by name')) {
    return client.from('connectors').select('key,name,version,tier,auth,surfaces,capabilities,enabled,simulated,manifest').order('name').then(({ data, error }) => wrapResult(data, error));
  }
  if (normalized.startsWith('select * from connectors where key = $1')) {
    return client.from('connectors').select('*').eq('key', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: destination_rules get ---
  if (normalized.startsWith('select * from destination_rules where destination_id = $1')) {
    return client.from('destination_rules').select('*').eq('destination_id', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }

  // --- Server: select destination for validate-rules/certify ---
  if (normalized.startsWith('select id, name, url, connector_key from destinations where id = $1')) {
    return client.from('destinations').select('id,name,url,connector_key').eq('id', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }
  if (normalized.startsWith('select id, connector_key from destinations where id = $1')) {
    return client.from('destinations').select('id,connector_key').eq('id', String(values[0])).then(({ data, error }) => wrapResult(data, error));
  }

  return null;
}

function wrapResult(data: unknown, error: { message: string; code: string } | null): DbResult {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return { rows: (data as DbRow[]) ?? [], rowCount: (data as DbRow[])?.length ?? 0 };
}

/**
 * Extract the underlying SupabaseClient from a supabase-rest Database.
 * Throws if the database is not using the supabase-rest backend.
 */
export function getSupabaseClient(db: Database): SupabaseClient {
  if (db.backend !== 'supabase-rest') throw new Error('Supabase client is only available for the supabase-rest backend');
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
  return createClient(url, key);
}

// --- Worker-specific helpers ---

async function claimQueuedJob(client: SupabaseClient): Promise<DbResult> {
  // Find the oldest queued job and atomically claim it.
  const { data: queued, error: findErr } = await client
    .from('publishing_jobs')
    .select('id')
    .eq('status', 'queued')
    .order('queued_at', { ascending: true })
    .limit(1);
  if (findErr) throw Object.assign(new Error(findErr.message), { code: findErr.code });
  const jobId = queued?.[0]?.id;
  if (!jobId) return { rows: [], rowCount: 0 };
  const { data: claimed, error: claimErr } = await client
    .from('publishing_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), progress: 10 })
    .eq('id', jobId)
    .eq('status', 'queued') // optimistic lock: only claim if still queued
    .select('id,destination_id,rendition_id,idempotency_key')
    .then((r) => ({ ...r, data: r.data as DbRow[] | null }));
  if (claimErr) throw Object.assign(new Error(claimErr.message), { code: claimErr.code });
  return { rows: claimed ?? [], rowCount: claimed?.length ?? 0 };
}

async function fetchJobDetails(client: SupabaseClient, jobId: string): Promise<DbResult> {
  const { data, error } = await client
    .from('publishing_jobs')
    .select('id,destination_id,rendition_id,idempotency_key,destinations(name,url,connector_key),destination_renditions!inner(title,body,canonical_url,media,content_items(canonical_url,ai_generated,ai_disclosure,media))')
    .eq('id', jobId)
    .limit(1);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const job = (data as DbRow[] | null)?.[0];
  if (!job) return { rows: [], rowCount: 0 };
  const dest = job.destinations as DbRow | undefined;
  const rendition = job.destination_renditions as DbRow | undefined;
  const content = rendition?.content_items as DbRow | undefined;
  const row: DbRow = {
    id: job.id,
    destination_id: job.destination_id,
    rendition_id: job.rendition_id,
    idempotency_key: job.idempotency_key,
    destination_name: dest?.name,
    destination_url: dest?.url,
    connector_key: dest?.connector_key,
    title: rendition?.title,
    body: rendition?.body,
    canonical_url: content?.canonical_url,
    ai_generated: content?.ai_generated,
    ai_disclosure: content?.ai_disclosure,
    media: content?.media ?? rendition?.media,
  };
  return { rows: [row], rowCount: 1 };
}
