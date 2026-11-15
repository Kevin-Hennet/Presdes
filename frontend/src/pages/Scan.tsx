import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, ScanLine } from 'lucide-react';
import { analyze, languages, type Analysis, type Language } from '../api/client';
import { Capture } from '../components/Capture';
import { Results, type SourcePhoto } from '../components/Results';
import { exampleAnalysis, examplePhoto } from '../demo';

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxPhotos = 4;
const maxPhotoBytes = 12 * 1024 * 1024;
const maxTotalBytes = 24 * 1024 * 1024;

type Photo = { file: File; url: string };
type Scan = { result: Analysis; photos: SourcePhoto[]; example?: boolean };

export default function ScanPage() {
  const pending = useRef<AbortController | null>(null);
  const selected = useRef<Photo[]>([]);
  const retakeTarget = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const captureHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [retaking, setRetaking] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const abortRequest = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  const release = useCallback(() => {
    abortRequest();
    for (const photo of selected.current) URL.revokeObjectURL(photo.url);
    selected.current = [];
  }, [abortRequest]);

  useEffect(() => release, [release]);

  function cancelAnalysis() {
    abortRequest();
    setBusy(false);
  }

  function reset() {
    release();
    setPhotos([]);
    changeRetakeTarget(null);
    setScan(null);
    setBusy(false);
    setError('');
  }

  function changePhotos(next: Photo[]) {
    cancelAnalysis();
    selected.current = next;
    setPhotos(next);
    setError('');
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
    if (retakeTarget.current !== retaking) return reject('The photo selection changed. Try again.');
    const previous = selected.current;
    const replaceIndex = retaking ? previous.findIndex(item => item.url === retaking) : -1;
    if (retaking && (files.length !== 1 || replaceIndex < 0)) {
      return reject('Choose one replacement photo.');
    }
    if (previous.length + files.length - (replaceIndex >= 0 ? 1 : 0) > maxPhotos) {
      return reject('Choose up to four photos of the same bottle.');
    }
    for (const file of files) {
      if (!supportedTypes.has(file.type)) {
        return reject(`${file.name} must be a JPG, PNG, or WebP photo.`);
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

    const additions = files.map(file => ({ file, url: URL.createObjectURL(file) }));
    if (replaceIndex >= 0) {
      const replaced = previous[replaceIndex];
      retained.splice(replaceIndex, 0, ...additions);
      URL.revokeObjectURL(replaced.url);
      changeRetakeTarget(null);
    } else {
      retained.push(...additions);
    }
    changePhotos(retained);
    if (origin === 'picker') focusReview();
  }

  function removePhoto(url: string, restoreFocus: boolean) {
    URL.revokeObjectURL(url);
    if (retaking === url) changeRetakeTarget(null);
    changePhotos(selected.current.filter(item => item.url !== url));
    if (restoreFocus) focusReview();
  }

  function retakePhoto(photo: Photo) {
    cancelAnalysis();
    setError('');
    changeRetakeTarget(photo.url);
    requestAnimationFrame(() => captureHeading.current?.focus());
  }

  async function submit() {
    if (!photos.length || pending.current || retaking) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');

    try {
      const result = await analyze(photos.map(photo => photo.file), language, controller.signal);
      if (pending.current === controller) {
        setScan({
          result,
          photos: photos.map((photo, index) => ({
            url: photo.url,
            alt: photos.length === 1 ? 'Medication label photo used for this analysis' : `Medication label source photo ${index + 1}`,
          })),
        });
      }
    } catch (cause) {
      if (pending.current === controller) {
        setError(cause instanceof Error ? cause.message : 'Could not analyze these photos. Try again.');
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  function showExample() {
    reset();
    setScan({
      result: exampleAnalysis,
      photos: [{ url: examplePhoto, alt: 'Fictional Pine Sample training label' }],
      example: true,
    });
  }

  function backToCapture() {
    reset();
    requestAnimationFrame(() => heading.current?.focus());
  }

  if (scan) {
    return <Results {...scan} onBack={backToCapture} onReviewPhotos={() => {
      setScan(null);
      focusReview();
    }} />;
  }

  const retakeNumber = photos.findIndex(photo => photo.url === retaking) + 1;
  return (
    <>
      <div className="page-intro scan-intro">
        <p className="eyebrow">Scan. Understand. Stay Informed.</p>
        <h1 ref={heading} tabIndex={-1}>Scan a medication label</h1>
        <p className="lede">Read the directions, printed warnings, and dates on your label. Listen to a section or get a plain-language explanation.</p>
      </div>
      <div className="workspace-grid">
        <section className="card capture-card" aria-labelledby="capture-heading">
          <div className="feature-icon"><ScanLine size={28} aria-hidden="true" /></div>
          <h2 id="capture-heading" ref={captureHeading} tabIndex={-1}>Add label photos</h2>
          <p className="muted">Use one photo or up to four overlapping views of the same bottle. Choose JPG, PNG, or WebP files up to 12 MB each and 24 MB total.</p>
          {retakeNumber > 0 && (
            <div className="notice">
              <p role="status">Retaking photo {retakeNumber}. Capture a replacement or choose one photo.</p>
              <button className="button outline" type="button" onClick={() => {
                changeRetakeTarget(null);
                focusReview();
              }}>Cancel retake</button>
            </div>
          )}
          <Capture
            photos={photos}
            maxPhotos={maxPhotos}
            retaking={retaking}
            onPhotos={choosePhotos}
            onRemove={url => removePhoto(url, false)}
            onRetake={changeRetakeTarget}
            onCameraOpened={cancelAnalysis}
            onCameraDone={focusReview}
          />
          {photos.length > 0 && (
            <section className="photo-review" aria-labelledby="review-heading">
              <h3 id="review-heading" ref={reviewHeading} tabIndex={-1}>
                {photos.length === 1 ? 'Review your photo' : 'Review your photos'}
              </h3>
              <ul className="scan-photos">
                {photos.map((photo, index) => {
                  const number = index + 1;
                  return (
                    <li className="scan-photo" key={photo.url}>
                      <img className="preview" src={photo.url} alt={photos.length === 1
                        ? 'Medication label photo selected for analysis'
                        : `Medication label photo ${number} selected for analysis`} />
                      <p className="muted">Photo {number} · {photo.file.name}</p>
                      <div className="button-row">
                        <button className="button outline" type="button" aria-label={`Retake photo ${number}`} onClick={() => retakePhoto(photo)}>Retake</button>
                        <button className="button plain" type="button" aria-label={`Remove photo ${number}`} onClick={() => removePhoto(photo.url, true)}>Remove</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="field">
                <label htmlFor="explanation-language">Explanation language</label>
                <select id="explanation-language" value={language} disabled={busy} onChange={event => setLanguage(event.target.value as Language)}>
                  {(Object.keys(languages) as Language[]).map(code => (
                    <option key={code} value={code}>{languages[code].label}</option>
                  ))}
                </select>
                <p className="muted">The extracted wording stays in the language printed on the label.</p>
              </div>
              <p className="muted">Analyzing sends the selected photos to OpenAI. Cover names and other personal information before continuing.</p>
              <button className="button primary" type="button" disabled={busy || Boolean(retaking)} onClick={submit}>
                <ScanLine size={20} aria-hidden="true" /> {busy ? 'Analyzing…' : 'Analyze label'}
              </button>
            </section>
          )}
          <p className="sr-only" role="status">
            {busy ? 'Analyzing the selected photos.' : `${photos.length} of ${maxPhotos} photos selected.`}
          </p>
          {error && <p className="notice" role="alert">{error}</p>}
        </section>
        <aside className="guide">
          <section className="guide-section">
            <Camera size={23} aria-hidden="true" />
            <h2>Get a clear photo</h2>
            <ul>
              <li>Use one bottle per scan. Rotate it to show each part of the label.</li>
              <li>Include a little of the same printed text in neighboring photos.</li>
              <li>Use even light, avoid glare, and check that small print is in focus.</li>
            </ul>
          </section>
          <section className="guide-section">
            <h2>See how it works</h2>
            <p>Explore a prepared result for a fictional label.</p>
            <button className="button link-button" type="button" onClick={showExample}>
              Try fictional example <ArrowRight size={19} aria-hidden="true" />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
