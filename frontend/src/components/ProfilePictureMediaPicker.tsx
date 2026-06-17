import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Folder, Image, Search, X } from 'lucide-react';
import { getAssetThumbnailUrl, handleAssetThumbnailError, MediaLibraryFolder, MediaLibraryItem, mediaService } from '../services/api';

const pageSize = 36;

interface ProfilePictureMediaPickerProps {
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSelect: (item: MediaLibraryItem) => void;
  onError: (message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

export function ProfilePictureMediaPicker({
  isOpen,
  isSaving = false,
  onClose,
  onSelect,
  onError,
  getErrorMessage,
}: ProfilePictureMediaPickerProps) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isOpen, searchTerm]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIsLoading(true);
    mediaService.getAll({
      folder: activeFolder || undefined,
      q: debouncedSearchTerm || undefined,
      page,
      limit: pageSize,
    })
      .then((response) => {
        setItems(response.data.items);
        setFolders(response.data.folders);
        setTotal(response.data.total);
      })
      .catch((error) => {
        onError(getErrorMessage(error, 'Failed to load media library.'));
      })
      .finally(() => setIsLoading(false));
  }, [activeFolder, debouncedSearchTerm, getErrorMessage, isOpen, onError, page]);

  useEffect(() => {
    if (!isOpen) {
      setActiveFolder('');
      setSearchTerm('');
      setDebouncedSearchTerm('');
      setPage(1);
    }
  }, [isOpen]);

  const activeFolderDetails = useMemo(
    () => folders.find((folder) => folder.key === activeFolder) || null,
    [activeFolder, folders],
  );
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Choose Profile Picture</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {activeFolderDetails ? `${activeFolderDetails.label} / ${total} image${total === 1 ? '' : 's'}` : 'Select a folder or search all media.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary" aria-label="Close media picker" title="Close" disabled={isSaving}>
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {activeFolderDetails && (
              <button type="button" onClick={() => { setActiveFolder(''); setPage(1); }} className="btn-secondary" disabled={isSaving}>
                <ChevronLeft size={16} />
                Folders
              </button>
            )}
            <label className="relative min-w-0 flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={activeFolderDetails ? 'Search this folder' : 'Search all media'}
                className="global-search-input w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!activeFolder && !debouncedSearchTerm ? (
            folders.length === 0 ? (
              <div className="empty-state">No media folders found.</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((folder) => (
                  <button
                    key={folder.key}
                    type="button"
                    onClick={() => { setActiveFolder(folder.key); setPage(1); }}
                    className="flex items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition hover:border-accent hover:bg-accent/5 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-accent/60"
                  >
                    <span className="rounded bg-accent/10 p-2 text-accent">
                      <Folder size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-gray-900 dark:text-white">{folder.label}</span>
                      <span className="block text-sm text-gray-500 dark:text-gray-400">{folder.count} image{folder.count === 1 ? '' : 's'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : isLoading ? (
            <div className="loading">Loading media...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">No matching images found.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {items.map((item) => (
                <article key={item.id} className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <button type="button" onClick={() => onSelect(item)} className="group block w-full text-left" disabled={isSaving}>
                    <div className="flex aspect-square items-center justify-center bg-gray-100 dark:bg-gray-950">
                      <img
                        src={getAssetThumbnailUrl(item.thumbnailUrl || item.url, 256)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => handleAssetThumbnailError(event, item.url)}
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="space-y-2 p-2">
                      <p className="truncate text-xs font-bold text-gray-800 dark:text-gray-100" title={item.fileName}>
                        <Image size={13} className="mr-1 inline text-accent" />
                        {item.fileName}
                      </p>
                      <span className="btn-primary w-full justify-center py-1.5 text-xs">
                        <Check size={13} />
                        Select
                      </span>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        {(activeFolder || debouncedSearchTerm) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 p-3 text-sm dark:border-gray-800">
            <span className="font-semibold text-gray-600 dark:text-gray-300">Page {page} of {pageCount}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} className="btn-secondary" disabled={page <= 1 || isSaving}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} className="btn-secondary" disabled={page >= pageCount || isSaving}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
