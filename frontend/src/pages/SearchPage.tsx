import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Smile, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AuthAccount, messageService, userService, User, UserFilters } from '../services/api';
import { SearchBar } from '../components/SearchBar';
import { UserTable } from '../components/UserTable';
import { UserDetail } from '../components/UserDetail';

interface SearchPageProps {
  currentUser: AuthAccount | null;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const SearchPage: React.FC<SearchPageProps> = ({ currentUser, onToast }) => {
  const emojiOptions = ['👍', '✅', '📌', '🚔', '📞', '🙏', '⚠️', '🎉'];
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [messageRecipient, setMessageRecipient] = useState<User | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [isSavingUser, setIsSavingUser] = useState(false);
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
    const pictureUrl = window.prompt('Enter a profile picture URL', String(editForm.profilePictureUrl || ''));

    if (pictureUrl === null) {
      return;
    }

    updateEditField('profilePictureUrl', pictureUrl.trim());
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
                className="flex h-10 w-10 items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-white/20"
                aria-label="Close edit user modal"
              >
                <X size={22} />
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
                    Click to add or change the profile picture URL.
                  </p>
                </div>
              </button>

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
                  <input value={String(editForm.personalPhoneNumber || '')} onChange={(event) => updateEditField('personalPhoneNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Department Phone</span>
                  <input value={String(editForm.departmentPhoneNumber || '')} onChange={(event) => updateEditField('departmentPhoneNumber', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Sex</span>
                  <input value={String(editForm.sex || '')} onChange={(event) => updateEditField('sex', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Marital Status</span>
                  <input value={String(editForm.maritalStatus || '')} onChange={(event) => updateEditField('maritalStatus', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
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
              <button type="submit" className="btn-primary" disabled={isSavingUser}>
                {isSavingUser ? 'Saving...' : 'Save User'}
              </button>
              <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">
                Cancel
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
              <button type="button" onClick={() => setMessageRecipient(null)} className="btn-secondary">
                Close
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 dark:text-gray-400"><Smile size={16} /> Emoji</span>
              {emojiOptions.map((emoji) => (
                <button key={emoji} type="button" onClick={() => setMessageBody((body) => `${body}${emoji}`)} className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  {emoji}
                </button>
              ))}
            </div>
            <button type="submit" className="btn-primary" disabled={isSendingMessage}>
              {isSendingMessage ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
