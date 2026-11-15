import { useEffect, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import type { Analysis } from '../api/client';
import { readHistory, removeAnalysis } from '../history';
import { Results } from '../components/Results';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function History() {
  const [items, setItems] = useState<Analysis[]>([]);
  const [open, setOpen] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    function refresh() {
      try {
        const list = readHistory();
        setItems(list);
        setOpen(current => list.find(item => item.id === current?.id) ?? null);
        setError('');
      } catch {
        setError('Saved scans could not be read in this browser.');
      }
    }
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  function deleteScan(id: string) {
    try {
      removeAnalysis(id);
      setItems(items => items.filter(item => item.id !== id));
      setNotice('Saved scan deleted.');
      setError('');
      requestAnimationFrame(() => document.getElementById('history-heading')?.focus());
    } catch {
      setNotice('');
      setError('This browser could not delete the scan. Try again.');
    }
  }

  function closeResult() {
    setOpen(null);
    const id = open?.id;
    requestAnimationFrame(() => document.getElementById('open-scan-' + id)?.focus());
  }

  if (open) return <Results result={open} saved onBack={closeResult} />;

  return (
    <>
      <div className="page-intro">
        <h1 id="history-heading" tabIndex={-1}>Saved scans</h1>
        <p className="lede">Reopen label text and explanations you chose to keep in this browser.</p>
      </div>
      <p className="sr-only" role="status">{notice}</p>
      {error && <p className="notice" role="alert">{error}</p>}
      {!error && items.length === 0 && (
        <section className="card empty-state">
          <h2>No saved scans yet</h2>
          <p className="muted">After analyzing a label, choose “Save text on this browser” to keep a copy.</p>
          <a className="button primary" href="#scan">Scan a label <ArrowRight size={19} aria-hidden="true" /></a>
        </section>
      )}
      <ul className="history-list">
        {items.map(item => {
          const name = item.medication.excerpts.join(' ') || 'Medication label';
          return (
            <li key={item.id} className="card history-item">
              <div>
                <h2 lang={item.source_language} dir="auto">{name}</h2>
                <p className="muted"><time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time></p>
              </div>
              <div className="button-row">
                <button id={'open-scan-' + item.id} className="button outline" type="button" onClick={() => setOpen(item)} aria-label={'Open saved scan for ' + name}>Open</button>
                <button className="button plain" type="button" onClick={() => deleteScan(item.id)} aria-label={'Delete saved scan for ' + name}>
                  <Trash2 size={19} aria-hidden="true" /> Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
