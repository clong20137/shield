import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image, RefreshCw } from 'lucide-react';
import { getAssetThumbnailUrl, getAssetUrl, handleAssetThumbnailError, MediaLibraryItem, mediaService } from '../services/api';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [folderFilter, setFolderFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMedia = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await mediaService.getAll();
      setItems(response.data);
    } catch (err) {
      console.error('Failed to load media library:', err);
      setError('Failed to load media library.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, []);

  const folders = useMemo(() => Array.from(new Set(items.map((item) => item.label))).sort(), [items]);
  const visibleItems = folderFilter ? items.filter((item) => item.label === folderFilter) : items;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Media Library</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{items.length} uploaded image{items.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
            <option value="">All media</option>
            {folders.map((folder) => <option key={folder}>{folder}</option>)}
          </select>
          <button type="button" onClick={() => void loadMedia()} className="btn-secondary" aria-label="Refresh media library" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {isLoading ? (
        <div className="loading">Loading media...</div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">No media found.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <article key={item.id} className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex aspect-square items-center justify-center bg-gray-100 dark:bg-gray-950">
                <img
                  src={getAssetThumbnailUrl(item.thumbnailUrl || item.url, item.folder === 'profile-pictures' ? 256 : 480)}
                  alt=""
                  onError={(event) => handleAssetThumbnailError(event, item.url)}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Image size={15} className="shrink-0 text-accent" />
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white" title={item.fileName}>{item.fileName}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.label} · {formatBytes(item.size)}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{new Date(item.updatedAt).toLocaleString()}</p>
                <a href={getAssetUrl(item.url)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-accent hover:text-primary-500">
                  <ExternalLink size={14} /> Open
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
