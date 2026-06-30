import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ExternalLink, Flag, Search, Shield, X } from 'lucide-react';
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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const onToastRef = useRef(onToast);
  const loadRequestIdRef = useRef(0);
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
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {users.map((user) => (
            <article
              key={user.id}
              className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-300/60"
            >
              <button type="button" onClick={() => setSelectedUser(user)} className="block w-full text-left">
                <div className="flex items-start gap-4 p-4">
                  <div className="relative shrink-0">
                    <span className="absolute -inset-1 rounded-full border border-yellow-300/60" />
                    {user.profilePictureUrl ? (
                      <img
                        src={getAssetThumbnailUrl(user.profilePictureUrl, 160)}
                        alt={`${user.firstName} ${user.lastName}`}
                        onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
                        className="relative h-20 w-20 rounded-full border-2 border-white bg-gray-100 object-cover shadow dark:border-gray-950 dark:bg-gray-800"
                      />
                    ) : (
                      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-primary-500 text-xl font-black text-white shadow dark:border-gray-950">
                        {getInitials(user)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black text-gray-900 dark:text-gray-100">
                        {user.rank ? `${user.rank} ` : ''}{user.firstName} {user.lastName}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-yellow-800 dark:bg-yellow-300/15 dark:text-yellow-100">
                        <Flag size={11} />
                        EOW
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-primary-500 dark:text-blue-100">
                      <CalendarDays size={14} />
                      {formatMemorialDate(user.endOfWatchDate)}
                    </p>
                    <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{getServiceLabel(user)}</p>
                    {user.memorialSummary && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{user.memorialSummary}</p>
                    )}
                  </div>
                </div>
              </button>
              {user.memorialExternalUrl && (
                <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                  <a
                    href={user.memorialExternalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-bold text-primary-500 hover:text-primary-600 dark:text-blue-100"
                  >
                    <ExternalLink size={15} />
                    Memorial Link
                  </a>
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

      {selectedUser && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="relative h-[100dvh] w-full max-w-5xl sm:h-auto">
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20"
              aria-label="Close memorial profile"
              title="Close"
            >
              <X size={18} />
            </button>
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              currentUser={currentUser}
              canEdit={canEdit}
              onToast={onToast}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MemorialPage;
