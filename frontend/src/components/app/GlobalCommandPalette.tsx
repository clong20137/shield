import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Bug, Calculator, CalendarDays, ClipboardList, Command, Laptop, LayoutDashboard, LockKeyhole, LucideIcon, Mail, Search, Shield, UserCircle, UserPlus, X } from 'lucide-react';
import type { AdminConsoleTab } from '../../pages/AdminConsolePage';

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

interface CommandPaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  icon: LucideIcon;
  action: () => void;
}

export function GlobalCommandPalette({
  isOpen,
  isAdministrator,
  canOpenAdminConsole,
  showCalendar,
  defaultAdminConsoleTab,
  permissions,
  onOpenChange,
  onOpenMessages,
  onOpenCalendar,
  onOpenCalculator,
  onOpenProfile,
  onReportBug,
}: {
  isOpen: boolean;
  isAdministrator: boolean;
  canOpenAdminConsole: boolean;
  showCalendar: boolean;
  defaultAdminConsoleTab: AdminConsoleTab;
  permissions: string[];
  onOpenChange: (isOpen: boolean) => void;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenCalculator: () => void;
  onOpenProfile: () => void;
  onReportBug: () => void;
}) {
  const navigate = useNavigate();
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const canUsePermission = (permission: string) => isAdministrator || permissionSet.has(permission);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const closePalette = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const runAndClose = useCallback((action: () => void) => {
    action();
    closePalette();
  }, [closePalette]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
    };

    document.addEventListener('keydown', handleShortcut);

    return () => document.removeEventListener('keydown', handleShortcut);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  const baseItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        detail: 'Open the main workspace.',
        keywords: ['home', 'start', 'workspace'],
        icon: LayoutDashboard,
        action: () => navigate('/'),
      },
      {
        id: 'messages',
        label: 'Messages',
        detail: 'Open instant messaging.',
        keywords: ['chat', 'inbox', 'conversation'],
        icon: Mail,
        action: onOpenMessages,
      },
      ...(showCalendar ? [{
        id: 'calendar',
        label: 'Calendar',
        detail: 'Open calendar, entries, and reminders.',
        keywords: ['schedule', 'reminder', 'daily'],
        icon: CalendarDays,
        action: onOpenCalendar,
      }] : []),
      {
        id: 'calculator',
        label: 'Calculator',
        detail: 'Open the floating calculator.',
        keywords: ['math', 'numbers'],
        icon: Calculator,
        action: onOpenCalculator,
      },
      {
        id: 'search-users',
        label: 'Search Users',
        detail: 'Find personnel profiles.',
        keywords: ['people', 'profile', 'personnel', 'employee'],
        icon: Search,
        action: () => navigate('/search'),
      },
      {
        id: 'reports',
        label: 'Reports',
        detail: 'Open operational reporting.',
        keywords: ['charts', 'analytics', 'metrics'],
        icon: BarChart3,
        action: () => navigate('/reports'),
      },
      {
        id: 'evaluations',
        label: 'Evaluations',
        detail: 'Open performance evaluations.',
        keywords: ['pe', 'review', 'performance'],
        icon: ClipboardList,
        action: () => navigate('/evaluations'),
      },
      {
        id: 'profile',
        label: 'Account Settings',
        detail: 'Manage profile, MFA, and preferences.',
        keywords: ['profile', 'settings', 'mfa', 'password'],
        icon: UserCircle,
        action: onOpenProfile,
      },
      {
        id: 'report-bug',
        label: 'Report a Bug',
        detail: 'Send an issue to administrators.',
        keywords: ['issue', 'help', 'support'],
        icon: Bug,
        action: onReportBug,
      },
    ];

    if (canOpenAdminConsole) {
      items.push(
        {
          id: 'admin',
          label: 'Admin Console',
          detail: 'Open administration.',
          keywords: ['settings', 'manage', 'administrator'],
          icon: Shield,
          action: () => navigate(`/admin/${defaultAdminConsoleTab}`),
        },
      );
    }

    if (canOpenAdminConsole && canUsePermission('admin:create-user') && canUsePermission('users:create')) {
      items.push({
          id: 'create-user',
          label: 'Create User',
          detail: 'Add a new account.',
          keywords: ['account', 'new', 'person'],
          icon: UserPlus,
          action: () => navigate('/admin/create-user'),
        });
    }

    if (canUsePermission('devices:manage')) {
      items.push(
        {
          id: 'devices',
          label: 'Devices',
          detail: 'Manage issued devices.',
          keywords: ['equipment', 'radio', 'phone', 'asset'],
          icon: Laptop,
          action: () => navigate('/devices'),
        },
      );
    }

    if (canOpenAdminConsole && canUsePermission('admin:audit') && canUsePermission('audit:view')) {
      items.push(
        {
          id: 'audit-log',
          label: 'Audit Log',
          detail: 'Review system activity.',
          keywords: ['activity', 'history', 'xlsx', 'export'],
          icon: ClipboardList,
          action: () => navigate('/admin/audit'),
        },
      );
    }

    if (canOpenAdminConsole && canUsePermission('admin:permissions') && canUsePermission('roles:manage')) {
      items.push(
        {
          id: 'permissions',
          label: 'Permissions',
          detail: 'Manage roles and access.',
          keywords: ['roles', 'access', 'security'],
          icon: LockKeyhole,
          action: () => navigate('/admin/permissions'),
        },
      );
    }

    return items;
  }, [canOpenAdminConsole, canUsePermission, defaultAdminConsoleTab, navigate, onOpenCalendar, onOpenCalculator, onOpenMessages, onOpenProfile, onReportBug, showCalendar]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = normalizedQuery
      ? baseItems.filter((item) => {
          const haystack = [item.label, item.detail, ...item.keywords].join(' ').toLowerCase();
          return normalizedQuery.split(/\s+/u).every((term) => haystack.includes(term));
        })
      : baseItems;

    if (normalizedQuery) {
      return [
        {
          id: `search-${normalizedQuery}`,
          label: `Search users for "${query.trim()}"`,
          detail: 'Open personnel search with this term.',
          keywords: ['people', 'profile', 'personnel'],
          icon: Search,
          action: () => navigate(`/search?q=${encodeURIComponent(query.trim())}`),
        },
        ...matches,
      ];
    }

    return matches;
  }, [baseItems, navigate, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (filteredItems.length ? (index + 1) % filteredItems.length : 0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (filteredItems.length ? (index - 1 + filteredItems.length) % filteredItems.length : 0));
      return;
    }

    if (event.key === 'Enter' && filteredItems[selectedIndex]) {
      event.preventDefault();
      runAndClose(filteredItems[selectedIndex].action);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/35 px-3 pt-[9vh] sm:px-6" onMouseDown={closePalette}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.36)] dark:border-gray-800 dark:bg-gray-950"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <Command className="shrink-0 text-primary-500 dark:text-blue-100" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands, people, apps..."
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          <button type="button" onClick={closePalette} className="icon-close-button" aria-label="Close command palette">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[min(28rem,62dvh)] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">No matching commands</div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => runAndClose(item.action)}
                  className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left transition ${
                    isSelected
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? 'border-white/25 bg-white/15 text-white'
                      : 'border-gray-200 bg-white text-primary-500 dark:border-gray-800 dark:bg-gray-900 dark:text-blue-100'
                  }`}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.label}</span>
                    <span className={`mt-0.5 block truncate text-xs font-semibold ${isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{item.detail}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
