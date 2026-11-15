import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { languages, type SourceLanguage } from '../api/client';

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

  useEffect(() => cancel, [cancel]);

  function stop() {
    cancel();
    setCurrent(null);
    setError('');
  }

  function play(section: string, text: string, language: SourceLanguage) {
    stop();
    const speech = new SpeechSynthesisUtterance(text);
    if (language !== 'und') speech.lang = languages[language].voice;
    utterance.current = speech;
    setCurrent(section);

    function finish(message = '') {
      if (utterance.current !== speech) return;
      utterance.current = null;
      setCurrent(null);
      setError(message);
    }

    speech.onend = () => finish();
    speech.onerror = () => finish('Read-aloud could not play. Check the voices available in your browser.');
    try {
      window.speechSynthesis.speak(speech);
    } catch {
      finish('Read-aloud could not start in this browser.');
    }
  }

  return { supported, current, error, play, stop };
}

type SpeechButtonProps = {
  speech: ReturnType<typeof useSpeech>;
  section: string;
  text: string;
  language: SourceLanguage;
};

export function SpeechButton({ speech, section, text, language }: SpeechButtonProps) {
  if (!speech.supported || !text) return null;
  const playing = speech.current === section;
  return (
    <button
      type="button"
      className="button outline"
      aria-label={playing ? 'Stop reading ' + section : 'Listen to ' + section}
      onClick={playing ? speech.stop : () => speech.play(section, text, language)}
    >
      {playing ? <Square size={17} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      {playing ? 'Stop' : 'Listen'}
    </button>
  );
}
