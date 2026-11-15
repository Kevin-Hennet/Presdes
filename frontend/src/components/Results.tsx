import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, CalendarDays, ClipboardList, FileText, Image, ShieldAlert, type LucideIcon } from 'lucide-react';
import { languages, type Analysis, type PrintedSection, type SourceLanguage } from '../api/client';
import { saveAnalysis } from '../history';
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
};

function PrintedLabelSection({ title, subject, icon: Icon, section, language, speech }: LabelSectionProps) {
  const status = section.state === 'unclear'
    ? `Text for ${subject} is unclear or incomplete in this photo. Check the printed label or retake the photo.`
    : section.state === 'not_found' ? `No text for ${subject} was found in this photo.` : '';
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

function SourcePhoto({ url, alt }: { url: string; alt: string }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="button outline"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(value => !value)}
      >
        <Image size={21} aria-hidden="true" /> {expanded ? 'Hide source photo' : 'View source photo'}
      </button>
      <div id={panelId} className="card result-section source-photo-panel" hidden={!expanded}>
        <img className="preview" src={url} alt={alt} />
        <a className="button outline" href={url} target="_blank" rel="noreferrer">Open full-size photo (new tab)</a>
      </div>
    </div>
  );
}

type ResultsProps = {
  result: Analysis;
  photo?: { url: string; alt: string };
  example?: boolean;
  onBack: () => void;
  saved?: boolean;
};

export function Results({ result, photo, example = false, onBack, saved = false }: ResultsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const speech = useSpeech();
  const [level, setLevel] = useState<'simple' | 'detailed'>('simple');
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>(saved ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState('');
  const source = result.source_language;
  const language = result.explanation_language;
  const usable = result.readability === 'readable' || result.readability === 'partial';
  const canSave = usable && !example && !saved;
  const uncertainties = result.uncertainties.join('\n');

  useEffect(() => { heading.current?.focus(); }, []);

  function save() {
    try {
      saveAnalysis(result);
      setSaveState('saved');
    } catch (error) {
      setSaveState('failed');
      setSaveError(error instanceof Error ? error.message : 'This browser could not save the scan.');
    }
  }

  return (
    <>
      <button type="button" className="button plain back" onClick={onBack}>
        <ArrowLeft size={19} aria-hidden="true" /> {saved ? 'Back to saved scans' : 'New photo'}
      </button>
      <div className="page-intro">
        <p className="eyebrow">{example ? 'Fictional example · prepared result' : saved ? 'Saved scan' : 'Scan result'}</p>
        <h1 ref={heading} tabIndex={-1}>
          {usable ? 'Read your label' : result.readability === 'unreadable' ? 'This label is unreadable' : 'Medication label needed'}
        </h1>
        <p className="lede">
          {usable
            ? 'Compare the AI-extracted wording with the printed label before relying on it.'
            : 'Take another photo with the whole medication label in focus and free of glare.'}
        </p>
        {photo && <SourcePhoto {...photo} />}
        {saved && <p className="muted">Saved scans contain text only.</p>}
      </div>
      <p className="sr-only" role="status">
        {usable ? 'Label analysis ready.' : 'Analysis complete. A new photo is needed.'}
      </p>
      <div className={canSave ? 'result-layout' : 'result-stack'}>
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
              {(Object.keys(labelSections) as Array<keyof typeof labelSections>).map(key => (
                <PrintedLabelSection key={key} {...labelSections[key]} section={result[key]} language={source} speech={speech} />
              ))}
              <section className="card result-section">
                <div className="section-header">
                  <h2><FileText size={21} aria-hidden="true" /> Full extracted label</h2>
                  <SpeechButton speech={speech} section="full extracted label" parts={[{ text: result.extracted_text, language: source }]} />
                </div>
                <p className="transcript" lang={source} dir="auto">{result.extracted_text}</p>
              </section>
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
                      setLevel(event.target.value === 'detailed' ? 'detailed' : 'simple');
                    }}>
                      <option value="simple">Plain language</option>
                      <option value="detailed">More detail</option>
                    </select>
                    <span className="muted">{languages[language].label}</span>
                  </div>
                  <p className="transcript" lang={language} dir="auto">{result.explanations[level]}</p>
                </section>
              )}
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
        {canSave && (
          <aside aria-label="Save options">
            <section className="card result-section">
              <h2>Keep this scan</h2>
              <p className="muted">Save extracted text and explanations on this browser. Anyone using this browser profile can read saved scans.</p>
              <button type="button" className="button outline" disabled={saveState === 'saved'} onClick={save}>
                <Bookmark size={19} aria-hidden="true" /> Save text on this browser
              </button>
              {saveState === 'saved' && <p role="status">Scan text saved on this browser.</p>}
              {saveState === 'failed' && <p role="alert" className="notice">Scan not saved. {saveError}</p>}
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
