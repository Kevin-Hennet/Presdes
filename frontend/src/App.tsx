import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScanLine, Settings2 } from 'lucide-react';
import ScanPage from './pages/Scan';
import History from './pages/History';

const pages = { scan: 'Scan', history: 'Saved medications' } as const;
type Page = keyof typeof pages;

const options = { large: 'Large text', contrast: 'High contrast', dark: 'Dark mode' } as const;
type Preferences = Record<keyof typeof options, boolean>;
const preferenceKey = 'presdes:display:v1';
const defaults: Preferences = { large: false, contrast: false, dark: false };

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
    return { large: value?.large === true, contrast: value?.contrast === true, dark: value?.dark === true };
  } catch {
    return defaults;
  }
}

function pageFromHash(): Page {
  return location.hash === '#history' ? 'history' : 'scan';
}

class ContentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="notice" role="alert">
        <h1>PresDes could not display this page</h1>
        <button type="button" className="button outline" onClick={() => location.reload()}>Reload page</button>
      </section>
    );
  }
}

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const [preferences, setPreferences] = useState(readPreferences);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const navigate = () => {
      if (location.hash === '#reference') {
        window.history.replaceState(window.history.state, '', '#scan');
      }
      setPage(pageFromHash());
      setAccessibilityOpen(false);
      requestAnimationFrame(() => main.current?.querySelector<HTMLHeadingElement>(':scope > :not([hidden]) h1')?.focus());
    };
    window.addEventListener('hashchange', navigate);
    if (location.hash === '#reference') navigate();
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.dark = String(preferences.dark);
    root.dataset.contrast = String(preferences.contrast);
    root.dataset.large = String(preferences.large);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    } catch {
      // The current page can still honor display preferences.
    }
  }, [preferences]);

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault();
        main.current?.focus();
      }}>Skip to content</a>
      <header className="site-header">
        <div className="frame header-row">
          <a className="brand" href="#scan">
            <span className="brand-mark"><ScanLine size={23} aria-hidden="true" /></span>
            PresDes
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            {(Object.keys(pages) as Page[]).map(item => (
              <a key={item} href={'#' + item} aria-current={page === item ? 'page' : undefined}>{pages[item]}</a>
            ))}
          </nav>
          <button
            ref={settingsButton}
            type="button"
            className="button outline display-button"
            aria-expanded={accessibilityOpen}
            aria-controls="display-options"
            onClick={() => setAccessibilityOpen(value => !value)}
          >
            <Settings2 size={19} aria-hidden="true" /> Display
          </button>
        </div>
        <section
          className="frame display-panel"
          id="display-options"
          aria-label="Display settings"
          hidden={!accessibilityOpen}
          onKeyDown={event => {
            if (event.key !== 'Escape') return;
            setAccessibilityOpen(false);
            settingsButton.current?.focus();
          }}
        >
          {(Object.keys(options) as Array<keyof typeof options>).map(key => (
            <label className="display-option" key={key}>
              <input type="checkbox" checked={preferences[key]} onChange={event => {
                const checked = event.target.checked;
                setPreferences(previous => ({ ...previous, [key]: checked }));
              }} />
              {options[key]}
            </label>
          ))}
        </section>
      </header>
      <main id="main-content" className="frame main" ref={main} tabIndex={-1}>
        <div hidden={page !== 'scan'}>
          <ContentBoundary><ScanPage active={page === 'scan'} /></ContentBoundary>
        </div>
        {page === 'history' && <div><ContentBoundary><History /></ContentBoundary></div>}
      </main>
      <footer className="site-footer">
        <div className="frame footer-row">
          <strong>PresDes</strong>
          <p>Accessibility prototype. Check the printed label and ask a pharmacist about medication decisions.</p>
        </div>
      </footer>
    </>
  );
}
