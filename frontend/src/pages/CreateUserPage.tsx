import { FormEvent, useEffect, useState } from 'react';
import { RotateCcw, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CreateUserPayload, User, userService } from '../services/api';
import { rankOptions } from '../constants/ranks';
import { districtOptions } from '../constants/districts';

interface CreateUserPageProps {
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  isModalView?: boolean;
  onCreated?: (user: User) => void;
}

const employmentTypes = ['Civilian', 'Police', 'Recruit', 'MC Inspector', 'Inactive', 'Other', 'CPS'];
const statusOptions = ['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Administrative Duty', 'Inactive'];
const sexOptions = ['', 'Male', 'Female'];
const maritalStatusOptions = ['', 'Single', 'Married', 'Divorced', 'Widowed'];

type UserForm = CreateUserPayload;

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/gu, '').slice(0, 10);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const emptyUserForm: UserForm = {
  firstName: '',
  lastName: '',
  email: '',
  profilePictureUrl: '',
  peNumber: '',
  peopleSoftId: '',
  carNumber: '',
  badgeNumber: '',
  radioNumber: '',
  personalPhoneNumber: '',
  departmentPhoneNumber: '',
  assignedTo: '',
  district: districtOptions[0],
  rank: '',
  isActive: true,
  employmentType: employmentTypes[0],
  typeDetails: '',
  status: statusOptions[0],
  supervisor: '',
  specialtyCertifications: '',
  publicSafetyId: '',
  race: '',
  sex: '',
  maritalStatus: '',
  residentialAddress: '',
  mailingAddress: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactPhone: '',
  role: 'user',
  receivesMessages: true,
  password: '',
};

function CreateUserPage({ onToast, isModalView = false, onCreated }: CreateUserPageProps) {
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    userService.getAll(1, 100)
      .then((response) => {
        const addresses = response.data.data
          .flatMap((user: User) => [user.residentialAddress, user.mailingAddress])
          .filter((address): address is string => Boolean(address?.trim()));
        setAddressSuggestions(Array.from(new Set(addresses)).slice(0, 50));
      })
      .catch(() => setAddressSuggestions([]));
  }, []);

  const updateField = (field: keyof UserForm, value: string | boolean) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim()) {
      onToast('error', 'First and last name are required.');
      return;
    }

    if (form.password && form.password.length < 8) {
      onToast('error', 'Password must be at least 8 characters.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await userService.create(form);
      onToast('success', 'User created\nThe account is ready to use.');
      if (onCreated) {
        onCreated(response.data);
      } else {
        navigate(`/search?userId=${encodeURIComponent(response.data.id)}&q=${encodeURIComponent(`${response.data.firstName} ${response.data.lastName}`)}`);
      }
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to create user. Check for duplicate PE, badge, or public safety ID.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {!isModalView && (
      <div className="mb-8">
        <h1>Create User</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Add a new personnel profile.</p>
      </div>
      )}

      <form onSubmit={handleSubmit} className={isModalView ? '' : 'rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800'}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</span>
            <input value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</span>
            <input value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Email</span>
            <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Login Password</span>
            <input type="password" value={form.password || ''} onChange={(event) => setForm((currentForm) => ({ ...currentForm, password: event.target.value }))} autoComplete="new-password" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">PE Number</span>
            <input value={form.peNumber} onChange={(event) => updateField('peNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">PeopleSoft ID</span>
            <input value={form.peopleSoftId} onChange={(event) => updateField('peopleSoftId', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Employee Type</span>
            <select value={form.employmentType} onChange={(event) => updateField('employmentType', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {employmentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
            <select value={form.status} onChange={(event) => updateField('status', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {statusOptions.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District</span>
            <select value={form.district} onChange={(event) => updateField('district', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {districtOptions.map((district) => <option key={district}>{district}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Rank</span>
            <select value={form.rank} onChange={(event) => updateField('rank', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {rankOptions.map((rank) => <option key={rank || 'none'} value={rank}>{rank || 'Select'}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Badge Number</span>
            <input value={form.badgeNumber} onChange={(event) => updateField('badgeNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Radio Number</span>
            <input value={form.radioNumber} onChange={(event) => updateField('radioNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Car Number</span>
            <input value={form.carNumber} onChange={(event) => updateField('carNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Personal Phone</span>
            <input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={form.personalPhoneNumber} onChange={(event) => updateField('personalPhoneNumber', formatPhoneNumber(event.target.value))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Department Phone</span>
            <input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={form.departmentPhoneNumber} onChange={(event) => updateField('departmentPhoneNumber', formatPhoneNumber(event.target.value))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Supervisor</span>
            <input value={form.supervisor} onChange={(event) => updateField('supervisor', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Sex</span>
            <select value={form.sex} onChange={(event) => updateField('sex', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {sexOptions.map((option) => <option key={option} value={option}>{option || 'Select'}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Marital Status</span>
            <select value={form.maritalStatus} onChange={(event) => updateField('maritalStatus', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
              {maritalStatusOptions.map((option) => <option key={option} value={option}>{option || 'Select'}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Public Safety ID</span>
            <input value={form.publicSafetyId} onChange={(event) => updateField('publicSafetyId', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block md:col-span-2 xl:col-span-3">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Residential Address</span>
            <input value={form.residentialAddress} onChange={(event) => updateField('residentialAddress', event.target.value)} autoComplete="street-address" list="shield-addresses" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block md:col-span-2 xl:col-span-3">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Mailing Address</span>
            <input value={form.mailingAddress} onChange={(event) => updateField('mailingAddress', event.target.value)} autoComplete="street-address" list="shield-addresses" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Contact Name</span>
            <input value={form.emergencyContactName} onChange={(event) => updateField('emergencyContactName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Contact Relationship</span>
            <input value={form.emergencyContactRelationship} onChange={(event) => updateField('emergencyContactRelationship', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Contact Phone</span>
            <input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={form.emergencyContactPhone} onChange={(event) => updateField('emergencyContactPhone', formatPhoneNumber(event.target.value))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
        </div>
        <datalist id="shield-addresses">
          {addressSuggestions.map((address) => <option key={address} value={address} />)}
        </datalist>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <button type="submit" className="btn-primary" disabled={isSaving} aria-label="Create user" title={isSaving ? 'Creating' : 'Create User'}>
            <UserPlus size={16} />
          </button>
          <button type="button" onClick={() => setForm(emptyUserForm)} className="btn-secondary" aria-label="Reset create user form" title="Reset">
            <RotateCcw size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateUserPage;
