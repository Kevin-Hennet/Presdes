import { ensureHistorySession } from './history-session';

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

export type HistoryScan = { result: Analysis; saved_at: string; example: boolean; saved_medication: boolean };
export type HistoryScanSummary = {
  id: string;
  name: string;
  source_language: SourceLanguage;
  saved_at: string;
  example: boolean;
  saved_medication: boolean;
};
export type HistoryScanPage = { items: HistoryScanSummary[]; next_before: string | null };
const mutationHeaders = { 'X-PresDes-Request': '1' };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function requestJson<T>(path: string, init: RequestInit): Promise<{ data: T; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
  } catch {
    throw new Error('Could not reach PresDes. Check your connection and try again.');
  }
  if (response.status === 204) return { data: undefined as T, headers: response.headers };

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (typeof data?.detail === 'string') throw new ApiError(response.status, data.detail);
    if (response.status === 413) throw new ApiError(413, 'This request exceeds the allowed size.');
    if (response.status === 422) throw new ApiError(422, 'Check your input and try again.');
    if (response.status === 504) throw new ApiError(504, 'The request took too long. Try again.');
    throw new ApiError(response.status, 'PresDes is temporarily unavailable. Try again.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('PresDes received an incomplete response. Try again.');
  }
  return { data: data as T, headers: response.headers };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  return (await requestJson<T>(path, init)).data;
}

function startHistorySession() {
  return ensureHistorySession(signal => request<void>('/api/saved-scans/session', {
    method: 'POST', headers: mutationHeaders, signal,
  }));
}

export async function analyze(files: readonly File[], language: Language, signal: AbortSignal) {
  // A temporary history outage must still allow analysis.
  await startHistorySession().catch(() => {});
  if (signal.aborted) throw signal.reason;
  let body: BodyInit;
  const headers = new Headers(mutationHeaders);
  if (files.length === 1) {
    const file = files[0];
    body = file;
    headers.set('Content-Type', file.type);
  } else {
    const uploads = new FormData();
    for (const file of files) uploads.append('files', file);
    body = uploads;
  }
  const { data, headers: responseHeaders } = await requestJson<Analysis>('/api/scans?' + new URLSearchParams({ language }), {
    method: 'POST', headers, body, signal,
  });
  return { result: data, historySaved: responseHeaders.get('X-PresDes-History') === 'saved' };
}

export async function previewHeic(file: File, signal: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch('/api/scans/preview', {
      method: 'POST', headers: { 'Content-Type': file.type }, body: file, signal, cache: 'no-store',
    });
  } catch {
    throw new Error('Could not prepare this iPhone photo. Check your connection and choose it again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Could not prepare this iPhone photo. Choose another photo or export it as a JPG.');
  }
  if (!response.headers.get('Content-Type')?.startsWith('image/jpeg')) {
    throw new Error('The photo preview could not be opened. Choose the photo again.');
  }
  return response.blob();
}

export async function retrySaveScan(result: Analysis) {
  await startHistorySession();
  return request<HistoryScan>('/api/saved-scans', {
    method: 'POST',
    headers: { ...mutationHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ result }),
  });
}

export function listHistoryScans(signal: AbortSignal, medications: boolean, before?: string) {
  const query = new URLSearchParams();
  if (medications) query.set('medications', 'true');
  if (before) query.set('before', before);
  return request<HistoryScanPage>('/api/saved-scans?' + query, { signal });
}

function scanPath(id: string) {
  return '/api/saved-scans/' + encodeURIComponent(id);
}

export function getHistoryScan(id: string, signal: AbortSignal) {
  return request<HistoryScan>(scanPath(id), { signal });
}

export function deleteHistoryScan(id: string, signal: AbortSignal) {
  return request<void>(scanPath(id), { method: 'DELETE', headers: mutationHeaders, signal });
}

export function setSavedMedication(id: string, saved: boolean) {
  return request<void>(scanPath(id) + '/medication', { method: saved ? 'PUT' : 'DELETE', headers: mutationHeaders });
}
