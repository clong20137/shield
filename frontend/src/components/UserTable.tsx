import React from 'react';
import { User } from '../services/api';

interface UserTableProps {
  users: User[];
  loading?: boolean;
  onUserSelect?: (user: User) => void;
  onEdit?: (user: User) => void;
  onDelete?: (userId: string) => void;
}

export const UserTable: React.FC<UserTableProps> = ({
  users,
  loading = false,
  onUserSelect,
  onEdit,
  onDelete,
}) => {
  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  if (users.length === 0) {
    return <div className="empty-state">No users found</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-primary-500 text-white">
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Last Name</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">First Name</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Badge #</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Rank</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">District</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Status</th>
              <th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                onClick={() => onUserSelect?.(user)}
                className="border-b border-gray-300 hover:bg-gray-50 transition cursor-pointer"
              >
                <td className="px-4 py-3">{user.lastName}</td>
                <td className="px-4 py-3">{user.firstName}</td>
                <td className="px-4 py-3">{user.badgeNumber}</td>
                <td className="px-4 py-3">{user.rank}</td>
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
                      if (window.confirm(`Delete ${user.firstName} ${user.lastName}?`)) {
                        onDelete?.(user.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
