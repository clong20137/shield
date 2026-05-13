import { useEffect, useState } from 'react';
import { AuthAccount, authService } from '../services/api';

interface PermissionsPageProps {
  account: AuthAccount;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

function PermissionsPage({
  account,
  onAccountUpdate,
  onToast,
  getErrorMessage,
}: PermissionsPageProps) {
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authService.getAccounts(account.id);
      setAccounts(response.data);
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
  }, [account.id]);

  const updateRole = async (targetAccount: AuthAccount, role: AuthAccount['role']) => {
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
        <button type="button" onClick={loadAccounts} className="btn-secondary">
          Refresh Accounts
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
                        onChange={(event) => updateRole(item, event.target.value as AuthAccount['role'])}
                        disabled={savingAccountId === item.id}
                        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      >
                        <option value="administrator">Administrator</option>
                        <option value="user">User</option>
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
    </div>
  );
}

export default PermissionsPage;
