import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, ScanLine } from 'lucide-react';
import { analyze, languages, type Analysis, type Language } from '../api/client';
import { Capture } from '../components/Capture';
import { Results } from '../components/Results';
import { exampleAnalysis, examplePhoto } from '../demo';

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxPhotoBytes = 12 * 1024 * 1024;

type Photo = { file: File; url: string };
type Scan = { result: Analysis; photo: { url: string; alt: string }; example?: boolean };

export default function ScanPage() {
  const pending = useRef<AbortController | null>(null);
  const activeUrl = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const release = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = null;
  }, []);

  useEffect(() => release, [release]);
  useEffect(() => { if (photo) reviewHeading.current?.focus(); }, [photo]);

  const reset = useCallback(() => {
    release();
    setPhoto(null);
    setScan(null);
    setBusy(false);
    setError('');
  }, [release]);

  const choosePhoto = useCallback((file: File) => {
    reset();
    if (!supportedTypes.has(file.type)) {
      setError('Choose a JPG, PNG, or WebP photo.');
      return;
    }
    if (!file.size || file.size > maxPhotoBytes) {
      setError(file.size ? 'The photo exceeds 12 MB. Choose a smaller photo.' : 'The photo is empty. Choose another file.');
      return;
    }
    const url = URL.createObjectURL(file);
    activeUrl.current = url;
    setPhoto({ file, url });
  }, [reset]);

  async function submit() {
    if (!photo || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');

    try {
      const result = await analyze(photo.file, language, controller.signal);
      if (pending.current === controller) {
        setScan({ result, photo: { url: photo.url, alt: 'Medication label photo used for this analysis' } });
      }
    } catch (cause) {
      if (pending.current === controller) {
        setError(cause instanceof Error ? cause.message : 'Could not analyze this photo. Try again.');
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
      photo: { url: examplePhoto, alt: 'Fictional Pine Sample training label' },
      example: true,
    });
  }

  function backToCapture() {
    reset();
    requestAnimationFrame(() => heading.current?.focus());
  }

  if (scan) return <Results {...scan} onBack={backToCapture} />;

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
          <h2 id="capture-heading">Add a label photo</h2>
          <p className="muted">Use your camera or choose a JPG, PNG, or WebP photo up to 12 MB.</p>
          <Capture onPhoto={choosePhoto} onCameraOpened={reset} />
          {photo && (
            <section className="photo-review" aria-labelledby="review-heading">
              <h3 id="review-heading" ref={reviewHeading} tabIndex={-1}>Review your photo</h3>
              <img className="preview" src={photo.url} alt="Medication label photo selected for analysis" />
              <p className="filename muted">{photo.file.name}</p>
              <div className="field">
                <label htmlFor="explanation-language">Explanation language</label>
                <select id="explanation-language" value={language} disabled={busy} onChange={event => setLanguage(event.target.value as Language)}>
                  {(Object.keys(languages) as Language[]).map(code => (
                    <option key={code} value={code}>{languages[code].label}</option>
                  ))}
                </select>
                <p className="muted">The extracted wording stays in the language printed on the label.</p>
              </div>
              <p className="muted">Analyzing sends the photo to OpenAI. Cover names and other personal information before continuing.</p>
              <button className="button primary" type="button" disabled={busy} onClick={submit}>
                <ScanLine size={20} aria-hidden="true" /> {busy ? 'Analyzing…' : 'Analyze label'}
              </button>
            </section>
          )}
          <p className="sr-only" role="status">{busy ? 'Analyzing the selected photo.' : ''}</p>
          {error && <p className="notice" role="alert">{error}</p>}
        </section>
        <aside className="guide">
          <section className="guide-section">
            <Camera size={23} aria-hidden="true" />
            <h2>Get a clear photo</h2>
            <ul>
              <li>Fill the frame with one label.</li>
              <li>Use even light and avoid glare.</li>
              <li>Check that small print is in focus.</li>
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
