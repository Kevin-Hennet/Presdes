export const languages = {
  en: { label: 'English', voice: 'en-US' },
  es: { label: 'Spanish', voice: 'es-ES' },
  hi: { label: 'Hindi', voice: 'hi-IN' },
  fr: { label: 'French', voice: 'fr-FR' },
  pt: { label: 'Portuguese', voice: 'pt-PT' },
  zh: { label: 'Chinese (Mandarin)', voice: 'zh-CN' },
  ar: { label: 'Arabic', voice: 'ar' },
} as const;

export type Language = keyof typeof languages;
export type SourceLanguage = Language | 'und';

export type PrintedSection = {
  state: 'found' | 'unclear' | 'not_found';
  excerpts: string[];
};

export type Analysis = {
  id: string;
  created_at: string;
  readability: 'readable' | 'partial' | 'unreadable' | 'not_medication_label' | 'mismatched_labels';
  source_language: SourceLanguage;
  explanation_language: Language;
  extracted_text: string;
  medication: PrintedSection;
  directions: PrintedSection;
  warnings: PrintedSection;
  printed_dates: PrintedSection;
  explanations: { simple: string; detailed: string } | null;
  uncertainties: string[];
  pharmacist_questions: string[];
};

export type LabelMatch = {
  name: string;
  manufacturer: string | null;
  source_url: string;
};

export type MongoScan = { result: Analysis; saved_at: string; example: boolean };
export type MongoScanSummary = {
  id: string;
  name: string;
  source_language: SourceLanguage;
  saved_at: string;
  example: boolean;
};
export type MongoScanPage = { items: MongoScanSummary[]; next_before: string | null };
const mutationHeaders = { 'X-PresDes-Request': '1' };

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
  } catch {
    throw new Error('Could not reach PresDes. Check your connection and try again.');
  }
  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (typeof data?.detail === 'string') throw new Error(data.detail);
    if (response.status === 413) throw new Error('This request exceeds the allowed size.');
    if (response.status === 422) throw new Error('Check your input and try again.');
    if (response.status === 504) throw new Error('The request took too long. Try again.');
    throw new Error('PresDes is temporarily unavailable. Try again.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('PresDes received an incomplete response. Try again.');
  }
  return data as T;
}

export function analyze(files: readonly File[], language: Language, signal: AbortSignal) {
  if (files.length === 1) {
    const file = files[0];
    return request<Analysis>('/api/scans?' + new URLSearchParams({ language }), {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
      signal,
    });
  }
  const body = new FormData();
  for (const file of files) body.append('files', file);
  return request<Analysis>('/api/scans?' + new URLSearchParams({ language }), {
    method: 'POST',
    body,
    signal,
  });
}

export function lookupLabels(name: string, signal: AbortSignal) {
  return request<{ matches: LabelMatch[] }>('/api/labels?' + new URLSearchParams({ name }), { signal });
}

export async function saveMongoScan(result: Analysis, example: boolean, signal: AbortSignal) {
  const session = () => request<void>('/api/saved-scans/session', { method: 'POST', headers: mutationHeaders, signal });
  // Serialize first-time session creation across tabs when browser locks are available.
  if (navigator.locks) await navigator.locks.request('presdes-mongodb-session', { signal }, session);
  else await session();
  return request<MongoScan>('/api/saved-scans', {
    method: 'POST',
    headers: { ...mutationHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ result, example }),
    signal,
  });
}

export function listMongoScans(signal: AbortSignal, before?: string) {
  const suffix = before ? '?' + new URLSearchParams({ before }) : '';
  return request<MongoScanPage>('/api/saved-scans' + suffix, { signal });
}

export function getMongoScan(id: string, signal: AbortSignal) {
  return request<MongoScan>('/api/saved-scans/' + encodeURIComponent(id), { signal });
}

export function deleteMongoScan(id: string, signal: AbortSignal) {
  return request<void>('/api/saved-scans/' + encodeURIComponent(id), { method: 'DELETE', headers: mutationHeaders, signal });
}
