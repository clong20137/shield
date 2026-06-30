import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ExternalLink, Flag, Plus, Search, Shield, X } from 'lucide-react';
import { getAssetThumbnailUrl, handleAssetThumbnailError, User, userService } from '../services/api';
import { UserDetail } from '../components/UserDetail';
import type { AuthAccount } from '../services/api';

interface MemorialPageProps {
  currentUser: AuthAccount | null;
  onToast: (type: 'success' | 'error', message: string) => void;
}

function getInitials(user: User): string {
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
}

function formatMemorialDate(value?: string | null): string {
  if (!value) {
    return 'End of Watch not set';
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function getServiceLabel(user: User): string {
  return user.serviceYears || [user.rank, user.district].filter(Boolean).join(' - ') || 'Indiana State Police';
}

const MemorialPage: React.FC<MemorialPageProps> = ({ currentUser, onToast }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<User[]>([]);
  const [selectedAddUser, setSelectedAddUser] = useState<User | null>(null);
  const [addForm, setAddForm] = useState({
    endOfWatchDate: '',
    serviceYears: '',
    memorialExternalUrl: '',
    memorialSummary: '',
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [memorialModalMode, setMemorialModalMode] = useState<'add' | 'edit'>('add');
  const [isSearchingAddUsers, setIsSearchingAddUsers] = useState(false);
  const [isAddingMemorial, setIsAddingMemorial] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const onToastRef = useRef(onToast);
  const loadRequestIdRef = useRef(0);
  const addSearchRequestIdRef = useRef(0);
  const lastErrorToastKeyRef = useRef('');
  const canEdit = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('users:edit'));

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadMemorials = useCallback(async (nextPage = 1) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (nextPage === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const response = await userService.searchPaged(debouncedQuery, { memorial: 'true' }, nextPage, 24);
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      lastErrorToastKeyRef.current = '';
      setUsers((current) => (nextPage === 1 ? response.data.data : [...current, ...response.data.data]));
      setPage(response.data.page);
      setHasMore(response.data.hasMore === true);
    } catch (error) {
      console.error('Failed to load memorial profiles:', error);
      const errorToastKey = `${debouncedQuery || '__all__'}:${nextPage}`;
      if (lastErrorToastKeyRef.current !== errorToastKey) {
        lastErrorToastKeyRef.current = errorToastKey;
        onToastRef.current('error', 'Failed to load memorial profiles.');
      }

      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      if (nextPage === 1) {
        setUsers([]);
        setHasMore(false);
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [debouncedQuery]);

  useEffect(() => {
    void loadMemorials(1);
  }, [loadMemorials]);

  useEffect(() => {
    const handleUserUpdate = () => void loadMemorials(1);
    window.addEventListener('shield:user-updated', handleUserUpdate);
    return () => window.removeEventListener('shield:user-updated', handleUserUpdate);
  }, [loadMemorials]);

  useEffect(() => {
    if (!isAddModalOpen) {
      return undefined;
    }

    const trimmedQuery = addQuery.trim();
    const requestId = addSearchRequestIdRef.current + 1;
    addSearchRequestIdRef.current = requestId;
    setIsSearchingAddUsers(true);

    const timer = window.setTimeout(() => {
      userService.searchPaged(trimmedQuery, { memorial: 'false' }, 1, 12)
        .then((response) => {
          if (requestId === addSearchRequestIdRef.current) {
            setAddResults(response.data.data);
          }
        })
        .catch((error) => {
          console.error('Failed to search users for memorial:', error);
          if (requestId === addSearchRequestIdRef.current) {
            setAddResults([]);
          }
        })
        .finally(() => {
          if (requestId === addSearchRequestIdRef.current) {
            setIsSearchingAddUsers(false);
          }
        });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [addQuery, isAddModalOpen]);

  const openAddMemorial = () => {
    setMemorialModalMode('add');
    setAddQuery('');
    setAddResults([]);
    setSelectedAddUser(null);
    setAddForm({
      endOfWatchDate: '',
      serviceYears: '',
      memorialExternalUrl: '',
      memorialSummary: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditMemorial = (user: User) => {
    setMemorialModalMode('edit');
    setAddQuery('');
    setAddResults([]);
    selectAddUser(user);
    setIsAddModalOpen(true);
  };

  const selectAddUser = (user: User) => {
    setSelectedAddUser(user);
    setAddForm({
      endOfWatchDate: user.endOfWatchDate?.slice(0, 10) || '',
      serviceYears: user.serviceYears || '',
      memorialExternalUrl: user.memorialExternalUrl || '',
      memorialSummary: user.memorialSummary || '',
    });
  };

  const addSelectedMemorial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAddUser || !canEdit) {
      return;
    }

    setIsAddingMemorial(true);
    try {
      const response = await userService.update(selectedAddUser.id, {
        isMemorial: true,
        endOfWatchDate: addForm.endOfWatchDate,
        serviceYears: addForm.serviceYears,
        memorialExternalUrl: addForm.memorialExternalUrl,
        memorialSummary: addForm.memorialSummary,
      });
      const updatedUser = response.data as User;
      setUsers((currentUsers) => {
        const exists = currentUsers.some((user) => user.id === updatedUser.id);
        if (exists) {
          return currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user));
        }
        return [updatedUser, ...currentUsers];
      });
      setSelectedUser((currentUser) => (currentUser?.id === updatedUser.id ? updatedUser : currentUser));
      onToastRef.current('success', `${selectedAddUser.firstName} ${selectedAddUser.lastName} ${memorialModalMode === 'edit' ? 'updated' : 'added to the memorial'}.`);
      window.dispatchEvent(new CustomEvent('shield:user-updated', { detail: { userId: selectedAddUser.id } }));
      setIsAddModalOpen(false);
      if (memorialModalMode === 'add') {
        await loadMemorials(1);
      }
    } catch (error) {
      console.error('Failed to add memorial profile:', error);
      onToastRef.current('error', memorialModalMode === 'edit' ? 'Failed to update memorial profile.' : 'Failed to add trooper to the memorial.');
    } finally {
      setIsAddingMemorial(false);
    }
  };

  const stats = useMemo(() => {
    const withEndOfWatch = users.filter((user) => user.endOfWatchDate).length;
    const districts = new Set(users.map((user) => user.district).filter(Boolean));
    return {
      loaded: users.length,
      withEndOfWatch,
      districts: districts.size,
    };
  }, [users]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="bg-gradient-to-br from-gray-950 via-primary-500 to-gray-900 px-5 py-6 text-white sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-yellow-100">
                <Flag size={16} />
                Memorial
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-normal text-white sm:text-4xl">Fallen Troopers</h1>
              <p className="mt-3 text-sm leading-6 text-blue-100 sm:text-base">
                A dedicated place to honor service, sacrifice, and legacy.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:min-w-[360px]">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-white/15 bg-white/10 p-3">
                  <p className="text-2xl font-black">{stats.loaded}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-100">Shown</p>
                </div>
                <div className="rounded border border-white/15 bg-white/10 p-3">
                  <p className="text-2xl font-black">{stats.withEndOfWatch}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-100">EOW</p>
                </div>
                <div className="rounded border border-white/15 bg-white/10 p-3">
                  <p className="text-2xl font-black">{stats.districts}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-100">Districts</p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddMemorial}
                  className="inline-flex items-center justify-center gap-2 rounded border border-yellow-200/40 bg-yellow-300/15 px-3 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/25"
                >
                  <Plus size={16} />
                  Add Trooper
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-200 p-4 dark:border-gray-800 sm:p-5">
          <label className="relative block">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memorial profiles"
              className="w-full rounded border border-gray-300 bg-white py-3 pl-10 pr-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>
        </div>
      </section>

      {isLoading ? (
        <div className="loading min-h-40">Loading memorial profiles...</div>
      ) : users.length === 0 ? (
        <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/10 text-primary-500 dark:text-blue-100">
            <Shield size={26} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-gray-100">No memorial profiles found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
            Mark a user as a memorial profile from Search to add them here.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {users.map((user) => (
            <article
              key={user.id}
              className="memorial-card group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <button type="button" onClick={() => setSelectedUser(user)} className="block w-full text-left">
                <div className="memorial-card-photo-wrap relative overflow-hidden bg-gradient-to-br from-gray-950 via-primary-500 to-gray-900">
                  <span className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1 bg-gradient-to-r from-transparent via-yellow-200/80 to-transparent" />
                  <span className="memorial-card-halo pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-200/25" />
                  <div className="relative z-[2] flex justify-center px-5 pb-4 pt-6">
                    {user.profilePictureUrl ? (
                      <img
                        src={getAssetThumbnailUrl(user.profilePictureUrl, 420)}
                        alt={`${user.firstName} ${user.lastName}`}
                        onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
                        className="memorial-card-photo h-52 w-52 rounded-full border-4 border-white/90 bg-gray-100 object-cover shadow-2xl dark:border-gray-950 dark:bg-gray-800 sm:h-60 sm:w-60"
                      />
                    ) : (
                      <div className="memorial-card-photo flex h-52 w-52 items-center justify-center rounded-full border-4 border-white/90 bg-primary-500 text-5xl font-black text-white shadow-2xl dark:border-gray-950 sm:h-60 sm:w-60">
                        {getInitials(user)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">
                        {user.rank ? `${user.rank} ` : ''}{user.firstName} {user.lastName}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-yellow-800 dark:bg-yellow-300/15 dark:text-yellow-100">
                        <Flag size={11} />
                        EOW
                      </span>
                    </div>
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-bold text-primary-500 dark:text-blue-100">
                      <CalendarDays size={14} />
                      {formatMemorialDate(user.endOfWatchDate)}
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{getServiceLabel(user)}</p>
                    {user.memorialSummary && (
                      <p className="mx-auto mt-3 line-clamp-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">{user.memorialSummary}</p>
                    )}
                </div>
              </button>
              {(user.memorialExternalUrl || canEdit) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                  <a
                    href={user.memorialExternalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-2 text-sm font-bold text-primary-500 hover:text-primary-600 dark:text-blue-100 ${user.memorialExternalUrl ? '' : 'pointer-events-none invisible'}`}
                  >
                    <ExternalLink size={15} />
                    Memorial Link
                  </a>
                  {canEdit && (
                    <button type="button" onClick={() => openEditMemorial(user)} className="btn-secondary h-8 px-3 text-xs">
                      Edit
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMemorials(page + 1)} className="btn-secondary" disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {selectedUser && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="relative h-[100dvh] w-full max-w-5xl sm:h-auto">
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onEdit={canEdit ? openEditMemorial : undefined}
              currentUser={currentUser}
              canEdit={canEdit}
              onToast={onToast}
            />
          </div>
        </div>,
        document.body,
      )}

      {isAddModalOpen && canEdit && createPortal(
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <form onSubmit={addSelectedMemorial} className="modal-window flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-900 sm:max-w-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-br from-gray-950 via-primary-500 to-gray-900 px-5 py-4 text-white dark:border-gray-800">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-100">Memorial</p>
                <h2 className="mt-1 text-xl font-black text-white">{memorialModalMode === 'edit' ? 'Edit Fallen Trooper' : 'Add Fallen Trooper'}</h2>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20" aria-label="Close add memorial" title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {memorialModalMode === 'add' && (
              <section className="min-w-0">
                <label className="relative block">
                  <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={addQuery}
                    onChange={(event) => setAddQuery(event.target.value)}
                    placeholder="Search troopers"
                    className="w-full rounded border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                </label>
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded border border-gray-200 p-2 dark:border-gray-800">
                  {isSearchingAddUsers ? (
                    <div className="loading py-8">Searching...</div>
                  ) : addResults.length === 0 ? (
                    <div className="empty-state rounded border border-dashed border-gray-300 py-8 text-sm dark:border-gray-700">No users found.</div>
                  ) : (
                    addResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => selectAddUser(user)}
                        className={`flex w-full items-center gap-3 rounded border p-2 text-left transition ${selectedAddUser?.id === user.id ? 'border-primary-500 bg-primary-50 dark:border-blue-300 dark:bg-blue-950/30' : 'border-gray-200 hover:border-primary-300 dark:border-gray-800 dark:hover:border-blue-300/60'}`}
                      >
                        {user.profilePictureUrl ? (
                          <img src={getAssetThumbnailUrl(user.profilePictureUrl, 72)} alt={`${user.firstName} ${user.lastName}`} onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)} className="h-11 w-11 rounded-full bg-gray-100 object-cover dark:bg-gray-800" />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500 text-sm font-black text-white">{getInitials(user)}</div>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</span>
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{[user.rank, user.district, user.badgeNumber].filter(Boolean).join(' - ') || user.email}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>
              )}
              <section className={`min-w-0 space-y-3 ${memorialModalMode === 'edit' ? 'lg:col-span-2' : ''}`}>
                {selectedAddUser ? (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-600/40 dark:bg-yellow-300/10">
                    <p className="text-xs font-black uppercase tracking-wide text-yellow-800 dark:text-yellow-100">Selected</p>
                    <p className="mt-1 font-black text-gray-900 dark:text-gray-100">{selectedAddUser.rank ? `${selectedAddUser.rank} ` : ''}{selectedAddUser.firstName} {selectedAddUser.lastName}</p>
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Select a trooper to add memorial details.</div>
                )}
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">End of Watch</span>
                  <input type="date" value={addForm.endOfWatchDate} onChange={(event) => setAddForm((form) => ({ ...form, endOfWatchDate: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Service Years</span>
                  <input value={addForm.serviceYears} placeholder="1998-2026" onChange={(event) => setAddForm((form) => ({ ...form, serviceYears: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Memorial Link</span>
                  <input value={addForm.memorialExternalUrl} placeholder="https://..." onChange={(event) => setAddForm((form) => ({ ...form, memorialExternalUrl: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Memorial Summary</span>
                  <textarea value={addForm.memorialSummary} onChange={(event) => setAddForm((form) => ({ ...form, memorialSummary: event.target.value }))} className="min-h-28 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
              </section>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn-secondary" disabled={isAddingMemorial}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!selectedAddUser || isAddingMemorial}>
                <Plus size={16} />
                <span>{isAddingMemorial ? 'Saving' : memorialModalMode === 'edit' ? 'Save Memorial' : 'Add to Memorial'}</span>
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default MemorialPage;
