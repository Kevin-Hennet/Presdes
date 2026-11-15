import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { languages, type SourceLanguage } from '../api/client';

export type SpeechPart = { text: string; language: SourceLanguage };

export function useSpeech() {
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState('');

  const cancel = useCallback(() => {
    if (!utterance.current) return;
    utterance.current = null;
    window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    function stopOnExit() {
      cancel();
      setCurrent(null);
    }
    function stopWhenHidden() {
      if (document.hidden) stopOnExit();
    }
    document.addEventListener('visibilitychange', stopWhenHidden);
    window.addEventListener('pagehide', stopOnExit);
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.removeEventListener('pagehide', stopOnExit);
      cancel();
    };
  }, [cancel]);

  function stop() {
    cancel();
    setCurrent(null);
    setError('');
  }

  function play(section: string, parts: readonly SpeechPart[]) {
    stop();
    if (parts.length === 0) return;
    setCurrent(section);

    function speakPart(index: number) {
      const { text, language } = parts[index];
      const speech = new SpeechSynthesisUtterance(text);
      if (language !== 'und') speech.lang = languages[language].voice;
      utterance.current = speech;

      function finish(message = '') {
        if (utterance.current !== speech) return;
        utterance.current = null;
        setCurrent(null);
        setError(message);
      }

      speech.onend = () => {
        if (utterance.current !== speech) return;
        if (index + 1 < parts.length) speakPart(index + 1);
        else finish();
      };
      speech.onerror = () => finish('Read-aloud could not play. Check the voices available in your browser.');
      try {
        window.speechSynthesis.speak(speech);
      } catch {
        finish('Read-aloud could not start in this browser.');
      }
    }

    speakPart(0);
  }

  return { supported, current, error, play, stop };
}

type SpeechButtonProps = {
  speech: ReturnType<typeof useSpeech>;
  section: string;
  parts: readonly SpeechPart[];
};

export function SpeechButton({ speech, section, parts }: SpeechButtonProps) {
  if (!speech.supported || parts.length === 0) return null;
  const playing = speech.current === section;
  return (
    <button
      type="button"
      className="button outline"
      aria-label={playing ? 'Stop reading ' + section : 'Listen to ' + section}
      onClick={playing ? speech.stop : () => speech.play(section, parts)}
    >
      {playing ? <Square size={17} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      {playing ? 'Stop' : 'Listen'}
    </button>
  );
}
