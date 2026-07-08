import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Flag, Pencil, Trash2, X } from 'lucide-react';
import { getAssetThumbnailUrl, handleAssetThumbnailError, User } from '../services/api';
import { RankBadge, isImportantRank } from './RankBadge';

export type UserSortKey = 'lastName' | 'firstName' | 'peNumber' | 'rank' | 'district' | 'status';
export type UserSortDirection = 'asc' | 'desc';

interface UserTableProps {
  users: User[];
  loading?: boolean;
  onUserSelect?: (user: User) => void;
  onEdit?: (user: User) => void;
  onDelete?: (userId: string) => void;
  canEdit?: boolean;
  selectedUserIds?: string[];
  onSelectionChange?: (userIds: string[]) => void;
  sortKey?: UserSortKey | null;
  sortDirection?: UserSortDirection;
  onSortChange?: (key: UserSortKey) => void;
}

export const UserTable: React.FC<UserTableProps> = ({
  users,
  loading = false,
  onUserSelect,
  onEdit,
  onDelete,
  canEdit = false,
  selectedUserIds = [],
  onSelectionChange,
  sortKey = null,
  sortDirection = 'asc',
  onSortChange,
}) => {
  const [userPendingDelete, setUserPendingDelete] = useState<User | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const selectedUserIdSet = new Set(selectedUserIds);
  const canSelectUsers = Boolean(onSelectionChange);
  const allVisibleSelected = users.length > 0 && users.every((user) => selectedUserIdSet.has(user.id));
  const rowHeight = 73;
  const virtualize = users.length > 80;
  const viewportHeight = virtualize ? Math.min(620, Math.max(360, users.length * rowHeight)) : undefined;
  const overscan = 8;
  const checkboxClassName =
    'h-4 w-4 rounded border border-gray-300 bg-white text-accent accent-accent focus:ring-accent focus:ring-2 dark:border-gray-700 dark:bg-gray-900';
  const startIndex = virtualize ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const visibleCount = virtualize && viewportHeight ? Math.ceil(viewportHeight / rowHeight) + overscan * 2 : users.length;
  const visibleUsers = virtualize ? users.slice(startIndex, startIndex + visibleCount) : users;
  const topSpacerHeight = virtualize ? startIndex * rowHeight : 0;
  const bottomSpacerHeight = virtualize ? Math.max(0, (users.length - startIndex - visibleUsers.length) * rowHeight) : 0;

  useEffect(() => {
    setScrollTop(0);
  }, [users]);

  const renderSortableHeader = (key: UserSortKey, label: string) => {
    const active = sortKey === key;
    const Icon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

    return (
      <th
        className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300"
        aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => onSortChange?.(key)}
          className="flex w-full items-center gap-1.5 text-left font-semibold text-white transition hover:text-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label={`Sort by ${label}${active ? ` ${sortDirection === 'asc' ? 'descending' : 'ascending'}` : ''}`}
        >
          <span>{label}</span>
          <Icon size={14} className={active ? 'opacity-100' : 'opacity-70'} aria-hidden="true" />
        </button>
      </th>
    );
  };

  const toggleVisibleUsers = (checked: boolean) => {
    if (!onSelectionChange) {
      return;
    }

    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedUserIds, ...users.map((user) => user.id)])));
      return;
    }

    const visibleUserIds = new Set(users.map((user) => user.id));
    onSelectionChange(selectedUserIds.filter((userId) => !visibleUserIds.has(userId)));
  };

  const toggleUser = (userId: string, checked: boolean) => {
    if (!onSelectionChange) {
      return;
    }

    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedUserIds, userId])));
      return;
    }

    onSelectionChange(selectedUserIds.filter((selectedUserId) => selectedUserId !== userId));
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  if (users.length === 0) {
    return <div className="empty-state">No users found</div>;
  }

  return (
    <>
    <div className="app-surface overflow-hidden">
      <div
        className="overflow-auto"
        style={viewportHeight ? { maxHeight: viewportHeight } : undefined}
        onScroll={(event) => {
          if (virtualize) {
            setScrollTop(event.currentTarget.scrollTop);
          }
        }}
      >
        <table className="app-data-table w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary-500 text-white">
              {canSelectUsers && (
                <th className="w-12 px-4 py-3 text-left font-semibold border-b-2 border-gray-300">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleVisibleUsers(event.target.checked)}
                  className={checkboxClassName}
                  aria-label={allVisibleSelected ? 'Clear visible selected users' : 'Select visible users'}
                />
              </th>
              )}
              {renderSortableHeader('lastName', 'Last Name')}
              {renderSortableHeader('firstName', 'First Name')}
              {renderSortableHeader('peNumber', 'PE #')}
              {renderSortableHeader('rank', 'Rank')}
              {renderSortableHeader('district', 'District')}
              {renderSortableHeader('status', 'Status')}
              {canEdit && <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={(canSelectUsers ? 7 : 6) + (canEdit ? 1 : 0)} style={{ height: topSpacerHeight, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleUsers.map((user) => (
              <tr
                key={user.id}
                onClick={() => onUserSelect?.(user)}
                className={`border-b border-gray-300 transition cursor-pointer dark:border-gray-800 ${
                  selectedUserIdSet.has(user.id)
                    ? 'bg-accent/10 hover:bg-accent/15 dark:bg-accent/15 dark:hover:bg-accent/20'
                    : isImportantRank(user.rank)
                    ? 'bg-accent/5 hover:bg-accent/10 dark:bg-accent/10 dark:hover:bg-accent/15'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {canSelectUsers && (
                  <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedUserIdSet.has(user.id)}
                    onChange={(event) => toggleUser(user.id, event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                    className={checkboxClassName}
                    aria-label={`Select ${user.firstName} ${user.lastName}`}
                  />
                </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={getAssetThumbnailUrl(user.profilePictureUrl, 96)}
                      alt={`${user.firstName} ${user.lastName}`}
                      onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{user.lastName}</span>
                      {Boolean(user.isMemorial) && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-yellow-700 dark:text-yellow-300">
                          <Flag size={11} />
                          Memorial
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">{user.firstName}</td>
                <td className="px-4 py-3">{user.peNumber}</td>
                <td className="px-4 py-3">
                  <RankBadge rank={user.rank} compact subtle />
                </td>
                <td className="px-4 py-3">{user.district}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    user.isActive
                      ? 'bg-green-100 text-success'
                      : 'bg-red-100 text-danger'
                  }`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 flex gap-2">
                    <button
                      className="btn btn-primary text-xs"
                      aria-label={`Edit ${user.firstName} ${user.lastName}`}
                      title="Edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.(user);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-danger text-xs"
                      aria-label={`Delete ${user.firstName} ${user.lastName}`}
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserPendingDelete(user);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {bottomSpacerHeight > 0 && (
              <tr aria-hidden="true">
                <td colSpan={(canSelectUsers ? 7 : 6) + (canEdit ? 1 : 0)} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    {userPendingDelete && (
      <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete User</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Delete {userPendingDelete.firstName} {userPendingDelete.lastName}?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setUserPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete user" title="Cancel">
              <X size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete?.(userPendingDelete.id);
                setUserPendingDelete(null);
              }}
              className="btn-danger"
              aria-label="Delete user"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
