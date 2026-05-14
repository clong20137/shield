import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

const AUTH_TOKEN_KEY = 'shield_auth_token';

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export function setAuthToken(token: string) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl: string;
  peNumber: string;
  peopleSoftId: string;
  carNumber: string;
  badgeNumber: string;
  radioNumber: string;
  personalPhoneNumber: string;
  departmentPhoneNumber: string;
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
  maritalStatus: string;
  residentialAddress: string;
  mailingAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserFilters {
  rank?: string;
  district?: string;
  active?: string;
  employmentType?: string;
  status?: string;
  sex?: string;
  supervisor?: string;
  badgeNumber?: string;
  radioNumber?: string;
  peNumber?: string;
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
  totalAccounts: number;
  administratorAccounts: number;
  standardAccounts: number;
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
  profilePictureUrl: string;
  role: 'administrator' | 'user';
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  account?: AuthAccount;
  requiresTwoFactor?: boolean;
  token?: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
}

export interface CalendarEntry {
  id: string;
  category: 'General Information';
  date: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

export interface DeviceRecord {
  id: string;
  type: 'Cell Phone' | 'MiFi Device' | 'Computer' | 'Radio';
  assetTag: string;
  makeModel: string;
  serialNumber: string;
  assignedTo: string;
  status: 'Available' | 'Assigned' | 'Maintenance' | 'Retired';
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserMessage {
  id: string;
  senderAccountId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
}

export const authService = {
  register: (email: string, password: string, displayName: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, displayName }),

  login: (email: string, password: string, twoFactorCode?: string) =>
    api.post<AuthResponse>('/auth/login', { email, password, twoFactorCode }),

  getSession: () =>
    api.get<AuthResponse>('/auth/session'),

  logout: () =>
    api.post('/auth/logout'),

  changePassword: (accountId: string, currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { accountId, currentPassword, newPassword }),

  setupTwoFactor: (accountId: string) =>
    api.post<TwoFactorSetupResponse>('/auth/2fa/setup', { accountId }),

  enableTwoFactor: (accountId: string, code: string) =>
    api.post<AuthResponse>('/auth/2fa/enable', { accountId, code }),

  disableTwoFactor: (accountId: string, password: string) =>
    api.post<AuthResponse>('/auth/2fa/disable', { accountId, password }),

  getAccounts: (requesterId: string) =>
    api.get<AuthAccount[]>('/auth/accounts', { params: { requesterId } }),

  updateRole: (requesterId: string, accountId: string, role: AuthAccount['role']) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/role`, { requesterId, role }),
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

  uploadProfilePicture: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return api.post<{ profilePictureUrl: string; user: User }>(`/users/${id}/profile-picture`, formData);
  },

  removeProfilePicture: (id: string) =>
    api.delete<{ profilePictureUrl: string; user: User }>(`/users/${id}/profile-picture`),
  
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

export const calendarService = {
  getAll: () =>
    api.get<CalendarEntry[]>('/calendar'),

  create: (entry: Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<CalendarEntry>('/calendar', entry),

  update: (id: string, entry: Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.put<CalendarEntry>(`/calendar/${id}`, entry),

  delete: (id: string) =>
    api.delete(`/calendar/${id}`),
};

export const auditService = {
  getAll: (limit = 100) =>
    api.get<AuditLog[]>('/audit', { params: { limit } }),
};

export const deviceService = {
  getAll: () =>
    api.get<DeviceRecord[]>('/devices'),

  create: (device: Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<DeviceRecord>('/devices', device),

  update: (id: string, device: Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.put<DeviceRecord>(`/devices/${id}`, device),

  delete: (id: string) =>
    api.delete(`/devices/${id}`),
};

export const messageService = {
  send: (message: Pick<UserMessage, 'senderAccountId' | 'recipientUserId' | 'subject' | 'body'>) =>
    api.post<UserMessage>('/messages', message),

  getForUser: (userId: string) =>
    api.get<UserMessage[]>(`/messages/user/${userId}`),

  getInbox: (accountId: string) =>
    api.get<UserMessage[]>(`/messages/inbox/${accountId}`),

  getSent: (accountId: string) =>
    api.get<UserMessage[]>(`/messages/sent/${accountId}`),

  markRead: (messageId: string, recipientUserId: string) =>
    api.put(`/messages/${messageId}/read`, { recipientUserId }),

  archive: (messageId: string, recipientUserId: string) =>
    api.put(`/messages/${messageId}/archive`, { recipientUserId }),

  delete: (messageId: string, accountId: string) =>
    api.delete(`/messages/${messageId}`, { data: { accountId } }),
};

export default api;
