import { CSSProperties, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, CalendarDays, Calculator, ClipboardList, ExternalLink, Flag, Laptop, LayoutDashboard, Link, LockKeyhole, LucideIcon, Mail, Pencil, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { quickLaunchService, type QuickLaunchExternalSlot as ApiQuickLaunchExternalSlot, type QuickLaunchSlot as ApiQuickLaunchSlot } from '../../services/api';
import { QUICK_LAUNCH_DEFAULT_SLOT_COUNT, QUICK_LAUNCH_MAX_SLOT_COUNT, QUICK_LAUNCH_MIN_SLOT_COUNT, normalizeQuickLaunchSlotCount, type QuickLaunchAppId, type QuickLaunchPlacement } from './quickLaunchCore';

const QUICK_LAUNCH_PICKER_WIDTH = 320;
const QUICK_LAUNCH_PICKER_GUTTER = 12;
const QUICK_LAUNCH_PICKER_CLOSE_MS = 500;
const QUICK_LAUNCH_CONTEXT_MENU_WIDTH = 256;
const QUICK_LAUNCH_CONTEXT_MENU_HEIGHT = 300;
const QUICK_LAUNCH_CONTEXT_MENU_GUTTER = 12;

type QuickLaunchExternalSlot = ApiQuickLaunchExternalSlot;
type QuickLaunchSlot = QuickLaunchAppId | QuickLaunchExternalSlot | null;

interface QuickLaunchApp {
  id: QuickLaunchAppId;
  label: string;
  path?: string;
  adminOnly?: boolean;
  requiredPermission?: string;
  icon: LucideIcon;
}

const quickLaunchApps: QuickLaunchApp[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'messages', label: 'Messages', icon: Mail },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'devices', label: 'Devices', path: '/devices', requiredPermission: 'devices:manage', icon: Laptop },
  { id: 'calculator', label: 'Calculator', icon: Calculator },
  { id: 'search', label: 'Search Users', path: '/search', icon: Search },
  { id: 'memorial', label: 'Memorial', path: '/memorial', icon: Flag },
  { id: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  { id: 'create-user', label: 'Create User', path: '/users/create', requiredPermission: 'admin:create-user', icon: UserPlus },
  { id: 'audit', label: 'Audit Log', path: '/audit', requiredPermission: 'admin:audit', icon: ClipboardList },
  { id: 'permissions', label: 'Permissions', path: '/permissions', requiredPermission: 'admin:permissions', icon: LockKeyhole },
];

function isExternalQuickLaunchSlot(slot: QuickLaunchSlot): slot is QuickLaunchExternalSlot {
  return typeof slot === 'object' && slot !== null && slot.type === 'external';
}

function getQuickLaunchSlotRenderKey(slot: QuickLaunchSlot, index: number): string {
  if (typeof slot === 'string') {
    return `app-${slot}`;
  }

  if (isExternalQuickLaunchSlot(slot)) {
    return `external-${slot.label}-${slot.url}`;
  }

  return `empty-${index}`;
}

function getEmptyQuickLaunchSlots(slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT): QuickLaunchSlot[] {
  return Array.from({ length: normalizeQuickLaunchSlotCount(slotCount) }, () => null);
}

function normalizeQuickLaunchSlots(rawSlots: unknown, slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT): QuickLaunchSlot[] {
  const parsedSlots = Array.isArray(rawSlots) ? rawSlots : [];
  const normalizedSlotCount = normalizeQuickLaunchSlotCount(slotCount);

  return Array.from({ length: normalizedSlotCount }, (_, index) => {
    const slot = parsedSlots[index];

    if (quickLaunchApps.some((app) => app.id === slot)) {
      return slot as QuickLaunchAppId;
    }

    if (
      typeof slot === 'object' &&
      slot !== null &&
      (slot as { type?: unknown }).type === 'external' &&
      typeof (slot as { label?: unknown }).label === 'string' &&
      typeof (slot as { url?: unknown }).url === 'string'
    ) {
      return {
        type: 'external',
        label: (slot as { label: string }).label,
        url: (slot as { url: string }).url,
      };
    }

    return null;
  });
}

function loadLegacyQuickLaunchSlots(storageKey: string, slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT): QuickLaunchSlot[] {
  try {
    const storedSlots = window.localStorage.getItem(storageKey);
    return normalizeQuickLaunchSlots(storedSlots ? JSON.parse(storedSlots) : [], slotCount);
  } catch {
    return getEmptyQuickLaunchSlots(slotCount);
  }
}

function saveLegacyQuickLaunchSlots(storageKey: string, slots: QuickLaunchSlot[], slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeQuickLaunchSlots(slots, slotCount)));
  } catch {
    // Local storage is only a fallback for quick launch preferences.
  }
}

function normalizeExternalAppUrl(value: string): string {
  const trimmedValue = value.trim();

  return /^https?:\/\//iu.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
}

function getExternalAppWindowName(label: string): string {
  const normalizedLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');

  return `shield_app_${normalizedLabel || 'external'}`;
}

function openExternalAppPopup(slot: QuickLaunchExternalSlot): boolean {
  const url = normalizeExternalAppUrl(slot.url);
  const width = Math.min(1280, Math.max(960, Math.round(window.screen.availWidth * 0.82)));
  const height = Math.min(900, Math.max(700, Math.round(window.screen.availHeight * 0.82)));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const windowFeatures = [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
  const popup = window.open(url, getExternalAppWindowName(slot.label), windowFeatures);

  if (popup) {
    popup.opener = null;
    popup.focus();
    return true;
  }

  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}

export function QuickLaunchTray({
  isAdministrator,
  permissions,
  isSidebarCollapsed,
  badgeCounts,
  activeModalApps,
  storageKey,
  accountId,
  showCalendar,
  slotCount,
  placement,
  onOpenMessages,
  onOpenCalendar,
  onOpenCalculator,
  onOpenCreateUser,
  onQuickLaunchHiddenChange,
  onQuickLaunchPlacementChange,
  onQuickLaunchSlotCountChange,
}: {
  isAdministrator: boolean;
  permissions: string[];
  isSidebarCollapsed: boolean;
  badgeCounts: Partial<Record<QuickLaunchAppId, number>>;
  activeModalApps: QuickLaunchAppId[];
  storageKey: string;
  accountId?: string;
  showCalendar: boolean;
  slotCount: number;
  placement: QuickLaunchPlacement;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenCalculator: () => void;
  onOpenCreateUser: () => void;
  onQuickLaunchHiddenChange: (hideQuickLaunch: boolean) => void;
  onQuickLaunchPlacementChange: (placement: QuickLaunchPlacement) => void;
  onQuickLaunchSlotCountChange: (slotCount: number) => void;
}) {
  const normalizedSlotCount = normalizeQuickLaunchSlotCount(slotCount);
  const isSidebarPlacement = placement === 'sidebar';
  const navigate = useNavigate();
  const location = useLocation();
  const [slots, setSlots] = useState<QuickLaunchSlot[]>(() => getEmptyQuickLaunchSlots(normalizedSlotCount));
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [launchingSlot, setLaunchingSlot] = useState<number | null>(null);
  const [failedLaunchSlot, setFailedLaunchSlot] = useState<number | null>(null);
  const [isPickerClosing, setIsPickerClosing] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Array<{ key: string; left: number; top: number }>>([]);
  const [sidebarTooltip, setSidebarTooltip] = useState<{ label: string; left: number; top: number } | null>(null);
  const didDragSlotRef = useRef(false);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const slotAnimationRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousSlotRectsRef = useRef<Record<string, DOMRect> | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerCloseTimerRef = useRef<number | null>(null);
  const indicatorRemeasureTimersRef = useRef<number[]>([]);
  const [pickerPosition, setPickerPosition] = useState<{ left: number; top: number; arrowLeft: number } | null>(null);
  const [externalLabel, setExternalLabel] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const canUseQuickLaunchApp = (app: QuickLaunchApp) => {
    if (app.id === 'calendar' && !showCalendar) {
      return false;
    }

    if (app.requiredPermission && !isAdministrator && !permissionSet.has(app.requiredPermission)) {
      return false;
    }

    if (app.id === 'create-user' && !isAdministrator && (!permissionSet.has('admin:access') || !permissionSet.has('users:create'))) {
      return false;
    }

    if (app.id === 'audit' && !isAdministrator && (!permissionSet.has('admin:access') || !permissionSet.has('audit:view'))) {
      return false;
    }

    if (app.id === 'permissions' && !isAdministrator && (!permissionSet.has('admin:access') || !permissionSet.has('roles:manage'))) {
      return false;
    }

    return !app.adminOnly || isAdministrator;
  };
  const availableApps = useMemo(() => quickLaunchApps.filter(canUseQuickLaunchApp), [isAdministrator, permissionSet, showCalendar]);
  const usedAppIds = new Set(
    slots
      .map((slot, index) => (index === editingSlot ? null : slot))
      .filter((slot): slot is QuickLaunchAppId => typeof slot === 'string'),
  );
  const editingExternalSlot = editingSlot !== null && isExternalQuickLaunchSlot(slots[editingSlot]) ? slots[editingSlot] : null;
  const activeModalAppSet = useMemo(() => new Set(activeModalApps), [activeModalApps]);

  useEffect(() => {
    if (editingExternalSlot) {
      setExternalLabel(editingExternalSlot.label);
      setExternalUrl(editingExternalSlot.url);
      return;
    }

    setExternalLabel('');
    setExternalUrl('');
  }, [editingExternalSlot]);

  useEffect(() => {
    if (editingSlot !== null && editingSlot >= normalizedSlotCount) {
      setEditingSlot(null);
      setIsPickerClosing(false);
      setExternalLabel('');
      setExternalUrl('');
    }

    if (contextMenu && contextMenu.index >= normalizedSlotCount) {
      setContextMenu(null);
    }

    if (draggingSlot !== null && draggingSlot >= normalizedSlotCount) {
      setDraggingSlot(null);
    }

    if (dragOverSlot !== null && dragOverSlot >= normalizedSlotCount) {
      setDragOverSlot(null);
    }

    if (launchingSlot !== null && launchingSlot >= normalizedSlotCount) {
      setLaunchingSlot(null);
    }

    if (failedLaunchSlot !== null && failedLaunchSlot >= normalizedSlotCount) {
      setFailedLaunchSlot(null);
    }
  }, [contextMenu, dragOverSlot, draggingSlot, editingSlot, failedLaunchSlot, launchingSlot, normalizedSlotCount]);

  const isAppActive = (app: QuickLaunchApp) => {
    if (activeModalAppSet.has(app.id)) {
      return true;
    }

    return Boolean(app.path && location.pathname === app.path);
  };

  const openQuickLaunchPicker = (index: number) => {
    if (pickerCloseTimerRef.current !== null) {
      window.clearTimeout(pickerCloseTimerRef.current);
      pickerCloseTimerRef.current = null;
    }

    setIsPickerClosing(false);
    setEditingSlot(index);
  };

  const closeQuickLaunchPicker = useCallback(() => {
    if (editingSlot === null || isPickerClosing) return;

    setIsPickerClosing(true);
    if (pickerCloseTimerRef.current !== null) {
      window.clearTimeout(pickerCloseTimerRef.current);
    }

    pickerCloseTimerRef.current = window.setTimeout(() => {
      setEditingSlot(null);
      setIsPickerClosing(false);
      setExternalLabel('');
      setExternalUrl('');
      pickerCloseTimerRef.current = null;
    }, QUICK_LAUNCH_PICKER_CLOSE_MS);
  }, [editingSlot, isPickerClosing]);

  useEffect(() => () => {
    if (pickerCloseTimerRef.current !== null) {
      window.clearTimeout(pickerCloseTimerRef.current);
    }
    indicatorRemeasureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
  }, []);

  const saveQuickLaunchSlots = useCallback(async (nextSlots: QuickLaunchSlot[]) => {
    const normalizedSlots = normalizeQuickLaunchSlots(nextSlots, normalizedSlotCount);
    setSlots(normalizedSlots);
    saveLegacyQuickLaunchSlots(storageKey, normalizedSlots, normalizedSlotCount);

    try {
      const response = await quickLaunchService.save(normalizedSlots as ApiQuickLaunchSlot[]);
      const savedSlots = normalizeQuickLaunchSlots(response.data.slots, normalizedSlotCount);
      setSlots(savedSlots);
      saveLegacyQuickLaunchSlots(storageKey, savedSlots, normalizedSlotCount);
    } catch (err) {
      console.error('Failed to save quick launch:', err);
    }
  }, [normalizedSlotCount, storageKey]);

  const loadQuickLaunchFromDatabase = useCallback(async () => {
    if (!accountId) {
      setSlots(getEmptyQuickLaunchSlots(normalizedSlotCount));
      return;
    }

    try {
      const response = await quickLaunchService.get();
      const databaseSlots = normalizeQuickLaunchSlots(response.data.slots, normalizedSlotCount);
      const hasDatabaseSlots = databaseSlots.some(Boolean);

      if (!hasDatabaseSlots) {
        const legacySlots = loadLegacyQuickLaunchSlots(storageKey, normalizedSlotCount);
        if (legacySlots.some(Boolean)) {
          setSlots(legacySlots);
          try {
            await quickLaunchService.save(legacySlots as ApiQuickLaunchSlot[]);
          } catch (saveError) {
            console.error('Failed to migrate quick launch slots:', saveError);
          }
          return;
        }
      }

      setSlots(databaseSlots);
      saveLegacyQuickLaunchSlots(storageKey, databaseSlots, normalizedSlotCount);
    } catch (err) {
      console.error('Failed to load quick launch:', err);
      setSlots(loadLegacyQuickLaunchSlots(storageKey, normalizedSlotCount));
    }
  }, [accountId, normalizedSlotCount, storageKey]);

  useEffect(() => {
    loadQuickLaunchFromDatabase();
  }, [loadQuickLaunchFromDatabase]);

  useEffect(() => {
    window.addEventListener('shield:quick-launch-updated', loadQuickLaunchFromDatabase);
    return () => window.removeEventListener('shield:quick-launch-updated', loadQuickLaunchFromDatabase);
  }, [loadQuickLaunchFromDatabase]);

  useLayoutEffect(() => {
    if (editingSlot === null) {
      setPickerPosition(null);
      return undefined;
    }

    const updatePickerPosition = () => {
      const slot = slotRefs.current[editingSlot];
      if (!slot) return;

      const rect = slot.getBoundingClientRect();
      const slotCenter = rect.left + rect.width / 2;
      const left = Math.min(
        Math.max(QUICK_LAUNCH_PICKER_GUTTER, slotCenter - QUICK_LAUNCH_PICKER_WIDTH / 2),
        Math.max(QUICK_LAUNCH_PICKER_GUTTER, window.innerWidth - QUICK_LAUNCH_PICKER_WIDTH - QUICK_LAUNCH_PICKER_GUTTER),
      );

      setPickerPosition({
        left,
        top: rect.top - 12,
        arrowLeft: slotCenter - left,
      });
    };

    updatePickerPosition();
    window.addEventListener('resize', updatePickerPosition);
    window.addEventListener('scroll', updatePickerPosition, true);

    return () => {
      window.removeEventListener('resize', updatePickerPosition);
      window.removeEventListener('scroll', updatePickerPosition, true);
    };
  }, [editingSlot]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && editingSlot !== null) {
        event.stopImmediatePropagation();
        closeQuickLaunchPicker();
      }
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeQuickLaunchPicker, editingSlot]);

  useEffect(() => {
    if (editingSlot === null) {
      return undefined;
    }

    const closePicker = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) {
        return;
      }

      const activeSlot = slotRefs.current[editingSlot];
      if (activeSlot?.contains(event.target as Node)) {
        return;
      }

      closeQuickLaunchPicker();
    };

    window.addEventListener('mousedown', closePicker);
    return () => window.removeEventListener('mousedown', closePicker);
  }, [closeQuickLaunchPicker, editingSlot]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu]);

  const openSlot = (index: number, slot: NonNullable<QuickLaunchSlot>) => {
    setLaunchingSlot(index);
    setFailedLaunchSlot(null);
    window.setTimeout(() => setLaunchingSlot((currentSlot) => (currentSlot === index ? null : currentSlot)), 650);

    if (isExternalQuickLaunchSlot(slot)) {
      try {
        if (!openExternalAppPopup(slot)) {
          setFailedLaunchSlot(index);
          window.setTimeout(() => setFailedLaunchSlot((currentSlot) => (currentSlot === index ? null : currentSlot)), 2200);
        }
      } catch {
        setFailedLaunchSlot(index);
        window.setTimeout(() => setFailedLaunchSlot((currentSlot) => (currentSlot === index ? null : currentSlot)), 2200);
      }
      return;
    }

    const app = availableApps.find((item) => item.id === slot);
    if (!app) return;

    if (app.id === 'messages') {
      onOpenMessages();
      return;
    }

    if (app.id === 'calendar') {
      onOpenCalendar();
      return;
    }

    if (app.id === 'calculator') {
      onOpenCalculator();
      return;
    }

    if (app.id === 'create-user') {
      onOpenCreateUser();
      return;
    }

    if (app.path) {
      navigate(location.pathname === app.path ? '/' : app.path);
    }
  };

  const assignSlot = (slot: QuickLaunchSlot) => {
    if (editingSlot === null) return;
    const nextSlots = slots.map((currentSlot, index) => (index === editingSlot ? slot : currentSlot));
    void saveQuickLaunchSlots(nextSlots);
    closeQuickLaunchPicker();
  };

  const removeSlot = (index: number) => {
    const nextSlots = slots.map((currentSlot, slotIndex) => (slotIndex === index ? null : currentSlot));
    void saveQuickLaunchSlots(nextSlots);
    setContextMenu(null);
  };

  const removeAllSlots = () => {
    void saveQuickLaunchSlots(getEmptyQuickLaunchSlots(normalizedSlotCount));
    setContextMenu(null);
    closeQuickLaunchPicker();
  };

  const assignExternalSlot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!externalLabel.trim() || !externalUrl.trim()) return;

    assignSlot({
      type: 'external',
      label: externalLabel.trim(),
      url: externalUrl.trim(),
    });
  };

  const moveSlot = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    previousSlotRectsRef.current = Object.fromEntries(
      Object.entries(slotAnimationRefs.current).flatMap(([key, element]) => {
        if (!element) return [];
        return [[key, element.getBoundingClientRect()]];
      }),
    );

    const nextSlots = [...slots];
    const [movedSlot] = nextSlots.splice(fromIndex, 1);
    nextSlots.splice(toIndex, 0, movedSlot);
    void saveQuickLaunchSlots(nextSlots);
  };

  useLayoutEffect(() => {
    const previousRects = previousSlotRectsRef.current;
    if (!previousRects) return;

    previousSlotRectsRef.current = null;

    Object.entries(previousRects).forEach(([key, previousRect]) => {
      const element = slotAnimationRefs.current[key];
      if (!element) return;

      const nextRect = element.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 500,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        },
      );
    });
  }, [slots]);

  const editContextMenuSlot = () => {
    if (!contextMenu) return;

    openQuickLaunchPicker(contextMenu.index);
    setContextMenu(null);
  };

  const activeQuickLaunchTargets = useMemo(() => {
    const activeTargets = slots.reduce<Array<{ key: string; index: number }>>((targets, slot, index) => {
      if (typeof slot !== 'string') {
        return targets;
      }

      const app = availableApps.find((item) => item.id === slot);
      if (app && isAppActive(app)) {
        targets.push({ key: getQuickLaunchSlotRenderKey(slot, index), index });
      }

      return targets;
    }, []);

    if (launchingSlot !== null && !activeTargets.some((target) => target.index === launchingSlot)) {
      activeTargets.push({
        key: getQuickLaunchSlotRenderKey(slots[launchingSlot], launchingSlot),
        index: launchingSlot,
      });
    }

    return activeTargets.sort((left, right) => left.index - right.index);
  }, [activeModalAppSet, availableApps, launchingSlot, location.pathname, slots]);

  const showSidebarSlotTooltip = (target: HTMLElement, label: string) => {
    if (!isSidebarPlacement || !isSidebarCollapsed) {
      return;
    }

    const rect = target.getBoundingClientRect();
    setSidebarTooltip({
      label,
      left: rect.right + 10,
      top: rect.top + rect.height / 2,
    });
  };

  useLayoutEffect(() => {
    if (activeQuickLaunchTargets.length === 0) {
      setActiveIndicators([]);
      return undefined;
    }

    const updateActiveIndicators = () => {
      const tray = trayRef.current;

      if (!tray) {
        setActiveIndicators([]);
        return;
      }

      const trayRect = tray.getBoundingClientRect();
      const nextIndicators = activeQuickLaunchTargets.flatMap((target) => {
        const slot = slotAnimationRefs.current[target.key] || slotRefs.current[target.index];
        if (!slot) return [];

        const slotRect = slot.getBoundingClientRect();
        return [{
          key: target.key,
          left: slotRect.left - trayRect.left + slotRect.width / 2,
          top: slotRect.bottom - trayRect.top + 6,
        }];
      });

      setActiveIndicators(nextIndicators);
    };

    const scheduleActiveIndicatorRemeasure = () => {
      indicatorRemeasureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      indicatorRemeasureTimersRef.current = [80, 180, 320, 520].map((delay) => window.setTimeout(updateActiveIndicators, delay));
    };

    updateActiveIndicators();
    const animationFrame = window.requestAnimationFrame(updateActiveIndicators);
    scheduleActiveIndicatorRemeasure();
    window.addEventListener('resize', updateActiveIndicators);
    window.addEventListener('scroll', updateActiveIndicators, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      indicatorRemeasureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      indicatorRemeasureTimersRef.current = [];
      window.removeEventListener('resize', updateActiveIndicators);
      window.removeEventListener('scroll', updateActiveIndicators, true);
    };
  }, [activeQuickLaunchTargets, isSidebarCollapsed]);

  return (
    <section
      data-no-global-context-menu="true"
      className={isSidebarPlacement
      ? `quick-launch-sidebar-placement pointer-events-none relative hidden select-none md:block ${isSidebarCollapsed ? 'quick-launch-sidebar-collapsed' : ''}`
      : `pointer-events-none fixed bottom-3 left-3 right-3 z-30 hidden select-none transition-all duration-200 sm:bottom-5 sm:right-6 md:block ${isSidebarCollapsed ? 'sm:left-24' : 'sm:left-[19.5rem]'}`
    }>
      <div
        ref={trayRef}
        data-onboarding-target="quick-launch"
        className={`quick-launch-gold-frame quick-launch-tray-enter pointer-events-auto relative max-w-full border border-transparent bg-white/85 p-2 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur dark:bg-gray-950/80 ${
          isSidebarPlacement
            ? 'quick-launch-sidebar-frame w-full rounded-lg'
            : 'mx-auto w-fit rounded-2xl sm:p-3'
        }`}
      >
        <div className={isSidebarPlacement
          ? `quick-launch-sidebar-grid grid max-w-full ${isSidebarCollapsed ? 'grid-cols-1 justify-items-center' : 'grid-cols-4'}`
          : 'flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2'
        }>
        {slots.map((slot, index) => {
          const slotRenderKey = getQuickLaunchSlotRenderKey(slot, index);
          const app = typeof slot === 'string' ? availableApps.find((item) => item.id === slot) || null : null;
          const isExternal = isExternalQuickLaunchSlot(slot);
          const visibleSlot = app || isExternal ? slot : null;
          const Icon = app?.icon || (isExternal ? ExternalLink : null);
          const label = app?.label || (isExternal ? slot.label : 'Add');
          const badgeCount = app ? badgeCounts[app.id] || 0 : 0;
          const isActive = app ? isAppActive(app) : false;
          const isEditing = editingSlot === index;
          const isLaunching = launchingSlot === index;
          const hasFailedLaunch = failedLaunchSlot === index;
          const previewLabel = visibleSlot ? `Open ${label}` : 'Add app';
          const slotStateClass = visibleSlot
            ? [
                'quick-launch-slot-configured',
                draggingSlot === index ? 'quick-launch-slot-dragging' : '',
                dragOverSlot === index ? 'quick-launch-slot-drop-target' : '',
                isActive ? 'quick-launch-slot-active' : '',
                isEditing ? 'quick-launch-slot-editing' : '',
                isLaunching ? 'quick-launch-slot-launching' : '',
                hasFailedLaunch ? 'quick-launch-slot-failed' : '',
              ].filter(Boolean).join(' ')
            : isEditing
              ? `quick-launch-slot-empty quick-launch-slot-editing ${dragOverSlot === index ? 'quick-launch-slot-drop-target' : ''}`
              : `quick-launch-slot-empty ${dragOverSlot === index ? 'quick-launch-slot-drop-target' : ''}`;

          return (
            <div
              key={slotRenderKey}
              className="quick-launch-slot-shell relative"
              ref={(element) => {
                slotRefs.current[index] = element;
                slotAnimationRefs.current[slotRenderKey] = element;
              }}
              draggable={Boolean(visibleSlot)}
              onDragStart={(event) => {
                if (!visibleSlot) {
                  event.preventDefault();
                  return;
                }

                didDragSlotRef.current = true;
                setDraggingSlot(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(event) => {
                if (draggingSlot === null || draggingSlot === index) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverSlot(index);
              }}
              onDragLeave={() => {
                setDragOverSlot((currentSlot) => (currentSlot === index ? null : currentSlot));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                if (!Number.isNaN(sourceIndex)) {
                  moveSlot(sourceIndex, index);
                }
                setDraggingSlot(null);
                setDragOverSlot(null);
              }}
              onDragEnd={() => {
                setDraggingSlot(null);
                setDragOverSlot(null);
                window.setTimeout(() => {
                  didDragSlotRef.current = false;
                }, 0);
              }}
              onMouseEnter={(event) => showSidebarSlotTooltip(event.currentTarget, hasFailedLaunch ? 'Blocked' : isLaunching ? 'Opening' : label)}
              onMouseLeave={() => setSidebarTooltip(null)}
              onFocusCapture={(event) => showSidebarSlotTooltip(event.currentTarget, hasFailedLaunch ? 'Blocked' : isLaunching ? 'Opening' : label)}
              onBlurCapture={() => setSidebarTooltip(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ index, x: event.clientX, y: event.clientY });
              }}
            >
              <button
                type="button"
                draggable={Boolean(visibleSlot)}
                onClick={() => {
                  if (didDragSlotRef.current) {
                    return;
                  }
                  if (visibleSlot) {
                    openSlot(index, visibleSlot);
                    return;
                  }
                  openQuickLaunchPicker(index);
                }}
                onDragStart={(event) => {
                  if (!visibleSlot) {
                    event.preventDefault();
                    return;
                  }

                  didDragSlotRef.current = true;
                  setDraggingSlot(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                className={`quick-launch-slot group ${slotStateClass}`}
                aria-label={visibleSlot ? `Open ${label}` : 'Add quick launch app'}
                aria-pressed={isActive}
              >
                <span className="quick-launch-slot-shine" />
                <span className="quick-launch-slot-icon" aria-hidden="true">
                  {hasFailedLaunch ? <AlertTriangle size={20} /> : Icon ? <Icon size={20} /> : <Plus size={22} />}
                </span>
                <span className="quick-launch-slot-label">{hasFailedLaunch ? 'Blocked' : isLaunching ? 'Opening' : label}</span>
              </button>
              <span className="quick-launch-hover-preview" role="presentation">{previewLabel}</span>

              {badgeCount > 0 && (
                <span key={`quick-launch-badge-${index}-${badgeCount}`} className="quick-launch-badge">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}

              {slot && (
                <button
                  type="button"
                  onClick={() => openQuickLaunchPicker(index)}
                  className={`quick-launch-edit-button ${isEditing ? 'quick-launch-edit-button-active' : ''}`}
                  aria-label={`Change ${label} shortcut`}
                  title="Change shortcut"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          );
        })}
        </div>
        {activeIndicators.map((indicator) => (
          <span
            key={`quick-launch-active-indicator-${indicator.key}`}
            className="quick-launch-active-indicator quick-launch-active-indicator-visible"
            style={{
              left: indicator.left,
              top: indicator.top,
            }}
          />
        ))}
      </div>

      {sidebarTooltip && typeof document !== 'undefined' && createPortal(
        <span
          className="sidebar-rail-tooltip sidebar-rail-tooltip-fixed"
          role="tooltip"
          style={{
            left: sidebarTooltip.left,
            top: sidebarTooltip.top,
          }}
        >
          {sidebarTooltip.label}
        </span>,
        document.body,
      )}

      {contextMenu && (
        <div
          className={`quick-launch-context-menu ${isSidebarPlacement ? 'quick-launch-sidebar-popup' : ''} pointer-events-auto fixed z-[70] w-64 overflow-hidden rounded border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900`}
          style={{
            left: Math.max(
              QUICK_LAUNCH_CONTEXT_MENU_GUTTER,
              Math.min(contextMenu.x, window.innerWidth - QUICK_LAUNCH_CONTEXT_MENU_WIDTH - QUICK_LAUNCH_CONTEXT_MENU_GUTTER),
            ),
            top: Math.max(
              QUICK_LAUNCH_CONTEXT_MENU_GUTTER,
              Math.min(contextMenu.y, window.innerHeight - QUICK_LAUNCH_CONTEXT_MENU_HEIGHT - QUICK_LAUNCH_CONTEXT_MENU_GUTTER),
            ),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={editContextMenuSlot}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <Pencil size={15} /> Edit shortcut
          </button>
          <button
            type="button"
            onClick={() => removeSlot(contextMenu.index)}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <Trash2 size={15} /> Remove
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <div className="px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <span>Slots</span>
              <span>{normalizedSlotCount}</span>
            </div>
            <input
              type="range"
              min={QUICK_LAUNCH_MIN_SLOT_COUNT}
              max={QUICK_LAUNCH_MAX_SLOT_COUNT}
              value={normalizedSlotCount}
              onChange={(event) => onQuickLaunchSlotCountChange(Number(event.target.value))}
              className="w-full"
              aria-label="Quick launcher slot count"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onQuickLaunchPlacementChange(placement === 'sidebar' ? 'dock' : 'sidebar');
              setContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <LayoutDashboard size={15} /> {placement === 'sidebar' ? 'Move to screen' : 'Move to left grid'}
          </button>
          <button
            type="button"
            onClick={() => {
              onQuickLaunchHiddenChange(true);
              setContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <X size={15} /> Hide launcher
          </button>
          <button
            type="button"
            onClick={removeAllSlots}
            className="quick-launch-context-menu-item quick-launch-context-menu-danger text-danger"
          >
            <X size={15} /> Remove All
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
        </div>
      )}

      {editingSlot !== null && (
        <div
          ref={pickerRef}
          className={`quick-launch-picker-enter ${isPickerClosing ? 'quick-launch-picker-exit' : ''} ${isSidebarPlacement ? 'quick-launch-sidebar-popup' : ''} pointer-events-auto fixed z-[75] max-h-[min(34rem,calc(100dvh-2rem))] overflow-y-auto rounded-lg border border-accent/30 bg-white p-3 text-gray-900 shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-accent/10 dark:border-accent/40 dark:bg-gray-900 dark:text-gray-100`}
          style={{
            left: pickerPosition?.left ?? QUICK_LAUNCH_PICKER_GUTTER,
            top: pickerPosition?.top ?? window.innerHeight - 120,
            width: QUICK_LAUNCH_PICKER_WIDTH,
            transform: 'translateY(-100%)',
            transformOrigin: `${pickerPosition?.arrowLeft ?? QUICK_LAUNCH_PICKER_WIDTH / 2}px bottom`,
          }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span
            className="absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-accent/30 bg-white dark:border-accent/40 dark:bg-gray-900"
            style={{ left: pickerPosition?.arrowLeft ?? QUICK_LAUNCH_PICKER_WIDTH / 2 }}
          />
          <div className="relative">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Choose App</h2>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Slot {(editingSlot ?? 0) + 1}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeQuickLaunchPicker();
                }}
                className="icon-close-button"
                aria-label="Close quick launch picker"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto pr-1">
              {availableApps.map((app, appIndex) => {
                const Icon = app.icon;
                const isAlreadyUsed = usedAppIds.has(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => assignSlot(app.id)}
                    disabled={isAlreadyUsed}
                    className="quick-launch-picker-option"
                    style={{ '--quick-launch-stagger-delay': `${Math.min(appIndex, 9) * 32}ms` } as CSSProperties}
                    title={isAlreadyUsed ? 'Already in your dock' : app.label}
                  >
                    <span className="quick-launch-picker-icon">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">{app.label}</span>
                    {isAlreadyUsed && <span className="text-xs font-semibold text-gray-400">Added</span>}
                  </button>
                );
              })}
            </div>

            <form onSubmit={assignExternalSlot} className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Link size={15} />
                External Site
              </div>
              <div className="grid gap-2">
                <input
                  value={externalLabel}
                  onChange={(event) => setExternalLabel(event.target.value)}
                  placeholder="Name"
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-gray-700 dark:bg-gray-950"
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={externalUrl}
                    onChange={(event) => setExternalUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button type="submit" className="btn-primary h-10 w-10 justify-center p-0" aria-label="Add external site" disabled={!externalLabel.trim() || !externalUrl.trim()}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-3 grid gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
              {editingExternalSlot && (
                <p className="break-all rounded bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{editingExternalSlot.label} - {editingExternalSlot.url}</p>
              )}
              <button
                type="button"
                onClick={() => assignSlot(null)}
                className="flex items-center gap-3 rounded px-2.5 py-2 text-left text-sm font-bold text-danger transition hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 size={16} />
                Clear this box
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
