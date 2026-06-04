import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Folder, HardDrive, Image, RefreshCw, Search, X } from 'lucide-react';
import { getAssetThumbnailUrl, getAssetUrl, handleAssetThumbnailError, MediaLibraryItem, mediaService } from '../services/api';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [folderFilter, setFolderFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<MediaLibraryItem | null>(null);
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
  const totalSize = useMemo(() => items.reduce((total, item) => total + item.size, 0), [items]);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    const matchesFolder = !folderFilter || item.label === folderFilter;
    const matchesSearch = !normalizedSearch || `${item.fileName} ${item.label}`.toLowerCase().includes(normalizedSearch);
    return matchesFolder && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="rounded bg-primary-50 p-2 text-primary-500 dark:bg-primary-900/30 dark:text-primary-200">
              <Image size={18} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Images</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{items.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="rounded bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              <Folder size={18} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Folders</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{folders.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="rounded bg-amber-50 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <HardDrive size={18} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Storage</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatBytes(totalSize)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Media Library</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Browse uploaded profile pictures and dashboard images.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-72">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search media"
                className="w-full rounded border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
            <select
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="">All folders</option>
              {folders.map((folder) => <option key={folder}>{folder}</option>)}
            </select>
            <button type="button" onClick={() => void loadMedia()} className="btn-secondary" aria-label="Refresh media library" title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading ? (
        <div className="loading">Loading media...</div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">No media found.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {visibleItems.map((item) => (
            <article key={item.id} className="group overflow-hidden rounded border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
              <button
                type="button"
                onClick={() => setSelectedItem(item)}
                className="block w-full text-left"
                aria-label={`Preview ${item.fileName}`}
              >
                <div className="flex aspect-square items-center justify-center bg-gray-100 dark:bg-gray-950">
                  <img
                    src={getAssetThumbnailUrl(item.thumbnailUrl || item.url, item.folder === 'profile-pictures' ? 256 : 480)}
                    alt=""
                    onError={(event) => handleAssetThumbnailError(event, item.url)}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Image size={15} className="shrink-0 text-primary-500" />
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white" title={item.fileName}>{item.fileName}</p>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatBytes(item.size)} / {formatDate(item.updatedAt)}</p>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{selectedItem.fileName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedItem.label} / {formatBytes(selectedItem.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={getAssetUrl(selectedItem.url)} target="_blank" rel="noreferrer" className="btn-secondary" aria-label="Open media in new tab" title="Open">
                  <ExternalLink size={16} />
                </a>
                <button type="button" onClick={() => setSelectedItem(null)} className="btn-secondary" aria-label="Close media preview" title="Close">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[72vh] overflow-auto bg-gray-100 p-4 dark:bg-gray-900">
              <img
                src={getAssetUrl(selectedItem.url)}
                alt=""
                className="mx-auto max-h-[68vh] max-w-full rounded bg-white object-contain shadow-sm dark:bg-gray-950"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
