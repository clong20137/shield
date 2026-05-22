import React, { useEffect, useState } from 'react';
import { Gauge, Laptop, Mail, Pencil, Phone, Save, Send, Smartphone, X } from 'lucide-react';
import { DeviceRecord, deviceService, getAssetUrl, handleAssetImageError, MileageSummary, mileageService, User } from '../services/api';
import { RankBadge } from './RankBadge';

interface UserDetailProps {
  user: User;
  onClose?: () => void;
  onEdit?: (user: User) => void;
  onMessage?: (user: User) => void;
  canEdit?: boolean;
}

function DetailRow({ label, value }: { label: string; value?: string | boolean | null }) {
  const displayValue = value === true ? 'Yes' : value === false ? 'No' : value || 'N/A';

  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-200 dark:border-gray-800">
      <span className="font-semibold text-gray-700 dark:text-gray-300">{label}:</span>
      <span className="text-right text-gray-600 dark:text-gray-300">{displayValue}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-primary-500 text-base mb-4 pb-2 border-b-2 border-gray-300 font-bold dark:text-blue-100 dark:border-gray-700">
        {title}
      </h3>
      {children}
    </div>
  );
}

function getInitials(user: User): string {
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
}

export const UserDetail: React.FC<UserDetailProps> = ({ user, onClose, onEdit, onMessage, canEdit = false }) => {
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

  const mileage = mileageSummary?.mileage || 0;
  const milestone = mileageSummary?.milestone || 0;
  const nextAchievement = mileageSummary?.nextAchievement || null;
  const mileagePercent = milestone > 0 ? Math.min(100, Math.round((mileage / milestone) * 100)) : 0;

  return (
    <div className="bg-white rounded-lg shadow-xl overflow-hidden dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="bg-primary-500 text-white px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
          {user.profilePictureUrl ? (
            <img
              src={getAssetUrl(user.profilePictureUrl)}
              alt={`${user.firstName} ${user.lastName}`}
              onError={handleAssetImageError}
              className="h-20 w-20 rounded-full border-2 border-white object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-white text-2xl font-bold text-primary-500">
              {getInitials(user)}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-2xl font-bold text-white">{user.firstName} {user.lastName}</h2>
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
            <p className="mt-2 text-sm text-blue-100">{user.email || 'No email on file'}</p>
            <p className="mt-1 text-sm text-blue-100">PE {user.peNumber || 'N/A'} - {user.district || 'No district'}</p>
          </div>
        </div>
          <div className="ml-auto flex items-start gap-3">
            <div className="w-full min-w-52 max-w-xs rounded border border-white/15 bg-white/10 p-3">
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
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/15 pt-4">
          {tabs.map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3 py-2 text-sm font-bold transition ${activeTab === tab ? 'bg-white text-primary-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-6 max-h-[70vh] overflow-y-auto">
        {activeTab === 'personal' && <DetailSection title="Personal Information">
          <DetailRow label="Name" value={`${user.firstName} ${user.lastName}`} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Sex" value={user.sex} />
          <DetailRow label="Marital Status" value={user.maritalStatus} />
          <DetailRow label="Race" value={user.race} />
        </DetailSection>}

        {activeTab === 'identification' && <DetailSection title="Identification">
          <DetailRow label="PE Number" value={user.peNumber} />
          <DetailRow label="PeopleSoft ID" value={user.peopleSoftId} />
          <DetailRow label="Badge Number" value={user.badgeNumber} />
          <DetailRow label="Radio Number" value={user.radioNumber} />
          <DetailRow label="Public Safety ID" value={user.publicSafetyId} />
          <DetailRow label="Car Number" value={user.carNumber} />
        </DetailSection>}

        {activeTab === 'employment' && <DetailSection title="Employment Details">
          <DetailRow label="Employee Type" value={user.employmentType} />
          <DetailRow label="Status" value={user.status} />
          <DetailRow label="District" value={user.district} />
          <div className="flex justify-between gap-4 border-b border-gray-200 py-2 dark:border-gray-800">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Rank:</span>
            <span className="max-w-[60%] text-right">
              <RankBadge rank={user.rank} compact />
            </span>
          </div>
          <DetailRow label="Assigned To" value={user.assignedTo} />
          <DetailRow label="Supervisor" value={user.supervisor} />
          <DetailRow label="Active" value={user.isActive} />
          <DetailRow label="Type Details" value={user.typeDetails} />
        </DetailSection>}

        {activeTab === 'contact' && <DetailSection title="Contact">
          <DetailRow label="Personal Phone" value={user.personalPhoneNumber} />
          <DetailRow label="Department Phone" value={user.departmentPhoneNumber} />
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
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveDeviceEdit} className="modal-window w-full max-w-2xl rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
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
