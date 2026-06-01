import React, { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { getAssetUrl, handleAssetImageError, User } from '../services/api';
import { RankBadge, isImportantRank } from './RankBadge';

interface UserTableProps {
  users: User[];
  loading?: boolean;
  onUserSelect?: (user: User) => void;
  onEdit?: (user: User) => void;
  onDelete?: (userId: string) => void;
  canEdit?: boolean;
}

export const UserTable: React.FC<UserTableProps> = ({
  users,
  loading = false,
  onUserSelect,
  onEdit,
  onDelete,
  canEdit = false,
}) => {
  const [userPendingDelete, setUserPendingDelete] = useState<User | null>(null);

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  if (users.length === 0) {
    return <div className="empty-state">No users found</div>;
  }

  return (
    <>
    <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-primary-500 text-white">
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Last Name</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">First Name</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">PE #</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Rank</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">District</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Status</th>
              {canEdit && <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                onClick={() => onUserSelect?.(user)}
                className={`border-b border-gray-300 transition cursor-pointer dark:border-gray-800 ${
                  isImportantRank(user.rank)
                    ? 'bg-accent/5 hover:bg-accent/10 dark:bg-accent/10 dark:hover:bg-accent/15'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={getAssetUrl(user.profilePictureUrl)}
                      alt={`${user.firstName} ${user.lastName}`}
                      onError={handleAssetImageError}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                    />
                    <span className="truncate font-semibold">{user.lastName}</span>
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
                      className="btn btn-danger text-xs"
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
