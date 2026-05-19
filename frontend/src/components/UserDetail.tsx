import React, { useState } from 'react';
import { Mail, Pencil, Phone, Send, X } from 'lucide-react';
import { getAssetUrl, handleAssetImageError, User } from '../services/api';
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
  const [activeTab, setActiveTab] = useState<'personal' | 'identification' | 'employment' | 'contact' | 'additional'>('personal');
  const tabs = [
    ['personal', 'Personal'],
    ['identification', 'Identification'],
    ['employment', 'Employment'],
    ['contact', 'Contact'],
    ['additional', 'Additional'],
  ] as const;

  return (
    <div className="bg-white rounded-lg shadow-xl overflow-hidden dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="bg-primary-500 text-white px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
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

        {activeTab === 'additional' && <DetailSection title="Additional">
          <DetailRow label="Specialty Certifications" value={user.specialtyCertifications} />
        </DetailSection>}
      </div>
    </div>
  );
};
