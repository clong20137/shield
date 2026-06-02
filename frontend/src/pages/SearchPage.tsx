import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Save, Send, X } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useSearchParams } from 'react-router-dom';
import { AuthAccount, AuthRole, authService, getAssetUrl, handleAssetImageError, messageService, userService, User, UserFilters } from '../services/api';
import { SearchBar } from '../components/SearchBar';
import { UserTable } from '../components/UserTable';
import { UserDetail } from '../components/UserDetail';
import { rankOptions } from '../constants/ranks';
import { districtOptions } from '../constants/districts';

interface SearchPageProps {
  currentUser: AuthAccount | null;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
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

const userUpdateFields = [
  'firstName',
  'lastName',
  'email',
  'profilePictureUrl',
  'peNumber',
  'peopleSoftId',
  'carNumber',
  'badgeNumber',
  'radioNumber',
  'personalPhoneNumber',
  'departmentPhoneNumber',
  'assignedTo',
  'district',
  'rank',
  'isActive',
  'employmentType',
  'typeDetails',
  'status',
  'supervisor',
  'specialtyCertifications',
  'publicSafetyId',
  'race',
  'sex',
  'maritalStatus',
  'residentialAddress',
  'mailingAddress',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
  'receivesMessages',
] as const satisfies readonly (keyof User)[];

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function isMobileViewport() {
  return window.innerWidth < 768;
}

function getInitialProfileWindowPosition() {
  const width = Math.min(window.innerWidth - 24, 920);
  return {
    x: Math.max(12, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(12, Math.round(window.innerHeight * 0.08)),
  };
}

const SearchPage: React.FC<SearchPageProps> = ({ currentUser, onToast }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [profileWindowPosition, setProfileWindowPosition] = useState(getInitialProfileWindowPosition);
  const [isProfileDragging, setIsProfileDragging] = useState(false);
  const [isMobileProfileLayout, setIsMobileProfileLayout] = useState(() => isMobileViewport());
  const [profileZIndex, setProfileZIndex] = useState(85);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [messageRecipient, setMessageRecipient] = useState<User | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [supervisorOptions, setSupervisorOptions] = useState<User[]>([]);
  const [roleOptions, setRoleOptions] = useState<AuthRole[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const profileWindowRef = useRef<HTMLDivElement | null>(null);
  const profileDragOffsetRef = useRef({ x: 0, y: 0 });
  const searchRequestRef = useRef(0);
  const [addressLookupQuery, setAddressLookupQuery] = useState('');
  const [searchParams] = useSearchParams();
  const globalQuery = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const selectedUserId = useMemo(() => searchParams.get('userId') ?? '', [searchParams]);
  const isAdministrator = currentUser?.role === 'administrator';
  const canEditProfilePictures = isAdministrator || currentUser?.permissions?.includes('users:profile-picture');

  useEffect(() => {
    const syncProfileLayout = () => {
      const nextIsMobile = isMobileViewport();
      setIsMobileProfileLayout(nextIsMobile);
      if (nextIsMobile) {
        setIsProfileDragging(false);
      }
    };

    syncProfileLayout();
    window.addEventListener('resize', syncProfileLayout);

    return () => window.removeEventListener('resize', syncProfileLayout);
  }, []);

  useEffect(() => {
    const handleFloatingFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ app?: string }>).detail;
      setProfileZIndex(detail?.app === 'profile' ? 85 : 58);
    };

    window.addEventListener('shield:floating-focus', handleFloatingFocus);
    return () => window.removeEventListener('shield:floating-focus', handleFloatingFocus);
  }, []);

  useEffect(() => {
    if (!isProfileDragging || isMobileProfileLayout) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = profileWindowRef.current?.offsetWidth || Math.min(window.innerWidth - 24, 920);
      const height = profileWindowRef.current?.offsetHeight || Math.min(window.innerHeight - 24, 760);
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      setProfileWindowPosition({
        x: Math.min(Math.max(12, event.clientX - profileDragOffsetRef.current.x), maxX),
        y: Math.min(Math.max(12, event.clientY - profileDragOffsetRef.current.y), maxY),
      });
    };

    const stopDragging = () => setIsProfileDragging(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [isProfileDragging, isMobileProfileLayout]);

  useEffect(() => {
    const keepProfileInView = () => {
      if (isMobileViewport()) {
        return;
      }

      const width = profileWindowRef.current?.offsetWidth || Math.min(window.innerWidth - 24, 920);
      const height = profileWindowRef.current?.offsetHeight || Math.min(window.innerHeight - 24, 760);
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      setProfileWindowPosition((current) => ({
        x: Math.min(Math.max(12, current.x), maxX),
        y: Math.min(Math.max(12, current.y), maxY),
      }));
    };

    window.addEventListener('resize', keepProfileInView);
    return () => window.removeEventListener('resize', keepProfileInView);
  }, []);

  const handleSearch = async (query: string) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setCurrentQuery(query);
    setLoading(true);
    setError(null);
    try {
      if (!query.trim()) {
        const response = await userService.getAll(1, 100);
        if (requestId !== searchRequestRef.current) return;
        setUsers(response.data.data);
      } else {
        const response = await userService.search(query);
        if (requestId !== searchRequestRef.current) return;
        setUsers(response.data);
      }
    } catch (err) {
      setError('Failed to search users. Please try again.');
      console.error(err);
    } finally {
      if (requestId === searchRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const handleFilterChange = async (filters: UserFilters) => {
    setLoading(true);
    setError(null);
    try {
      const response = await userService.search(currentQuery, filters);
      setUsers(response.data);
    } catch (err) {
      setError('Failed to apply filters. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!isAdministrator) {
      onToast('error', 'Administrator permission required.');
      return;
    }

    try {
      await userService.delete(userId);
      setUsers(users.filter(u => u.id !== userId));
      setSelectedUser(null);
    } catch (err) {
      setError('Failed to delete user. Please try again.');
      console.error(err);
    }
  };

  const loadUserEditOptions = async () => {
    try {
      const response = await userService.getAll(1, 500);
      const roleResponse = currentUser ? await authService.getRoles(currentUser.id) : null;
      const loadedUsers = response.data.data;
      const addresses = loadedUsers
        .flatMap((user) => [user.residentialAddress, user.mailingAddress])
        .filter((address): address is string => Boolean(address?.trim()));

      setSupervisorOptions(loadedUsers);
      setRoleOptions(roleResponse?.data || []);
      setAddressSuggestions(Array.from(new Set(addresses)).slice(0, 100));
    } catch (err) {
      console.error('Failed to load user edit options:', err);
      onToast('error', 'Failed to load user edit options.');
    }
  };

  const openEditUser = (user: User) => {
    if (!isAdministrator) {
      onToast('error', 'Administrator permission required.');
      return;
    }

    setEditingUser(user);
    setEditForm(user);
    if (supervisorOptions.length === 0 || addressSuggestions.length === 0 || roleOptions.length === 0) {
      void loadUserEditOptions();
    }
  };

  const updateEditField = (field: keyof User, value: string | boolean) => {
    setEditForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const updateAddressField = (field: 'residentialAddress' | 'mailingAddress', value: string) => {
    updateEditField(field, value);
    setAddressLookupQuery(value);
  };

  const openSelectedUser = (user: User) => {
    setProfileZIndex(85);
    window.dispatchEvent(new CustomEvent('shield:floating-focus', { detail: { app: 'profile' } }));
    setSelectedUser(null);
    window.setTimeout(() => setSelectedUser({ ...user }), 0);
  };

  const focusProfileWindow = () => {
    setProfileZIndex(85);
    window.dispatchEvent(new CustomEvent('shield:floating-focus', { detail: { app: 'profile' } }));
  };

  const startDraggingProfile = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isMobileProfileLayout) {
      return;
    }

    if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) {
      return;
    }

    focusProfileWindow();

    const rect = profileWindowRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    profileDragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsProfileDragging(true);
  };

  const updateProfilePicture = () => {
    if (!canEditProfilePictures) {
      onToast('error', 'Profile photo permission required.');
      return;
    }

    profilePictureInputRef.current?.click();
  };

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !editingUser) {
      return;
    }

    if (!canEditProfilePictures) {
      onToast('error', 'Profile photo permission required.');
      return;
    }

    setIsUploadingPicture(true);
    try {
      const response = await userService.uploadProfilePicture(editingUser.id, file);
      const updatedUser = response.data.user;
      setEditForm(updatedUser);
      setEditingUser(updatedUser);
      setSelectedUser(updatedUser);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      onToast('success', 'Profile picture uploaded.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to upload profile picture.');
    } finally {
      setIsUploadingPicture(false);
      event.target.value = '';
    }
  };

  const removeProfilePicture = async () => {
    if (!editingUser) {
      return;
    }

    if (!canEditProfilePictures) {
      onToast('error', 'Profile photo permission required.');
      return;
    }

    setIsUploadingPicture(true);
    try {
      const response = await userService.removeProfilePicture(editingUser.id);
      const updatedUser = response.data.user;
      setEditForm(updatedUser);
      setEditingUser(updatedUser);
      setSelectedUser(updatedUser);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      onToast('success', 'Profile picture removed.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to remove profile picture.');
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleSaveUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingUser || !isAdministrator) {
      onToast('error', 'Administrator permission required.');
      return;
    }

    if (!String(editForm.firstName || '').trim() || !String(editForm.lastName || '').trim()) {
      onToast('error', 'First and last name are required.');
      return;
    }

    setIsSavingUser(true);

    try {
      const payload = userUpdateFields.reduce<Partial<User>>((updates, field) => {
        if (Object.prototype.hasOwnProperty.call(editForm, field)) {
          updates[field] = editForm[field] as never;
        }

        return updates;
      }, {});
      await userService.update(editingUser.id, payload);
      if (editForm.role && editForm.role !== editingUser.role && currentUser) {
        await authService.updateRole(currentUser.id, editingUser.id, String(editForm.role));
      }
      const response = await userService.getById(editingUser.id);
      const updatedUser = response.data as User;
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === editingUser.id ? updatedUser : user)),
      );
      setSelectedUser(updatedUser);
      setEditingUser(null);
      setEditForm({});
      onToast('success', 'Profile saved\nThe user record has been updated.');
    } catch (err) {
      console.error(err);
      onToast('error', getErrorMessage(err, 'Failed to update user.'));
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser || !messageRecipient) {
      onToast('error', 'You must be signed in to send messages.');
      return;
    }

    if (!messageSubject.trim() || !messageBody.trim()) {
      onToast('error', 'Enter a subject and message.');
      return;
    }

    setIsSendingMessage(true);

    try {
      await messageService.send({
        senderAccountId: currentUser.id,
        recipientUserId: messageRecipient.id,
        subject: messageSubject,
        body: messageBody,
      });
      setMessageRecipient(null);
      setMessageSubject('');
      setMessageBody('');
      onToast('success', 'Message sent.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const addEmoji = (emojiData: EmojiClickData) => {
    setMessageBody((body) => `${body}${emojiData.emoji}`);
  };

  useEffect(() => {
    handleSearch(globalQuery);
  }, [globalQuery]);

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
            Array.from(new Set([...response.data, ...currentSuggestions])).slice(0, 100),
          );
        })
        .catch((err) => console.error('Failed to load address suggestions:', err));
    }, 300);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [addressLookupQuery]);

  useEffect(() => {
    const handleRealtimeUserUpdate = async (event: Event) => {
      let entityId = '';
      try {
        entityId = ((event as CustomEvent<{ entityId?: string }>).detail?.entityId || '').trim();
      } catch {
        entityId = '';
      }

      await handleSearch(currentQuery);

      if (selectedUser && (!entityId || entityId === selectedUser.id)) {
        userService.getById(selectedUser.id)
          .then((response) => setSelectedUser(response.data as User))
          .catch((err) => console.error('Failed to refresh selected user:', err));
      }

      if (editingUser && (!entityId || entityId === editingUser.id)) {
        userService.getById(editingUser.id)
          .then((response) => {
            const updatedUser = response.data as User;
            setEditingUser(updatedUser);
            setEditForm(updatedUser);
          })
          .catch((err) => console.error('Failed to refresh editing user:', err));
      }

      if (!entityId || supervisorOptions.some((user) => user.id === entityId)) {
        void loadUserEditOptions();
      }
    };

    window.addEventListener('shield:user-updated', handleRealtimeUserUpdate);
    window.addEventListener('shield:permission-updated', handleRealtimeUserUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleRealtimeUserUpdate);
      window.removeEventListener('shield:permission-updated', handleRealtimeUserUpdate);
    };
  }, [currentQuery, editingUser, selectedUser, supervisorOptions]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    let isMounted = true;

    userService.getById(selectedUserId)
      .then((response) => {
        if (isMounted) {
          setSelectedUser(response.data);
          focusProfileWindow();
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError('Failed to load selected user profile.');
        }
        console.error(err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedUserId]);

  return (
    <div>
      <h1 className="mb-8">Search Users</h1>
      
      {error && <div className="error">{error}</div>}
      
      <SearchBar
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        initialQuery={globalQuery}
        placeholder="Search by email, name, PE #, district, badge, radio, phone, or ID..."
      />

      <UserTable
        users={users}
        loading={loading}
        onUserSelect={openSelectedUser}
        onEdit={openEditUser}
        onDelete={handleDelete}
        canEdit={isAdministrator}
      />

      {selectedUser && (
        <div className="pointer-events-none fixed inset-0" style={{ zIndex: profileZIndex }}>
          <div
            ref={profileWindowRef}
            className={`pointer-events-auto fixed inset-0 h-[100dvh] w-full resize-none overflow-hidden rounded-none shadow-[0_30px_90px_rgba(15,23,42,0.42)] ring-1 ring-black/10 dark:ring-white/10 md:inset-auto md:h-[min(92dvh,780px)] md:min-h-[min(560px,calc(100dvh-1.5rem))] md:w-[min(920px,calc(100vw-1.5rem))] md:min-w-[min(420px,calc(100vw-1.5rem))] md:resize md:rounded-lg ${isProfileDragging ? 'md:cursor-grabbing' : ''}`}
            style={isMobileProfileLayout ? undefined : { left: profileWindowPosition.x, top: profileWindowPosition.y }}
            onMouseDownCapture={focusProfileWindow}
          >
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onEdit={openEditUser}
              onMessage={setMessageRecipient}
              onToast={onToast}
              canEdit={isAdministrator}
              onHeaderPointerDown={startDraggingProfile}
              isFloatingProfile
            />
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4">
          <form onSubmit={handleSaveUser} className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white shadow-xl dark:bg-gray-900 sm:max-h-[92vh] sm:max-w-5xl sm:rounded-lg">
            <div className="flex shrink-0 items-center justify-between gap-4 bg-primary-500 px-4 py-4 text-white sm:px-5">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold text-white sm:text-2xl">Edit User</h2>
                <p className="mt-1 text-sm text-blue-100">{editingUser.firstName} {editingUser.lastName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="icon-close-button border-white/20 bg-white/10 text-white hover:bg-white/20 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                aria-label="Close edit user modal"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <button
                type="button"
                onClick={updateProfilePicture}
                disabled={!canEditProfilePictures}
                className="mb-6 flex w-full flex-col items-center gap-3 rounded border border-gray-200 bg-gray-50 p-4 text-center hover:border-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 sm:flex-row sm:gap-4 sm:text-left"
              >
                {editForm.profilePictureUrl ? (
                  <img
                    src={getAssetUrl(String(editForm.profilePictureUrl))}
                    alt="Profile"
                    onError={handleAssetImageError}
                  className="h-20 w-20 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary-500 text-2xl font-bold text-white">
                    {String(editForm.firstName || 'U').slice(0, 1)}{String(editForm.lastName || '').slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="flex items-center justify-center gap-2 font-bold text-gray-800 dark:text-gray-100 sm:justify-start">
                    <Camera size={18} className="text-accent" />
                    Profile Picture
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isUploadingPicture ? 'Uploading picture...' : canEditProfilePictures ? 'Click to upload or change the profile picture.' : 'Profile photo permission required.'}
                  </p>
                </div>
              </button>
              <input
                ref={profilePictureInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePictureUpload}
                className="hidden"
              />
              {editForm.profilePictureUrl && (
                <button
                  type="button"
                  onClick={removeProfilePicture}
                  className="btn-danger mb-6"
                  disabled={isUploadingPicture}
                >
                  Remove Profile Picture
                </button>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</span>
                  <input value={String(editForm.firstName || '')} onChange={(event) => updateEditField('firstName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</span>
                  <input value={String(editForm.lastName || '')} onChange={(event) => updateEditField('lastName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Email</span>
                  <input value={String(editForm.email || '')} onChange={(event) => updateEditField('email', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">PE Number</span>
                  <input value={String(editForm.peNumber || '')} onChange={(event) => updateEditField('peNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">PeopleSoft ID</span>
                  <input value={String(editForm.peopleSoftId || '')} onChange={(event) => updateEditField('peopleSoftId', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Employee Type</span>
                  <select value={String(editForm.employmentType || '')} onChange={(event) => updateEditField('employmentType', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    {['Civilian', 'Police', 'Recruit', 'MC Inspector', 'Inactive', 'Other', 'CPS'].map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
                  <select value={String(editForm.status || '')} onChange={(event) => updateEditField('status', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    {['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Administrative Duty', 'Inactive'].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4 rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                  <span>
                    <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Account active</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Turn off to lock login access without deleting the user.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={editForm.isActive !== false}
                    onChange={(event) => updateEditField('isActive', event.target.checked)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Role</span>
                  <select value={String(editForm.role || 'user')} onChange={(event) => updateEditField('role', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    {(roleOptions.length > 0 ? roleOptions : [{ id: 'role-user', name: 'user', permissions: [], createdAt: '', updatedAt: '' }, { id: 'role-administrator', name: 'administrator', permissions: [], createdAt: '', updatedAt: '' }]).map((role) => (
                      <option key={role.id} value={role.name}>{role.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District</span>
                  <select value={String(editForm.district || '')} onChange={(event) => updateEditField('district', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    <option value="">Select</option>
                    {districtOptions.map((district) => <option key={district}>{district}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Rank</span>
                  <select value={String(editForm.rank || '')} onChange={(event) => updateEditField('rank', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    {rankOptions.map((rank) => <option key={rank || 'none'} value={rank}>{rank || 'Select'}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Badge Number</span>
                  <input value={String(editForm.badgeNumber || '')} onChange={(event) => updateEditField('badgeNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Radio Number</span>
                  <input value={String(editForm.radioNumber || '')} onChange={(event) => updateEditField('radioNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Personal Phone</span>
                  <input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={String(editForm.personalPhoneNumber || '')} onChange={(event) => updateEditField('personalPhoneNumber', formatPhoneNumber(event.target.value))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Department Phone</span>
                  <input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={String(editForm.departmentPhoneNumber || '')} onChange={(event) => updateEditField('departmentPhoneNumber', formatPhoneNumber(event.target.value))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Sex</span>
                  <select value={String(editForm.sex || '')} onChange={(event) => updateEditField('sex', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    {['', 'Male', 'Female'].map((option) => <option key={option} value={option}>{option || 'Select'}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Marital Status</span>
                  <select value={String(editForm.maritalStatus || '')} onChange={(event) => updateEditField('maritalStatus', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    {['', 'Single', 'Married', 'Divorced', 'Widowed'].map((option) => <option key={option} value={option}>{option || 'Select'}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Supervisor</span>
                  <select value={String(editForm.supervisor || '')} onChange={(event) => updateEditField('supervisor', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                    <option value="">Select</option>
                    {supervisorOptions.map((supervisor) => {
                      const supervisorName = `${supervisor.firstName || ''} ${supervisor.lastName || ''}`.trim() || supervisor.email || supervisor.id;
                      return (
                        <option key={supervisor.id} value={supervisorName}>
                          {supervisorName}{supervisor.rank ? ` - ${supervisor.rank}` : ''}{supervisor.district ? ` (${supervisor.district})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="block md:col-span-2 xl:col-span-3">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Residential Address</span>
                  <input value={String(editForm.residentialAddress || '')} onChange={(event) => updateAddressField('residentialAddress', event.target.value)} autoComplete="street-address" list="shield-edit-addresses" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block md:col-span-2 xl:col-span-3">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Mailing Address</span>
                  <input value={String(editForm.mailingAddress || '')} onChange={(event) => updateAddressField('mailingAddress', event.target.value)} autoComplete="street-address" list="shield-edit-addresses" className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Contact Name</span>
                  <input value={String(editForm.emergencyContactName || '')} onChange={(event) => updateEditField('emergencyContactName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Contact Relationship</span>
                  <input value={String(editForm.emergencyContactRelationship || '')} onChange={(event) => updateEditField('emergencyContactRelationship', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Emergency Contact Phone</span>
                  <input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={String(editForm.emergencyContactPhone || '')} onChange={(event) => updateEditField('emergencyContactPhone', formatPhoneNumber(event.target.value))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
              </div>
              <datalist id="shield-edit-addresses">
                {addressSuggestions.map((address) => <option key={address} value={address} />)}
              </datalist>
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-5">
              <button type="submit" className="btn-primary" disabled={isSavingUser} aria-label="Save user" title={isSavingUser ? 'Saving' : 'Save User'}>
                <Save size={16} />
              </button>
              <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary" aria-label="Cancel edit user" title="Cancel">
                <X size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      {messageRecipient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleSendMessage} className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2>Send Message</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  To {messageRecipient.firstName} {messageRecipient.lastName}
                </p>
              </div>
              <button type="button" onClick={() => setMessageRecipient(null)} className="icon-close-button" aria-label="Close message modal" title="Close">
                <X size={20} />
              </button>
            </div>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Subject</span>
              <input
                value={messageSubject}
                onChange={(event) => setMessageSubject(event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Message</span>
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                className="min-h-40 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
            <div className="relative mb-4">
              <button type="button" onClick={() => setIsEmojiPickerOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700" aria-label="Add emoji">
                🙂
              </button>
              {isEmojiPickerOpen && (
                <div className="absolute z-20 mt-2">
                  <EmojiPicker onEmojiClick={addEmoji} />
                </div>
              )}
            </div>
            <button type="submit" className="btn-primary" disabled={isSendingMessage} aria-label="Send message" title={isSendingMessage ? 'Sending' : 'Send Message'}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
