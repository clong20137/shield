import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ExternalLink, Folder, HardDrive, Image, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { AuthAccount, getAssetThumbnailUrl, getAssetUrl, handleAssetThumbnailError, MediaLibraryFolder, MediaLibraryItem, mediaService } from '../services/api';

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

interface MediaLibraryPageProps {
  account: AuthAccount;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

function hasPermission(account: AuthAccount, permission: string): boolean {
  return account.role === 'administrator' || Boolean(account.permissions?.includes(permission));
}

export default function MediaLibraryPage({ account, onToast, getErrorMessage }: MediaLibraryPageProps) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [folders, setFolders] = useState<MediaLibraryFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<MediaLibraryItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderKey, setEditingFolderKey] = useState('');
  const [editingFolderName, setEditingFolderName] = useState('');
  const [renamingImageId, setRenamingImageId] = useState('');
  const [renamingImageName, setRenamingImageName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const canViewMedia = hasPermission(account, 'media:view') || hasPermission(account, 'media:upload') || hasPermission(account, 'media:edit') || hasPermission(account, 'media:delete');
  const canUploadMedia = hasPermission(account, 'media:upload');
  const canEditMedia = hasPermission(account, 'media:edit');
  const canDeleteMedia = hasPermission(account, 'media:delete');

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

  useEffect(() => {
    const handleMediaUpdate = () => void loadMedia();
    window.addEventListener('shield:media-updated', handleMediaUpdate);
    return () => window.removeEventListener('shield:media-updated', handleMediaUpdate);
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

  const createFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await mediaService.createFolder(newFolderName);
      setNewFolderName('');
      onToast('success', 'Folder created.');
      await loadMedia();
    } catch (err) {
      onToast('error', getErrorMessage(err, 'Failed to create folder.'));
    }
  };

  const renameFolder = async (folder: MediaLibraryFolder) => {
    if (!editingFolderName.trim()) return;

    try {
      const response = await mediaService.renameFolder(folder.key, editingFolderName);
      setEditingFolderKey('');
      setEditingFolderName('');
      if (activeFolder === folder.key) {
        setActiveFolder(response.data.key);
      }
      onToast('success', 'Folder renamed.');
      await loadMedia();
    } catch (err) {
      onToast('error', getErrorMessage(err, 'Failed to rename folder.'));
    }
  };

  const deleteFolder = async (folder: MediaLibraryFolder) => {
    if (folder.protected || !window.confirm(`Delete ${folder.label} and all images inside it?`)) {
      return;
    }

    try {
      await mediaService.deleteFolder(folder.key);
      if (activeFolder === folder.key) {
        closeFolder();
      }
      onToast('success', 'Folder deleted.');
      await loadMedia();
    } catch (err) {
      onToast('error', getErrorMessage(err, 'Failed to delete folder.'));
    }
  };

  const uploadImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!activeFolder || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const response = await mediaService.uploadImages(activeFolder, files, setUploadProgress);
      setUploadProgress(100);
      onToast('success', `${response.data.uploadedCount} image${response.data.uploadedCount === 1 ? '' : 's'} uploaded\n${response.data.skippedCount} skipped`);
      await loadMedia();
    } catch (err) {
      onToast('error', getErrorMessage(err, 'Failed to upload images.'));
    } finally {
      setIsUploading(false);
    }
  };

  const renameImage = async (item: MediaLibraryItem) => {
    if (!renamingImageName.trim()) return;

    try {
      await mediaService.renameImage(item.folder, item.fileName, renamingImageName);
      setRenamingImageId('');
      setRenamingImageName('');
      onToast('success', 'Image renamed.');
      await loadMedia();
    } catch (err) {
      onToast('error', getErrorMessage(err, 'Failed to rename image.'));
    }
  };

  const deleteImage = async (item: MediaLibraryItem) => {
    if (!window.confirm(`Delete ${item.fileName}?`)) return;

    try {
      await mediaService.deleteImage(item.folder, item.fileName);
      setSelectedItem((selected) => selected?.id === item.id ? null : selected);
      onToast('success', 'Image deleted.');
      await loadMedia();
    } catch (err) {
      onToast('error', getErrorMessage(err, 'Failed to delete image.'));
    }
  };

  if (!canViewMedia) {
    return <div className="empty-state">You do not have permission to view the media library.</div>;
  }

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
            {activeFolderDetails && canUploadMedia && (
              <>
                <button type="button" onClick={() => uploadInputRef.current?.click()} className="btn-primary" disabled={isUploading} aria-label="Upload images" title="Upload Images">
                  <Upload size={16} />
                </button>
                <input ref={uploadInputRef} type="file" multiple accept=".jpg,.jpeg,.jfif,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={uploadImages} />
              </>
            )}
            {activeFolderDetails && (
              <button type="button" onClick={closeFolder} className="btn-secondary">
                <ChevronLeft size={16} />
                Folders
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {isUploading && (
        <div className="rounded border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-primary-500 dark:text-blue-100">
            <span>Uploading images</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white dark:bg-gray-900">
            <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {!activeFolder && (
        <>
        {canEditMedia && (
          <form onSubmit={createFolder} className="flex flex-col gap-2 rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:flex-row">
            <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="New folder name" className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
            <button type="submit" className="btn-primary" aria-label="Create folder" title="Create Folder">
              <Plus size={16} />
            </button>
          </form>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <article
              key={folder.key}
              className="rounded border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-primary-700"
            >
              <div className="flex items-start gap-3" onDoubleClick={() => openFolder(folder.key)}>
                <button type="button" onClick={() => openFolder(folder.key)} className="rounded bg-primary-50 p-3 text-primary-500 dark:bg-primary-900/30 dark:text-primary-200" aria-label={`Open ${folder.label}`}>
                  <Folder size={24} />
                </button>
                <div className="min-w-0 flex-1">
                  {editingFolderKey === folder.key ? (
                    <div className="flex gap-2">
                      <input value={editingFolderName} onChange={(event) => setEditingFolderName(event.target.value)} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950" autoFocus />
                      <button type="button" onClick={() => void renameFolder(folder)} className="btn-secondary" aria-label="Save folder name" title="Save">
                        <Check size={15} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => openFolder(folder.key)} className="block max-w-full text-left">
                      <p className="truncate text-base font-bold text-gray-900 dark:text-white">{folder.label}</p>
                    </button>
                  )}
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{folder.count} image{folder.count === 1 ? '' : 's'} / {formatBytes(folder.size)}</p>
                  <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Last updated {formatDate(folder.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {canEditMedia && !folder.protected && (
                    <button type="button" onClick={() => { setEditingFolderKey(folder.key); setEditingFolderName(folder.label); }} className="btn-secondary" aria-label="Rename folder" title="Rename">
                      <Pencil size={15} />
                    </button>
                  )}
                  {canDeleteMedia && !folder.protected && (
                    <button type="button" onClick={() => void deleteFolder(folder)} className="btn-secondary text-danger" aria-label="Delete folder" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        </>
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
                        {renamingImageId === item.id ? (
                          <input value={renamingImageName} onChange={(event) => setRenamingImageName(event.target.value)} onClick={(event) => event.stopPropagation()} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" autoFocus />
                        ) : (
                          <p className="truncate text-sm font-bold text-gray-900 dark:text-white" title={item.fileName}>{item.fileName}</p>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{formatBytes(item.size)}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(item.updatedAt)}</p>
                    </div>
                  </button>
                  {(canEditMedia || canDeleteMedia) && (
                    <div className="flex gap-1 border-t border-gray-100 p-2 dark:border-gray-800">
                      {canEditMedia && (
                        renamingImageId === item.id ? (
                          <button type="button" onClick={() => void renameImage(item)} className="btn-secondary flex-1" aria-label="Save image name" title="Save">
                            <Check size={15} />
                          </button>
                        ) : (
                          <button type="button" onClick={() => { setRenamingImageId(item.id); setRenamingImageName(item.fileName.replace(/\.[^.]+$/u, '')); }} className="btn-secondary flex-1" aria-label="Rename image" title="Rename">
                            <Pencil size={15} />
                          </button>
                        )
                      )}
                      {canDeleteMedia && (
                        <button type="button" onClick={() => void deleteImage(item)} className="btn-secondary flex-1 text-danger" aria-label="Delete image" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
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
                {canDeleteMedia && (
                  <button type="button" onClick={() => void deleteImage(selectedItem)} className="btn-secondary text-danger" aria-label="Delete media" title="Delete">
                    <Trash2 size={16} />
                  </button>
                )}
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
