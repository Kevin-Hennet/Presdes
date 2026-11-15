import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, CalendarDays, ClipboardList, FileText, Image, ShieldAlert } from 'lucide-react';
import { languages, type Analysis, type PrintedSection, type SourceLanguage } from '../api/client';
import { saveAnalysis } from '../history';
import { SpeechButton, useSpeech } from './Speech';

const sectionLabels = {
  directions: 'Directions',
  warnings: 'Printed warnings',
  printed_dates: 'Printed expiration or discard dates',
} as const;
const sectionIcons = {
  directions: ClipboardList,
  warnings: ShieldAlert,
  printed_dates: CalendarDays,
};
const sectionMessages = {
  unclear: 'Unclear in this photo. Check the label or retake the photo.',
  not_found: 'No matching text found in this photo.',
};

function Excerpts({ section, language }: { section: PrintedSection; language: SourceLanguage }) {
  return (
    <>
      {section.state !== 'found' && <p className="muted">{sectionMessages[section.state]}</p>}
      {section.excerpts.map((excerpt, index) => (
        <blockquote key={index} lang={language} dir="auto">{excerpt}</blockquote>
      ))}
    </>
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
      </div>
      <p className="sr-only" role="status">
        {usable ? 'Label analysis ready.' : 'Analysis complete. A new photo is needed.'}
      </p>
      <div className="result-layout">
        <div className="result-stack">
          {result.uncertainties.length > 0 && (
            <section className="notice" aria-labelledby="uncertainties">
              <h2 id="uncertainties">What may be unclear</h2>
              <ul lang={language} dir="auto">
                {result.uncertainties.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </section>
          )}
          {usable && (
            <>
              <section className="card result-section">
                <h2>Medication on label</h2>
                <Excerpts section={result.medication} language={source} />
              </section>
              {(Object.keys(sectionLabels) as Array<keyof typeof sectionLabels>).map(key => {
                const Icon = sectionIcons[key];
                const title = sectionLabels[key];
                const section = result[key];
                return (
                  <section className="card result-section" key={key}>
                    <div className="section-header">
                      <h2><Icon size={21} aria-hidden="true" /> {title}</h2>
                      <SpeechButton speech={speech} section={title.toLowerCase()} text={section.excerpts.join('\n')} language={source} />
                    </div>
                    <Excerpts section={section} language={source} />
                  </section>
                );
              })}
              <section className="card result-section">
                <div className="section-header">
                  <h2><FileText size={21} aria-hidden="true" /> Full extracted label</h2>
                  <SpeechButton speech={speech} section="full extracted label" text={result.extracted_text} language={source} />
                </div>
                <p className="transcript" lang={source} dir="auto">{result.extracted_text}</p>
              </section>
              {result.explanations && (
                <section className="card explanation result-section">
                  <div className="section-header">
                    <h2>{example ? 'Example explanation' : 'AI explanation'}</h2>
                    <SpeechButton speech={speech} section="explanation" text={result.explanations[level]} language={language} />
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
        <aside className="result-stack" aria-label="Photo and scan actions">
          <section className="card result-section">
            <h2><Image size={21} aria-hidden="true" /> Source photo</h2>
            {photo ? (
              <a className="photo-link" href={photo.url} target="_blank" rel="noreferrer">
                <img className="preview" src={photo.url} alt={photo.alt} />
                <span>Open full-size photo (new tab)</span>
              </a>
            ) : <p className="muted">Saved scans contain text only.</p>}
          </section>
          {usable && !example && !saved && (
            <section className="card result-section">
              <h2>Keep this scan</h2>
              <p className="muted">Save extracted text and explanations on this browser. Anyone using this browser profile can read saved scans.</p>
              <button type="button" className="button outline" disabled={saveState === 'saved'} onClick={save}>
                <Bookmark size={19} aria-hidden="true" /> Save text on this browser
              </button>
              {saveState === 'saved' && <p role="status">Scan text saved on this browser.</p>}
              {saveState === 'failed' && <p role="alert" className="notice">Scan not saved. {saveError}</p>}
            </section>
          )}
          {usable && !speech.supported && <p className="notice">Read-aloud is unavailable in this browser.</p>}
          {speech.error && <p className="notice" role="alert">{speech.error}</p>}
        </aside>
      </div>
    </>
  );
}
