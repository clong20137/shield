import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  peNumber: string;
  carNumber: string;
  badgeNumber: string;
  assignedTo: string;
  district: string;
  rank: string;
  isActive: boolean;
  employmentType: string;
  typeDetails: string;
  status: string;
  supervisor: string;
  specialtyCertifications: string;
  publicSafetyId: string;
  race: string;
  sex: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserFilters {
  rank?: string;
  district?: string;
  active?: string;
  employmentType?: string;
}

export interface UserListResponse {
  data: User[];
  page: number;
  limit: number;
  count: number;
}

export interface SystemStatistics {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalDistricts: number;
  totalRanks: number;
}

export interface ReportRow {
  rank?: string;
  district?: string;
  employmentType?: string;
  count: number;
  activeCount: number;
}

export interface AuthAccount {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  account: AuthAccount;
}

export const authService = {
  register: (email: string, password: string, displayName: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, displayName }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
};

export const userService = {
  search: (searchTerm: string, filters?: UserFilters) =>
    api.get('/users/search', { params: { q: searchTerm, ...filters } }),
  
  getAll: (page: number = 1, limit: number = 50) =>
    api.get<UserListResponse>('/users/all', { params: { page, limit } }),
  
  getById: (id: string) =>
    api.get(`/users/${id}`),
  
  create: (user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post('/users', user),
  
  update: (id: string, updates: Partial<User>) =>
    api.put(`/users/${id}`, updates),
  
  delete: (id: string) =>
    api.delete(`/users/${id}`),
};

export const reportService = {
  getByRank: () =>
    api.get<ReportRow[]>('/reports/by-rank'),
  
  getByDistrict: () =>
    api.get<ReportRow[]>('/reports/by-district'),
  
  getByEmploymentType: () =>
    api.get<ReportRow[]>('/reports/by-employment-type'),
  
  getStatistics: () =>
    api.get<SystemStatistics>('/reports/statistics'),
  
  getDetailedReport: (filters?: UserFilters) =>
    api.get('/reports/detailed', { params: filters }),
};

export default api;
