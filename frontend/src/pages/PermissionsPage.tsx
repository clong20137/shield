import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { AuthAccount, AuthRole, authService } from '../services/api';

interface PermissionsPageProps {
  account: AuthAccount;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

const permissionOptions = [
  { key: 'users:view', label: 'View users' },
  { key: 'users:create', label: 'Create users' },
  { key: 'users:edit', label: 'Edit users' },
  { key: 'devices:manage', label: 'Manage devices' },
  { key: 'calendar:manage', label: 'Manage calendar' },
  { key: 'audit:view', label: 'View audit log' },
  { key: 'roles:manage', label: 'Manage roles' },
  { key: 'messages:send', label: 'Send messages' },
  { key: 'dashboard:manage', label: 'Manage dashboard posts' },
];

function PermissionsPage({
  account,
  onAccountUpdate,
  onToast,
  getErrorMessage,
}: PermissionsPageProps) {
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>(['users:view']);
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await authService.getAccounts(account.id);
      const rolesResponse = await authService.getRoles(account.id);
      setAccounts(response.data);
      setRoles(rolesResponse.data);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load accounts.');
      setError(message);
      onToast('error', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    const interval = window.setInterval(() => loadAccounts(false), 30000);

    return () => window.clearInterval(interval);
  }, [account.id]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isCreateRoleModalOpen) {
        setIsCreateRoleModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isCreateRoleModalOpen]);

  const updateRole = async (targetAccount: AuthAccount, role: string) => {
    setSavingAccountId(targetAccount.id);
    setError(null);

    try {
      const response = await authService.updateRole(account.id, targetAccount.id, role);

      if (response.data.account) {
        setAccounts((currentAccounts) =>
          currentAccounts.map((item) =>
            item.id === targetAccount.id ? response.data.account as AuthAccount : item,
          ),
        );

        if (targetAccount.id === account.id) {
          onAccountUpdate(response.data.account);
        }
      }

      onToast('success', 'Permissions updated.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update permissions.');
      setError(message);
      onToast('error', message);
    } finally {
      setSavingAccountId(null);
    }
  };

  const createRole = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!newRoleName.trim()) {
      onToast('error', 'Role name is required.');
      return;
    }

    setIsSavingRole(true);
    setError(null);
    try {
      const response = await authService.createRole(account.id, newRoleName, newRolePermissions);
      setRoles((currentRoles) => [...currentRoles, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRoleName('');
      setNewRolePermissions(['users:view']);
      setIsCreateRoleModalOpen(false);
      onToast('success', 'Role created.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create role.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSavingRole(false);
    }
  };

  const administratorCount = accounts.filter((item) => item.role === 'administrator').length;
  const standardCount = accounts.filter((item) => item.role === 'user').length;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Permissions</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Manage account access levels for administrators and users.
          </p>
        </div>
        <button type="button" onClick={() => setIsCreateRoleModalOpen(true)} className="btn-primary">
          <Plus size={16} />
          Create Role
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Total Accounts</p>
          <p className="mt-2 text-3xl font-bold text-primary-500 dark:text-blue-100">{accounts.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Administrators</p>
          <p className="mt-2 text-3xl font-bold text-accent">{administratorCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Users</p>
          <p className="mt-2 text-3xl font-bold text-primary-500 dark:text-blue-100">{standardCount}</p>
        </div>
      </div>

      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <h2 className="mb-5">Account Roles</h2>
        {loading ? (
          <div className="loading">Loading accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="empty-state">No accounts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">2FA</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-4 font-semibold text-gray-800 dark:text-gray-100">{item.displayName}</td>
                    <td className="px-3 py-4">{item.email}</td>
                    <td className="px-3 py-4">{item.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</td>
                    <td className="px-3 py-4">
                      <select
                        value={item.role}
                        onChange={(event) => updateRole(item, event.target.value)}
                        disabled={savingAccountId === item.id}
                        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.name}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCreateRoleModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={createRole} className="modal-window w-full max-w-3xl rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Role</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Define a role name and choose its permissions.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateRoleModalOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
                aria-label="Close create role"
              >
                <X size={20} />
              </button>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Role Name</span>
              <input
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder="supervisor"
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                autoFocus
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Permissions</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {permissionOptions.map((permission) => (
                  <label key={permission.key} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                    <input
                      type="checkbox"
                      checked={newRolePermissions.includes(permission.key)}
                      onChange={(event) => {
                        setNewRolePermissions((currentPermissions) =>
                          event.target.checked
                            ? [...currentPermissions, permission.key]
                            : currentPermissions.filter((item) => item !== permission.key),
                        );
                      }}
                    />
                    {permission.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
              <button type="button" onClick={() => setIsCreateRoleModalOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSavingRole}>
                {isSavingRole ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default PermissionsPage;
