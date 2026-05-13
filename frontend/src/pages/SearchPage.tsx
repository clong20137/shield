import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { userService, User, UserFilters } from '../services/api';
import { SearchBar } from '../components/SearchBar';
import { UserTable } from '../components/UserTable';
import { UserDetail } from '../components/UserDetail';

const SearchPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [searchParams] = useSearchParams();
  const globalQuery = useMemo(() => searchParams.get('q') ?? '', [searchParams]);

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

  useEffect(() => {
    handleSearch(globalQuery);
  }, [globalQuery]);

  return (
    <div>
      <h1 className="mb-8">Search Users</h1>
      
      {error && <div className="error">{error}</div>}
      
      <SearchBar
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        initialQuery={globalQuery}
        placeholder="Search by name, PE #, Badge #, or ID..."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <UserTable
            users={users}
            loading={loading}
            onUserSelect={setSelectedUser}
            onDelete={handleDelete}
          />
        </div>

        {selectedUser && (
          <div>
            <UserDetail
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
