import type { QueryRunner } from './db.js';
import { CONNECTORS, type Destination, type Rendition } from './connectors/core.js';
import { validatePostingRules } from './rules.js';

type JobRow = { id: string; destination_id: string; rendition_id: string; idempotency_key: string; destination_name: string; destination_url: string; connector_key: string; title: string; body: string; canonical_url?: string; ai_generated: boolean; ai_disclosure?: string; media: Array<{ type: string; url?: string }> };

export async function processNextJob(runner: QueryRunner) {
  const claimed = (await runner.query<JobRow>(`update publishing_jobs j set status = 'running', started_at = now(), progress = 10 where j.id = (select id from publishing_jobs where status = 'queued' order by queued_at for update skip locked limit 1) returning j.id, j.destination_id, j.rendition_id, j.idempotency_key`, [])).rows[0];
  if (!claimed) return false;
  try {
    const job = (await runner.query<JobRow>(`select j.id, j.destination_id, j.rendition_id, j.idempotency_key, d.name destination_name, d.url destination_url, d.connector_key, r.title, r.body, c.canonical_url, c.ai_generated, c.ai_disclosure, c.media from publishing_jobs j join destinations d on d.id = j.destination_id join destination_renditions r on r.id = j.rendition_id join content_items c on c.id = r.content_item_id where j.id = $1`, [claimed.id])).rows[0];
    if (!job) throw Object.assign(new Error('Publishing job references missing content'), { code: 'INVALID_REQUEST' });
    const connector = CONNECTORS[job.connector_key];
    if (!connector) throw Object.assign(new Error('Connector is disabled or unavailable'), { code: 'CONNECTOR_DISABLED' });
    const destination: Destination = { id: job.destination_id, name: job.destination_name, url: job.destination_url, connector_key: job.connector_key };
    const rendition: Rendition = { title: job.title, body: job.body, canonical_url: job.canonical_url, media: job.media };
    const violations = await validatePostingRules(runner, destination, rendition, job);
    if (violations.length) {
      const violation = violations[0];
      await runner.query(`update publishing_jobs set status = $2, progress = 100, error_code = $3, error_message = $4, result = $5, completed_at = now() where id = $1`, [job.id, violation.retryable ? 'blocked' : 'failed', violation.code, violation.message, JSON.stringify({ violations })]);
      return true;
    }
    await runner.query(`update publishing_jobs set progress = 45 where id = $1`, [job.id]);
    const result = await connector.publish(rendition, destination, { simulated: process.env.SIMULATION_MODE !== 'false' }, job.idempotency_key);
    await runner.query(`update publishing_jobs set status = 'succeeded', progress = 100, platform_post_id = $2, live_url = $3, result = $4, completed_at = now() where id = $1`, [job.id, result.platform_post_id, result.live_url ?? null, JSON.stringify(result)]);
    await runner.query(`update idempotency_records set outcome = $2 where job_id = $1`, [job.id, JSON.stringify({ status: 'succeeded', result })]);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'PLATFORM_UNAVAILABLE';
    const message = error instanceof Error ? error.message : 'Publishing failed';
    await runner.query(`update publishing_jobs set status = 'failed', progress = 100, error_code = $2, error_message = $3, completed_at = now() where id = $1`, [claimed.id, code, message]);
    await runner.query(`update idempotency_records set outcome = $2 where job_id = $1`, [claimed.id, JSON.stringify({ status: 'failed', code, message })]);
    return true;
  }
}
