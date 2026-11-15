import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, CalendarDays, ClipboardList, FileText, Image, ShieldAlert, type LucideIcon } from 'lucide-react';
import { ApiError, getHistoryScan, languages, retrySaveScan, setSavedMedication, type Analysis, type PrintedSection, type SourceLanguage } from '../api/client';
import type { ResultView } from '../scan-workspace';
import { SpeechButton, useSpeech, type SpeechPart } from './Speech';

type LabelSection = {
  title: string;
  subject: string;
  icon?: LucideIcon;
};

const labelSections = {
  medication: { title: 'Medication on label', subject: 'the medication name or strength' },
  directions: { title: 'Directions', subject: 'the directions', icon: ClipboardList },
  warnings: { title: 'Printed warnings', subject: 'printed warnings', icon: ShieldAlert },
  printed_dates: { title: 'Printed expiration or discard dates', subject: 'printed expiration or discard dates', icon: CalendarDays },
} satisfies Record<string, LabelSection>;

type LabelSectionProps = LabelSection & {
  section: PrintedSection;
  language: SourceLanguage;
  speech: ReturnType<typeof useSpeech>;
  evidence: string;
};

function PrintedLabelSection({ title, subject, icon: Icon, section, language, speech, evidence }: LabelSectionProps) {
  const status = section.state === 'unclear'
    ? `Text for ${subject} is unclear or incomplete in ${evidence}. Check the printed label or retake the photo.`
    : section.state === 'not_found' ? `No text for ${subject} was found in ${evidence}.` : '';
  const excerpt = section.excerpts.join('\n');
  const parts: SpeechPart[] = [];
  if (status) {
    parts.push({ text: excerpt ? status + ' Readable text follows.' : status, language: 'en' });
  }
  if (excerpt) parts.push({ text: excerpt, language });

  return (
    <section className="card result-section">
      <div className="section-header">
        <h2>{Icon && <Icon size={21} aria-hidden="true" />} {title}</h2>
        <SpeechButton speech={speech} section={title.toLowerCase()} parts={parts} />
      </div>
      {status && <p className="muted">{status}</p>}
      {section.excerpts.map((excerpt, index) => (
        <blockquote key={index} lang={language} dir="auto">{excerpt}</blockquote>
      ))}
    </section>
  );
}

export type SourcePhoto = { url: string; alt: string };

function SourcePhotos({ photos }: { photos: SourcePhoto[] }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const multiple = photos.length > 1;

  return (
    <div>
      <button
        type="button"
        className="button outline"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(value => !value)}
      >
        <Image size={21} aria-hidden="true" /> {expanded ? 'Hide' : 'View'} source {multiple ? 'photos' : 'photo'}
      </button>
      <ul id={panelId} className="card scan-photos source-photo-panel" hidden={!expanded}>
        {photos.map(({ url, alt }, index) => (
          <li className="scan-photo" key={url}>
            <img className="preview" src={url} alt={alt} />
            <a className="button outline" href={url} target="_blank" rel="noreferrer">
              {multiple ? `Open full-size photo ${index + 1} (new tab)` : 'Open full-size photo (new tab)'}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ResultsProps = {
  result: Analysis;
  photos?: SourcePhoto[];
  example?: boolean;
  onBack: () => void;
  onReviewPhotos?: () => void;
  saved?: 'browser' | 'history';
  medicationSaved?: boolean;
  onMedicationChange?: (saved: boolean) => void;
  workspaceView?: ResultView;
  onWorkspaceViewChange?: (id: string, change: Partial<ResultView>, expected?: ResultView) => void;
  reconcileHistory?: boolean;
};

export function Results({
  result, photos, example = false, onBack, onReviewPhotos, saved,
  medicationSaved = false, onMedicationChange,
  workspaceView, onWorkspaceViewChange, reconcileHistory = false,
}: ResultsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const medicationButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const pendingUpdate = useRef(false);
  const speech = useSpeech();
  const [savedView, setSavedView] = useState<ResultView>({
    level: 'simple', history: saved === 'history' ? 'saved' : 'unsaved', medicationSaved,
  });
  const view = workspaceView ?? savedView;
  const latestView = useRef(view);
  const { level, history, medicationSaved: isMedication } = view;
  const [checkAttempts, setCheckAttempts] = useState(0);
  const [checking, setChecking] = useState(reconcileHistory);
  const [checkFailed, setCheckFailed] = useState(false);
  const [updating, setUpdating] = useState<'retry' | 'medication' | null>(null);
  const [historyError, setHistoryError] = useState('');
  const source = result.source_language;
  const language = result.explanation_language;
  const usable = result.readability === 'readable' || result.readability === 'partial';
  const mismatch = result.readability === 'mismatched_labels';
  const evidence = photos ? (photos.length > 1 ? 'these photos' : 'this photo') : 'the scan';
  const canBookmark = usable && !example && saved !== 'browser';
  const uncertainties = result.uncertainties.join('\n');

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { latestView.current = view; }, [view]);
  useEffect(() => {
    if (!onWorkspaceViewChange || !canBookmark) return;
    function checkAfterRestore(event: PageTransitionEvent) {
      if (event.persisted) setCheckAttempts(attempts => attempts + 1);
    }
    window.addEventListener('pageshow', checkAfterRestore);
    return () => window.removeEventListener('pageshow', checkAfterRestore);
  }, [canBookmark, onWorkspaceViewChange]);

  useEffect(() => {
    if (!canBookmark || !onWorkspaceViewChange || (!reconcileHistory && checkAttempts === 0)) return;
    const controller = new AbortController();
    const expected = latestView.current;
    setChecking(true);
    setCheckFailed(false);
    void getHistoryScan(result.id, controller.signal).then(record => {
      if (!controller.signal.aborted) {
        if (record.result.id !== result.id) throw new Error('Unexpected scan ID');
        onWorkspaceViewChange(result.id, { history: 'saved', medicationSaved: record.saved_medication === true }, expected);
      }
    }).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 410)) {
        if (expected.history !== 'unsaved' || cause.status === 410) {
          onWorkspaceViewChange(result.id, { history: 'missing', medicationSaved: false }, expected);
        }
      } else {
        setCheckFailed(true);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setChecking(false);
    });
    return () => controller.abort();
  }, [canBookmark, checkAttempts, onWorkspaceViewChange, reconcileHistory, result.id]);

  function changeView(change: Partial<ResultView>) {
    if (onWorkspaceViewChange) onWorkspaceViewChange(result.id, change);
    else setSavedView(previous => ({ ...previous, ...change }));
  }

  async function updateHistory(action: 'retry' | 'medication') {
    if (pendingUpdate.current || checking || checkFailed || history === 'missing') return;
    pendingUpdate.current = true;
    setUpdating(action);
    setHistoryError('');
    let confirmed = history === 'saved';
    try {
      if (!confirmed) {
        const record = await retrySaveScan(result);
        if (action === 'retry' && document.activeElement === retryButton.current) {
          requestAnimationFrame(() => medicationButton.current?.focus());
        }
        changeView({ history: 'saved', medicationSaved: record.saved_medication });
        confirmed = true;
      }
      if (action === 'medication') {
        const next = !isMedication;
        await setSavedMedication(result.id, next);
        changeView({ medicationSaved: next });
        onMedicationChange?.(next);
      }
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 410 || (confirmed && cause.status === 404))) {
        changeView({ history: 'missing', medicationSaved: false });
        onMedicationChange?.(false);
      } else if (confirmed) {
        setHistoryError(isMedication ? 'Could not remove this medication. Try again.' : 'Could not add this medication. Try again.');
      }
    } finally {
      pendingUpdate.current = false;
      setUpdating(null);
    }
  }

  return (
    <>
      <button type="button" className="button plain back" onClick={onBack}>
        <ArrowLeft size={19} aria-hidden="true" /> {saved ? 'Back to list' : 'New scan'}
      </button>
      <div className="page-intro">
        <p className="eyebrow">{example ? 'Fictional example · prepared result' : saved ? 'Saved scan' : 'Scan result'}</p>
        <h1 ref={heading} tabIndex={-1}>
          {usable ? 'Read your label' : mismatch ? 'Scan one bottle at a time'
            : result.readability === 'unreadable' ? 'This label is unreadable' : 'Medication label needed'}
        </h1>
        <p className="lede">
          {usable
            ? 'Compare the AI-extracted wording with the printed label before relying on it.'
            : mismatch
              ? 'These photos appear to show different bottles or labels. Review the photos and scan each bottle separately.'
              : 'Take another photo with the medication label in focus and free of glare.'}
        </p>
        {mismatch && onReviewPhotos && <button className="button primary" type="button" onClick={onReviewPhotos}>Review photos</button>}
        {photos?.length ? <SourcePhotos photos={photos} /> : null}
        {canBookmark && checking && <p className="muted" role="status">Checking Scan history…</p>}
        {canBookmark && checkFailed && (
          <div className="button-row">
            <p className="muted" role="status">Could not check Scan history.</p>
            <button className="button plain" type="button" onClick={() => setCheckAttempts(attempts => attempts + 1)}>Retry history check</button>
          </div>
        )}
        {canBookmark && !checking && !checkFailed && history === 'missing' && (
          <p className="muted" role="status">This scan is no longer in Scan history.</p>
        )}
        {canBookmark && !checking && !checkFailed && history !== 'missing' && (
          <div className="button-row">
            <button ref={medicationButton} type="button" className="button outline" aria-disabled={updating !== null}
              onClick={() => void updateHistory('medication')}>
              <Bookmark size={19} aria-hidden="true" />
              {updating === 'medication' ? (isMedication ? 'Removing medication…' : 'Adding medication…')
                : isMedication ? 'Remove from saved medications' : 'Add to saved medications'}
            </button>
            <p className="muted" role="status">{isMedication ? 'Added to saved medications' : ''}</p>
          </div>
        )}
        {canBookmark && !saved && !checking && !checkFailed && history !== 'missing' && (
          <div className="button-row">
            <p className="muted" role="status">{history === 'saved' ? 'Saved to Scan history.'
              : updating ? 'Saving this scan…' : 'Could not save this scan.'}</p>
            {history === 'unsaved' && <button ref={retryButton} type="button" className="button plain" aria-disabled={updating !== null}
              onClick={() => void updateHistory('retry')}>Retry saving scan</button>}
          </div>
        )}
        {historyError && <p className="notice" role="status">{historyError}</p>}
        {saved && <p className="muted">Saved scans contain text only. {saved === 'browser' ? 'From legacy history on this browser.' : ''}</p>}
      </div>
      <p className="sr-only" role="status">
        {usable ? 'Label analysis ready.' : mismatch ? 'Analysis complete. Scan each bottle separately.' : 'Analysis complete. A new photo is needed.'}
      </p>
      <div className="result-stack">
        {(usable || uncertainties) && !speech.supported && <p className="notice">Read-aloud is unavailable in this browser.</p>}
        {speech.error && <p className="notice" role="alert">{speech.error}</p>}
        {uncertainties && (
          <section className="notice" aria-labelledby="uncertainties">
            <div className="section-header">
              <h2 id="uncertainties">What may be unclear</h2>
              <SpeechButton speech={speech} section="what may be unclear" parts={[{ text: uncertainties, language }]} />
            </div>
            <ul lang={language} dir="auto">
              {result.uncertainties.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </section>
        )}
        {usable && (
          <>
            {result.explanations && (
              <section className="card explanation result-section">
                <div className="section-header">
                  <h2>{example ? 'Example explanation' : 'AI explanation'}</h2>
                  <SpeechButton speech={speech} section="explanation" parts={[{ text: result.explanations[level], language }]} />
                </div>
                <div className="explanation-options">
                  <label htmlFor="reading-level">Reading level</label>
                  <select id="reading-level" value={level} onChange={event => {
                    speech.stop();
                    changeView({ level: event.target.value === 'detailed' ? 'detailed' : 'simple' });
                  }}>
                    <option value="simple">Plain language</option>
                    <option value="detailed">More detail</option>
                  </select>
                  <span className="muted">{languages[language].label}</span>
                </div>
                <p className="transcript" lang={language} dir="auto">{result.explanations[level]}</p>
              </section>
            )}
            {(Object.keys(labelSections) as Array<keyof typeof labelSections>).map(key => (
              <PrintedLabelSection key={key} {...labelSections[key]} section={result[key]} language={source} speech={speech} evidence={evidence} />
            ))}
            <section className="card result-section">
              <div className="section-header">
                <h2><FileText size={21} aria-hidden="true" /> Full extracted label</h2>
                <SpeechButton speech={speech} section="full extracted label" parts={[{ text: result.extracted_text, language: source }]} />
              </div>
              <p className="transcript" lang={source} dir="auto">{result.extracted_text}</p>
            </section>
            {result.pharmacist_questions.length > 0 && (
              <section className="card result-section">
                <h2>Questions for your pharmacist</h2>
                <ul lang={language} dir="auto">
                  {result.pharmacist_questions.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
