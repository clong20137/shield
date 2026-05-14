import React, { useEffect, useMemo, useState } from 'react';
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [messageRecipient, setMessageRecipient] = useState<User | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [searchParams] = useSearchParams();
  const globalQuery = useMemo(() => searchParams.get('q') ?? '', [searchParams]);
  const selectedUserId = useMemo(() => searchParams.get('userId') ?? '', [searchParams]);

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
    try {
      await userService.delete(userId);
      setUsers(users.filter(u => u.id !== userId));
      setSelectedUser(null);
    } catch (err) {
      setError('Failed to delete user. Please try again.');
      console.error(err);
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
        onDelete={handleDelete}
      />

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl">
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onMessage={setMessageRecipient}
            />
          </div>
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
