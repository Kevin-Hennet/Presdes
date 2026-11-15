import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

const imageTypes = 'image/jpeg,image/png,image/webp';
const maxCaptureEdge = 2560;

type CaptureProps = {
  onPhoto: (photo: File) => void;
  onCameraOpened: () => void;
};

export function Capture({ onPhoto, onCameraOpened }: CaptureProps) {
  const video = useRef<HTMLVideoElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const captureButton = useRef<HTMLButtonElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraAttempt = useRef(0);
  const [status, setStatus] = useState<'closed' | 'opening' | 'preview'>('closed');
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState('');

  const releaseCamera = useCallback(() => {
    cameraAttempt.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => releaseCamera, [releaseCamera]);

  function closeCamera() {
    releaseCamera();
    setStatus('closed');
    setReady(false);
    setTaking(false);
  }

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
    if (!preview?.videoWidth || !preview.videoHeight || taking) return;
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
    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (attempt !== cameraAttempt.current) return;
      closeCamera();
      if (blob) {
        onPhoto(new File([blob], 'captured-label.jpg', { type: 'image/jpeg' }));
      } else {
        setError('Could not capture the photo. Try your device camera or choose a photo.');
      }
    }, 'image/jpeg', 0.94);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!photo) return;
    closeCamera();
    setError('');
    onPhoto(photo);
  }

  return (
    <div className="capture">
      <input ref={upload} hidden type="file" aria-label="Photo file" accept={imageTypes} onChange={choosePhoto} />
      <input ref={native} hidden type="file" aria-label="Photo from device camera" accept={imageTypes} capture="environment" onChange={choosePhoto} />
      <div className="button-row">
        {status === 'closed' && (
          <button ref={cameraButton} type="button" className="button primary" onClick={openCamera}>
            <Camera size={20} aria-hidden="true" /> Open camera
          </button>
        )}
        <button type="button" className="button outline" onClick={() => upload.current?.click()}>
          <ImagePlus size={20} aria-hidden="true" /> Choose photo
        </button>
        <button type="button" className="button plain" onClick={() => native.current?.click()}>
          Use device camera
        </button>
      </div>
      {status !== 'closed' && (
        <div className="camera-panel">
          <p role="status">{status === 'opening' ? 'Opening camera…' : 'Frame the complete label in the preview.'}</p>
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
              <button ref={captureButton} type="button" className="button primary" disabled={!ready || taking} onClick={takePhoto}>
                <Camera size={20} aria-hidden="true" /> Capture photo
              </button>
            )}
            <button type="button" className="button outline" onClick={() => {
              closeCamera();
              requestAnimationFrame(() => cameraButton.current?.focus());
            }}>
              <X size={20} aria-hidden="true" /> Close camera
            </button>
          </div>
        </div>
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  );
}
