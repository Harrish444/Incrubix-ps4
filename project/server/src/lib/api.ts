export type ApiMetrics = {
  destinations: number;
  posts_30d: number;
  certified: number;
  success_rate: number | null;
  simulation: boolean;
};

export type ApiDestination = {
  id: string;
  name: string;
  platform_key: string;
  surface: string;
  audience_tags: string[];
  relevance_score: number | null;
  certification_status: 'uncertified' | 'certified' | 'simulated' | 'demoted';
  updated_at: string;
};

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export function getMetrics() { return request<{ data: ApiMetrics }>('/api/v1/metrics'); }
export function getDestinations() { return request<{ data: ApiDestination[] }>('/api/v1/destinations'); }
export function getHealth() { return request<{ status: string; simulation: boolean }>('/health'); }
export function startCertification(destinationId: string) { return request<{ job_id: string; status: string }>(`/api/v1/destinations/${destinationId}/certify`, { method: 'POST', body: JSON.stringify({ mode: 'simulation' }) }); }

export type ImportResult = {
  import_id: string;
  accepted: number;
  duplicates: number;
  rejected: number;
  errors: Array<{ row: number; field?: string; message: string }>;
};

export async function importCatalogue(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${baseUrl}/api/v1/catalogue/import`, { method: 'POST', body: form });
  const body = await response.json() as ImportResult & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Import failed (${response.status})`);
  return body;
}
