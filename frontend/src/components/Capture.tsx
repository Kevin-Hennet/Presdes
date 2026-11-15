import { useCallback, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { CameraOverlay } from './CameraOverlay';

const imageTypes = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif';

type CaptureProps = {
  photos: readonly { url: string }[];
  maxPhotos: number;
  disabled?: boolean;
  retaking: string | null;
  onPhotos: (photos: File[], origin: 'camera' | 'picker') => string | undefined;
  onRemove: (url: string) => void;
  onRetake: (url: string | null) => void;
  onCameraOpened: () => void;
  onCameraDone: () => void;
};

export function Capture({ photos, maxPhotos, disabled = false, retaking, onPhotos, onRemove, onRetake, onCameraOpened, onCameraDone }: CaptureProps) {
  const cameraButton = useRef<HTMLButtonElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const shot = useRef(0);
  const restoreCameraFocus = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const available = !disabled && (photos.length < maxPhotos || Boolean(retaking));
  const uploadLabel = retaking ? 'Choose replacement photo' : photos.length ? 'Add photo files' : 'Choose photos';

  useLayoutEffect(() => {
    if (!cameraOpen && restoreCameraFocus.current) {
      restoreCameraFocus.current = false;
      cameraButton.current?.focus({ preventScroll: true });
    }
  }, [cameraOpen]);

  function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !window.HTMLDialogElement?.prototype.showModal) {
      setError('The in-page camera needs a secure connection and a compatible browser. Use a photo file or your device camera.');
      return;
    }
    onCameraOpened();
    setError('');
    setCameraOpen(true);
  }

  const dismissCamera = useCallback((done: boolean, message?: string) => {
    restoreCameraFocus.current = !done;
    setCameraOpen(false);
    if (message) setError(message);
    else onRetake(null);
    if (done) onCameraDone();
  }, [onCameraDone, onRetake]);

  function acceptCapture(blob: Blob) {
    shot.current += 1;
    const file = new File([blob], `captured-label-${shot.current}.jpg`, { type: 'image/jpeg' });
    return onPhotos([file], 'camera');
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const selection = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!selection.length || disabled) return;
    setError('');
    onPhotos(selection, 'picker');
  }

  return (
    <div className="capture">
      <input ref={upload} hidden type="file" aria-label="Photo file" accept={imageTypes} multiple={!retaking} onChange={choosePhoto} />
      <input ref={native} hidden type="file" aria-label="Photo from device camera" accept={imageTypes} capture="environment" onChange={choosePhoto} />
      <div className="button-row">
        <button ref={cameraButton} type="button" className="button primary" aria-haspopup="dialog" disabled={disabled} onClick={openCamera}>
          <Camera size={20} aria-hidden="true" /> Open camera
        </button>
        <button type="button" className="button outline" disabled={!available} onClick={() => upload.current?.click()}>
          <ImagePlus size={20} aria-hidden="true" /> {uploadLabel}
        </button>
        <button type="button" className="button plain" disabled={!available} onClick={() => native.current?.click()}>
          Use device camera
        </button>
      </div>
      {cameraOpen && (
        <CameraOverlay photos={photos} maxPhotos={maxPhotos} retaking={retaking} onCapture={acceptCapture}
          onRemove={onRemove} onRetake={onRetake} onDismiss={dismissCamera} />
      )}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  );
}
