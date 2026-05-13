import React from 'react';
import { UserFilters } from '../services/api';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onFilterChange?: (filters: UserFilters) => void;
  placeholder?: string;
  initialQuery?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onFilterChange,
  placeholder = 'Search by name, PE #, Badge #, or ID...',
  initialQuery = '',
}) => {
  const [query, setQuery] = React.useState(initialQuery);
  const [showFilters, setShowFilters] = React.useState(false);
  const [filters, setFilters] = React.useState({
    rank: '',
    district: '',
    active: '',
    employmentType: '',
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleFilterChange = (field: keyof UserFilters, value: string) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-8 dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 border-2 border-gray-300 rounded focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
        <button type="submit" className="btn-primary">
          Search
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters
        </button>
      </form>

      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-300 dark:border-gray-700">
          <select
            value={filters.rank}
            onChange={(e) => handleFilterChange('rank', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Ranks</option>
            <option value="Officer">Officer</option>
            <option value="Detective">Detective</option>
            <option value="Sergeant">Sergeant</option>
            <option value="Lieutenant">Lieutenant</option>
            <option value="Captain">Captain</option>
          </select>

          <select
            value={filters.district}
            onChange={(e) => handleFilterChange('district', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Districts</option>
            <option value="District 1">District 1</option>
            <option value="District 2">District 2</option>
            <option value="District 3">District 3</option>
            <option value="District 4">District 4</option>
            <option value="District 5">District 5</option>
          </select>

          <select
            value={filters.active}
            onChange={(e) => handleFilterChange('active', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <select
            value={filters.employmentType}
            onChange={(e) => handleFilterChange('employmentType', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Employment Types</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
          </select>
        </div>
      )}
    </div>
  );
};
