import React, { useState } from 'react';
import { User } from '../services/api';

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
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Badge #</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Employee Type</th>
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
                className="border-b border-gray-300 hover:bg-gray-50 transition cursor-pointer dark:border-gray-800 dark:hover:bg-gray-800"
              >
                <td className="px-4 py-3">{user.lastName}</td>
                <td className="px-4 py-3">{user.firstName}</td>
                <td className="px-4 py-3">{user.peNumber}</td>
                <td className="px-4 py-3">{user.badgeNumber}</td>
                <td className="px-4 py-3">{user.employmentType}</td>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.(user);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserPendingDelete(user);
                      }}
                    >
                      Delete
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
            <button type="button" onClick={() => setUserPendingDelete(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete?.(userPendingDelete.id);
                setUserPendingDelete(null);
              }}
              className="btn-danger"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
