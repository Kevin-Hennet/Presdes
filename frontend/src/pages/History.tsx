import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import {
  deleteMongoScan, getMongoScan, listMongoScans, type Analysis, type MongoScanPage, type MongoScanSummary,
} from '../api/client';
import { readHistory, removeAnalysis } from '../history';
import { Results } from '../components/Results';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
type Source = 'browser' | 'mongodb';
type OpenScan = { result: Analysis; source: Source; example?: boolean };

export default function History() {
  const [source, setSource] = useState<Source>('browser');
  const [browserItems, setBrowserItems] = useState<Analysis[]>([]);
  const [browserError, setBrowserError] = useState('');
  const [page, setPage] = useState<MongoScanPage | null>(null);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [mongoError, setMongoError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState<OpenScan | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const before = cursors[cursors.length - 1];

  useEffect(() => {
    function refreshBrowser() {
      try {
        const list = readHistory();
        setBrowserItems(list);
        setOpen(current => {
          if (current?.source !== 'browser') return current;
          const result = list.find(item => item.id === current.result.id);
          return result ? { source: 'browser', result } : null;
        });
        setBrowserError('');
      } catch {
        setBrowserError('Saved scans could not be read in this browser.');
      }
    }
    refreshBrowser();
    window.addEventListener('storage', refreshBrowser);
    return () => window.removeEventListener('storage', refreshBrowser);
  }, []);

  useEffect(() => {
    if (source !== 'mongodb') return;
    const controller = new AbortController();
    setLoading(true);
    setMongoError('');
    setPage(null);
    void listMongoScans(controller.signal, before).then(data => {
      if (!controller.signal.aborted) setPage(data);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setMongoError(cause instanceof Error ? cause.message : 'MongoDB saved scans could not be read.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [source, before, refresh]);

  useEffect(() => () => pending.current?.abort(), []);

  function switchSource(next: Source) {
    if (next === source) return;
    setError('');
    setNotice('');
    setSource(next);
  }

  async function runOperation(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setWorking(true);
    setNotice('');
    setError('');
    try {
      await action(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'The saved scan could not be updated.');
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  function openScan(id: string) {
    if (source === 'browser') {
      const result = browserItems.find(item => item.id === id);
      if (result) setOpen({ source, result });
      return;
    }
    void runOperation(async signal => {
      const saved = await getMongoScan(id, signal);
      if (!signal.aborted) setOpen({ source, result: saved.result, example: saved.example });
    });
  }

  function deleteScan(id: string) {
    void runOperation(async signal => {
      if (source === 'browser') {
        try {
          removeAnalysis(id);
        } catch {
          throw new Error('This browser could not delete the scan. Try again.');
        }
        setBrowserItems(items => items.filter(item => item.id !== id));
        setNotice('Saved scan deleted from this browser.');
      } else {
        await deleteMongoScan(id, signal);
        if (signal.aborted) return;
        setRefresh(value => value + 1);
        setNotice('Saved scan deleted from MongoDB.');
      }
      requestAnimationFrame(() => document.getElementById('history-heading')?.focus());
    });
  }

  function closeResult() {
    const id = open?.result.id;
    setOpen(null);
    requestAnimationFrame(() => document.getElementById('open-scan-' + id)?.focus());
  }

  if (open) return <Results result={open.result} saved={open.source} example={open.example} onBack={closeResult} />;

  const items: MongoScanSummary[] = source === 'mongodb' ? page?.items ?? [] : browserItems.map(item => ({
    id: item.id,
    name: item.medication.excerpts.join(' ') || 'Medication label',
    source_language: item.source_language,
    saved_at: item.created_at,
    example: false,
  }));
  const listError = source === 'mongodb' ? mongoError : browserError;
  const listing = source === 'mongodb' && loading;
  const nextPage = page?.next_before;

  return (
    <>
      <div className="page-intro">
        <h1 id="history-heading" tabIndex={-1}>Saved scans</h1>
        <div className="button-row" role="group" aria-label="Saved scan storage">
          <button className="button outline" type="button" aria-pressed={source === 'browser'} disabled={working} onClick={() => switchSource('browser')}>This browser</button>
          <button className="button outline" type="button" aria-pressed={source === 'mongodb'} disabled={working} onClick={() => switchSource('mongodb')}>MongoDB</button>
        </div>
        <p className="lede">
          {source === 'browser'
            ? 'Reopen label text and explanations kept in this browser profile.'
            : 'Reopen text you saved to MongoDB from this browser session. To access these records, return to this browser profile.'}
        </p>
      </div>
      <p className="sr-only" role="status">{notice}</p>
      {listing && <p role="status">Loading MongoDB saved scans…</p>}
      {(error || listError) && <p className="notice" role="alert">{error || listError}</p>}
      {source === 'mongodb' && listError && (
        <button className="button outline" type="button" onClick={() => setRefresh(value => value + 1)}>Retry MongoDB history</button>
      )}
      {!listError && !listing && items.length === 0 && (
        <section className="card empty-state">
          <h2>{source === 'browser' ? 'No saved scans yet' : 'No saved scans on this page'}</h2>
          <p className="muted">
            {source === 'browser'
              ? 'After analyzing a label, choose “Save text on this browser” to keep a copy.'
              : 'Choose “Save text to MongoDB” from a scan result or the prepared fictional example.'}
          </p>
          <a className="button primary" href="#scan">Scan a label <ArrowRight size={19} aria-hidden="true" /></a>
        </section>
      )}
      <ul className="history-list">
        {items.map(item => (
          <li key={item.id} className="card history-item">
            <div>
              <h2 lang={item.source_language} dir="auto">{item.name}</h2>
              {item.example && <p className="muted">Fictional example</p>}
              <p className="muted"><time dateTime={item.saved_at}>{dateFormat.format(new Date(item.saved_at))}</time></p>
            </div>
            <div className="button-row">
              <button id={'open-scan-' + item.id} className="button outline" type="button" disabled={working} onClick={() => openScan(item.id)} aria-label={'Open saved scan for ' + item.name}>Open</button>
              <button className="button plain" type="button" disabled={working} onClick={() => deleteScan(item.id)} aria-label={'Delete saved scan for ' + item.name}>
                <Trash2 size={19} aria-hidden="true" /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {source === 'mongodb' && (cursors.length > 1 || nextPage) && (
        <nav className="button-row" aria-label="MongoDB saved scan pages">
          <button className="button outline" type="button" disabled={working || listing || cursors.length === 1}
            onClick={() => setCursors(values => values.slice(0, -1))}>Previous page</button>
          <button className="button outline" type="button" disabled={working || listing || !nextPage}
            onClick={() => { if (nextPage) setCursors(values => [...values, nextPage]); }}>Next page</button>
        </nav>
      )}
    </>
  );
}
