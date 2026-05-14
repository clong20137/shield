import React from 'react';
import { User } from '../services/api';

interface UserDetailProps {
  user: User;
  onClose?: () => void;
  onEdit?: (user: User) => void;
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

export const UserDetail: React.FC<UserDetailProps> = ({ user, onClose, onEdit }) => {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="bg-primary-500 text-white px-5 py-4 flex justify-between items-center">
        <h2 className="text-2xl font-bold m-0">{user.firstName} {user.lastName}</h2>
        <button
          className="bg-transparent border-none text-white text-2xl cursor-pointer w-10 h-10 flex items-center justify-center rounded hover:bg-black/20"
          onClick={onClose}
          aria-label="Close user detail"
        >
          x
        </button>
      </div>

      <div className="px-5 py-6 max-h-[70vh] overflow-y-auto">
        <DetailSection title="Personal Information">
          <DetailRow label="Name" value={`${user.firstName} ${user.lastName}`} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Sex" value={user.sex} />
          <DetailRow label="Marital Status" value={user.maritalStatus} />
          <DetailRow label="Race" value={user.race} />
        </DetailSection>

        <DetailSection title="Identification">
          <DetailRow label="PE Number" value={user.peNumber} />
          <DetailRow label="PeopleSoft ID" value={user.peopleSoftId} />
          <DetailRow label="Badge Number" value={user.badgeNumber} />
          <DetailRow label="Radio Number" value={user.radioNumber} />
          <DetailRow label="Public Safety ID" value={user.publicSafetyId} />
          <DetailRow label="Car Number" value={user.carNumber} />
        </DetailSection>

        <DetailSection title="Employment Details">
          <DetailRow label="Employee Type" value={user.employmentType} />
          <DetailRow label="Status" value={user.status} />
          <DetailRow label="District" value={user.district} />
          <DetailRow label="Rank" value={user.rank} />
          <DetailRow label="Assigned To" value={user.assignedTo} />
          <DetailRow label="Supervisor" value={user.supervisor} />
          <DetailRow label="Active" value={user.isActive} />
          <DetailRow label="Type Details" value={user.typeDetails} />
        </DetailSection>

        <DetailSection title="Contact">
          <DetailRow label="Personal Phone" value={user.personalPhoneNumber} />
          <DetailRow label="Department Phone" value={user.departmentPhoneNumber} />
          <DetailRow label="Residential Address" value={user.residentialAddress} />
          <DetailRow label="Mailing Address" value={user.mailingAddress} />
        </DetailSection>

        <DetailSection title="Additional">
          <DetailRow label="Specialty Certifications" value={user.specialtyCertifications} />
        </DetailSection>
      </div>

      <div className="flex gap-2 px-5 py-4 border-t-2 border-gray-300">
        <button className="btn-primary" onClick={() => onEdit?.(user)}>
          Edit User
        </button>
        <button className="btn bg-gray-400 text-gray-800 hover:bg-gray-500" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};
