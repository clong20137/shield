import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { lazy, Suspense } from 'react';
import { Download, Image, KeyRound, MessageSquare, Save, Send, Users, X } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { useSearchParams } from 'react-router-dom';
import { AuthAccount, AuthRole, authService, getAssetUrl, handleAssetImageError, MediaLibraryItem, messageService, userService, User, UserFilters } from '../services/api';
import { SearchBar } from '../components/SearchBar';
import { UserTable } from '../components/UserTable';
import { UserDetail } from '../components/UserDetail';
import { FloatingWindow } from '../components/FloatingWindow';
import { ProfilePictureMediaPicker } from '../components/ProfilePictureMediaPicker';
import { rankOptions } from '../constants/ranks';
import { districtOptions } from '../constants/districts';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface SearchPageProps {
  currentUser: AuthAccount | null;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

type BulkActionMode = 'message' | 'update' | null;

interface BulkUpdateForm {
  rank: string;
  district: string;
  status: string;
  isActive: string;
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
  'isHidden',
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

const defaultBulkUpdateForm: BulkUpdateForm = {
  rank: '',
  district: '',
  status: '',
  isActive: '',
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function csvCell(value: unknown): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replace(/"/gu, '""')}"`;
}

function downloadUsersCsv(users: User[]) {
  const headers = [
    'Last Name',
    'First Name',
    'Email',
    'PE Number',
    'PeopleSoft ID',
    'Rank',
    'District',
    'Status',
    'Employment Type',
    'Department Phone',
    'Personal Phone',
  ];
  const rows = users.map((user) => [
    user.lastName,
    user.firstName,
    user.email,
    user.peNumber,
    user.peopleSoftId,
    user.rank,
    user.district,
    user.status,
    user.employmentType,
    user.departmentPhoneNumber,
    user.personalPhoneNumber,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shield-selected-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [profileZIndex, setProfileZIndex] = useState(85);
  const [editProfileZIndex, setEditProfileZIndex] = useState(86);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentFilters, setCurrentFilters] = useState<UserFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<User | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [bulkActionMode, setBulkActionMode] = useState<BulkActionMode>(null);
  const [bulkMessageSubject, setBulkMessageSubject] = useState('');
  const [bulkMessageBody, setBulkMessageBody] = useState('');
  const [bulkUpdateForm, setBulkUpdateForm] = useState<BulkUpdateForm>(defaultBulkUpdateForm);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [supervisorOptions, setSupervisorOptions] = useState<User[]>([]);
  const [roleOptions, setRoleOptions] = useState<AuthRole[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [isProfileMediaPickerOpen, setIsProfileMediaPickerOpen] = useState(false);
  const searchRequestRef = useRef(0);
  const [addressLookupQuery, setAddressLookupQuery] = useState('');
  const [searchParams] = useSearchParams();
  const globalQuery = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const selectedUserId = useMemo(() => searchParams.get('userId') ?? '', [searchParams]);
  const shouldEditSelectedUser = useMemo(() => searchParams.get('edit') === '1', [searchParams]);
  const isAdministrator = currentUser?.role === 'administrator';
  const canEditProfilePictures = isAdministrator || currentUser?.permissions?.includes('users:profile-picture');
  const canViewHiddenUsers = isAdministrator || currentUser?.permissions?.includes('users:view-hidden');
  const searchCheckboxClassName =
    'h-4 w-4 rounded border border-gray-300 bg-white text-accent accent-accent focus:ring-accent focus:ring-2 dark:border-gray-700 dark:bg-gray-900';
  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [selectedUserIds, users],
  );
  const eligibleBulkMessageCount = useMemo(
    () => selectedUsers.filter((user) => user.id !== currentUser?.id && user.receivesMessages !== false).length,
    [currentUser?.id, selectedUsers],
  );
  const pageStart = users.length === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const pageEnd = users.length === 0 ? 0 : pageStart + users.length - 1;

  useEffect(() => {
    const handleFloatingFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ app?: string }>).detail;
      setProfileZIndex(detail?.app === 'profile' ? 85 : 58);
      setEditProfileZIndex(detail?.app === 'editProfile' ? 86 : 59);
    };

    window.addEventListener('shield:floating-focus', handleFloatingFocus);
    return () => window.removeEventListener('shield:floating-focus', handleFloatingFocus);
  }, []);

  useEffect(() => {
    const currentUserIds = new Set(users.map((user) => user.id));
    setSelectedUserIds((currentIds) => currentIds.filter((userId) => currentUserIds.has(userId)));
  }, [users]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      if (editingUser) {
        event.preventDefault();
        setEditingUser(null);
        return;
      }

      if (bulkActionMode) {
        event.preventDefault();
        closeBulkAction();
        return;
      }

      if (selectedUser) {
        event.preventDefault();
        setSelectedUser(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [bulkActionMode, editingUser, selectedUser]);

  const loadUsersPage = async (query: string, filters: UserFilters = currentFilters, nextPage = 1, nextPageSize = pageSize) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setCurrentQuery(query);
    setCurrentFilters(filters);
    setPage(nextPage);
    setPageSize(nextPageSize);
    setLoading(true);
    setError(null);
    try {
      const response = await userService.searchPaged(query, filters, nextPage, nextPageSize);
      if (requestId !== searchRequestRef.current) return;
      setUsers(response.data.data);
      setHasMoreUsers(Boolean(response.data.hasMore));
    } catch (err) {
      setError('Failed to search users. Please try again.');
      console.error(err);
    } finally {
      if (requestId === searchRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSearch = async (query: string) => {
    await loadUsersPage(query, currentFilters, 1, pageSize);
  };

  const handleFilterChange = async (filters: UserFilters) => {
    await loadUsersPage(currentQuery, filters, 1, pageSize);
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

    setEditProfileZIndex(86);
    window.dispatchEvent(new CustomEvent('shield:floating-focus', { detail: { app: 'editProfile' } }));
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

  const focusEditProfileWindow = () => {
    setEditProfileZIndex(86);
    window.dispatchEvent(new CustomEvent('shield:floating-focus', { detail: { app: 'editProfile' } }));
  };

  const updateProfilePicture = () => {
    if (!canEditProfilePictures) {
      onToast('error', 'Profile photo permission required.');
      return;
    }

    setIsProfileMediaPickerOpen(true);
  };

  const selectProfilePictureFromMedia = async (item: MediaLibraryItem) => {
    if (!editingUser) {
      return;
    }

    if (!canEditProfilePictures) {
      onToast('error', 'Profile photo permission required.');
      return;
    }

    setIsUploadingPicture(true);
    try {
      const response = await userService.setProfilePicture(editingUser.id, item.url);
      const updatedUser = response.data.user;
      setEditForm(updatedUser);
      setEditingUser(updatedUser);
      setSelectedUser(updatedUser);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      setIsProfileMediaPickerOpen(false);
      onToast('success', 'Profile picture updated.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to update profile picture.');
    } finally {
      setIsUploadingPicture(false);
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

  const handleAdminPasswordReset = async () => {
    if (!editingUser || !isAdministrator) {
      onToast('error', 'Administrator permission required.');
      return;
    }

    if (editingUser.id === currentUser?.id) {
      onToast('error', 'Use Account Settings to change your own password.');
      return;
    }

    const confirmed = window.confirm(`Reset ${editingUser.firstName} ${editingUser.lastName}'s password to ISP08isp! and require a password change on next sign-in?`);
    if (!confirmed) {
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await authService.adminResetPassword(editingUser.id);
      onToast('success', `Password reset\nTemporary password: ${response.data.temporaryPassword}`);
    } catch (err) {
      console.error(err);
      onToast('error', getErrorMessage(err, 'Failed to reset password.'));
    } finally {
      setIsResettingPassword(false);
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

  const closeBulkAction = () => {
    setBulkActionMode(null);
    setBulkMessageSubject('');
    setBulkMessageBody('');
    setBulkUpdateForm(defaultBulkUpdateForm);
    setIsBulkProcessing(false);
  };

  const exportSelectedUsers = () => {
    if (selectedUsers.length === 0) {
      onToast('error', 'Select at least one user first.');
      return;
    }

    downloadUsersCsv(selectedUsers);
    onToast('success', `Exported ${selectedUsers.length} selected user${selectedUsers.length === 1 ? '' : 's'}.`);
  };

  const handleBulkMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser) {
      onToast('error', 'You must be signed in to send messages.');
      return;
    }

    if (!bulkMessageSubject.trim() || !bulkMessageBody.trim()) {
      onToast('error', 'Enter a subject and message.');
      return;
    }

    const recipients = selectedUsers.filter((user) => user.id !== currentUser.id && user.receivesMessages !== false);

    if (recipients.length === 0) {
      onToast('error', 'No selected users can receive messages.');
      return;
    }

    setIsBulkProcessing(true);

    try {
      await Promise.all(
        recipients.map((recipient) =>
          messageService.send({
            senderAccountId: currentUser.id,
            recipientUserId: recipient.id,
            subject: bulkMessageSubject,
            body: bulkMessageBody,
          }),
        ),
      );
      onToast('success', `Message sent to ${recipients.length} user${recipients.length === 1 ? '' : 's'}.`);
      closeBulkAction();
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to send bulk message.');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAdministrator) {
      onToast('error', 'Administrator permission required.');
      return;
    }

    const updates: Partial<User> = {};

    if (bulkUpdateForm.rank) {
      updates.rank = bulkUpdateForm.rank;
    }

    if (bulkUpdateForm.district) {
      updates.district = bulkUpdateForm.district;
    }

    if (bulkUpdateForm.status) {
      updates.status = bulkUpdateForm.status;
    }

    if (bulkUpdateForm.isActive) {
      updates.isActive = bulkUpdateForm.isActive === 'true';
    }

    if (Object.keys(updates).length === 0) {
      onToast('error', 'Choose at least one field to update.');
      return;
    }

    setIsBulkProcessing(true);

    try {
      await Promise.all(selectedUsers.map((user) => userService.update(user.id, updates)));
      const refreshedUsers = await Promise.all(selectedUsers.map((user) => userService.getById(user.id)));
      const updatedUsers = refreshedUsers.map((response) => response.data as User);
      const updatedUserMap = new Map(updatedUsers.map((user) => [user.id, user]));
      setUsers((currentUsers) =>
        currentUsers.map((user) => updatedUserMap.get(user.id) || user),
      );

      if (selectedUser && updatedUserMap.has(selectedUser.id)) {
        setSelectedUser(updatedUserMap.get(selectedUser.id) || selectedUser);
      }

      onToast('success', `Updated ${updatedUsers.length} user${updatedUsers.length === 1 ? '' : 's'}.`);
      closeBulkAction();
    } catch (err) {
      console.error(err);
      onToast('error', getErrorMessage(err, 'Failed to update selected users.'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const openMessageThread = (user: User) => {
    window.dispatchEvent(new CustomEvent('shield:open-message-thread', { detail: user }));
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
          const loadedUser = response.data as User;
          if (shouldEditSelectedUser) {
            setSelectedUser(null);
            openEditUser(loadedUser);
          } else {
            setSelectedUser(loadedUser);
            focusProfileWindow();
          }
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
  }, [selectedUserId, shouldEditSelectedUser]);

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

      {selectedUsers.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-primary-500 dark:text-blue-100">
              {selectedUsers.length} selected
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bulk actions apply to the currently selected search results.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportSelectedUsers} className="btn-secondary" aria-label="Export selected users" title="Export selected users">
              <Download size={16} />
              <span>CSV</span>
            </button>
            <button type="button" onClick={() => setBulkActionMode('message')} className="btn-primary" aria-label="Message selected users" title="Message selected users">
              <MessageSquare size={16} />
              <span>Message</span>
            </button>
            {isAdministrator && (
              <button type="button" onClick={() => setBulkActionMode('update')} className="btn-primary" aria-label="Bulk update selected users" title="Bulk update selected users">
                <Users size={16} />
                <span>Update</span>
              </button>
            )}
            <button type="button" onClick={() => setSelectedUserIds([])} className="btn-secondary" aria-label="Clear selected users" title="Clear selected users">
              <X size={16} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}

      {users.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
          <span className="text-gray-500 dark:text-gray-400">Showing {pageStart}-{pageEnd}{hasMoreUsers ? '+' : ''}</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => void loadUsersPage(currentQuery, currentFilters, 1, Number(event.target.value))}
              className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
              aria-label="Users per page"
            >
              {[25, 50, 100, 250].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button type="button" onClick={() => void loadUsersPage(currentQuery, currentFilters, Math.max(1, page - 1), pageSize)} disabled={page <= 1 || loading} className="btn-secondary px-2 py-1 text-xs" aria-label="Previous user page" title="Previous">
              Previous
            </button>
            <span className="font-semibold text-gray-700 dark:text-gray-200">Page {page}</span>
            <button type="button" onClick={() => void loadUsersPage(currentQuery, currentFilters, page + 1, pageSize)} disabled={!hasMoreUsers || loading} className="btn-secondary px-2 py-1 text-xs" aria-label="Next user page" title="Next">
              Next
            </button>
          </div>
        </div>
      )}

      <UserTable
        users={users}
        loading={loading}
        onUserSelect={openSelectedUser}
        onEdit={openEditUser}
        onDelete={handleDelete}
        canEdit={isAdministrator}
        selectedUserIds={selectedUserIds}
        onSelectionChange={setSelectedUserIds}
      />

      {bulkActionMode === 'message' && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={handleBulkMessage} className="w-full max-w-2xl rounded-lg bg-white shadow-2xl ring-1 ring-black/10 dark:bg-gray-900 dark:ring-white/10">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Message Selected Users</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Sending to {eligibleBulkMessageCount} eligible user{eligibleBulkMessageCount === 1 ? '' : 's'}.
                </p>
              </div>
              <button type="button" onClick={closeBulkAction} className="icon-close-button" aria-label="Close bulk message" title="Close">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Subject</span>
                <input
                  value={bulkMessageSubject}
                  onChange={(event) => setBulkMessageSubject(event.target.value)}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Message</span>
                <textarea
                  value={bulkMessageBody}
                  onChange={(event) => setBulkMessageBody(event.target.value)}
                  className="min-h-44 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button type="button" onClick={closeBulkAction} className="btn-secondary" disabled={isBulkProcessing}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isBulkProcessing}>
                <Send size={16} />
                <span>{isBulkProcessing ? 'Sending' : 'Send'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {bulkActionMode === 'update' && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={handleBulkUpdate} className="w-full max-w-3xl rounded-lg bg-white shadow-2xl ring-1 ring-black/10 dark:bg-gray-900 dark:ring-white/10">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bulk Update Users</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Leave fields blank to keep existing values.
                </p>
              </div>
              <button type="button" onClick={closeBulkAction} className="icon-close-button" aria-label="Close bulk update" title="Close">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Rank</span>
                <select
                  value={bulkUpdateForm.rank}
                  onChange={(event) => setBulkUpdateForm((form) => ({ ...form, rank: event.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="">No change</option>
                  {rankOptions.filter(Boolean).map((rank) => <option key={rank} value={rank}>{rank}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District</span>
                <select
                  value={bulkUpdateForm.district}
                  onChange={(event) => setBulkUpdateForm((form) => ({ ...form, district: event.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="">No change</option>
                  {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
                <select
                  value={bulkUpdateForm.status}
                  onChange={(event) => setBulkUpdateForm((form) => ({ ...form, status: event.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="">No change</option>
                  {['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', 'Administrative Duty', 'Inactive'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Login Access</span>
                <select
                  value={bulkUpdateForm.isActive}
                  onChange={(event) => setBulkUpdateForm((form) => ({ ...form, isActive: event.target.value }))}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="">No change</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button type="button" onClick={closeBulkAction} className="btn-secondary" disabled={isBulkProcessing}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isBulkProcessing}>
                <Save size={16} />
                <span>{isBulkProcessing ? 'Updating' : 'Apply Update'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedUser && (
        <FloatingWindow
          className="pointer-events-auto fixed inset-0 h-[100dvh] w-full resize-none overflow-hidden rounded-none shadow-[0_30px_90px_rgba(15,23,42,0.42)] ring-1 ring-black/10 dark:ring-white/10 md:inset-auto md:h-[min(92dvh,780px)] md:min-h-[min(560px,calc(100dvh-1.5rem))] md:w-[min(920px,calc(100vw-1.5rem))] md:min-w-[min(420px,calc(100vw-1.5rem))] md:resize md:rounded-lg"
          fallbackSize={{ width: Math.min(window.innerWidth - 24, 920), height: Math.min(window.innerHeight - 24, 760) }}
          initialPosition={getInitialProfileWindowPosition}
          onFocus={focusProfileWindow}
          zIndex={profileZIndex}
        >
          {({ dragHandleProps }) => (
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onEdit={openEditUser}
              onMessage={openMessageThread}
              onToast={onToast}
              canEdit={isAdministrator}
              currentUser={currentUser}
              onHeaderPointerDown={dragHandleProps.onPointerDown}
              isFloatingProfile
            />
          )}
        </FloatingWindow>
      )}

      {editingUser && (
        <FloatingWindow
          className="pointer-events-auto fixed inset-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-full min-w-0 max-w-none resize-none flex-col overflow-hidden rounded-none bg-white shadow-2xl dark:bg-gray-900 md:inset-auto md:h-[min(92dvh,820px)] md:max-h-[calc(100dvh-1rem)] md:min-h-[min(520px,calc(100dvh-1rem))] md:w-[min(1040px,calc(100vw-1rem))] md:min-w-[min(440px,calc(100vw-1rem))] md:max-w-[calc(100vw-1rem)] md:resize md:rounded-lg"
          fallbackSize={{ width: Math.min(window.innerWidth - 16, 1040), height: Math.min(window.innerHeight - 16, 820) }}
          initialPosition={getInitialProfileWindowPosition}
          zIndex={editProfileZIndex}
          onFocus={focusEditProfileWindow}
        >
          {({ dragHandleProps, isDragging }) => (
          <form onSubmit={handleSaveUser} className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none bg-white dark:bg-gray-900 md:rounded-lg">
            <ProfilePictureMediaPicker
              isOpen={isProfileMediaPickerOpen}
              isSaving={isUploadingPicture}
              onClose={() => setIsProfileMediaPickerOpen(false)}
              onSelect={selectProfilePictureFromMedia}
              onError={(message) => onToast('error', message)}
              getErrorMessage={getErrorMessage}
            />
            <div
              {...dragHandleProps}
              className={`flex shrink-0 select-none items-center justify-between gap-4 bg-primary-500 px-4 py-4 text-white sm:px-5 md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
            >
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
              <div className={`mb-6 flex w-full flex-col items-center gap-3 rounded border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-800 dark:bg-gray-950 sm:flex-row sm:gap-4 sm:text-left ${canEditProfilePictures ? 'hover:border-accent' : 'opacity-60'}`}>
                <button
                  type="button"
                  onClick={updateProfilePicture}
                  disabled={isUploadingPicture || !canEditProfilePictures}
                  className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-white text-accent transition hover:border-accent focus:border-accent disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900"
                  aria-label="Choose profile picture from media library"
                  title={canEditProfilePictures ? 'Choose Profile Picture' : 'Profile photo permission required'}
                >
                  {editForm.profilePictureUrl ? (
                    <img
                      src={getAssetUrl(String(editForm.profilePictureUrl))}
                      alt="Profile"
                      onError={handleAssetImageError}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-primary-500 text-2xl font-bold text-white">
                      {String(editForm.firstName || 'U').slice(0, 1)}{String(editForm.lastName || '').slice(0, 1)}
                    </span>
                  )}
                  {canEditProfilePictures && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                      <Image size={22} />
                    </span>
                  )}
                </button>
                <div className="min-w-0">
                  <p className="flex items-center justify-center gap-2 font-bold text-gray-800 dark:text-gray-100 sm:justify-start">
                    <Image size={18} className="text-accent" />
                    Profile Picture
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isUploadingPicture ? 'Updating picture...' : canEditProfilePictures ? 'Click to choose from the media library.' : 'Profile photo permission required.'}
                  </p>
                </div>
              </div>
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
                    {['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', 'Administrative Duty', 'Inactive'].map((status) => <option key={status}>{status}</option>)}
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
                    className={searchCheckboxClassName}
                  />
                </label>
                {canViewHiddenUsers && (
                  <label className="flex items-center justify-between gap-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
                    <span>
                      <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Hidden profile</span>
                      <span className="mt-1 block text-xs text-gray-600 dark:text-gray-300">Hide from search, profile lookup, mentions, and pinned profiles unless the viewer has hidden-user permission.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={editForm.isHidden === true}
                      onChange={(event) => updateEditField('isHidden', event.target.checked)}
                      className={searchCheckboxClassName}
                    />
                  </label>
                )}
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

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-5">
              <button
                type="button"
                onClick={handleAdminPasswordReset}
                className="btn-secondary"
                disabled={isResettingPassword || editingUser.id === currentUser?.id}
                aria-label="Reset user password"
                title={editingUser.id === currentUser?.id ? 'Use Account Settings for your password' : isResettingPassword ? 'Resetting Password' : 'Reset Password'}
              >
                <KeyRound size={16} />
                <span>{isResettingPassword ? 'Resetting...' : 'Reset Password'}</span>
              </button>
              <button type="submit" className="btn-primary" disabled={isSavingUser} aria-label="Save user" title={isSavingUser ? 'Saving' : 'Save User'}>
                <Save size={16} />
                <span>Save</span>
              </button>
            </div>
          </form>
          )}
        </FloatingWindow>
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
                  <Suspense fallback={<div className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">Loading...</div>}>
                    <EmojiPicker onEmojiClick={addEmoji} />
                  </Suspense>
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
