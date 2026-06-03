import { useEffect, useMemo, useState } from 'react';
import { Mail, Pencil, Plus, Save, Search, ShieldCheck, X } from 'lucide-react';
import { AuthAccount, AuthInvite, AuthRole, RegistrationSettings, authService } from '../services/api';

interface PermissionsPageProps {
  account: AuthAccount;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
  section?: 'all' | 'permissions' | 'settings';
  isModalView?: boolean;
}

const permissionGroups = [
  {
    title: 'Users & Profiles',
    description: 'Directory access, profile editing, and account creation.',
    permissions: [
      { key: 'users:view', label: 'View users' },
      { key: 'users:create', label: 'Create users' },
      { key: 'users:edit', label: 'Edit users' },
      { key: 'users:view-hidden', label: 'View hidden users' },
      { key: 'users:profile-picture', label: 'Edit profile photos' },
    ],
  },
  {
    title: 'Operations',
    description: 'Daily work tools and inventory operations.',
    permissions: [
      { key: 'devices:manage', label: 'Manage devices' },
      { key: 'calendar:manage', label: 'Manage calendar' },
      { key: 'messages:send', label: 'Send messages' },
      { key: 'alerts:send', label: 'Send urgent alerts' },
    ],
  },
  {
    title: 'Reports & Reviews',
    description: 'Submitted reports, CPAR workflows, and review access.',
    permissions: [
      { key: 'reports:trooper-dailies', label: 'View/review Trooper Daily reports' },
      { key: 'reports:cpar', label: 'Create CPAR reports' },
    ],
  },
  {
    title: 'Administration',
    description: 'System controls, audit history, posts, and issue tracking.',
    permissions: [
      { key: 'roles:manage', label: 'Manage roles' },
      { key: 'audit:view', label: 'View audit log' },
      { key: 'dashboard:manage', label: 'Manage dashboard posts' },
      { key: 'dashboard:create', label: 'Create news and updates' },
      { key: 'dashboard:edit', label: 'Edit news and updates' },
      { key: 'dashboard:delete', label: 'Delete news and updates' },
      { key: 'bugs:manage', label: 'Manage bug tracker' },
    ],
  },
];

function PermissionChecklist({
  selectedPermissions,
  onChange,
}: {
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
}) {
  const [permissionSearch, setPermissionSearch] = useState('');
  const query = permissionSearch.trim().toLowerCase();
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions]);
  const visibleGroups = permissionGroups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((permission) =>
        !query ||
        permission.label.toLowerCase().includes(query) ||
        permission.key.toLowerCase().includes(query) ||
        group.title.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.permissions.length > 0);

  const togglePermission = (permissionKey: string, checked: boolean) => {
    onChange(
      checked
        ? Array.from(new Set([...selectedPermissions, permissionKey]))
        : selectedPermissions.filter((item) => item !== permissionKey),
    );
  };

  const selectGroup = (keys: string[]) => {
    onChange(Array.from(new Set([...selectedPermissions, ...keys])));
  };

  const clearGroup = (keys: string[]) => {
    const clearSet = new Set(keys);
    onChange(selectedPermissions.filter((item) => !clearSet.has(item)));
  };

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          value={permissionSearch}
          onChange={(event) => setPermissionSearch(event.target.value)}
          placeholder="Search permissions..."
          className="w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
      </label>

      <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
        {visibleGroups.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 py-8 text-sm dark:border-gray-700">No permissions match that search.</div>
        ) : visibleGroups.map((group) => {
          const groupKeys = group.permissions.map((permission) => permission.key);
          const selectedCount = groupKeys.filter((key) => selectedSet.has(key)).length;
          return (
            <section key={group.title} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{group.title}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-white px-2 py-1 text-xs font-bold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800">
                    {selectedCount}/{group.permissions.length}
                  </span>
                  <button type="button" onClick={() => selectGroup(groupKeys)} className="text-xs font-bold text-accent hover:underline">
                    Select
                  </button>
                  <button type="button" onClick={() => clearGroup(groupKeys)} className="text-xs font-bold text-gray-500 hover:text-danger dark:text-gray-400">
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <label key={permission.key} className="flex items-start gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(permission.key)}
                      onChange={(event) => togglePermission(permission.key, event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold text-gray-800 dark:text-gray-100">{permission.label}</span>
                      <span className="mt-0.5 block text-xs text-gray-400">{permission.key}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PermissionsPage({
  account,
  onToast,
  getErrorMessage,
  section = 'all',
  isModalView = false,
}: PermissionsPageProps) {
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
    sessionTimeoutMinutes: 0,
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState<AuthInvite[]>([]);
  const [latestInvite, setLatestInvite] = useState<AuthInvite | null>(null);
  const [isSavingRegistration, setIsSavingRegistration] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const rolesResponse = await authService.getRoles(account.id);
      const registrationResponse = await authService.getRegistrationSettings();
      const invitesResponse = await authService.listInvites();
      setRoles(rolesResponse.data);
      setRegistrationSettings(registrationResponse.data);
      try {
        window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(registrationResponse.data.sessionTimeoutMinutes || 0));
      } catch {}
      setInvites(invitesResponse.data);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load admin settings.');
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
      try {
        const minutes = response.data.sessionTimeoutMinutes || 0;
        window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(minutes));
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
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create roles and organize permission sets. Assign a role from the user profile edit modal.</p>
          </div>
          <button type="button" onClick={() => setIsCreateRoleModalOpen(true)} className="btn-primary" aria-label="Create role" title="Create Role">
            <Plus size={16} />
          </button>
        </div>
      )}
      <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Role Definitions</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Edit the permissions each role grants. User assignment now lives on each user profile.</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <button key={role.id} type="button" onClick={() => openEditRole(role)} className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 px-3 py-3 text-left text-sm text-gray-700 hover:border-accent hover:text-accent dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200" aria-label={`Edit ${role.name} role`} title={`Edit ${role.name}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <ShieldCheck size={16} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{role.name}</span>
                    <span className="mt-0.5 block text-xs text-gray-400">{role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}</span>
                  </span>
                </span>
                <Pencil size={16} className="shrink-0" />
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="loading">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="empty-state">No roles found.</div>
        ) : (
          <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Select a role card above to update its permission set. To assign a role, open a user profile and choose Edit.
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
              value={registrationSettings.sessionTimeoutMinutes}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, sessionTimeoutMinutes: Math.max(0, Number(event.target.value) || 0) }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Set minutes of inactivity before users are automatically signed out. Use 0 to disable.</p>
          </label>
          <div className="flex justify-end lg:col-span-3">
            <button type="submit" className="btn-primary" disabled={isSavingRegistration} aria-label="Save all registration settings" title={isSavingRegistration ? 'Saving' : 'Save Settings'}>
              <Save size={16} />
            </button>
          </div>
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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Permissions</span>
                <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold text-accent">{newRolePermissions.length} selected</span>
              </div>
              <PermissionChecklist selectedPermissions={newRolePermissions} onChange={setNewRolePermissions} />
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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Permissions</span>
                <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold text-accent">{editRolePermissions.length} selected</span>
              </div>
              <PermissionChecklist selectedPermissions={editRolePermissions} onChange={setEditRolePermissions} />
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
