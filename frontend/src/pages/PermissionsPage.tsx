import { useEffect, useState } from 'react';
import { Mail, Pencil, Plus, Save, ShieldCheck, X } from 'lucide-react';
import { AuthAccount, AuthInvite, AuthRole, RegistrationSettings, authService } from '../services/api';

interface PermissionsPageProps {
  account: AuthAccount;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
  section?: 'all' | 'permissions' | 'settings';
  isModalView?: boolean;
}

const permissionOptions = [
  { key: 'users:view', label: 'View users' },
  { key: 'users:create', label: 'Create users' },
  { key: 'users:edit', label: 'Edit users' },
  { key: 'users:profile-picture', label: 'Edit profile photos' },
  { key: 'devices:manage', label: 'Manage devices' },
  { key: 'calendar:manage', label: 'Manage calendar' },
  { key: 'reports:trooper-dailies', label: 'View Trooper Daily reports' },
  { key: 'reports:cpar', label: 'Create CPAR reports' },
  { key: 'audit:view', label: 'View audit log' },
  { key: 'roles:manage', label: 'Manage roles' },
  { key: 'messages:send', label: 'Send messages' },
  { key: 'dashboard:manage', label: 'Manage dashboard posts' },
  { key: 'bugs:manage', label: 'Manage bug tracker' },
];

function PermissionsPage({
  account,
  onAccountUpdate,
  onToast,
  getErrorMessage,
  section = 'all',
  isModalView = false,
}: PermissionsPageProps) {
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>(['users:view']);
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AuthRole | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRolePermissions, setEditRolePermissions] = useState<string[]>([]);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const SESSION_TIMEOUT_KEY = 'shield_session_timeout_minutes';

  const [registrationSettings, setRegistrationSettings] = useState<RegistrationSettings>({
    mode: 'public',
    appBaseUrl: window.location.origin,
    maintenanceMode: false,
    loginWarningEnabled: true,
    loginWarningMessage: 'This is a Indiana State Police computer application system that is for Official use only. This system is subject to monitoring. Therefore, no expectation of privacy is to be assumed. Individuals found performing unauthorized activities may be subject to disciplinary action including criminal prosecution.',
    // optional field: sessionTimeoutMinutes (minutes of inactivity before auto-logout). 0 disables.
    // will be read/saved to localStorage as a fallback for older backends.
    // @ts-ignore
    sessionTimeoutMinutes: 0,
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState<AuthInvite[]>([]);
  const [latestInvite, setLatestInvite] = useState<AuthInvite | null>(null);
  const [isSavingRegistration, setIsSavingRegistration] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
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
      const registrationResponse = await authService.getRegistrationSettings();
      const invitesResponse = await authService.listInvites();
      setAccounts(response.data);
      setRoles(rolesResponse.data);
      // merge any sessionTimeoutMinutes if the backend provides it
      const reg = registrationResponse.data as unknown as { sessionTimeoutMinutes?: number };
      setRegistrationSettings((current) => ({ ...(registrationResponse.data as RegistrationSettings), // base
        // preserve existing keys
        ...(reg.sessionTimeoutMinutes !== undefined ? { sessionTimeoutMinutes: reg.sessionTimeoutMinutes } : { sessionTimeoutMinutes: (current as any).sessionTimeoutMinutes }),
      } as RegistrationSettings));
      // also persist to localStorage as fallback
      try {
        const val = reg.sessionTimeoutMinutes ?? (window.localStorage.getItem(SESSION_TIMEOUT_KEY) ? parseInt(window.localStorage.getItem(SESSION_TIMEOUT_KEY) as string, 10) : 0);
        if (typeof val === 'number') window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(val));
      } catch {}
      setInvites(invitesResponse.data);
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
    const handlePermissionsUpdate = () => loadAccounts(false);

    window.addEventListener('shield:permission-updated', handlePermissionsUpdate);
    window.addEventListener('shield:user-updated', handlePermissionsUpdate);
    return () => {
      window.removeEventListener('shield:permission-updated', handlePermissionsUpdate);
      window.removeEventListener('shield:user-updated', handlePermissionsUpdate);
    };
  }, [account.id]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isCreateRoleModalOpen) {
        setIsCreateRoleModalOpen(false);
      }
      if (event.key === 'Escape' && editingRole) {
        setEditingRole(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isCreateRoleModalOpen, editingRole]);

  const openEditRole = (role: AuthRole) => {
    setEditingRole(role);
    setEditRoleName(role.name);
    setEditRolePermissions(role.permissions);
  };

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

  const saveRoleEdit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!editingRole || !editRoleName.trim()) {
      onToast('error', 'Role name is required.');
      return;
    }

    setIsSavingRole(true);
    setError(null);
    try {
      const response = await authService.updateRoleDefinition(editingRole.id, editRoleName, editRolePermissions);
      setRoles((currentRoles) => currentRoles.map((role) => (role.id === editingRole.id ? response.data : role)).sort((a, b) => a.name.localeCompare(b.name)));
      setAccounts((currentAccounts) => currentAccounts.map((item) => (item.role === editingRole.name ? { ...item, role: response.data.name } : item)));
      setEditingRole(null);
      onToast('success', 'Role updated.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update role.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSavingRole(false);
    }
  };

  const saveRegistrationSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingRegistration(true);
    setError(null);

    try {
      const response = await authService.updateRegistrationSettings(registrationSettings);
      setRegistrationSettings(response.data);
      // persist session timeout to localStorage as a fallback
      try {
        // @ts-ignore
        const minutes = (response.data && (response.data.sessionTimeoutMinutes ?? (registrationSettings as any).sessionTimeoutMinutes)) || 0;
        window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(minutes));
        // notify other components in the same window about the change
        try {
          window.dispatchEvent(new CustomEvent('shield:session-timeout-updated', { detail: { minutes } }));
        } catch {}
      } catch {}
      onToast('success', 'Registration settings saved.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to save registration settings.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSavingRegistration(false);
    }
  };

  const createInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inviteEmail.trim()) {
      onToast('error', 'Enter an email to invite.');
      return;
    }

    setIsSendingInvite(true);
    setError(null);
    try {
      const response = await authService.createInvite(inviteEmail, account.id);
      setLatestInvite(response.data);
      setInvites((items) => [response.data, ...items]);
      setInviteEmail('');
      onToast('success', 'Invite link created.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create invite.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSendingInvite(false);
    }
  };

  const administratorCount = accounts.filter((item) => item.role === 'administrator').length;
  const standardCount = accounts.filter((item) => item.role === 'user').length;

  return (
    <div>
      {!isModalView && (
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Permissions</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Manage account access levels for administrators and users.
          </p>
        </div>
        <button type="button" onClick={() => setIsCreateRoleModalOpen(true)} className="btn-primary" aria-label="Create role" title="Create Role">
          <Plus size={16} />
        </button>
      </div>
      )}

      {error && <div className="error">{error}</div>}

      {(section === 'all' || section === 'permissions') && (
      <>
      {isModalView && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Roles & Access</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Assign account roles or adjust role permissions.</p>
          </div>
          <button type="button" onClick={() => setIsCreateRoleModalOpen(true)} className="btn-primary" aria-label="Create role" title="Create Role">
            <Plus size={16} />
          </button>
        </div>
      )}
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2>Account Roles</h2>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <button key={role.id} type="button" onClick={() => openEditRole(role)} className="inline-flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700 hover:border-accent hover:text-accent dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200" aria-label={`Edit ${role.name} role`} title={`Edit ${role.name}`}>
                <ShieldCheck size={16} />
                <span>{role.name}</span>
                <Pencil size={16} />
              </button>
            ))}
          </div>
        </div>
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
      </>
      )}

      {(section === 'all' || section === 'settings') && (
      <section className="mt-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5">
          <h2>Registration Access</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Control public registration or create secure invite links for new accounts.
          </p>
        </div>

        <form onSubmit={saveRegistrationSettings} className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
          <label>
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Registration Mode</span>
            <select
              value={registrationSettings.mode}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, mode: event.target.value as RegistrationSettings['mode'] }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="public">Public</option>
              <option value="invite-only">Invite Only</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">App URL for Invites</span>
            <input
              value={registrationSettings.appBaseUrl}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, appBaseUrl: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              placeholder="https://shield.example.gov"
            />
          </label>
          <button type="submit" className="btn-primary self-end" disabled={isSavingRegistration} aria-label="Save registration settings" title={isSavingRegistration ? 'Saving' : 'Save'}>
            <Save size={16} />
          </button>
          <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800 lg:col-span-3">
            <span>
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Maintenance mode</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Only administrators can sign in while this is enabled.</span>
            </span>
            <input
              type="checkbox"
              checked={registrationSettings.maintenanceMode}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, maintenanceMode: event.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800 lg:col-span-3">
            <span>
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Login warning acknowledgement</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Require users to acknowledge an official-use warning on every sign-in.</span>
            </span>
            <input
              type="checkbox"
              checked={registrationSettings.loginWarningEnabled}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, loginWarningEnabled: event.target.checked }))}
            />
          </label>
          <label className="lg:col-span-3">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Login Warning Message</span>
            <textarea
              value={registrationSettings.loginWarningMessage}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, loginWarningMessage: event.target.value }))}
              className="min-h-32 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              disabled={!registrationSettings.loginWarningEnabled}
            />
          </label>
          <label className="lg:col-span-3">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Auto-logout (minutes)</span>
            <input
              type="number"
              min={0}
              value={(registrationSettings as any).sessionTimeoutMinutes ?? 0}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, // @ts-ignore
                sessionTimeoutMinutes: Math.max(0, Number(event.target.value) || 0),
              }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Set minutes of inactivity before users are automatically signed out. Use 0 to disable.</p>
          </label>
        </form>

        <form onSubmit={createInvite} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="person@example.gov"
          />
          <button type="submit" className="btn-secondary" disabled={isSendingInvite} aria-label="Create invite" title={isSendingInvite ? 'Creating' : 'Create Invite'}>
            <Plus size={16} />
          </button>
        </form>

        {latestInvite?.inviteUrl && (
          <div className="mt-4 rounded border border-accent/30 bg-accent/10 p-3">
            <p className="text-sm font-bold text-primary-500 dark:text-blue-100">Invite link ready for {latestInvite.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input readOnly value={latestInvite.inviteUrl} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
              <a
                href={`mailto:${encodeURIComponent(latestInvite.email)}?subject=${encodeURIComponent('Your SHIELD invite')}&body=${encodeURIComponent(`Use this secure link to create your SHIELD login:\n\n${latestInvite.inviteUrl}`)}`}
                className="btn-primary"
                aria-label="Email invite"
                title="Email Invite"
              >
                <Mail size={16} />
              </a>
            </div>
          </div>
        )}

        {invites.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Invited By</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Expires</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-3 font-semibold">{invite.email}</td>
                    <td className="px-3 py-3">{invite.invitedByName || 'System'}</td>
                    <td className="px-3 py-3">{invite.acceptedAt ? 'Accepted' : new Date(invite.expiresAt).getTime() < Date.now() ? 'Expired' : 'Pending'}</td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{new Date(invite.expiresAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

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
                className="icon-close-button"
                aria-label="Close create role"
                title="Close"
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
              <div className="grid max-h-[42vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
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
              <button type="button" onClick={() => setIsCreateRoleModalOpen(false)} className="btn-secondary" aria-label="Cancel create role" title="Cancel">
                <X size={16} />
              </button>
              <button type="submit" className="btn-primary" disabled={isSavingRole} aria-label="Create role" title={isSavingRole ? 'Creating' : 'Create Role'}>
                <Plus size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
      {editingRole && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveRoleEdit} className="modal-window w-full max-w-3xl rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Role</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Update this role name and permissions.</p>
              </div>
              <button type="button" onClick={() => setEditingRole(null)} className="icon-close-button" aria-label="Close edit role" title="Close">
                <X size={20} />
              </button>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Role Name</span>
              <input
                value={editRoleName}
                onChange={(event) => setEditRoleName(event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                autoFocus
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Permissions</span>
              <div className="grid max-h-[42vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
                {permissionOptions.map((permission) => (
                  <label key={permission.key} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                    <input
                      type="checkbox"
                      checked={editRolePermissions.includes(permission.key)}
                      onChange={(event) => {
                        setEditRolePermissions((currentPermissions) =>
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
              <button type="button" onClick={() => setEditingRole(null)} className="btn-secondary" aria-label="Cancel edit role" title="Cancel">
                <X size={16} />
              </button>
              <button type="submit" className="btn-primary" disabled={isSavingRole} aria-label="Save role" title={isSavingRole ? 'Saving' : 'Save Role'}>
                <Save size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default PermissionsPage;
