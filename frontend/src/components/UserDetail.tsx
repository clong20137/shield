import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Gauge, Laptop, Mail, Pencil, Phone, Save, Send, Smartphone, X } from 'lucide-react';
import { DeviceRecord, deviceService, getAssetUrl, handleAssetImageError, MileageSummary, mileageService, User } from '../services/api';
import { RankBadge } from './RankBadge';

interface UserDetailProps {
  user: User;
  onClose?: () => void;
  onEdit?: (user: User) => void;
  onMessage?: (user: User) => void;
  onToast?: (type: 'success' | 'error', message: string) => void;
  canEdit?: boolean;
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
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:border-0 sm:p-0">
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

function isUserOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const value = new Date(lastSeenAt).getTime();
  if (Number.isNaN(value)) {
    return false;
  }

  return Date.now() - value < 2 * 60 * 1000;
}

function getLastOnlineLabel(lastSeenAt?: string | null): string {
  if (!lastSeenAt) {
    return 'Last online: Never';
  }

  const value = new Date(lastSeenAt).getTime();
  if (Number.isNaN(value)) {
    return 'Last online: Unknown';
  }

  const diffMs = Date.now() - value;
  if (diffMs < 2 * 60 * 1000) {
    return 'Online now';
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return `Last online ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last online ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Last online ${days} day${days === 1 ? '' : 's'} ago`;
  }

  return `Last online ${new Date(lastSeenAt).toLocaleString()}`;
}

export const UserDetail: React.FC<UserDetailProps> = ({ user, onClose, onEdit, onMessage, onToast, canEdit = false, onHeaderPointerDown, isFloatingProfile = false }) => {
  const callNumber = user.departmentPhoneNumber || user.personalPhoneNumber;
  const callHref = callNumber ? `tel:${callNumber.replace(/[^\d+]/gu, '')}` : undefined;
  const emailHref = user.email ? `mailto:${user.email}` : undefined;
  const [activeTab, setActiveTab] = useState<'personal' | 'identification' | 'employment' | 'contact' | 'devices' | 'additional'>('personal');
  const [mileageSummary, setMileageSummary] = useState<MileageSummary | null>(null);
  const [assignedDevices, setAssignedDevices] = useState<DeviceRecord[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceRecord | null>(null);
  const [deviceEditForm, setDeviceEditForm] = useState<Partial<DeviceRecord>>({});
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [presenceTick, setPresenceTick] = useState(0);
  const tabs = [
    ['personal', 'Personal'],
    ['identification', 'Identification'],
    ['employment', 'Employment'],
    ['contact', 'Contact'],
    ['devices', 'Devices'],
    ['additional', 'Additional'],
  ] as const;

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
    let isMounted = true;

    const loadAssignedDevices = () => {
      setIsDevicesLoading(true);
      setDeviceError(null);
      deviceService.getAssignedToUser(user.id)
        .then((response) => {
          if (isMounted) {
            setAssignedDevices(response.data);
          }
        })
        .catch((error) => {
          console.error('Failed to load assigned profile devices:', error);
          if (isMounted) {
            setAssignedDevices([]);
            setDeviceError('Failed to load assigned devices.');
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsDevicesLoading(false);
          }
        });
    };

    loadAssignedDevices();
    window.addEventListener('shield:device-updated', loadAssignedDevices);

    return () => {
      isMounted = false;
      window.removeEventListener('shield:device-updated', loadAssignedDevices);
    };
  }, [user.id]);

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

  const mileage = mileageSummary?.mileage || 0;
  const milestone = mileageSummary?.milestone || 0;
  const nextAchievement = mileageSummary?.nextAchievement || null;
  const mileagePercent = milestone > 0 ? Math.min(100, Math.round((mileage / milestone) * 100)) : 0;
  const isOnline = isUserOnline(user.lastSeenAt);
  const lastOnlineLabel = useMemo(() => getLastOnlineLabel(user.lastSeenAt), [presenceTick, user.lastSeenAt]);
  const profileRingClass = isOnline
    ? 'border-green-400 shadow-[0_0_0_4px_rgba(34,197,94,0.22)]'
    : 'border-white';

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden rounded-none bg-white shadow-xl dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800 sm:h-auto sm:max-h-[92dvh] sm:rounded-lg">
      <div
        onPointerDown={onHeaderPointerDown}
        className={`shrink-0 select-none bg-primary-500 px-4 py-4 text-white sm:px-5 sm:py-5 ${isFloatingProfile ? 'md:cursor-grab' : ''}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
          <div className="relative shrink-0">
            {isOnline && <span className="absolute inset-0 animate-ping rounded-full border-4 border-green-300 opacity-60" />}
          {user.profilePictureUrl ? (
            <img
              src={getAssetUrl(user.profilePictureUrl)}
              alt={`${user.firstName} ${user.lastName}`}
              onError={handleAssetImageError}
              className={`relative h-20 w-20 rounded-full border-2 object-cover sm:h-20 sm:w-20 ${profileRingClass}`}
            />
          ) : (
            <div className={`relative flex h-20 w-20 items-center justify-center rounded-full border-2 bg-white text-2xl font-bold text-primary-500 sm:h-20 sm:w-20 ${profileRingClass}`}>
              {getInitials(user)}
            </div>
          )}
          </div>
          <div>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              <h2 className="m-0 text-xl font-bold text-white sm:text-2xl">{user.firstName} {user.lastName}</h2>
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
                {canEdit && (
                  <button className="flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={() => onEdit?.(user)} aria-label="Edit user" title="Edit User" type="button">
                    <Pencil size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2">
              <RankBadge rank={user.rank} />
            </div>
            <p className="mt-2 max-w-full truncate text-sm text-blue-100">{user.email || 'No email on file'}</p>
            <p className="mt-1 text-sm text-blue-100">PE {user.peNumber || 'N/A'} - {user.district || 'No district'}</p>
            <p className={`mt-1 text-xs font-bold ${isOnline ? 'text-green-100' : 'text-blue-100'}`}>{lastOnlineLabel}</p>
            {isFloatingProfile && <p className="mt-1 hidden text-xs text-blue-100 md:block">Drag to move. Resize from the corner.</p>}
          </div>
        </div>
          <div className="flex w-full items-start gap-3 lg:ml-auto lg:w-auto">
            <div className="min-w-0 flex-1 rounded border border-white/15 bg-white/10 p-3 lg:min-w-52 lg:max-w-xs">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-white">
                <span className="inline-flex items-center gap-2">
                  <Gauge size={15} />
                  Mileage
                </span>
                <span>{mileage.toLocaleString()} mi</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${mileagePercent}%` }} />
              </div>
              {milestone > 0 && (
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
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto border-t border-white/15 px-4 pt-3 sm:mx-0 sm:mt-5 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pt-4">
          {tabs.map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded px-3 py-2 text-sm font-bold transition ${activeTab === tab ? 'bg-white text-primary-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-3 py-4 dark:bg-gray-950 sm:bg-transparent sm:px-5 sm:py-6 sm:dark:bg-transparent">
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

        {activeTab === 'additional' && <DetailSection title="Additional">
          <DetailRow label="Specialty Certifications" value={user.specialtyCertifications} />
        </DetailSection>}
      </div>
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
