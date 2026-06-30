import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, Gauge, Laptop, Mail, Pencil, Phone, Save, Send, Smartphone, X } from 'lucide-react';
import { AuthAccount, CalendarEntry, calendarService, DeviceRecord, deviceService, getAssetFullImageUrl, getAssetThumbnailUrl, handleAssetImageError, handleAssetThumbnailError, MileageSummary, mileageService, User } from '../services/api';
import { subscribeMessageRealtime } from '../services/realtime';
import { getLastOnlineLabel, getPresenceSnapshot, normalizePresenceStatus, PresenceDisplayStatus, PresenceState } from '../utils/presence';
import { RankBadge } from './RankBadge';

interface UserDetailProps {
  user: User;
  onClose?: () => void;
  onEdit?: (user: User) => void;
  onMessage?: (user: User) => void;
  onToast?: (type: 'success' | 'error', message: string) => void;
  canEdit?: boolean;
  currentUser?: AuthAccount | null;
  onHeaderPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  isFloatingProfile?: boolean;
}

function DetailRow({
  label,
  value,
  copyValue,
  onCopy,
  isCopied = false,
}: {
  label: string;
  value?: string | boolean | null;
  copyValue?: string | null;
  onCopy?: (label: string, value: string) => void;
  isCopied?: boolean;
}) {
  const displayValue = value === true ? 'Yes' : value === false ? 'No' : value || 'N/A';
  const canCopy = typeof copyValue === 'string' && copyValue.trim().length > 0 && Boolean(onCopy);

  return (
    <div className="flex flex-col gap-1 border-b border-gray-200 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-400 sm:text-sm sm:normal-case sm:tracking-normal sm:text-gray-700 sm:dark:text-gray-300">{label}</span>
      <span className="flex min-w-0 items-center justify-between gap-2 text-left text-gray-700 dark:text-gray-200 sm:justify-end sm:text-right sm:text-gray-600 sm:dark:text-gray-300">
        <span className="min-w-0 break-words sm:truncate">{displayValue}</span>
        {canCopy && (
          <button
            type="button"
            onClick={() => onCopy?.(label, copyValue.trim())}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:border-primary-500 hover:text-primary-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-blue-200 dark:hover:text-blue-100 sm:h-7 sm:w-7"
            aria-label={`Copy ${label}`}
            title={isCopied ? 'Copied' : `Copy ${label}`}
          >
            {isCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="user-detail-section mb-6 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:border-0 sm:p-0">
      <h3 className="mb-2 border-b border-gray-200 pb-2 text-base font-bold text-primary-500 dark:border-gray-700 dark:text-blue-100 sm:mb-4 sm:border-b-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function getInitials(user: User): string {
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
}

function getProfilePhotoFileName(user: User, contentType?: string | null): string {
  const baseName = `${user.firstName || 'profile'}-${user.lastName || 'photo'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '') || 'profile-photo';
  const extensionFromUrl = user.profilePictureUrl?.split('?')[0]?.match(/\.([a-z0-9]+)$/iu)?.[1];
  const extensionFromType = contentType?.split('/')[1]?.replace('jpeg', 'jpg');
  const extension = extensionFromType || extensionFromUrl || 'jpg';

  return `${baseName}.${extension}`;
}

type ProfileTab = 'personal' | 'identification' | 'employment' | 'contact' | 'devices' | 'calendar' | 'additional';

function getPresenceTone(displayStatus: PresenceDisplayStatus) {
  if (displayStatus === 'busy') {
    return {
      label: 'Busy',
      textClass: 'text-red-100',
      dotClass: 'bg-red-400',
      ringClass: 'border-red-300/90 shadow-[0_0_0_2px_rgba(239,68,68,0.18)]',
      pulseClass: 'border-red-300/60',
    };
  }

  if (displayStatus === 'away') {
    return {
      label: 'Away',
      textClass: 'text-amber-100',
      dotClass: 'bg-amber-300',
      ringClass: 'border-amber-300/90 shadow-[0_0_0_2px_rgba(251,191,36,0.18)]',
      pulseClass: 'border-amber-300/70',
    };
  }

  if (displayStatus === 'active') {
    return {
      label: 'Active',
      textClass: 'text-green-100/90',
      dotClass: 'bg-green-300',
      ringClass: 'border-green-300/80 shadow-[0_0_0_2px_rgba(34,197,94,0.14)]',
      pulseClass: 'border-green-300/45',
    };
  }

  return {
    label: 'Offline',
    textClass: 'text-blue-100',
    dotClass: 'bg-blue-200/70',
    ringClass: 'border-white',
    pulseClass: '',
  };
}

function getSupervisorLookupValues(account?: AuthAccount | null) {
  if (!account) {
    return [];
  }

  return Array.from(new Set([
    account.displayName,
    `${account.firstName || ''} ${account.lastName || ''}`.trim(),
    account.email,
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))));
}

function isProfileSupervisor(user: User, account?: AuthAccount | null): boolean {
  const supervisor = user.supervisor?.trim().toLowerCase();
  return Boolean(supervisor && getSupervisorLookupValues(account).includes(supervisor));
}

function formatCalendarDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCalendarMonth(value: Date): string {
  return value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getCalendarDays(month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function getEntryTone(entry: CalendarEntry): string {
  if (entry.category === 'Trooper Daily') {
    return entry.reviewStatus === 'Returned'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
      : 'border-primary-100 bg-primary-50 text-primary-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100';
  }

  return 'border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
}

function getCalendarSummary(entries: CalendarEntry[]) {
  const submitted = entries.filter((entry) => entry.submissionStatus === 'Submitted').length;
  const dutyHours = entries.reduce((total, entry) => total + (Number(entry.dutyHours) || 0), 0);
  const trooperDailyCount = entries.filter((entry) => entry.category === 'Trooper Daily').length;

  return { submitted, dutyHours, trooperDailyCount };
}

export const UserDetail: React.FC<UserDetailProps> = ({ user, onClose, onEdit, onMessage, onToast, canEdit = false, currentUser = null, onHeaderPointerDown, isFloatingProfile = false }) => {
  const callNumber = user.departmentPhoneNumber || user.personalPhoneNumber;
  const callHref = callNumber ? `tel:${callNumber.replace(/[^\d+]/gu, '')}` : undefined;
  const emailHref = user.email ? `mailto:${user.email}` : undefined;
  const [activeTab, setActiveTab] = useState<ProfileTab>('personal');
  const [mileageSummary, setMileageSummary] = useState<MileageSummary | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [profileCalendarMonth, setProfileCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => formatDateKey(new Date()));
  const [assignedDevices, setAssignedDevices] = useState<DeviceRecord[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceRecord | null>(null);
  const [deviceEditForm, setDeviceEditForm] = useState<Partial<DeviceRecord>>({});
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [presenceTick, setPresenceTick] = useState(0);
  const [realtimePresence, setRealtimePresence] = useState<PresenceState | null>(null);
  const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
  const isDeviceLoadInFlightRef = useRef(false);
  const deviceRefreshTimerRef = useRef<number | null>(null);
  const deviceLoadRequestIdRef = useRef(0);
  const canBypassHiddenProfileCalendar = currentUser?.id === user.id || currentUser?.role === 'administrator';
  const canViewProfileCalendar = Boolean(
    (!user.calendarHidden || canBypassHiddenProfileCalendar) && (
      currentUser?.id === user.id ||
      currentUser?.role === 'administrator' ||
      currentUser?.permissions?.includes('calendar:view-profiles') ||
      isProfileSupervisor(user, currentUser)
    ),
  );
  const tabs: Array<[ProfileTab, string]> = [
    ['personal', 'Personal'],
    ['identification', 'Identification'],
    ['employment', 'Employment'],
    ['contact', 'Contact'],
    ['devices', 'Devices'],
    ...(canViewProfileCalendar ? [['calendar', 'Calendar'] as [ProfileTab, string]] : []),
    ['additional', 'Additional'],
  ];
  const calendarSummary = useMemo(() => getCalendarSummary(calendarEntries), [calendarEntries]);
  const calendarDays = useMemo(() => getCalendarDays(profileCalendarMonth), [profileCalendarMonth]);
  const entriesByDate = useMemo(() => calendarEntries.reduce<Record<string, CalendarEntry[]>>((groups, entry) => {
    groups[entry.date] = [...(groups[entry.date] || []), entry];
    return groups;
  }, {}), [calendarEntries]);
  const selectedDayEntries = entriesByDate[selectedCalendarDate] || [];
  const selectedDayLabel = formatCalendarDate(selectedCalendarDate);
  const changeProfileCalendarMonth = (offset: number) => {
    setProfileCalendarMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  useEffect(() => {
    let isMounted = true;
    const loadMileageSummary = () => {
      mileageService.getSummary(user.id)
        .then((response) => {
          if (isMounted) {
            setMileageSummary(response.data);
          }
        })
        .catch((error) => {
          console.error('Failed to load profile mileage:', error);
          if (isMounted) {
            setMileageSummary(null);
          }
        });
    };

    loadMileageSummary();
    window.addEventListener('shield:calendar-updated', loadMileageSummary);
    window.addEventListener('shield:mileage-updated', loadMileageSummary);

    return () => {
      isMounted = false;
      window.removeEventListener('shield:calendar-updated', loadMileageSummary);
      window.removeEventListener('shield:mileage-updated', loadMileageSummary);
    };
  }, [user.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceTick((current) => current + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsPhotoPreviewOpen(false);
  }, [user.id, user.profilePictureUrl]);

  useEffect(() => {
    if (!isPhotoPreviewOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPhotoPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPhotoPreviewOpen]);

  useEffect(() => {
    setRealtimePresence(null);
    let isMounted = true;
    const handlePresenceUpdate = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as {
          actorAccountId?: string;
          actorOnline?: boolean;
          actorAway?: boolean;
          actorStatus?: string;
          actorLastSeenAt?: string | null;
        };

        if (!isMounted || payload.actorAccountId !== user.id) {
          return;
        }

        setRealtimePresence({
          online: payload.actorOnline === true,
          away: payload.actorAway === true,
          status: normalizePresenceStatus(payload.actorStatus),
          lastSeenAt: payload.actorLastSeenAt || null,
        });
      } catch (error) {
        console.error('Failed to parse profile presence update:', error);
      }
    };

    const unsubscribePresence = subscribeMessageRealtime('presence-updated', handlePresenceUpdate);
    const unsubscribeError = subscribeMessageRealtime('error', (event) => {
      console.error('Profile presence connection error:', event);
    });

    return () => {
      isMounted = false;
      unsubscribePresence();
      unsubscribeError();
    };
  }, [user.id]);

  useEffect(() => {
    if (activeTab !== 'calendar' || !canViewProfileCalendar) {
      return;
    }

    let isMounted = true;
    setIsCalendarLoading(true);
    setCalendarError(null);

    calendarService.getProfileEntries(user.id)
      .then((response) => {
        if (isMounted) {
          setCalendarEntries(response.data);
        }
      })
      .catch((error) => {
        console.error('Failed to load profile calendar:', error);
        if (isMounted) {
          setCalendarEntries([]);
          setCalendarError('Failed to load calendar activity.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCalendarLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, canViewProfileCalendar, user.id]);

  const loadAssignedDevices = useCallback((showLoading = true) => {
    if (isDeviceLoadInFlightRef.current) {
      return;
    }

    isDeviceLoadInFlightRef.current = true;
    const requestId = deviceLoadRequestIdRef.current + 1;
    deviceLoadRequestIdRef.current = requestId;
    setIsDevicesLoading(showLoading);
    setDeviceError(null);
    deviceService.getAssignedToUser(user.id)
      .then((response) => {
        if (requestId === deviceLoadRequestIdRef.current) {
          setAssignedDevices(response.data);
        }
      })
      .catch((error) => {
        console.error('Failed to load assigned profile devices:', error);
        if (requestId === deviceLoadRequestIdRef.current) {
          setDeviceError('Failed to load assigned devices.');
        }
      })
      .finally(() => {
        if (requestId === deviceLoadRequestIdRef.current) {
          isDeviceLoadInFlightRef.current = false;
          setIsDevicesLoading(false);
        }
      });
  }, [user.id]);

  useEffect(() => {
    deviceLoadRequestIdRef.current += 1;
    isDeviceLoadInFlightRef.current = false;
    loadAssignedDevices();
    const handleDeviceUpdate = () => {
      if (deviceRefreshTimerRef.current) {
        window.clearTimeout(deviceRefreshTimerRef.current);
      }

      deviceRefreshTimerRef.current = window.setTimeout(() => loadAssignedDevices(false), 350);
    };

    window.addEventListener('shield:device-updated', handleDeviceUpdate);

    return () => {
      window.removeEventListener('shield:device-updated', handleDeviceUpdate);
      if (deviceRefreshTimerRef.current) {
        window.clearTimeout(deviceRefreshTimerRef.current);
      }
    };
  }, [loadAssignedDevices]);

  const openDeviceEdit = (device: DeviceRecord) => {
    setEditingDevice(device);
    setDeviceEditForm(device);
  };

  const saveDeviceEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingDevice) return;

    setDeviceError(null);
    try {
      const response = await deviceService.update(editingDevice.id, {
        ...editingDevice,
        ...deviceEditForm,
        eventAction: 'Updated from profile',
        eventNotes: `Updated from ${user.firstName} ${user.lastName}`.trim(),
      });
      setAssignedDevices((devices) => devices.map((device) => (device.id === editingDevice.id ? response.data : device)));
      setEditingDevice(null);
      setDeviceEditForm({});
    } catch (error) {
      console.error('Failed to update profile device:', error);
      setDeviceError('Failed to update device.');
    }
  };

  const copyProfileValue = async (label: string, value: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (!copied) {
          throw new Error('Fallback copy failed');
        }
      }

      setCopiedField(label);
      onToast?.('success', `${label} copied to clipboard.`);
      window.setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1600);
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      onToast?.('error', `Could not copy ${label}.`);
    }
  };

  const downloadProfilePhoto = async () => {
    if (!fullProfilePhotoUrl) {
      return;
    }

    try {
      const response = await fetch(fullProfilePhotoUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Download failed with ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = getProfilePhotoFileName(user, blob.type);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      onToast?.('success', 'Profile photo downloaded.');
    } catch (error) {
      console.error('Failed to download profile photo:', error);
      onToast?.('error', 'Could not download profile photo.');
    }
  };

  const mileage = mileageSummary?.mileage || 0;
  const milestone = mileageSummary?.milestone || 0;
  const nextAchievement = mileageSummary?.nextAchievement || null;
  const mileagePercent = milestone > 0 ? Math.min(100, Math.round((mileage / milestone) * 100)) : 0;
  const presenceSnapshot = useMemo(
    () => getPresenceSnapshot(realtimePresence, user.lastSeenAt),
    [presenceTick, realtimePresence, user.lastSeenAt],
  );
  const lastOnlineLabel = useMemo(() => getLastOnlineLabel(presenceSnapshot), [presenceSnapshot]);
  const presenceTone = getPresenceTone(presenceSnapshot.displayStatus);
  const profileRingClass = presenceTone.ringClass;
  const fullProfilePhotoUrl = user.profilePictureUrl ? getAssetFullImageUrl(user.profilePictureUrl) : '';

  return (
    <div className={`user-detail-panel flex flex-col overflow-hidden rounded-none bg-white shadow-xl dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 sm:rounded-lg ${isFloatingProfile ? 'h-full max-h-full' : 'h-[100dvh] sm:h-auto sm:max-h-[92dvh]'}`}>
      <div
        onPointerDown={onHeaderPointerDown}
        className={`shrink-0 select-none bg-primary-500 px-4 text-white sm:px-5 ${isFloatingProfile ? 'py-3 sm:py-3 md:cursor-grab' : 'py-4 sm:py-5'}`}
      >
        <div className={`flex flex-col lg:flex-row lg:items-start lg:justify-between ${isFloatingProfile ? 'gap-3' : 'gap-4'}`}>
          <div className={`flex min-w-0 flex-col items-center text-center sm:flex-row sm:items-center sm:text-left ${isFloatingProfile ? 'gap-3' : 'gap-3 sm:gap-4'}`}>
          <div className="relative shrink-0">
            {presenceSnapshot.showPulse && presenceTone.pulseClass && <span className={`pointer-events-none absolute -inset-1 rounded-full border shield-online-pulse ${presenceTone.pulseClass}`} />}
          {user.profilePictureUrl ? (
            <button
              type="button"
              onClick={() => setIsPhotoPreviewOpen(true)}
              className="group relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-500"
              aria-label={`View larger photo of ${user.firstName} ${user.lastName}`}
              title="View Photo"
            >
              <img
                src={getAssetThumbnailUrl(user.profilePictureUrl, 256)}
                alt={`${user.firstName} ${user.lastName}`}
                onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
                className={`relative rounded-full border-2 object-cover transition group-hover:brightness-110 ${isFloatingProfile ? 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]' : 'h-20 w-20 sm:h-20 sm:w-20'} ${profileRingClass}`}
              />
              <span className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition group-hover:bg-black/10" />
            </button>
          ) : (
            <div className={`relative flex items-center justify-center rounded-full border-2 bg-white font-bold text-primary-500 ${isFloatingProfile ? 'h-16 w-16 text-xl sm:h-[4.5rem] sm:w-[4.5rem]' : 'h-20 w-20 text-2xl sm:h-20 sm:w-20'} ${profileRingClass}`}>
              {getInitials(user)}
            </div>
          )}
          </div>
          <div>
            <div className={`flex flex-col items-center sm:flex-row sm:flex-wrap sm:items-center ${isFloatingProfile ? 'gap-2' : 'gap-3 sm:gap-2'}`}>
              <h2 className={`m-0 font-bold text-white ${isFloatingProfile ? 'text-xl sm:text-xl' : 'text-xl sm:text-2xl'}`}>{user.firstName} {user.lastName}</h2>
              {user.isHidden && (
                <span className="rounded-full border border-amber-200/40 bg-amber-300/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-100">
                  Hidden
                </span>
              )}
              <div className="flex gap-2">
                <a
                  className={`flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20 ${emailHref ? '' : 'pointer-events-none opacity-50'}`}
                  href={emailHref}
                  aria-label="Email user"
                  title={emailHref ? 'Email User' : 'No email on file'}
                >
                  <Mail size={16} />
                </a>
                <a
                  className={`flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20 ${callHref ? '' : 'pointer-events-none opacity-50'}`}
                  href={callHref}
                  aria-label="Call user"
                  title={callHref ? `Call ${callNumber}` : 'No phone number on file'}
                >
                  <Phone size={16} />
                </a>
                <button className="flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => onMessage?.(user)} aria-label="Send message" title="Send Message" type="button">
                  <Send size={16} />
                </button>
                {canEdit && onEdit && (
                  <button className="flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => onEdit?.(user)} aria-label="Edit user" title="Edit User" type="button">
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className={isFloatingProfile ? 'mt-1.5' : 'mt-2'}>
              <RankBadge rank={user.rank} />
            </div>
            <p className={`${isFloatingProfile ? 'mt-1.5' : 'mt-2'} max-w-full truncate text-sm text-blue-100`}>{user.email || 'No email on file'}</p>
            <p className="mt-0.5 text-sm text-blue-100">PE {user.peNumber || 'N/A'} - {user.district || 'No district'}</p>
            <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${presenceTone.textClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${presenceTone.dotClass}`} />
              {lastOnlineLabel}
            </p>
          </div>
        </div>
          <div className="flex w-full items-start gap-3 lg:ml-auto lg:w-auto">
            <div className={`min-w-0 flex-1 rounded border border-white/15 bg-white/10 lg:max-w-xs ${isFloatingProfile ? 'p-2.5 lg:min-w-52' : 'p-3 lg:min-w-52'}`}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-bold text-white">
                <span className="inline-flex items-center gap-2">
                  <Gauge size={15} />
                  Mileage
                </span>
                <span>{mileage.toLocaleString()} mi</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${mileagePercent}%` }} />
              </div>
              {Boolean(milestone > 0) && (
                <p className="mt-1 text-xs font-semibold text-blue-100">
                  {mileagePercent}% of {nextAchievement?.title || `${milestone.toLocaleString()} mi milestone`}
                </p>
              )}
            </div>
          <button
            className="icon-close-button border-white/20 bg-white/10 text-white hover:bg-white/20 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            onClick={onClose}
            aria-label="Close user detail"
            title="Close"
            type="button"
          >
            <X size={20} />
          </button>
          </div>
        </div>
        <div className={`-mx-4 flex gap-2 overflow-x-auto border-t border-white/15 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 ${isFloatingProfile ? 'mt-3 pt-2.5' : 'mt-4 pt-3 sm:mt-5 sm:pt-4'}`}>
          {tabs.map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`user-detail-tab shrink-0 rounded text-sm font-bold transition ${isFloatingProfile ? 'px-3 py-1.5' : 'px-3 py-2'} ${activeTab === tab ? 'user-detail-tab-active bg-white text-primary-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`user-detail-body min-h-0 flex-1 overflow-y-auto bg-gray-50 px-3 dark:bg-gray-950 sm:bg-transparent sm:px-5 sm:dark:bg-transparent ${isFloatingProfile ? 'py-3 sm:py-4' : 'py-4 sm:py-6'}`}>
        {activeTab === 'personal' && <DetailSection title="Personal Information">
          <DetailRow label="Name" value={`${user.firstName} ${user.lastName}`} />
          <DetailRow label="Email" value={user.email} copyValue={user.email} onCopy={copyProfileValue} isCopied={copiedField === 'Email'} />
          <DetailRow label="Sex" value={user.sex} />
          <DetailRow label="Marital Status" value={user.maritalStatus} />
          <DetailRow label="Race" value={user.race} />
        </DetailSection>}

        {activeTab === 'identification' && <DetailSection title="Identification">
          <DetailRow label="PE Number" value={user.peNumber} copyValue={user.peNumber} onCopy={copyProfileValue} isCopied={copiedField === 'PE Number'} />
          <DetailRow label="PeopleSoft ID" value={user.peopleSoftId} copyValue={user.peopleSoftId} onCopy={copyProfileValue} isCopied={copiedField === 'PeopleSoft ID'} />
          <DetailRow label="Badge Number" value={user.badgeNumber} />
          <DetailRow label="Radio Number" value={user.radioNumber} />
          <DetailRow label="Public Safety ID" value={user.publicSafetyId} />
          <DetailRow label="Car Number" value={user.carNumber} />
        </DetailSection>}

        {activeTab === 'employment' && <DetailSection title="Employment Details">
          <DetailRow label="Employee Type" value={user.employmentType} />
          <DetailRow label="Status" value={user.status} />
          <DetailRow label="District" value={user.district} />
          <div className="flex flex-col gap-1 border-b border-gray-200 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-400 sm:text-sm sm:normal-case sm:tracking-normal sm:text-gray-700 sm:dark:text-gray-300">Rank</span>
            <span className="text-left sm:max-w-[60%] sm:text-right">
              <RankBadge rank={user.rank} compact />
            </span>
          </div>
          <DetailRow label="Assigned To" value={user.assignedTo} />
          <DetailRow label="Supervisor" value={user.supervisor} />
          <DetailRow label="Active" value={user.isActive} />
          {user.isHidden && <DetailRow label="Hidden" value={user.isHidden} />}
          <DetailRow label="Type Details" value={user.typeDetails} />
        </DetailSection>}

        {activeTab === 'contact' && <DetailSection title="Contact">
          <DetailRow label="Personal Phone" value={user.personalPhoneNumber} copyValue={user.personalPhoneNumber} onCopy={copyProfileValue} isCopied={copiedField === 'Personal Phone'} />
          <DetailRow label="Department Phone" value={user.departmentPhoneNumber} copyValue={user.departmentPhoneNumber} onCopy={copyProfileValue} isCopied={copiedField === 'Department Phone'} />
          <DetailRow label="Residential Address" value={user.residentialAddress} />
          <DetailRow label="Mailing Address" value={user.mailingAddress} />
          <DetailRow label="Emergency Contact" value={user.emergencyContactName} />
          <DetailRow label="Emergency Relationship" value={user.emergencyContactRelationship} />
          <DetailRow label="Emergency Phone" value={user.emergencyContactPhone} />
        </DetailSection>}

        {activeTab === 'devices' && <DetailSection title="Assigned Devices">
          {deviceError && <div className="error">{deviceError}</div>}
          {isDevicesLoading ? (
            <div className="loading">Loading assigned devices...</div>
          ) : assignedDevices.length === 0 ? (
            <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No devices are assigned to this user.</div>
          ) : (
            <div className="space-y-3">
              {assignedDevices.map((device) => (
                <article key={device.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
                        {device.type === 'Cell Phone' ? <Smartphone size={18} /> : <Laptop size={18} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-gray-900 dark:text-gray-100">{device.assetTag}</p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{device.type} - {device.makeModel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold text-accent">{device.status}</span>
                      {canEdit && (
                        <button type="button" onClick={() => openDeviceEdit(device)} className="btn-secondary" aria-label={`Edit ${device.assetTag}`} title="Edit Device">
                          <Pencil size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <DetailRow label="Serial" value={device.serialNumber || 'N/A'} />
                    <DetailRow label="Condition" value={device.condition || 'Good'} />
                    <DetailRow label="Location" value={device.location || 'N/A'} />
                    <DetailRow label="Phone" value={device.phoneNumber || 'N/A'} />
                    <DetailRow label="IMEI" value={device.imei || 'N/A'} />
                    <DetailRow label="ICCID" value={device.simNumber || 'N/A'} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </DetailSection>}

        {activeTab === 'calendar' && canViewProfileCalendar && <DetailSection title="Calendar">
          {calendarError && <div className="error">{calendarError}</div>}
          {isCalendarLoading ? (
            <div className="loading">Loading calendar activity...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Entries</span>
                  <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{calendarEntries.length}</p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Duty Hours</span>
                  <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{calendarSummary.dutyHours.toLocaleString()}</p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Submitted</span>
                  <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{calendarSummary.submitted}</p>
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCalendarMonth(profileCalendarMonth)}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{calendarEntries.length === 0 ? 'No activity loaded' : `${calendarSummary.trooperDailyCount} Trooper Daily entr${calendarSummary.trooperDailyCount === 1 ? 'y' : 'ies'}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeProfileCalendarMonth(-1)} className="btn-secondary" aria-label="Previous month" title="Previous Month">
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={() => setProfileCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="btn-secondary text-xs" title="Current Month">
                      Today
                    </button>
                    <button type="button" onClick={() => changeProfileCalendarMonth(1)} className="btn-secondary" aria-label="Next month" title="Next Month">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
                  {calendarDays.map((day) => {
                    const dateKey = formatDateKey(day);
                    const dayEntries = entriesByDate[dateKey] || [];
                    const isCurrentMonth = day.getMonth() === profileCalendarMonth.getMonth();
                    const isSelected = selectedCalendarDate === dateKey;
                    const isToday = dateKey === formatDateKey(new Date());

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => setSelectedCalendarDate(dateKey)}
                        className={`min-h-[76px] rounded border p-1 text-left transition sm:min-h-[100px] sm:p-2 ${isSelected ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-gray-200 dark:border-gray-800'} ${isCurrentMonth ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 text-gray-400 dark:bg-gray-900/50 dark:text-gray-500'} hover:border-primary-400 hover:shadow-sm`}
                      >
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-primary-500 text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                          {day.getDate()}
                        </span>
                        <span className="mt-1 flex flex-col gap-1">
                          {dayEntries.slice(0, 2).map((entry) => (
                            <span key={entry.id} className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-bold sm:text-xs ${getEntryTone(entry)}`}>
                              {entry.category === 'Trooper Daily' ? `${entry.dutyHours || '0'} hrs` : entry.category}
                            </span>
                          ))}
                          {dayEntries.length > 2 && (
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">+{dayEntries.length - 2} more</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarDays size={18} className="text-primary-500 dark:text-blue-100" />
                  <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">{selectedDayLabel}</h4>
                </div>
                {selectedDayEntries.length === 0 ? (
                  <div className="empty-state rounded border border-dashed border-gray-300 py-6 text-sm dark:border-gray-700">No activity on this date.</div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEntries.map((entry) => (
                      <article key={entry.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 dark:text-gray-100">{entry.category}</p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{entry.districtWorked || 'No district'} - {entry.specialStatus || 'None'}</p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold text-accent">{entry.dutyHours || '0'} hrs</span>
                            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{entry.submissionStatus}</span>
                            {entry.category === 'Trooper Daily' && (
                              <span className="rounded bg-primary-500/10 px-2 py-1 text-xs font-bold text-primary-500 dark:text-blue-100">{entry.reviewStatus}</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                          <DetailRow label="Updated" value={new Date(entry.updatedAt).toLocaleString()} />
                          <DetailRow label="Review Notes" value={entry.reviewNotes} />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DetailSection>}

        {activeTab === 'additional' && <DetailSection title="Additional">
          <DetailRow label="Specialty Certifications" value={user.specialtyCertifications} />
        </DetailSection>}
      </div>
      {isPhotoPreviewOpen && fullProfilePhotoUrl && (
        <div
          className="modal-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setIsPhotoPreviewOpen(false)}
          role="presentation"
        >
          <div
            className="modal-window relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</h2>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{user.rank || 'Profile photo'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadProfilePhoto()}
                  className="btn-secondary h-9 px-3"
                  aria-label="Download profile photo"
                  title="Download Photo"
                >
                  <Download size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPhotoPreviewOpen(false)}
                  className="icon-close-button h-9 w-9"
                  aria-label="Close photo preview"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-950 p-3 sm:p-5">
              <img
                src={fullProfilePhotoUrl}
                alt={`${user.firstName} ${user.lastName}`}
                onError={handleAssetImageError}
                className="max-h-[78dvh] max-w-full rounded object-contain shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
      {editingDevice && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <form onSubmit={saveDeviceEdit} className="modal-window max-h-[96dvh] w-full overflow-y-auto rounded-t-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:max-w-2xl sm:rounded-lg sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Device</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{editingDevice.assetTag} - {editingDevice.makeModel}</p>
              </div>
              <button type="button" onClick={() => setEditingDevice(null)} className="icon-close-button" aria-label="Close device edit" title="Close">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
                <select value={String(deviceEditForm.status || editingDevice.status)} onChange={(event) => setDeviceEditForm((form) => ({ ...form, status: event.target.value as DeviceRecord['status'] }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                  {['Available', 'Assigned', 'Maintenance', 'Damaged', 'Lost', 'Retired'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Condition</span>
                <select value={String(deviceEditForm.condition || editingDevice.condition || 'Good')} onChange={(event) => setDeviceEditForm((form) => ({ ...form, condition: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                  {['New', 'Good', 'Fair', 'Poor', 'Damaged'].map((condition) => <option key={condition}>{condition}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Location</span>
                <input value={String(deviceEditForm.location || '')} onChange={(event) => setDeviceEditForm((form) => ({ ...form, location: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Replacement Due</span>
                <input type="date" value={String(deviceEditForm.replacementDueDate || '')} onChange={(event) => setDeviceEditForm((form) => ({ ...form, replacementDueDate: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Notes</span>
                <textarea value={String(deviceEditForm.notes || '')} onChange={(event) => setDeviceEditForm((form) => ({ ...form, notes: event.target.value }))} className="min-h-24 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
              <button type="button" onClick={() => setEditingDevice(null)} className="btn-secondary" aria-label="Cancel device edit" title="Cancel">
                <X size={16} />
              </button>
              <button type="submit" className="btn-primary" aria-label="Save device" title="Save Device">
                <Save size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
