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
  readability: 'readable' | 'partial' | 'unreadable' | 'not_medication_label';
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

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: 'no-store' });
  } catch {
    throw new Error('Could not reach PresDes. Check your connection and try again.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (typeof data?.detail === 'string') throw new Error(data.detail);
    if (response.status === 413) throw new Error('The photo exceeds 12 MB. Choose a smaller photo.');
    if (response.status === 422) throw new Error('Check your input and try again.');
    if (response.status === 504) throw new Error('The request took too long. Try again.');
    throw new Error('PresDes is temporarily unavailable. Try again.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('PresDes received an incomplete response. Try again.');
  }
  return data as T;
}

export function analyze(file: File, language: Language, signal: AbortSignal) {
  return request<Analysis>('/api/scans?' + new URLSearchParams({ language }), {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
    signal,
  });
}

export function lookupLabels(name: string, signal: AbortSignal) {
  return request<{ matches: LabelMatch[] }>('/api/labels?' + new URLSearchParams({ name }), { signal });
}
