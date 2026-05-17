import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Save, Send, X } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useSearchParams } from 'react-router-dom';
import { AuthAccount, messageService, userService, User, UserFilters } from '../services/api';
import { SearchBar } from '../components/SearchBar';
import { UserTable } from '../components/UserTable';
import { UserDetail } from '../components/UserDetail';

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

const SearchPage: React.FC<SearchPageProps> = ({ currentUser, onToast }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [messageRecipient, setMessageRecipient] = useState<User | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const [searchParams] = useSearchParams();
  const globalQuery = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const selectedUserId = useMemo(() => searchParams.get('userId') ?? '', [searchParams]);
  const isAdministrator = currentUser?.role === 'administrator';

  const handleSearch = async (query: string) => {
    setCurrentQuery(query);
    setLoading(true);
    setError(null);
    try {
      if (!query.trim()) {
        const response = await userService.getAll(1, 100);
        setUsers(response.data.data);
      } else {
        const response = await userService.search(query);
        setUsers(response.data);
      }
    } catch (err) {
      setError('Failed to search users. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
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

  const openEditUser = (user: User) => {
    if (!isAdministrator) {
      onToast('error', 'Administrator permission required.');
      return;
    }

    setEditingUser(user);
    setEditForm(user);
  };

  const updateEditField = (field: keyof User, value: string | boolean) => {
    setEditForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const updateProfilePicture = () => {
    profilePictureInputRef.current?.click();
  };

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !editingUser) {
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
      await userService.update(editingUser.id, editForm);
      const updatedUser = { ...editingUser, ...editForm } as User;
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === editingUser.id ? updatedUser : user)),
      );
      setSelectedUser(updatedUser);
      setEditingUser(null);
      setEditForm({});
      onToast('success', 'User updated.');
    } catch (err) {
      console.error(err);
      onToast('error', 'Failed to update user.');
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
    if (!selectedUserId) {
      return;
    }

    let isMounted = true;

    userService.getById(selectedUserId)
      .then((response) => {
        if (isMounted) {
          setSelectedUser(response.data);
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
        onUserSelect={setSelectedUser}
        onEdit={openEditUser}
        onDelete={handleDelete}
        canEdit={isAdministrator}
      />

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl">
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onEdit={openEditUser}
              onMessage={setMessageRecipient}
              canEdit={isAdministrator}
            />
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleSaveUser} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between gap-4 bg-primary-500 px-5 py-4 text-white">
              <div>
                <h2 className="text-2xl font-bold text-white">Edit User</h2>
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

            <div className="p-5">
              <button
                type="button"
                onClick={updateProfilePicture}
                className="mb-6 flex items-center gap-4 rounded border border-gray-200 bg-gray-50 p-4 text-left hover:border-accent dark:border-gray-800 dark:bg-gray-950"
              >
                {editForm.profilePictureUrl ? (
                  <img
                    src={String(editForm.profilePictureUrl)}
                    alt="Profile"
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-500 text-2xl font-bold text-white">
                    {String(editForm.firstName || 'U').slice(0, 1)}{String(editForm.lastName || '').slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-100">
                    <Camera size={18} className="text-accent" />
                    Profile Picture
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isUploadingPicture ? 'Uploading picture...' : 'Click to upload or change the profile picture.'}
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
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District</span>
                  <input value={String(editForm.district || '')} onChange={(event) => updateEditField('district', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
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
                  <input value={String(editForm.supervisor || '')} onChange={(event) => updateEditField('supervisor', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block md:col-span-2 xl:col-span-3">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Residential Address</span>
                  <textarea value={String(editForm.residentialAddress || '')} onChange={(event) => updateEditField('residentialAddress', event.target.value)} className="min-h-20 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block md:col-span-2 xl:col-span-3">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Mailing Address</span>
                  <textarea value={String(editForm.mailingAddress || '')} onChange={(event) => updateEditField('mailingAddress', event.target.value)} className="min-h-20 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
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
