import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

const imageTypes = 'image/jpeg,image/png,image/webp';
const maxCaptureEdge = 2560;

type CaptureProps = {
  onPhotos: (photos: File[], origin: 'camera' | 'picker') => void;
  onCameraOpened: () => void;
  onCameraDone: () => void;
  available: boolean;
  hasPhotos: boolean;
  replacing: boolean;
  analyzing: boolean;
};

export function Capture({ onPhotos, onCameraOpened, onCameraDone, available, hasPhotos, replacing, analyzing }: CaptureProps) {
  const video = useRef<HTMLVideoElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const captureButton = useRef<HTMLButtonElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraAttempt = useRef(0);
  const shot = useRef(0);
  const [status, setStatus] = useState<'closed' | 'opening' | 'preview'>('closed');
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState('');
  const uploadLabel = replacing ? 'Choose replacement photo' : hasPhotos ? 'Add photo files' : 'Choose photos';

  const releaseCamera = useCallback(() => {
    cameraAttempt.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => releaseCamera, [releaseCamera]);

  const closeCamera = useCallback(() => {
    releaseCamera();
    setStatus('closed');
    setReady(false);
    setTaking(false);
  }, [releaseCamera]);

  useEffect(() => {
    if (analyzing) closeCamera();
  }, [analyzing, closeCamera]);

  async function openCamera() {
    onCameraOpened();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('The in-page camera needs a secure connection and a compatible browser. Use a photo file or your device camera.');
      return;
    }

    setStatus('opening');
    const attempt = ++cameraAttempt.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (attempt !== cameraAttempt.current || !video.current) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = media;
      video.current.srcObject = media;
      setStatus('preview');
      await video.current.play();
    } catch (cause) {
      if (attempt !== cameraAttempt.current) return;
      closeCamera();
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      setError(denied
        ? 'Camera access was declined. Allow camera access in your browser or choose a photo.'
        : 'Could not open the camera. Try your device camera or choose a photo.');
      requestAnimationFrame(() => cameraButton.current?.focus());
    }
  }

  useEffect(() => {
    if (status === 'preview' && ready) captureButton.current?.focus();
  }, [status, ready]);

  function takePhoto() {
    const preview = video.current;
    if (!preview?.videoWidth || !preview.videoHeight || taking || !available) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxCaptureEdge / Math.max(preview.videoWidth, preview.videoHeight));
    canvas.width = Math.max(1, Math.round(preview.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(preview.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Could not capture the photo. Try your device camera or choose a photo.');
      return;
    }

    const attempt = cameraAttempt.current;
    setTaking(true);
    setError('');
    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (attempt !== cameraAttempt.current) return;
      setTaking(false);
      if (blob) {
        shot.current += 1;
        onPhotos([new File([blob], `captured-label-${shot.current}.jpg`, { type: 'image/jpeg' })], 'camera');
        requestAnimationFrame(() => {
          if (!captureButton.current?.disabled && attempt === cameraAttempt.current) captureButton.current?.focus();
        });
      } else {
        setError('Could not capture the photo. Try your device camera or choose a photo.');
      }
    }, 'image/jpeg', 0.94);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photos = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!photos.length) return;
    closeCamera();
    setError('');
    onPhotos(photos, 'picker');
  }

  return (
    <div className="capture">
      <input ref={upload} hidden type="file" aria-label="Photo file" accept={imageTypes} multiple={!replacing} onChange={choosePhoto} />
      <input ref={native} hidden type="file" aria-label="Photo from device camera" accept={imageTypes} capture="environment" onChange={choosePhoto} />
      <div className="button-row">
        {status === 'closed' && (
          <button ref={cameraButton} type="button" className="button primary" disabled={!available} onClick={openCamera}>
            <Camera size={20} aria-hidden="true" /> Open camera
          </button>
        )}
        <button type="button" className="button outline" disabled={!available} onClick={() => upload.current?.click()}>
          <ImagePlus size={20} aria-hidden="true" /> {uploadLabel}
        </button>
        <button type="button" className="button plain" disabled={!available} onClick={() => native.current?.click()}>
          Use device camera
        </button>
      </div>
      {status !== 'closed' && (
        <div className="camera-panel">
          <p role="status">{status === 'opening' ? 'Opening camera…' : 'Rotate the same bottle and overlap some text from the previous view.'}</p>
          <video
            ref={video}
            aria-label="Live camera preview"
            className="preview"
            autoPlay
            playsInline
            muted
            onLoadedData={() => setReady(true)}
            hidden={status !== 'preview'}
          />
          <div className="button-row">
            {status === 'preview' && (
              <button ref={captureButton} type="button" className="button primary" disabled={!ready || taking || !available} onClick={takePhoto}>
                <Camera size={20} aria-hidden="true" /> {replacing ? 'Capture replacement photo' : 'Capture photo'}
              </button>
            )}
            <button type="button" className="button outline" onClick={() => {
              closeCamera();
              onCameraDone();
              requestAnimationFrame(() => {
                if (document.activeElement === document.body) cameraButton.current?.focus();
              });
            }}>
              <X size={20} aria-hidden="true" /> Done with camera
            </button>
          </div>
        </div>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  );
}
