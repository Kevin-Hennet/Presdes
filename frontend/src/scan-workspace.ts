import { languages, type Analysis, type Language } from './api/client';

export const maxPhotos = 4;
export const maxPhotoBytes = 12 * 1024 * 1024;
export const maxTotalBytes = 24 * 1024 * 1024;
export const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
export const isHeic = (file: File) => file.type === 'image/heic' || file.type === 'image/heif';

export type StoredPhoto = { file: File; preview: Blob | null };
export type PendingPhotos = { photos: StoredPhoto[]; replaceIndex: number | null };
export type ResultView = {
  level: 'simple' | 'detailed';
  history: 'saved' | 'unsaved' | 'missing';
  medicationSaved: boolean;
};
export type WorkspaceResult = { result: Analysis; view: ResultView };
export type Workspace = {
  photos: StoredPhoto[];
  language: Language;
  scan: WorkspaceResult | null;
  pendingPhotos: PendingPhotos | null;
  analyzing: boolean;
};

export const emptyWorkspace: Workspace = {
  photos: [], language: 'en', scan: null, pendingPhotos: null, analyzing: false,
};

const storeName = 'workspace';
const key = 'current';
const resetKey = 'presdes:scan-reset:v1';

function validLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(languages, value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validResult(value: unknown): value is WorkspaceResult {
  if (!record(value) || !record(value.result) || !record(value.view)) return false;
  const { result, view } = value;
  const sections = [result.medication, result.directions, result.warnings, result.printed_dates];
  return typeof result.id === 'string' && result.id.length > 0 && result.id.length <= 100
    && typeof result.created_at === 'string' && Number.isFinite(Date.parse(result.created_at))
    && ['readable', 'partial', 'unreadable', 'not_medication_label', 'mismatched_labels'].some(state => state === result.readability)
    && (result.source_language === 'und' || validLanguage(result.source_language)) && validLanguage(result.explanation_language)
    && typeof result.extracted_text === 'string' && textList(result.uncertainties) && textList(result.pharmacist_questions)
    && sections.every(section => record(section) && ['found', 'unclear', 'not_found'].some(state => state === section.state) && textList(section.excerpts))
    && (result.explanations === null || (record(result.explanations)
      && typeof result.explanations.simple === 'string' && typeof result.explanations.detailed === 'string'))
    && (view.level === 'simple' || view.level === 'detailed')
    && (view.history === 'saved' || view.history === 'unsaved' || view.history === 'missing')
    && typeof view.medicationSaved === 'boolean' && JSON.stringify(result).length <= 256 * 1024;
}

function validPhotos(value: unknown, ready: boolean): value is StoredPhoto[] {
  return Array.isArray(value) && value.length <= maxPhotos && value.every(photo => {
    if (!record(photo) || !(photo.file instanceof File) || !photoTypes.has(photo.file.type)
      || !photo.file.size || photo.file.size > maxPhotoBytes) return false;
    if (photo.preview === null) return !ready || !isHeic(photo.file);
    return isHeic(photo.file) && photo.preview instanceof Blob && photo.preview.type === 'image/jpeg'
      && photo.preview.size > 0 && photo.preview.size <= maxPhotoBytes;
  });
}

function fits(photos: StoredPhoto[]) {
  return photos.length <= maxPhotos && photos.reduce((size, photo) => size + photo.file.size, 0) <= maxTotalBytes
    && photos.reduce((size, photo) => size + (photo.preview?.size ?? 0), 0) <= maxTotalBytes;
}

function validWorkspace(value: unknown): value is Workspace {
  if (!record(value) || !validPhotos(value.photos, true) || !fits(value.photos) || !validLanguage(value.language)
    || typeof value.analyzing !== 'boolean') return false;
  if (value.scan !== null) return value.photos.length > 0 && !value.analyzing
    && value.pendingPhotos === null && validResult(value.scan);
  if (value.analyzing) return value.photos.length > 0 && value.pendingPhotos === null;
  const pending = value.pendingPhotos;
  if (pending === null) return true;
  if (!record(pending) || !validPhotos(pending.photos, false) || !pending.photos.some(photo => isHeic(photo.file))) return false;
  if (pending.replaceIndex !== null && (typeof pending.replaceIndex !== 'number'
    || !Number.isInteger(pending.replaceIndex) || pending.replaceIndex < 0
    || pending.replaceIndex >= value.photos.length || pending.photos.length !== 1)) return false;
  return fits([...value.photos.filter((_, index) => index !== pending.replaceIndex), ...pending.photos]);
}

type PhotoData = { bytes: ArrayBuffer; name: string; type: string; lastModified: number; preview: ArrayBuffer | null };
type WorkspaceData = Omit<Workspace, 'photos' | 'pendingPhotos'> & {
  photos: PhotoData[];
  pendingPhotos: { photos: PhotoData[]; replaceIndex: number | null } | null;
};
type Entry = { version: 2; revision: string; generation: string | null; workspace: WorkspaceData };

function decodePhotos(value: unknown) {
  if (!Array.isArray(value) || value.length > maxPhotos) return null;
  return value.map(photo => {
    if (!record(photo) || !(photo.bytes instanceof ArrayBuffer)
      || !photo.bytes.byteLength || photo.bytes.byteLength > maxPhotoBytes
      || typeof photo.name !== 'string' || typeof photo.lastModified !== 'number' || !Number.isFinite(photo.lastModified)
      || typeof photo.type !== 'string' || !photoTypes.has(photo.type)) return null;
    if (photo.preview !== null && (!(photo.preview instanceof ArrayBuffer)
      || !photo.preview.byteLength || photo.preview.byteLength > maxPhotoBytes)) return null;
    return {
      file: new File([photo.bytes], photo.name, { type: photo.type, lastModified: photo.lastModified }),
      preview: photo.preview === null ? null : new Blob([photo.preview], { type: 'image/jpeg' }),
    };
  });
}

function decodeWorkspace(value: unknown) {
  if (!record(value)) return null;
  const pending = value.pendingPhotos;
  const workspace = {
    ...value,
    photos: decodePhotos(value.photos),
    pendingPhotos: record(pending) ? { ...pending, photos: decodePhotos(pending.photos) } : pending,
  };
  return validWorkspace(workspace) ? workspace : null;
}

function uniqueRevision() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
}

function resetGeneration() {
  try {
    return localStorage.getItem(resetKey);
  } catch {
    return undefined;
  }
}

function markReset() {
  // Record the clear synchronously so a reload during the IndexedDB transaction ignores the old photos.
  const generation = uniqueRevision();
  try {
    localStorage.setItem(resetKey, generation);
    return generation;
  } catch {
    return undefined;
  }
}

function revisionOf(value: unknown) {
  return record(value) && typeof value.revision === 'string' ? value.revision : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presdes-scan-workspace', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('The scan workspace is open in another tab.'));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

async function access(edit?: (previous: unknown) => Entry): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, edit ? 'readwrite' : 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      let entry: unknown;
      let failure: unknown;
      request.onsuccess = () => {
        entry = request.result;
        if (!edit) return;
        try {
          entry = edit(entry);
          store.put(entry, key);
        } catch (cause) {
          failure = cause;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(entry);
      transaction.onabort = () => reject(failure ?? transaction.error);
    });
  } finally {
    database.close();
  }
}

export class WorkspaceConflict extends Error {}

export function createWorkspaceStorage() {
  let revision: string | null = null;
  let generation: string | null = null;
  let queue = Promise.resolve();
  let reading: Promise<Workspace | null> | undefined;
  const photoBytes = new WeakMap<Blob, Promise<ArrayBuffer>>();

  function bytes(blob: Blob) {
    const existing = photoBytes.get(blob);
    if (existing) return existing;
    const read = blob.arrayBuffer().catch(cause => {
      photoBytes.delete(blob);
      throw cause;
    });
    photoBytes.set(blob, read);
    return read;
  }

  async function encodePhotos(photos: StoredPhoto[]) {
    return Promise.all(photos.map(async ({ file, preview }): Promise<PhotoData> => ({
      bytes: await bytes(file), name: file.name, type: file.type, lastModified: file.lastModified,
      preview: preview ? await bytes(preview) : null,
    })));
  }

  function save(workspace: Workspace, reset = false) {
    const expectedGeneration = (reset ? markReset() : undefined) ?? generation;
    const write = queue.then(async () => {
      if (!validWorkspace(workspace)) throw new Error('The scan workspace exceeds its storage limits.');
      // Persist bytes and file metadata. Some WebKit contexts cannot clone file-backed blobs into IndexedDB.
      const pending = workspace.pendingPhotos;
      const data: WorkspaceData = {
        ...workspace,
        photos: await encodePhotos(workspace.photos),
        pendingPhotos: pending ? { ...pending, photos: await encodePhotos(pending.photos) } : null,
      };
      const entry: Entry = { version: 2, revision: uniqueRevision(), generation: expectedGeneration, workspace: data };
      await access(previous => {
        const actualGeneration = resetGeneration();
        if ((actualGeneration !== undefined && actualGeneration !== expectedGeneration)
          || (!reset && revisionOf(previous) !== revision)) throw new WorkspaceConflict();
        return entry;
      });
      revision = entry.revision;
      generation = entry.generation;
    });
    queue = write.catch(() => {});
    return write;
  }

  return {
    load() {
      reading ??= access().then(async entry => {
        revision = revisionOf(entry);
        const storedGeneration = record(entry) && typeof entry.generation === 'string' ? entry.generation : null;
        const marker = resetGeneration();
        generation = marker === undefined ? storedGeneration : marker;
        if (entry === undefined) return null;
        if (generation !== storedGeneration) {
          // Finish deleting a reset workspace if the previous document closed before the write committed.
          await save(emptyWorkspace);
          return null;
        }
        if (record(entry) && revision) {
          if (entry.version === 2) {
            const restored = decodeWorkspace(entry.workspace);
            if (restored) return restored;
          }
          if (entry.version === 1 && validWorkspace(entry.workspace)) return entry.workspace;
        }
        throw new Error('The saved scan workspace could not be read.');
      });
      return reading;
    },
    save,
  };
}
