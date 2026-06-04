import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, FolderUp, RotateCcw, Upload, UserPlus } from 'lucide-react';
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
const allowedPhotoExtensions = new Set(['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp']);

type UserForm = CreateUserPayload;

function getImportErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data as { error?: string; message?: string } | undefined;
    return responseError?.error || responseError?.message || error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

function isAllowedProfilePhoto(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return allowedPhotoExtensions.has(extension);
}

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
  isHidden: false,
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
  const [addressLookupQuery, setAddressLookupQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingPhotos, setIsImportingPhotos] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const [importSummary, setImportSummary] = useState<{ createdCount: number; skippedRows: Array<{ rowNumber: number; reason: string }> } | null>(null);
  const [photoImportSummary, setPhotoImportSummary] = useState<{ uploadedCount: number; skippedFiles: Array<{ fileName: string; peNumber: string; reason: string }> } | null>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoFolderInputRef = useRef<HTMLInputElement | null>(null);
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

  const updateAddressField = (field: 'residentialAddress' | 'mailingAddress', value: string) => {
    updateField(field, value);
    setAddressLookupQuery(value);
  };

  useEffect(() => {
    const query = addressLookupQuery.trim();
    if (query.length < 3) {
      return;
    }

    let isMounted = true;
    const timer = window.setTimeout(() => {
      userService.getAddressSuggestions(query)
        .then((response) => {
          if (!isMounted) {
            return;
          }

          setAddressSuggestions((currentSuggestions) =>
            Array.from(new Set([...response.data, ...currentSuggestions])).slice(0, 50),
          );
        })
        .catch(() => undefined);
    }, 300);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [addressLookupQuery]);

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

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportSummary(null);
    try {
      const response = await userService.importSpreadsheet(file);
      setImportSummary({
        createdCount: response.data.createdCount,
        skippedRows: response.data.skippedRows,
      });
      onToast('success', `${response.data.createdCount} account${response.data.createdCount === 1 ? '' : 's'} imported\nDefault password: ${response.data.defaultPassword}`);
    } catch (err) {
      console.error(err);
      onToast('error', getImportErrorMessage(err, 'Failed to import spreadsheet.'));
    } finally {
      setIsImporting(false);
    }
  };

  const handlePhotoImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    if (selectedFiles.length === 0) {
      return;
    }

    const files = selectedFiles.filter(isAllowedProfilePhoto);
    const ignoredCount = selectedFiles.length - files.length;

    if (files.length === 0) {
      onToast('error', 'No supported image files were selected. Use JPG, JPEG, JFIF, PNG, GIF, or WEBP.');
      return;
    }

    setIsImportingPhotos(true);
    setPhotoUploadProgress(0);
    setPhotoImportSummary(null);
    try {
      const response = await userService.importProfilePictures(files, setPhotoUploadProgress);
      setPhotoUploadProgress(100);
      setPhotoImportSummary({
        uploadedCount: response.data.uploadedCount,
        skippedFiles: response.data.skippedFiles,
      });
      const ignoredText = ignoredCount > 0 ? `\n${ignoredCount} unsupported file${ignoredCount === 1 ? '' : 's'} ignored` : '';
      onToast('success', `${response.data.uploadedCount} profile photo${response.data.uploadedCount === 1 ? '' : 's'} imported\n${response.data.skippedCount} skipped${ignoredText}`);
    } catch (err) {
      console.error(err);
      const message = getImportErrorMessage(err, 'Failed to import profile photos.');
      setPhotoImportSummary({
        uploadedCount: 0,
        skippedFiles: [{ fileName: 'Import failed', peNumber: '', reason: message }],
      });
      onToast('error', message);
    } finally {
      setIsImportingPhotos(false);
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

      <div className={isModalView ? 'mb-5 rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900' : 'mb-5 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Import Roster & Photos</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Import accounts from Excel, or upload profile photos named by PE number. Existing photos are skipped.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => spreadsheetInputRef.current?.click()} className="btn-secondary" disabled={isImporting} aria-label="Import Excel roster" title={isImporting ? 'Importing' : 'Import Excel roster'}>
              <Upload size={16} />
            </button>
            <button type="button" onClick={() => photoInputRef.current?.click()} className="btn-secondary" disabled={isImportingPhotos} aria-label="Import profile photos" title={isImportingPhotos ? 'Importing photos' : 'Import profile photos by PE number'}>
              <Camera size={16} />
            </button>
            <button type="button" onClick={() => photoFolderInputRef.current?.click()} className="btn-secondary" disabled={isImportingPhotos} aria-label="Import profile photo folder" title={isImportingPhotos ? 'Importing photos' : 'Import a folder of PE-numbered photos'}>
              <FolderUp size={16} />
            </button>
          </div>
          <input ref={spreadsheetInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.jfif,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" onChange={handlePhotoImport} />
          <input
            ref={photoFolderInputRef}
            type="file"
            accept=".jpg,.jpeg,.jfif,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handlePhotoImport}
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          />
        </div>
        {importSummary && (
          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
            <p className="font-semibold text-gray-900 dark:text-white">{importSummary.createdCount} account{importSummary.createdCount === 1 ? '' : 's'} created.</p>
            {importSummary.skippedRows.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto text-gray-600 dark:text-gray-300">
                {importSummary.skippedRows.slice(0, 20).map((row) => (
                  <p key={`${row.rowNumber}-${row.reason}`}>Row {row.rowNumber}: {row.reason}</p>
                ))}
                {importSummary.skippedRows.length > 20 && <p>{importSummary.skippedRows.length - 20} more skipped rows.</p>}
              </div>
            )}
          </div>
        )}
        {photoImportSummary && (
          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
            <p className="font-semibold text-gray-900 dark:text-white">{photoImportSummary.uploadedCount} profile photo{photoImportSummary.uploadedCount === 1 ? '' : 's'} uploaded.</p>
            {photoImportSummary.skippedFiles.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto text-gray-600 dark:text-gray-300">
                {photoImportSummary.skippedFiles.slice(0, 20).map((file) => (
                  <p key={`${file.fileName}-${file.reason}`}>{file.fileName}: {file.reason}</p>
                ))}
                {photoImportSummary.skippedFiles.length > 20 && <p>{photoImportSummary.skippedFiles.length - 20} more skipped files.</p>}
              </div>
            )}
          </div>
        )}
        {isImportingPhotos && (
          <div className="mt-4 rounded border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-primary-500 dark:text-blue-100">
              <span>Uploading profile photos</span>
              <span>{photoUploadProgress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white dark:bg-gray-900">
              <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${photoUploadProgress}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Large batches may keep processing after the upload reaches 100% while thumbnails are generated.</p>
          </div>
        )}
      </div>

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
            <input value={form.residentialAddress} onChange={(event) => updateAddressField('residentialAddress', event.target.value)} autoComplete="street-address" list="shield-addresses" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </label>
          <label className="block md:col-span-2 xl:col-span-3">
            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Mailing Address</span>
            <input value={form.mailingAddress} onChange={(event) => updateAddressField('mailingAddress', event.target.value)} autoComplete="street-address" list="shield-addresses" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
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
