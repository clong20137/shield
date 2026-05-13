import React from 'react';
import { User } from '../services/api';

interface UserDetailProps {
  user: User;
  onClose?: () => void;
  onEdit?: (user: User) => void;
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

      <div className="px-5 py-6 max-h-96 overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-primary-500 text-base mb-4 pb-2 border-b-2 border-gray-300 font-bold">
            Personal Information
          </h3>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Name:</span>
            <span className="text-gray-600 dark:text-gray-300">{user.firstName} {user.lastName}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Race:</span>
            <span className="text-gray-600 dark:text-gray-300">{user.race}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Sex:</span>
            <span className="text-gray-600 dark:text-gray-300">{user.sex}</span>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-primary-500 text-base mb-4 pb-2 border-b-2 border-gray-300 font-bold">
            Identification
          </h3>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">PE Number:</span>
            <span className="text-gray-600">{user.peNumber}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Badge Number:</span>
            <span className="text-gray-600">{user.badgeNumber}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Public Safety ID:</span>
            <span className="text-gray-600">{user.publicSafetyId}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Car Number:</span>
            <span className="text-gray-600">{user.carNumber}</span>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-primary-500 text-base mb-4 pb-2 border-b-2 border-gray-300 font-bold">
            Employment Details
          </h3>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Rank:</span>
            <span className="text-gray-600">{user.rank}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">District:</span>
            <span className="text-gray-600">{user.district}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Assigned To:</span>
            <span className="text-gray-600">{user.assignedTo}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Employment Type:</span>
            <span className="text-gray-600">{user.employmentType}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Type Details:</span>
            <span className="text-gray-600">{user.typeDetails}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Status:</span>
            <span className="text-gray-600">{user.status}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Active:</span>
            <span className={`font-semibold ${user.isActive ? 'text-success' : 'text-danger'}`}>
              {user.isActive ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-primary-500 text-base mb-4 pb-2 border-b-2 border-gray-300 font-bold">
            Management
          </h3>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Supervisor:</span>
            <span className="text-gray-600">{user.supervisor}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-200">
            <span className="font-semibold text-gray-700">Specialty Certifications:</span>
            <span className="text-gray-600">{user.specialtyCertifications}</span>
          </div>
        </div>
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
