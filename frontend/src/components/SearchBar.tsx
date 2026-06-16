import React from 'react';
import { SlidersHorizontal, Search } from 'lucide-react';
import { UserFilters } from '../services/api';
import { rankOptions } from '../constants/ranks';
import { districtOptions } from '../constants/districts';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onFilterChange?: (filters: UserFilters) => void;
  placeholder?: string;
  initialQuery?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onFilterChange,
  placeholder = 'Search by name, district, PE #, Badge #, or ID...',
  initialQuery = '',
}) => {
  const employmentTypes = ['Civilian', 'Police', 'Recruit', 'MC Inspector', 'Inactive', 'Other', 'CPS'];
  const [query, setQuery] = React.useState(initialQuery);
  const onSearchRef = React.useRef(onSearch);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [showFilters, setShowFilters] = React.useState(false);
  const [filters, setFilters] = React.useState({
    rank: '',
    district: '',
    active: '',
    employmentType: '',
    status: '',
    sex: '',
    supervisor: '',
    badgeNumber: '',
    radioNumber: '',
    peNumber: '',
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  React.useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  React.useEffect(() => {
    const focusSearch = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('shield:focus-user-search', focusSearch);

    return () => window.removeEventListener('shield:focus-user-search', focusSearch);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      onSearchRef.current(query);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const handleFilterChange = (field: keyof UserFilters, value: string) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-8 dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 border-2 border-gray-300 rounded focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-sm dark:border-gray-700 dark:bg-gray-950"
        />
        <button type="submit" className="btn-primary" aria-label="Search users" title="Search">
          <Search size={16} />
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowFilters(!showFilters)}
          aria-label="Toggle filters"
          title="Filters"
        >
          <SlidersHorizontal size={16} />
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
            {rankOptions.filter(Boolean).map((rank) => (
              <option key={rank} value={rank}>{rank}</option>
            ))}
          </select>

          <select
            value={filters.district}
            onChange={(e) => handleFilterChange('district', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Districts</option>
            {districtOptions.map((district) => (
              <option key={district} value={district}>{district}</option>
            ))}
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
            {employmentTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Special Status</option>
            {['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', 'Administrative Duty', 'Inactive'].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select
            value={filters.sex}
            onChange={(e) => handleFilterChange('sex', e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white cursor-pointer focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">All Sex</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>

          <input
            value={filters.supervisor}
            onChange={(e) => handleFilterChange('supervisor', e.target.value)}
            placeholder="Supervisor"
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          />

          <input
            value={filters.peNumber}
            onChange={(e) => handleFilterChange('peNumber', e.target.value)}
            placeholder="PE number"
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          />

          <input
            value={filters.badgeNumber}
            onChange={(e) => handleFilterChange('badgeNumber', e.target.value)}
            placeholder="Badge number"
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          />

          <input
            value={filters.radioNumber}
            onChange={(e) => handleFilterChange('radioNumber', e.target.value)}
            placeholder="Radio number"
            className="px-3 py-2 border-2 border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>
      )}
    </div>
  );
};
