import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Camera, RotateCcw, Trash2 } from 'lucide-react';

const maxCaptureEdge = 2560;

type CameraOverlayProps = {
  photos: readonly { url: string }[];
  maxPhotos: number;
  retaking: string | null;
  onCapture: (blob: Blob) => string | undefined;
  onRemove: (url: string) => void;
  onRetake: (url: string | null) => void;
  onDismiss: (done: boolean, message?: string) => void;
};

function captureVisibleFrame(video: HTMLVideoElement, complete: BlobCallback) {
  const { videoWidth, videoHeight } = video;
  const { width, height } = video.getBoundingClientRect();
  if (!videoWidth || !videoHeight || !width || !height || video.readyState < 2) {
    complete(null);
    return;
  }

  // Match the video element's centered object-fit: cover crop.
  const zoom = Math.max(width / videoWidth, height / videoHeight);
  const sourceWidth = Math.min(videoWidth, width / zoom);
  const sourceHeight = Math.min(videoHeight, height / zoom);
  const scale = Math.min(1, maxCaptureEdge / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    complete(null);
    return;
  }
  context.drawImage(
    video,
    (videoWidth - sourceWidth) / 2, (videoHeight - sourceHeight) / 2, sourceWidth, sourceHeight,
    0, 0, canvas.width, canvas.height,
  );
  canvas.toBlob(complete, 'image/jpeg', 0.94);
}

export function CameraOverlay({ photos, maxPhotos, retaking, onCapture, onRemove, onRetake, onDismiss }: CameraOverlayProps) {
  const title = useId();
  const modal = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const shutter = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const thumbnails = useRef<HTMLUListElement>(null);
  const active = useRef(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [taking, setTaking] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const reviewIndex = photos.findIndex(photo => photo.url === reviewing);
  const reviewNumber = reviewIndex + 1;
  const replacementNumber = photos.findIndex(photo => photo.url === retaking) + 1;
  const available = photos.length < maxPhotos || replacementNumber > 0;

  useLayoutEffect(() => {
    const dialog = modal.current;
    if (!dialog) return;
    const x = window.scrollX;
    const y = window.scrollY;
    const previousTop = document.body.style.top;
    dialog.showModal();
    document.body.style.top = `-${y}px`;
    document.documentElement.classList.add('camera-open');
    done.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.classList.remove('camera-open');
      document.body.style.top = previousTop;
      dialog.close();
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }, []);

  useEffect(() => {
    const preview = video.current;
    if (!preview) return;
    let stream: MediaStream | undefined;
    let track: MediaStreamTrack | undefined;
    let cancelled = false;
    active.current = true;

    const paused = () => setPaused(true);
    const resumed = () => setPaused(false);
    const interrupted = () => {
      if (!cancelled) onDismiss(false, 'The camera disconnected. Open it again or choose photos from your device.');
    };
    function stopStream() {
      stream?.getTracks().forEach(item => item.stop());
      stream = undefined;
      if (preview) preview.srcObject = null;
    }
    function closeOnExit() {
      if (cancelled) return;
      cancelled = true;
      active.current = false;
      stopStream();
      onDismiss(false);
    }
    function closeWhenHidden() {
      if (document.hidden) closeOnExit();
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled || !preview) {
          stopStream();
          return;
        }
        track = stream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') {
          interrupted();
          return;
        }
        setPaused(track.muted);
        track.addEventListener('mute', paused);
        track.addEventListener('unmute', resumed);
        track.addEventListener('ended', interrupted);
        preview.srcObject = stream;
        await preview.play();
      } catch (cause) {
        if (cancelled) return;
        const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
        onDismiss(false, denied
          ? 'Camera access was declined. Allow access in your browser or choose photos from your device.'
          : 'Could not open the camera. Try your device camera or choose photos from your device.');
      }
    }

    document.addEventListener('visibilitychange', closeWhenHidden);
    window.addEventListener('pagehide', closeOnExit);
    void start();
    return () => {
      cancelled = true;
      active.current = false;
      document.removeEventListener('visibilitychange', closeWhenHidden);
      window.removeEventListener('pagehide', closeOnExit);
      track?.removeEventListener('mute', paused);
      track?.removeEventListener('unmute', resumed);
      track?.removeEventListener('ended', interrupted);
      stopStream();
    };
  }, [onDismiss]);

  function focusLive(preferThumbnail?: string) {
    requestAnimationFrame(() => {
      const thumbnail = Array.from(thumbnails.current?.querySelectorAll('button') ?? [])
        .find(button => button.dataset.photo === preferThumbnail);
      (thumbnail ?? (shutter.current?.disabled ? done.current : shutter.current))?.focus({ preventScroll: true });
    });
  }

  function takePhoto() {
    if (!video.current || !ready || paused || taking || !available) return;
    setTaking(true);
    setError('');
    captureVisibleFrame(video.current, blob => {
      if (!active.current) return;
      setTaking(false);
      if (!blob) {
        setError('Could not capture the photo. Wait for a clear preview and try again.');
        return;
      }
      const message = onCapture(blob);
      if (message) setError(message);
      else setAnnouncement(replacementNumber
        ? `Photo ${replacementNumber} replaced.`
        : `Photo ${photos.length + 1} captured.`);
      focusLive();
    });
  }

  function returnToLive() {
    setReviewing(null);
    focusLive(reviewing ?? undefined);
  }

  function retake() {
    onRetake(reviewing);
    setReviewing(null);
    focusLive();
  }

  function remove() {
    if (!reviewing) return;
    onRemove(reviewing);
    setAnnouncement(`Photo ${reviewNumber} removed.`);
    setReviewing(null);
    focusLive();
  }

  function containTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <dialog ref={modal} className="camera-dialog" aria-labelledby={title} onKeyDown={containTab}
      onCancel={event => { event.preventDefault(); onDismiss(false); }}>
      <header className="camera-header">
        <h2 id={title}>Label camera</h2>
        <button ref={done} type="button" className="button outline camera-button" aria-label="Done with camera" onClick={() => onDismiss(true)}>Done</button>
      </header>
      <div className="camera-surface">
        <video ref={video} className="camera-live" aria-label="Live camera preview" aria-hidden={reviewIndex >= 0}
          autoPlay playsInline muted onLoadedData={() => setReady(true)} onPlaying={() => setReady(true)} />
        {reviewIndex >= 0 ? (
          <div className="camera-still">
            <img src={photos[reviewIndex].url} alt={`Selected label photo ${reviewNumber}`} />
          </div>
        ) : (!ready || paused) && (
          <p className="camera-status" role="status">{paused ? 'Camera paused. Return to this tab to resume.' : 'Opening camera…'}</p>
        )}
      </div>
      <div className="camera-controls">
        {reviewIndex >= 0 ? (
          <div className="camera-photo-actions" role="group" aria-label={`Photo ${reviewNumber} actions`}>
            <button ref={back} type="button" className="button outline camera-button" onClick={returnToLive}>
              <ArrowLeft size={18} aria-hidden="true" /> Back to camera
            </button>
            <button type="button" className="button outline camera-button" aria-label={`Retake photo ${reviewNumber}`} onClick={retake}>
              <RotateCcw size={18} aria-hidden="true" /> Retake
            </button>
            <button type="button" className="button outline camera-button" aria-label={`Remove photo ${reviewNumber}`} onClick={remove}>
              <Trash2 size={18} aria-hidden="true" /> Remove
            </button>
          </div>
        ) : (
          <div className="camera-shutter-row">
            <p>{replacementNumber ? `Retaking photo ${replacementNumber}`
              : available ? 'Rotate the same bottle. Overlap some printed text.' : 'Photo limit reached. Review or retake a photo, or tap Done.'}</p>
            <button ref={shutter} type="button" className="camera-shutter" disabled={!ready || paused || taking || !available}
              aria-label={replacementNumber ? 'Capture replacement photo' : 'Capture photo'} onClick={takePhoto}>
              <Camera size={28} aria-hidden="true" />
            </button>
            {replacementNumber > 0 && <button type="button" className="button outline camera-button" disabled={taking} onClick={() => {
              onRetake(null);
              focusLive();
            }}>Cancel retake</button>}
          </div>
        )}
        {!!photos.length && (
          <ul ref={thumbnails} className="camera-thumbnails" aria-label="Selected photos">
            {photos.map((photo, index) => (
              <li key={photo.url}>
                <button type="button" className="camera-thumb" data-photo={photo.url} disabled={taking}
                  aria-label={`Review photo ${index + 1}`} aria-pressed={reviewing === photo.url} onClick={() => {
                    setReviewing(photo.url);
                    setError('');
                    requestAnimationFrame(() => back.current?.focus({ preventScroll: true }));
                  }}>
                  <img src={photo.url} alt="" /><span aria-hidden="true">{index + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="sr-only" role="status">{announcement}</p>
        {error && <p className="camera-error" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
