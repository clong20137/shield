import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Music, Plus, Trash2, Volume2 } from 'lucide-react';
import { getAssetUrl, NotificationSound, notificationSoundService } from '../services/api';

interface NotificationSoundsPageProps {
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function NotificationSoundsPage({ onToast, getErrorMessage }: NotificationSoundsPageProps) {
  const [sounds, setSounds] = useState<NotificationSound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingSoundId, setDeletingSoundId] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadSounds = () => {
    setIsLoading(true);
    notificationSoundService.getAll()
      .then((response) => setSounds(response.data.sounds))
      .catch((error) => onToast('error', getErrorMessage(error, 'Failed to load notification sounds.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSounds();
  }, []);

  const uploadSound = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      const response = await notificationSoundService.upload(file);
      setSounds((items) => [...items, response.data.sound].sort((first, second) => first.label.localeCompare(second.label)));
      onToast('success', 'Notification sound uploaded.');
      window.dispatchEvent(new Event('shield:notification-sounds-updated'));
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to upload notification sound.'));
    } finally {
      setIsUploading(false);
    }
  };

  const previewSound = (sound: NotificationSound) => {
    audioRef.current?.pause();
    const audio = new Audio(getAssetUrl(sound.url));
    audio.volume = 0.85;
    audioRef.current = audio;
    void audio.play().catch(() => onToast('error', 'Unable to preview this sound.'));
  };

  const deleteSound = async (sound: NotificationSound) => {
    setDeletingSoundId(sound.id);
    try {
      await notificationSoundService.delete(sound.id);
      setSounds((items) => items.filter((item) => item.id !== sound.id));
      onToast('success', 'Notification sound deleted.');
      window.dispatchEvent(new Event('shield:notification-sounds-updated'));
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to delete notification sound.'));
    } finally {
      setDeletingSoundId('');
    }
  };

  return (
    <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>Notification Sounds</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload custom sounds officers can choose for message notifications and reminder alarms.
          </p>
        </div>
        <button type="button" onClick={() => uploadInputRef.current?.click()} className="btn-primary" disabled={isUploading} aria-label="Upload notification sound" title="Upload Sound">
          <Plus size={16} />
          <span>{isUploading ? 'Uploading...' : 'Upload Sound'}</span>
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,.aac,.webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/webm"
          className="hidden"
          onChange={uploadSound}
        />
      </div>

      {isLoading ? (
        <div className="loading">Loading notification sounds...</div>
      ) : sounds.length === 0 ? (
        <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">
          No custom notification sounds have been uploaded.
        </div>
      ) : (
        <div className="space-y-2">
          {sounds.map((sound) => (
            <div key={sound.id} className="grid gap-3 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-accent/10 text-accent">
                <Music size={17} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-gray-900 dark:text-gray-100">{sound.label}</p>
                <p className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">{formatFileSize(sound.size)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => previewSound(sound)} className="btn-secondary" aria-label={`Preview ${sound.label}`} title="Preview Sound">
                  <Volume2 size={16} />
                  <span>Preview</span>
                </button>
                <button type="button" onClick={() => void deleteSound(sound)} className="btn-danger" disabled={deletingSoundId === sound.id} aria-label={`Delete ${sound.label}`} title="Delete Sound">
                  <Trash2 size={16} />
                  <span>{deletingSoundId === sound.id ? 'Deleting' : 'Delete'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
