import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { lookupLabels, type LabelMatch } from '../api/client';

export default function Reference() {
  const pending = useRef<AbortController | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState<{ term: string; matches: LabelMatch[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => pending.current?.abort(), []);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = name.trim();
    if (!term || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setSearch(null);
    try {
      const { matches } = await lookupLabels(term, controller.signal);
      if (!controller.signal.aborted) setSearch({ term, matches });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'The FDA label service is unavailable.');
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <>
      <div className="page-intro">
        <h1 tabIndex={-1}>FDA label reference</h1>
        <p className="lede">Look up an individual product label in openFDA by brand or generic name. Check the product and manufacturer before using a record.</p>
      </div>
      <section className="card reference-form">
        <form onSubmit={lookup}>
          <div className="field">
            <label htmlFor="medication-name">Medication name</label>
            <input id="medication-name" type="search" value={name} required minLength={2} maxLength={80} onChange={event => setName(event.target.value)} />
          </div>
          <button className="button primary" type="submit" disabled={busy || name.trim().length < 2}>
            <Search size={20} aria-hidden="true" /> Search labels
          </button>
        </form>
        <p className="muted">For questions about taking medications together, ask a pharmacist.</p>
      </section>
      <p role="status">
        {busy ? 'Searching FDA labels…' : search
          ? search.matches.length ? `${search.matches.length} label records found for “${search.term}”.` : `No label records found for “${search.term}”.`
          : ''}
      </p>
      {error && <p className="notice" role="alert">{error}</p>}
      {search && search.matches.length > 0 && (
        <ul className="history-list">
          {search.matches.map(match => (
            <li className="card history-item" key={match.source_url}>
              <div>
                <h2>{match.name}</h2>
                {match.manufacturer && <p className="muted">{match.manufacturer}</p>}
              </div>
              <a className="button outline" href={match.source_url} target="_blank" rel="noreferrer" aria-label={'Open FDA record for ' + match.name + ' (new tab)'}>
                Open FDA record <ExternalLink size={19} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
