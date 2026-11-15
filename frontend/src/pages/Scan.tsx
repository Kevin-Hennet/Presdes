import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, ImagePlus, RotateCcw, Scan, ScanLine, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError, analyze, languages, previewHeic, type Language } from '../api/client';
import { Capture } from '../components/Capture';
import { Results } from '../components/Results';
import {
  createWorkspaceStorage, emptyWorkspace, isHeic, maxPhotoBytes, maxPhotos, maxTotalBytes, photoTypes, WorkspaceConflict,
  type PendingPhotos, type ResultView, type StoredPhoto, type Workspace,
} from '../scan-workspace';
import './scan.css';

function identifyPhoto(file: File): File {
  // iOS file providers can omit the MIME type. The server still verifies the actual encoding.
  if ((!file.type || file.type === 'application/octet-stream') && /\.hei[cf]$/i.test(file.name)) {
    return new File([file], file.name, { type: /\.heic$/i.test(file.name) ? 'image/heic' : 'image/heif', lastModified: file.lastModified });
  }
  return file;
}
type Photo = StoredPhoto & { url: string };

function displayPhoto(photo: StoredPhoto): Photo {
  return { ...photo, url: URL.createObjectURL(photo.preview ?? photo.file) };
}

export default function ScanPage({ active }: { active: boolean }) {
  const [storage] = useState(createWorkspaceStorage);
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const current = useRef(workspace);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [resumeResult, setResumeResult] = useState(false);
  const [storageError, setStorageError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const conversion = useRef<AbortController | null>(null);
  const selected = useRef<Photo[]>([]);
  const retakeTarget = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterClear = useRef(false);
  const captureHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const analysisHeading = useRef<HTMLHeadingElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const focusAnalysisError = useRef(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [retaking, setRetaking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const { scan, language, pendingPhotos } = workspace;

  const remember = useCallback(async (next: Workspace, reset = false) => {
    try {
      await storage.save(next, reset);
      setStorageError('');
    } catch (cause) {
      setStorageError(cause instanceof WorkspaceConflict
        ? 'The current scan changed in another tab. Reload to see the latest scan.'
        : 'Could not save the current scan on this browser. Keep this page open to continue.');
    }
  }, [storage]);

  const updateWorkspace = useCallback((change: Partial<Workspace>) => {
    const next = { ...current.current, ...change };
    current.current = next;
    setWorkspace(next);
    return remember(next);
  }, [remember]);

  useEffect(() => {
    let cancelled = false;
    void storage.load().then(restored => {
      if (cancelled || !restored) return;
      const restoredPhotos = restored.photos.map(displayPhoto);
      current.current = restored;
      selected.current = restoredPhotos;
      setWorkspace(restored);
      setPhotos(restoredPhotos);
      setResumeResult(true);
    }).catch(() => {
      if (!cancelled) setStorageError('Could not restore the current scan from this browser.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [storage]);

  useEffect(() => {
    if (!active) setResumeResult(true);
  }, [active]);

  useLayoutEffect(() => {
    if (active && !clearing && focusAfterClear.current && heading.current) {
      focusAfterClear.current = false;
      heading.current.focus();
    }
  }, [active, clearing]);

  useLayoutEffect(() => {
    if (!active) return;
    if (busy) analysisHeading.current?.focus();
    if (!busy && focusAnalysisError.current && errorNotice.current) {
      focusAnalysisError.current = false;
      errorNotice.current.focus();
    }
  }, [active, busy, error]);

  const abortRequest = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  const release = useCallback(() => {
    abortRequest();
    conversion.current?.abort();
    conversion.current = null;
    for (const photo of selected.current) URL.revokeObjectURL(photo.url);
    selected.current = [];
  }, [abortRequest]);

  useEffect(() => release, [release]);

  function cancelAnalysis() {
    abortRequest();
    setBusy(false);
    if (current.current.analyzing) void updateWorkspace({ analyzing: false });
  }

  async function newScan() {
    setClearing(true);
    release();
    setPhotos([]);
    setReviewUrl(null);
    changeRetakeTarget(null);
    setBusy(false);
    setError('');
    setPreparing(false);
    const cleared = { ...emptyWorkspace, language: current.current.language };
    current.current = cleared;
    setWorkspace(cleared);
    await remember(cleared, true);
    focusAfterClear.current = true;
    setClearing(false);
  }

  function changePhotos(next: Photo[]) {
    abortRequest();
    setBusy(false);
    selected.current = next;
    setPhotos(next);
    setError('');
    void updateWorkspace({
      photos: next.map(({ file, preview }) => ({ file, preview })),
      pendingPhotos: null,
      analyzing: false,
    });
  }

  const focusReview = useCallback(() => {
    requestAnimationFrame(() => (reviewHeading.current ?? captureHeading.current)?.focus());
  }, []);

  const changeRetakeTarget = useCallback((url: string | null) => {
    retakeTarget.current = url;
    setRetaking(url);
  }, []);

  function choosePhotos(files: File[], origin: 'camera' | 'picker') {
    function reject(message: string) {
      if (origin === 'picker') setError(message);
      return message;
    }
    if (conversion.current || pendingPhotos) return reject('Finish preparing the pending photos first.');
    files = files.map(identifyPhoto);
    if (retakeTarget.current !== retaking) return reject('The photo selection changed. Try again.');
    const previous = selected.current;
    const replaceIndex = retaking ? previous.findIndex(item => item.url === retaking) : null;
    if (replaceIndex !== null && (files.length !== 1 || replaceIndex < 0)) {
      return reject('Choose one replacement photo.');
    }
    if (previous.length + files.length - (replaceIndex !== null ? 1 : 0) > maxPhotos) {
      return reject('Choose up to four photos of the same bottle.');
    }
    for (const file of files) {
      if (!photoTypes.has(file.type)) {
        return reject(`${file.name} must be a JPG, PNG, WebP, still GIF, HEIC, or HEIF photo.`);
      }
      if (!file.size || file.size > maxPhotoBytes) {
        return reject(file.size ? `${file.name} exceeds 12 MB. Choose a smaller photo.` : `${file.name} is empty. Choose another photo.`);
      }
    }
    const retained = previous.filter((_, index) => index !== replaceIndex);
    const combinedBytes = [...retained.map(item => item.file), ...files].reduce((sum, file) => sum + file.size, 0);
    if (combinedBytes > maxTotalBytes) {
      return reject('The photos exceed 24 MB total. Remove a photo or choose smaller files.');
    }

    const batch = { photos: files.map(file => ({ file, preview: null })), replaceIndex };
    if (!files.some(isHeic)) {
      commitPhotos(batch, origin === 'picker');
      return;
    }
    void preparePhotos(batch);
  }

  function commitPhotos(batch: PendingPhotos, restoreFocus: boolean) {
    const next = [...selected.current];
    const additions = batch.photos.map(displayPhoto);
    if (batch.replaceIndex !== null) {
      const [replaced] = next.splice(batch.replaceIndex, 1, ...additions);
      URL.revokeObjectURL(replaced.url);
      changeRetakeTarget(null);
      setReviewUrl(additions[0].url);
    } else {
      next.push(...additions);
    }
    changePhotos(next);
    if (restoreFocus) focusReview();
  }

  async function preparePhotos(batch: PendingPhotos) {
    if (conversion.current) return;
    abortRequest();
    setBusy(false);
    const controller = new AbortController();
    conversion.current = controller;
    setPreparing(true);
    setError('');
    try {
      await updateWorkspace({ pendingPhotos: batch, analyzing: false });
      // Convert only unfinished previews and checkpoint each JPEG before starting the next.
      for (const [index, photo] of batch.photos.entries()) {
        if (conversion.current !== controller) return;
        if (!isHeic(photo.file) || photo.preview) continue;
        const preview = await previewHeic(photo.file, controller.signal);
        if (conversion.current !== controller) return;
        batch = { ...batch, photos: batch.photos.map((item, position) => position === index ? { ...item, preview } : item) };
        await updateWorkspace({ pendingPhotos: batch });
      }
      if (conversion.current === controller) commitPhotos(batch, true);
    } catch (cause) {
      if (conversion.current !== controller) return;
      if (cause instanceof ApiError) void updateWorkspace({ pendingPhotos: null });
      setError(cause instanceof Error ? cause.message : 'Could not prepare the photo. Try again.');
    } finally {
      if (conversion.current === controller) {
        conversion.current = null;
        setPreparing(false);
      }
    }
  }

  function removePhoto(url: string, restoreFocus: boolean) {
    const removedIndex = selected.current.findIndex(item => item.url === url);
    const remaining = selected.current.filter(item => item.url !== url);
    URL.revokeObjectURL(url);
    if (retaking === url) changeRetakeTarget(null);
    if (url === (reviewUrl ?? selected.current[0]?.url)) {
      setReviewUrl((remaining[removedIndex] ?? remaining[remaining.length - 1])?.url ?? null);
    }
    changePhotos(remaining);
    if (restoreFocus) focusReview();
  }

  function retakePhoto(photo: Photo) {
    cancelAnalysis();
    setError('');
    changeRetakeTarget(photo.url);
    requestAnimationFrame(() => captureHeading.current?.focus());
  }

  async function submit() {
    if (!photos.length || pending.current || retaking || pendingPhotos) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setResumeResult(false);
    setError('');

    try {
      await updateWorkspace({ analyzing: true });
      if (pending.current !== controller) return;
      const { result, historySaved } = await analyze(photos.map(photo => photo.file), language, controller.signal);
      if (pending.current === controller) {
        const completed: Workspace = {
          ...current.current,
          analyzing: false,
          scan: { result, view: { history: historySaved ? 'saved' : 'unsaved', level: 'simple', medicationSaved: false } },
        };
        await remember(completed);
        if (pending.current === controller) {
          current.current = completed;
          setWorkspace(completed);
        }
      }
    } catch (cause) {
      if (pending.current === controller) {
        // A transport failure can happen before the old document exits on reload.
        // Keep its checkpoint until the app has a result or an explicit server rejection.
        if (cause instanceof ApiError) void updateWorkspace({ analyzing: false });
        focusAnalysisError.current = active;
        setError(cause instanceof Error ? cause.message : 'Could not analyze these photos. Try again.');
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  const updateResultView = useCallback((id: string, change: Partial<ResultView>, expected?: ResultView) => {
    const result = current.current.scan;
    if (result?.result.id !== id) return;
    if (expected && (expected.history !== result.view.history || expected.medicationSaved !== result.view.medicationSaved)) return;
    const view = { ...result.view, ...change };
    if (view.history === result.view.history && view.level === result.view.level && view.medicationSaved === result.view.medicationSaved) return;
    void updateWorkspace({ scan: { ...result, view } });
  }, [updateWorkspace]);

  if (!active) return null;
  if (loading || clearing) return <p className="notice" role="status">{loading ? 'Restoring the current scan…' : 'Clearing the current scan…'}</p>;
  const storageNotice = storageError && <p className="notice" role="status">{storageError}</p>;
  if (scan) {
    return <>
      {storageNotice}
      <Results
        key={scan.result.id}
        result={scan.result}
        workspaceView={scan.view}
        onWorkspaceViewChange={updateResultView}
        reconcileHistory={resumeResult}
        photos={photos.map((photo, index) => ({
          url: photo.url,
          alt: photos.length === 1 ? 'Medication label photo used for this analysis' : `Medication label source photo ${index + 1}`,
        }))}
        onBack={() => void newScan()}
        onReviewPhotos={() => {
          void updateWorkspace({ scan: null });
          focusReview();
        }}
      />
    </>;
  }

  const retakeNumber = photos.findIndex(photo => photo.url === retaking) + 1;
  const reviewIndex = Math.max(0, photos.findIndex(photo => photo.url === reviewUrl));
  const reviewedPhoto = photos[reviewIndex];
  return (
    <div className="scan-workspace">
      <header className="scan-intro">
        <h1 ref={heading} tabIndex={-1}>Scan your label</h1>
        {reviewedPhoto || pendingPhotos
          ? <button className="button plain" type="button" onClick={() => void newScan()}>New scan</button>
          : <p className="muted">Capture the printed directions, warnings, and dates.</p>}
      </header>
      {storageNotice}
      {busy && reviewedPhoto ? (
        <section className="scan-panel scan-analysis" aria-labelledby="analysis-heading">
          <div className="scan-analysis-preview" aria-busy="true">
            <img src={reviewedPhoto.url} alt="" />
            <div className="scan-sweep" aria-hidden="true" />
          </div>
          <div className="scan-analysis-copy">
            <h2 id="analysis-heading" ref={analysisHeading} tabIndex={-1}>Analyzing your label…</h2>
            <p className="muted" role="status">Reading your photos and preparing an explanation.</p>
            <button className="button outline" type="button" onClick={() => {
              cancelAnalysis();
              focusReview();
            }}>Stop waiting</button>
          </div>
        </section>
      ) : (
        <>
          {workspace.analyzing && !error && <p className="notice" role="status">Analysis was interrupted. Analyze the photos again when you’re ready.</p>}
          {reviewedPhoto && (
            <section className="scan-panel scan-review" aria-labelledby="review-heading">
              <div className="scan-review-header">
                <h2 id="review-heading" ref={reviewHeading} tabIndex={-1}>
                  {photos.length === 1 ? 'Review your photo' : 'Review your photos'}
                </h2>
                <p className="scan-count" role="status">{photos.length} of {maxPhotos} photos</p>
              </div>
              <figure className="scan-review-figure">
                <div className="scan-review-media">
                  <img key={reviewedPhoto.url} src={reviewedPhoto.url} alt={photos.length === 1
                    ? 'Medication label photo selected for analysis'
                    : `Medication label photo ${reviewIndex + 1} selected for analysis`} />
                </div>
                <figcaption className="muted">Photo {reviewIndex + 1} · {reviewedPhoto.file.name}</figcaption>
              </figure>
              {photos.length > 1 && (
                <ul className="scan-thumbnails" aria-label="Selected photos">
                  {photos.map((photo, index) => (
                    <li key={photo.url}>
                      <button className="scan-thumbnail" type="button" aria-label={`Review photo ${index + 1}`}
                        aria-pressed={index === reviewIndex} onClick={() => setReviewUrl(photo.url)}>
                        <img src={photo.url} alt="" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="button-row scan-review-actions">
                <button className="button outline" type="button" disabled={Boolean(pendingPhotos)}
                  aria-label={`Retake photo ${reviewIndex + 1}`} onClick={() => retakePhoto(reviewedPhoto)}>
                  <RotateCcw size={17} aria-hidden="true" /> Retake
                </button>
                <button className="button plain" type="button" disabled={Boolean(pendingPhotos)}
                  aria-label={`Remove photo ${reviewIndex + 1}`} onClick={() => removePhoto(reviewedPhoto.url, true)}>
                  <Trash2 size={17} aria-hidden="true" /> Remove
                </button>
              </div>
            </section>
          )}
          {error && <p className="notice" ref={errorNotice} tabIndex={-1} role="alert">{error}</p>}
          <section className={reviewedPhoto ? 'scan-panel scan-capture' : 'scan-panel scan-capture scan-capture-empty'} aria-labelledby="capture-heading">
            {!reviewedPhoto && (
              <div className="scan-capture-art" aria-hidden="true">
                <div className="scan-capture-symbol"><Scan size={64} strokeWidth={1.4} /><Camera size={27} strokeWidth={1.6} /></div>
              </div>
            )}
            <div className="scan-capture-copy">
              <h2 id="capture-heading" ref={captureHeading} tabIndex={-1}>{retakeNumber ? 'Replace a photo' : 'Add label photos'}</h2>
              {!reviewedPhoto && <p className="muted">Rotate the same bottle and overlap the edges between photos.</p>}
              {retakeNumber > 0 && (
                <div className="notice">
                  <p role="status">Retaking photo {retakeNumber}. Capture a replacement or choose one photo.</p>
                  <button className="button outline" type="button" disabled={preparing} onClick={() => {
                    changeRetakeTarget(null);
                    focusReview();
                  }}>Cancel retake</button>
                </div>
              )}
              <Capture
                photos={photos}
                maxPhotos={maxPhotos}
                disabled={Boolean(pendingPhotos)}
                retaking={retaking}
                onPhotos={choosePhotos}
                onRemove={url => removePhoto(url, false)}
                onRetake={changeRetakeTarget}
                onCameraOpened={cancelAnalysis}
                onCameraDone={focusReview}
              />
              {preparing && <p className="notice" role="status">Preparing iPhone photo preview…</p>}
              {pendingPhotos && !preparing && (
                <div className="notice">
                  <p role="status">Photo preparation was interrupted. You can retry the pending photos.</p>
                  <div className="button-row">
                    <button className="button outline" type="button" onClick={() => void preparePhotos(pendingPhotos)}>Retry photo preview</button>
                    <button className="button plain" type="button" onClick={() => {
                      void updateWorkspace({ pendingPhotos: null });
                      changeRetakeTarget(null);
                      focusReview();
                    }}>Discard pending photos</button>
                  </div>
                </div>
              )}
            </div>
          </section>
          {reviewedPhoto && (
            <section className="scan-panel scan-submit" aria-label="Analysis settings">
              <div className="field">
                <label htmlFor="explanation-language">Explanation language</label>
                <select id="explanation-language" value={language} onChange={event => void updateWorkspace({ language: event.target.value as Language })}>
                  {(Object.keys(languages) as Language[]).map(code => (
                    <option key={code} value={code}>{languages[code].label}</option>
                  ))}
                </select>
                <p className="muted">Printed wording stays in the label’s original language.</p>
              </div>
              <p className="scan-disclosure">
                <ShieldCheck size={19} aria-hidden="true" />
                <span>Cover personal information. Analysis sends photos to OpenAI. Readable text and explanations are saved automatically in Scan history. This browser keeps the current scan and photos until you choose New scan.</span>
              </p>
              <button className="button primary scan-submit-button" type="button" disabled={Boolean(pendingPhotos) || Boolean(retaking)} onClick={submit}>
                <ScanLine size={20} aria-hidden="true" /> Analyze label
              </button>
            </section>
          )}
          <details className="scan-formats">
            <summary><ImagePlus size={18} aria-hidden="true" /> Photo formats and limits <ChevronDown size={18} aria-hidden="true" /></summary>
            <p>Choose up to four JPG, PNG, WebP, still GIF, HEIC, or HEIF photos from the same bottle. Each photo can be up to 12 MB, with a 24 MB total limit. PresDes prepares previews for HEIC and HEIF photos.</p>
          </details>
        </>
      )}
    </div>
  );
}
