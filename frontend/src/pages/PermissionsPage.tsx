import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Mail, Pencil, Plus, Power, Save, Search, ShieldCheck, ShieldAlert, Sparkles, X } from 'lucide-react';
import { AccessReviewResponse, AuthAccount, AuthInvite, AuthRole, RegistrationSettings, ThemeSettings, authService, reportService, systemService } from '../services/api';
import { getEffectiveSeasonalTheme, getSeasonalThemeOption, SEASONAL_THEME_OPTIONS, type SeasonalThemePreference } from '../theme/seasonalThemes';

const APP_BASE_PATH = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/u, '');
const DEFAULT_APP_BASE_URL = `${window.location.origin}${APP_BASE_PATH}`;
const DEFAULT_BRAND_LOGO = '/shield-splash-logo.png';
const MAX_LOGO_SIZE_BYTES = 240 * 1024;

function withAppBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}` || '/';
}

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
      { key: 'account:profile-picture', label: 'Change own profile photo' },
      { key: 'presence:incognito', label: 'Use incognito mode' },
      { key: 'presence:view-incognito', label: 'View incognito presence' },
    ],
  },
  {
    title: 'Media Library',
    description: 'Photo library browsing, uploads, folder management, and deletion.',
    permissions: [
      { key: 'media:view', label: 'View media library' },
      { key: 'media:upload', label: 'Upload media' },
      { key: 'media:edit', label: 'Create/rename folders and images' },
      { key: 'media:delete', label: 'Delete images and folders' },
    ],
  },
  {
    title: 'Operations',
    description: 'Daily work tools and inventory operations.',
    permissions: [
      { key: 'devices:manage', label: 'Manage devices' },
      { key: 'devices:delete-all', label: 'Delete all device records' },
      { key: 'calendar:manage', label: 'Manage calendar' },
      { key: 'calendar:view-profiles', label: 'View profile calendars' },
      { key: 'messages:receive', label: 'Receive messages' },
      { key: 'messages:send', label: 'Send messages' },
      { key: 'desktop:start-with-windows', label: 'Use Start with Windows' },
      { key: 'desktop:minimize-to-tray', label: 'Use minimize to system tray' },
      { key: 'alerts:send', label: 'Send urgent alerts' },
      { key: 'district-feed:post', label: 'Post district feed updates' },
    ],
  },
  {
    title: 'Fleet',
    description: 'Fleet app calendar, vehicle, and inventory module access.',
    permissions: [
      { key: 'fleet:bookings:manage', label: 'View and manage Fleet booking calendar' },
      { key: 'fleet:vehicles:manage', label: 'Access and manage Fleet vehicles page' },
      { key: 'fleet:inventory:manage', label: 'Access and manage Fleet inventory page' },
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
  {
    title: 'Admin Console Sections',
    description: 'Control which admin tools appear inside the Admin Console.',
    permissions: [
      { key: 'admin:access', label: 'Open Admin Console' },
      { key: 'admin:general', label: 'Open General settings' },
      { key: 'admin:permissions', label: 'Open Permissions' },
      { key: 'admin:achievements', label: 'Open Achievements' },
      { key: 'admin:create-user', label: 'Open Create User' },
      { key: 'admin:media', label: 'Open Media' },
      { key: 'admin:alerts', label: 'Open Urgent Alerts' },
      { key: 'admin:bugs', label: 'Open Bug Tracker' },
      { key: 'admin:audit', label: 'Open Audit Log' },
      { key: 'admin:errors', label: 'Open Error Log' },
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
    appBaseUrl: DEFAULT_APP_BASE_URL,
    appName: '',
    siteName: '',
    brandLogoDataUrl: '',
    maintenanceMode: false,
    loginWarningEnabled: true,
    loginWarningMessage: 'This is a Indiana State Police computer application system that is for Official use only. This system is subject to monitoring. Therefore, no expectation of privacy is to be assumed. Individuals found performing unauthorized activities may be subject to disciplinary action including criminal prosecution.',
    sessionTimeoutMinutes: 0,
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState<AuthInvite[]>([]);
  const [latestInvite, setLatestInvite] = useState<AuthInvite | null>(null);
  const [isSavingRegistration, setIsSavingRegistration] = useState(false);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>({
    seasonalTheme: 'auto',
  });
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [accessReview, setAccessReview] = useState<AccessReviewResponse | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [isRestartingApi, setIsRestartingApi] = useState(false);
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
      const themeResponse = await authService.getThemeSettings();
      const invitesResponse = await authService.listInvites();
      const accessReviewResponse = await reportService.getAccessReview();
      setRoles(rolesResponse.data);
      setRegistrationSettings(registrationResponse.data);
      setThemeSettings(themeResponse.data);
      try {
        window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(registrationResponse.data.sessionTimeoutMinutes || 0));
      } catch {}
      setInvites(invitesResponse.data);
      setAccessReview(accessReviewResponse.data);
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
    if (section === 'settings') return undefined;

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncAccessReview();
      }
    };
    const intervalId = window.setInterval(syncWhenVisible, 60000);

    window.addEventListener('focus', syncWhenVisible);
    document.addEventListener('visibilitychange', syncWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncWhenVisible);
      document.removeEventListener('visibilitychange', syncWhenVisible);
    };
  }, [section]);

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
      window.dispatchEvent(new CustomEvent('shield:setup-settings-updated', { detail: response.data }));
      try {
        const minutes = response.data.sessionTimeoutMinutes || 0;
        window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(minutes));
        try {
          window.dispatchEvent(new CustomEvent('shield:session-timeout-updated', { detail: { minutes } }));
        } catch {}
      } catch {}
      onToast('success', 'General settings saved.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to save registration settings.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSavingRegistration(false);
    }
  };

  const saveThemeSettings = async (nextSettings: ThemeSettings) => {
    if (account.role !== 'administrator') {
      onToast('error', 'Only administrators can change the seasonal theme.');
      return;
    }

    const previousSettings = themeSettings;
    setThemeSettings(nextSettings);
    setIsSavingTheme(true);
    setError(null);

    try {
      const response = await authService.updateThemeSettings(nextSettings);
      setThemeSettings(response.data);
      window.dispatchEvent(new CustomEvent('shield:theme-settings-updated', { detail: response.data }));
      onToast('success', 'Seasonal theme updated for everyone.');
    } catch (err) {
      setThemeSettings(previousSettings);
      const message = getErrorMessage(err, 'Failed to update theme settings.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSavingTheme(false);
    }
  };

  const handleLogoFileChange = (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      onToast('error', 'Choose an image file for the app logo.');
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      onToast('error', 'Logo image must be 240 KB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        onToast('error', 'Logo image could not be read.');
        return;
      }
      setRegistrationSettings((settings) => ({ ...settings, brandLogoDataUrl: result }));
    };
    reader.onerror = () => onToast('error', 'Logo image could not be read.');
    reader.readAsDataURL(file);
  };

  const restartApi = async () => {
    if (!window.confirm('Restart the Shield API now? Users may briefly see the app reconnect while PM2 starts it again.')) {
      return;
    }

    setIsRestartingApi(true);
    try {
      const response = await systemService.restartApi();
      onToast('info', response.data.message);
      window.setTimeout(() => {
        onToast('info', 'Waiting for the API to come back online...');
      }, 1500);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to request API restart.');
      onToast('error', message);
      setIsRestartingApi(false);
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

  async function syncAccessReview() {
    try {
      const response = await reportService.getAccessReview();
      setAccessReview(response.data);
    } catch (err) {
      console.error('Failed to live sync access review:', err);
    }
  }

  const flaggedAccounts = accessReview?.accounts.filter((item) => item.reviewFlags.length > 0) || [];
  const reviewPageSize = 6;
  const reviewPageCount = Math.max(1, Math.ceil(flaggedAccounts.length / reviewPageSize));
  const currentReviewPage = Math.min(reviewPage, reviewPageCount);
  const visibleFlaggedAccounts = flaggedAccounts.slice((currentReviewPage - 1) * reviewPageSize, currentReviewPage * reviewPageSize);
  const effectiveSeasonalTheme = getEffectiveSeasonalTheme(themeSettings.seasonalTheme as SeasonalThemePreference);
  const effectiveSeasonalOption = getSeasonalThemeOption(effectiveSeasonalTheme);
  const canChangeTheme = account.role === 'administrator';

  useEffect(() => {
    setReviewPage((page) => Math.min(page, reviewPageCount));
  }, [reviewPageCount]);

  const formatDate = (value?: string | null) => {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
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
      <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
              <ShieldAlert size={20} className="text-accent" />
              Access Review
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review privileged access, MFA enrollment, stale accounts, and active sessions.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:ring-emerald-900">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
            Live synced
          </span>
        </div>

        {loading ? (
          <div className="loading">Loading access review...</div>
        ) : !accessReview ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">Access review is not available.</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Accounts', accessReview.summary.totalAccounts],
                ['Admins', accessReview.summary.administratorAccounts],
                ['MFA Missing', accessReview.summary.mfaMissingAccounts],
                ['Active Sessions', accessReview.summary.activeSessions],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                  <span className="block text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{label}</span>
                  <span className="mt-1 block text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</span>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {accessReview.roles.map((role) => (
                <div key={role.role} className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{role.role}</span>
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800">
                      {role.accountCount} account{role.accountCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'} assigned</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {(section === 'all' || section === 'permissions') && (
      <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Accounts Needing Review</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review accounts with missing MFA, stale activity, active sessions, or elevated access.</p>
            </div>
          </div>
          <span className="rounded bg-amber-50 px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
            {flaggedAccounts.length} flagged
          </span>
        </div>

        {loading ? (
          <div className="loading">Loading accounts needing review...</div>
        ) : !accessReview ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">Access review is not available.</div>
        ) : flaggedAccounts.length === 0 ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
            No accounts currently need review.
          </div>
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              {visibleFlaggedAccounts.map((reviewAccount) => (
                <article key={reviewAccount.id} className="rounded border border-amber-200 bg-amber-50/60 p-3 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-black text-gray-900 dark:text-gray-100">{reviewAccount.displayName}</span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{reviewAccount.email}</span>
                    </div>
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
                      {reviewAccount.role}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    <span>Last seen {formatDate(reviewAccount.lastSeenAt)}</span>
                    <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                    <span>{reviewAccount.reviewFlags.length} review flag{reviewAccount.reviewFlags.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {reviewAccount.reviewFlags.map((flag) => (
                      <span key={flag} className="rounded bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-800 ring-1 ring-amber-200 dark:bg-gray-950 dark:text-amber-100 dark:ring-amber-900">
                        {flag.replace(/_/gu, ' ')}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {reviewPageCount > 1 && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  Page {currentReviewPage} of {reviewPageCount}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                    disabled={currentReviewPage === 1}
                    className="btn-secondary"
                    aria-label="Previous review page"
                    title="Previous Page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewPage((page) => Math.min(reviewPageCount, page + 1))}
                    disabled={currentReviewPage === reviewPageCount}
                    className="btn-secondary"
                    aria-label="Next review page"
                    title="Next Page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      )}

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
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
                <Sparkles size={20} className="text-accent" />
                Theme Manager
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose the global seasonal theme. Changes update connected users automatically.
              </p>
            </div>
            <span className="rounded bg-white px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800">
              {isSavingTheme ? 'Saving' : 'Live'}
            </span>
          </div>

          <div className="max-w-md">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Seasonal Theme</span>
                {themeSettings.seasonalTheme === 'auto' && (
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Auto: {effectiveSeasonalOption.label}</span>
                )}
              </div>
              <select
                value={themeSettings.seasonalTheme}
                disabled={!canChangeTheme || isSavingTheme}
                onChange={(event) => void saveThemeSettings({ ...themeSettings, seasonalTheme: event.target.value as ThemeSettings['seasonalTheme'] })}
                className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:border-accent focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
              >
                {SEASONAL_THEME_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {getSeasonalThemeOption(themeSettings.seasonalTheme as SeasonalThemePreference).description}
              </p>
            </div>
        </div>

        <div className="mb-5">
          <h2>General Settings</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set the visible app name, control public registration, or create secure invite links for new accounts.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
                <Power size={18} className="text-amber-700 dark:text-amber-200" />
                API Service Control
              </h3>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                Run the Express API under PM2 or the ShieldApi Windows Service so it starts with Windows and comes back online after this restart action.
              </p>
              <div className="mt-3 grid gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                <code className="rounded bg-white px-2 py-1 dark:bg-gray-900">pm2 start ecosystem.config.cjs</code>
                <code className="rounded bg-white px-2 py-1 dark:bg-gray-900">pm2 save</code>
                <code className="rounded bg-white px-2 py-1 dark:bg-gray-900">.\deployment\windows\install-shield-api-service.ps1</code>
                <code className="rounded bg-white px-2 py-1 dark:bg-gray-900">pm2 monit</code>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void restartApi()}
              className="btn-danger shrink-0"
              disabled={isRestartingApi}
              aria-label="Restart Shield API"
              title={isRestartingApi ? 'Restart requested' : 'Restart API'}
            >
              <Power size={16} />
              {isRestartingApi ? 'Restarting' : 'Restart API'}
            </button>
          </div>
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-100">
            Only use this after PM2 or the ShieldApi Windows Service is configured. If the API is running from a normal terminal, it will shut down and must be started manually.
          </p>
        </div>

        <form onSubmit={saveRegistrationSettings} className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
          <label className="lg:col-span-1">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">App Name</span>
            <input
              value={registrationSettings.appName || ''}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, appName: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              placeholder="Shield"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Site Name</span>
            <input
              value={registrationSettings.siteName || ''}
              onChange={(event) => setRegistrationSettings((settings) => ({ ...settings, siteName: event.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              placeholder="Shield Workspace"
            />
          </label>
          <div className="rounded border border-gray-200 p-4 dark:border-gray-800 lg:col-span-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-950">
                  <img
                    src={registrationSettings.brandLogoDataUrl || withAppBase(DEFAULT_BRAND_LOGO)}
                    alt="Current app logo"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">App Logo</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Use a transparent PNG/WebP/SVG for the splash screen and left navigation panel.</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <label className="btn-secondary cursor-pointer" title="Upload Logo">
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      handleLogoFileChange(event.target.files?.[0] || null);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {registrationSettings.brandLogoDataUrl && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRegistrationSettings((settings) => ({ ...settings, brandLogoDataUrl: '' }))}
                    aria-label="Use default app logo"
                    title="Use Default Logo"
                  >
                    Use Default
                  </button>
                )}
              </div>
            </div>
          </div>
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
                href={`mailto:${encodeURIComponent(latestInvite.email)}?subject=${encodeURIComponent(`Your ${(registrationSettings.appName || 'application').trim()} invite`)}&body=${encodeURIComponent(`Use this secure link to create your ${(registrationSettings.appName || 'application').trim()} login:\n\n${latestInvite.inviteUrl}`)}`}
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
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-6 sm:p-8 lg:p-10">
          <form onSubmit={saveRoleEdit} className="modal-window my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900 sm:my-8 sm:max-h-[calc(100vh-4rem)] sm:p-8 lg:my-10 lg:max-h-[calc(100vh-5rem)]">
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
