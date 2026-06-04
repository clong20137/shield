import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Folder, HardDrive, Image, RefreshCw, Search, X } from 'lucide-react';
import { getAssetThumbnailUrl, getAssetUrl, handleAssetThumbnailError, MediaLibraryFolder, MediaLibraryItem, mediaService } from '../services/api';

const pageSize = 60;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return 'No files';
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
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<MediaLibraryItem | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const loadMedia = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await mediaService.getAll({
        folder: activeFolder || undefined,
        q: debouncedSearchTerm || undefined,
        page,
        limit: pageSize,
      });
      setItems(response.data.items);
      setFolders(response.data.folders);
      setTotal(response.data.total);
      setTotalItems(response.data.totalItems);
      setTotalSize(response.data.totalSize);
    } catch (err) {
      console.error('Failed to load media library:', err);
      setError('Failed to load media library.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMedia();
  }, [activeFolder, debouncedSearchTerm, page]);

  const activeFolderDetails = useMemo(
    () => folders.find((folder) => folder.key === activeFolder) || null,
    [activeFolder, folders],
  );
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  const openFolder = (folderKey: string) => {
    setActiveFolder(folderKey);
    setPage(1);
    setSearchTerm('');
    setDebouncedSearchTerm('');
  };

  const closeFolder = () => {
    setActiveFolder('');
    setPage(1);
    setSearchTerm('');
    setDebouncedSearchTerm('');
  };

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
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totalItems}</p>
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
              {activeFolderDetails ? `${activeFolderDetails.label} / ${total} matching image${total === 1 ? '' : 's'}` : 'Double-click a folder to browse its files.'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-72">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={activeFolderDetails ? 'Search this folder' : 'Search all media'}
                className="w-full rounded border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
            {activeFolderDetails && (
              <button type="button" onClick={closeFolder} className="btn-secondary">
                <ChevronLeft size={16} />
                Folders
              </button>
            )}
            <button type="button" onClick={() => void loadMedia()} className="btn-secondary" aria-label="Refresh media library" title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {!activeFolder && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <button
              key={folder.key}
              type="button"
              onDoubleClick={() => openFolder(folder.key)}
              onClick={() => openFolder(folder.key)}
              className="rounded border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-primary-700"
            >
              <div className="flex items-start gap-3">
                <div className="rounded bg-primary-50 p-3 text-primary-500 dark:bg-primary-900/30 dark:text-primary-200">
                  <Folder size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-gray-900 dark:text-white">{folder.label}</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{folder.count} image{folder.count === 1 ? '' : 's'} / {formatBytes(folder.size)}</p>
                  <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Last updated {formatDate(folder.updatedAt)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeFolder && (
        <>
          <div className="flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <p>Showing {firstItem}-{lastItem} of {total}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1} className="btn-secondary">
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-24 text-center font-semibold text-gray-700 dark:text-gray-200">Page {page} of {pageCount}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} disabled={page >= pageCount} className="btn-secondary">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="loading">Loading media...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">No media found.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {items.map((item) => (
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
                        loading="lazy"
                        decoding="async"
                        onError={(event) => handleAssetThumbnailError(event, item.url)}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Image size={15} className="shrink-0 text-primary-500" />
                        <p className="truncate text-sm font-bold text-gray-900 dark:text-white" title={item.fileName}>{item.fileName}</p>
                      </div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{formatBytes(item.size)}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(item.updatedAt)}</p>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{selectedItem.fileName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatBytes(selectedItem.size)} / {formatDate(selectedItem.updatedAt)}</p>
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
