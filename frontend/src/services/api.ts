import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
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

export const userService = {
  search: (searchTerm: string, filters?: any) =>
    api.get('/users/search', { params: { q: searchTerm, ...filters } }),
  
  getAll: (page: number = 1, limit: number = 50) =>
    api.get('/users/all', { params: { page, limit } }),
  
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
    api.get('/reports/by-rank'),
  
  getByDistrict: () =>
    api.get('/reports/by-district'),
  
  getByEmploymentType: () =>
    api.get('/reports/by-employment-type'),
  
  getStatistics: () =>
    api.get('/reports/statistics'),
  
  getDetailedReport: (filters?: any) =>
    api.get('/reports/detailed', { params: filters }),
};

export default api;
