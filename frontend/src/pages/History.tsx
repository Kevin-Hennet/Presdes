import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import {
  deleteHistoryScan, getHistoryScan, listHistoryScans, type Analysis, type HistoryScanPage, type HistoryScanSummary,
} from '../api/client';
import { readHistory, removeAnalysis } from '../history';
import { Results } from '../components/Results';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const views = {
  medications: {
    title: 'Saved medications',
    description: 'Reopen the medications you added from scan results in this browser.',
    empty: 'No saved medications yet',
  },
  history: {
    title: 'Scan history',
    description: 'Readable label results are saved automatically for this browser. Deleting a scan also removes it from Saved medications.',
    empty: 'No scans in this history',
  },
  legacy: {
    title: 'Legacy browser history',
    description: 'Reopen scans that were previously saved on this browser.',
    empty: 'No legacy browser scans',
  },
} as const;
type View = keyof typeof views;
type OpenScan = { result: Analysis; source: 'browser' | 'history'; example?: boolean; medication?: boolean };

export default function History() {
  const [view, setView] = useState<View>('medications');
  const [browserItems, setBrowserItems] = useState<Analysis[]>([]);
  const [browserError, setBrowserError] = useState('');
  const [page, setPage] = useState<HistoryScanPage | null>(null);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState<OpenScan | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const before = cursors[cursors.length - 1];
  const isLegacy = view === 'legacy';
  const description = views[view];

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
    if (view === 'legacy') return;
    const controller = new AbortController();
    setLoading(true);
    setHistoryError('');
    setPage(null);
    void listHistoryScans(controller.signal, view === 'medications', before).then(data => {
      if (!controller.signal.aborted) setPage(data);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setHistoryError(cause instanceof Error ? cause.message : 'Scan history could not be read.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [view, before, refresh]);

  useEffect(() => () => pending.current?.abort(), []);

  function switchView(next: View) {
    if (next === view) return;
    setError('');
    setNotice('');
    setPage(null);
    setCursors([undefined]);
    setView(next);
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
    if (isLegacy) {
      const result = browserItems.find(item => item.id === id);
      if (result) setOpen({ source: 'browser', result });
      return;
    }
    void runOperation(async signal => {
      const saved = await getHistoryScan(id, signal);
      if (!signal.aborted) setOpen({
        source: 'history', result: saved.result, example: saved.example, medication: saved.saved_medication,
      });
    });
  }

  function deleteScan(id: string) {
    void runOperation(async signal => {
      if (isLegacy) {
        try {
          removeAnalysis(id);
        } catch {
          throw new Error('This browser could not delete the scan. Try again.');
        }
        setBrowserItems(items => items.filter(item => item.id !== id));
        setNotice('Scan deleted from legacy browser history.');
      } else {
        await deleteHistoryScan(id, signal);
        if (signal.aborted) return;
        setRefresh(value => value + 1);
        setNotice('Scan deleted from history.');
      }
      requestAnimationFrame(() => document.getElementById('history-heading')?.focus());
    });
  }

  function closeResult() {
    const id = open?.result.id;
    setOpen(null);
    requestAnimationFrame(() => {
      (document.getElementById('open-scan-' + id) ?? document.getElementById('history-heading'))?.focus();
    });
  }

  function updateBookmark(id: string, medication: boolean) {
    setOpen(current => current?.result.id === id ? { ...current, medication } : current);
    setPage(current => current && {
      ...current,
      items: view === 'medications' && !medication
        ? current.items.filter(item => item.id !== id)
        : current.items.map(item => item.id === id ? { ...item, saved_medication: medication } : item),
    });
  }

  if (open) return <Results
    result={open.result} saved={open.source} example={open.example} medicationSaved={open.medication}
    onBack={closeResult} onMedicationChange={saved => updateBookmark(open.result.id, saved)}
  />;

  const items: HistoryScanSummary[] = isLegacy ? browserItems.map(item => ({
    id: item.id,
    name: item.medication.excerpts.join(' ') || 'Medication label',
    source_language: item.source_language,
    saved_at: item.created_at,
    example: false,
    saved_medication: false,
  })) : page?.items ?? [];
  const listError = isLegacy ? browserError : historyError;
  const listing = !isLegacy && loading;
  const nextPage = page?.next_before;

  return (
    <>
      <div className="page-intro">
        <h1 id="history-heading" tabIndex={-1}>{description.title}</h1>
        <div className="button-row" role="group" aria-label="Scan collections">
          {(Object.keys(views) as View[]).map(item => (
            <button key={item} className="button outline" type="button" aria-pressed={view === item}
              disabled={working} onClick={() => switchView(item)}>{views[item].title}</button>
          ))}
        </div>
        <p className="lede">{description.description}</p>
      </div>
      <p className="sr-only" role="status">{notice}</p>
      {listing && <p role="status">Loading {description.title.toLowerCase()}…</p>}
      {(error || listError) && <p className="notice" role="alert">{error || listError}</p>}
      {!isLegacy && listError && (
        <button className="button outline" type="button" onClick={() => setRefresh(value => value + 1)}>Retry loading scans</button>
      )}
      {!listError && !listing && items.length === 0 && (
        <section className="card empty-state">
          <h2>{description.empty}</h2>
          {view === 'medications' && <p className="muted">Choose “Add to saved medications” on a label result.</p>}
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
              {view !== 'medications' && (
                <button className="button plain" type="button" disabled={working} onClick={() => deleteScan(item.id)}
                  aria-label={item.saved_medication ? 'Delete scan and saved medication for ' + item.name : 'Delete scan from history for ' + item.name}>
                  <Trash2 size={19} aria-hidden="true" /> {item.saved_medication ? 'Delete scan and saved medication' : 'Delete from history'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!isLegacy && (cursors.length > 1 || nextPage) && (
        <nav className="button-row" aria-label="Scan pages">
          <button className="button outline" type="button" disabled={working || listing || cursors.length === 1}
            onClick={() => setCursors(values => values.slice(0, -1))}>Previous page</button>
          <button className="button outline" type="button" disabled={working || listing || !nextPage}
            onClick={() => { if (nextPage) setCursors(values => [...values, nextPage]); }}>Next page</button>
        </nav>
      )}
    </>
  );
}
