import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/u, '');

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

export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getMessageEventsUrl(): string | null {
  const token = getAuthToken();
  return token ? `${API_BASE_URL}/messages/events?token=${encodeURIComponent(token)}` : null;
}

export function getAppEventsUrl(): string | null {
  const token = getAuthToken();
  return token ? `${API_BASE_URL}/events?token=${encodeURIComponent(token)}` : null;
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
  role: string;
  receivesMessages: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload extends Omit<User, 'id' | 'createdAt' | 'updatedAt'> {
  password?: string;
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
  role: string;
  receivesMessages: boolean;
  hasCompletedOnboarding: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthRole {
  id: string;
  name: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export type RegistrationMode = 'public' | 'invite-only' | 'disabled';

export interface RegistrationSettings {
  mode: RegistrationMode;
  appBaseUrl: string;
}

export interface AuthInvite {
  id: string;
  email: string;
  invitedBy: string | null;
  invitedByName: string | null;
  token?: string;
  inviteUrl?: string;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  isCurrent?: boolean;
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
  ownerAccountId?: string;
  category: 'General Information' | 'Trooper Daily';
  date: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  details: Record<string, string>;
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
  type: 'Cell Phone' | 'MiFi Device' | 'Computer' | 'Radio' | 'Cradlepoint';
  assetTag: string;
  makeModel: string;
  serialNumber: string;
  assignedTo: string;
  status: 'Available' | 'Assigned' | 'Maintenance' | 'Retired' | 'Damaged' | 'Lost';
  location: string;
  notes: string;
  phoneNumber: string;
  imei: string;
  simNumber: string;
  radioId: string;
  hostname: string;
  routerId: string;
  warrantyExpiration: string;
  replacementDueDate: string;
  maintenanceDueDate: string;
  lastServiceDate: string;
  purchaseDate: string;
  condition: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceEvent {
  id: string;
  deviceId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  assignedTo: string;
  status: string;
  notes: string;
  createdAt: string;
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
  senderRank?: string;
  senderProfilePictureUrl?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientRank?: string;
  recipientProfilePictureUrl?: string;
  senderReceivesMessages?: boolean;
  recipientReceivesMessages?: boolean;
}

export interface DashboardPost {
  id: string;
  title: string;
  body: string;
  category: 'Update' | 'News' | 'Alert';
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BugReportStatus = 'New' | 'Pending' | 'Fixed' | 'Closed';
export type BugReportPriority = 'Low' | 'Normal' | 'High' | 'Critical';

export interface BugReport {
  id: string;
  reporterId: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  title: string;
  description: string;
  location: string;
  priority: BugReportPriority;
  status: BugReportStatus;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface MileageSummary {
  mileage: number;
  milestone: number;
}

export type QuickLaunchExternalSlot = {
  type: 'external';
  label: string;
  url: string;
};

export type QuickLaunchSlot = string | QuickLaunchExternalSlot | null;

export interface QuickLaunchResponse {
  slots: QuickLaunchSlot[];
}

export type PerformanceEvaluationStatus = 'Sent' | 'Signed';

export interface PerformanceEvaluation {
  id: string;
  employeeAccountId: string;
  employeeName: string;
  employeeEmail: string;
  supervisorAccountId: string;
  supervisorName: string;
  evaluationPeriod: string;
  positionTitle: string;
  district: string;
  ratings: Record<string, string>;
  strengths: string;
  improvements: string;
  goals: string;
  supervisorComments: string;
  employeeComments: string;
  status: PerformanceEvaluationStatus;
  supervisorSignature: string;
  supervisorSignedAt: string | null;
  employeeSignature: string;
  employeeSignedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreatePerformanceEvaluationPayload = Pick<
  PerformanceEvaluation,
  'employeeAccountId' | 'evaluationPeriod' | 'positionTitle' | 'district' | 'ratings' | 'strengths' | 'improvements' | 'goals' | 'supervisorComments'
>;

export const authService = {
  register: (email: string, password: string, displayName: string, inviteToken?: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, displayName, inviteToken }),

  login: (email: string, password: string, twoFactorCode?: string) =>
    api.post<AuthResponse>('/auth/login', { email, password, twoFactorCode }),

  requestPasswordReset: (email: string) =>
    api.post<{ message: string }>('/auth/password-reset/request', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/password-reset/confirm', { token, password }),

  getSession: () =>
    api.get<AuthResponse>('/auth/session'),

  logout: () =>
    api.post('/auth/logout'),

  getSessions: () =>
    api.get<AuthSession[]>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    api.delete(`/auth/sessions/${sessionId}`),

  revokeOtherSessions: () =>
    api.post<{ revokedCount: number }>('/auth/sessions/revoke-others'),

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

  updateRole: (requesterId: string, accountId: string, role: string) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/role`, { requesterId, role }),

  getRoles: (requesterId: string) =>
    api.get<AuthRole[]>('/auth/roles', { params: { requesterId } }),

  createRole: (requesterId: string, name: string, permissions: string[]) =>
    api.post<AuthRole>('/auth/roles', { requesterId, name, permissions }),

  getRegistrationSettings: () =>
    api.get<RegistrationSettings>('/auth/registration-settings'),

  updateRegistrationSettings: (settings: RegistrationSettings) =>
    api.put<RegistrationSettings>('/auth/registration-settings', settings),

  createInvite: (email: string, requesterId: string) =>
    api.post<AuthInvite>('/auth/invites', { email, requesterId }),

  listInvites: () =>
    api.get<AuthInvite[]>('/auth/invites'),

  updateMessagePreferences: (accountId: string, receiveMessages: boolean) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/message-preferences`, { receiveMessages }),

  completeOnboarding: (accountId: string) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/onboarding-complete`),
};

export const userService = {
  search: (searchTerm: string, filters?: UserFilters) =>
    api.get('/users/search', { params: { q: searchTerm, ...filters } }),
  
  getAll: (page: number = 1, limit: number = 50) =>
    api.get<UserListResponse>('/users/all', { params: { page, limit } }),
  
  getById: (id: string) =>
    api.get(`/users/${id}`),
  
  create: (user: CreateUserPayload) =>
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
  getAll: (accountId: string) =>
    api.get<CalendarEntry[]>('/calendar', { params: { accountId } }),

  create: (entry: Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'> & { accountId: string; actorId?: string; actorName?: string }) =>
    api.post<CalendarEntry>('/calendar', entry),

  update: (id: string, entry: Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'> & { accountId: string; actorId?: string; actorName?: string }) =>
    api.put<CalendarEntry>(`/calendar/${id}`, entry),

  delete: (id: string, actor?: { accountId?: string; actorId?: string; actorName?: string }) =>
    api.delete(`/calendar/${id}`, { data: actor }),
};

export const auditService = {
  getAll: (limit = 100) =>
    api.get<AuditLog[]>('/audit', { params: { limit } }),
};

export const deviceService = {
  getAll: () =>
    api.get<DeviceRecord[]>('/devices'),

  create: (device: Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'> & { actorId?: string; actorName?: string; eventNotes?: string }) =>
    api.post<DeviceRecord>('/devices', device),

  update: (id: string, device: Omit<DeviceRecord, 'id' | 'createdAt' | 'updatedAt'> & { actorId?: string; actorName?: string; eventAction?: string; eventNotes?: string }) =>
    api.put<DeviceRecord>(`/devices/${id}`, device),

  getHistory: (id: string) =>
    api.get<DeviceEvent[]>(`/devices/${id}/history`),

  addHistory: (id: string, event: Pick<DeviceEvent, 'action'> & Partial<Pick<DeviceEvent, 'assignedTo' | 'status' | 'notes'>> & { actorId?: string; actorName?: string }) =>
    api.post<DeviceEvent>(`/devices/${id}/history`, event),

  delete: (id: string, actor?: { actorId?: string; actorName?: string; eventNotes?: string }) =>
    api.delete(`/devices/${id}`, { data: actor }),
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

export const dashboardPostService = {
  getAll: (limit = 10) =>
    api.get<DashboardPost[]>('/dashboard-posts', { params: { limit } }),

  create: (post: Pick<DashboardPost, 'title' | 'body' | 'category'> & { requesterId: string; authorName: string }) =>
    api.post<DashboardPost>('/dashboard-posts', post),

  delete: (id: string, requesterId: string) =>
    api.delete(`/dashboard-posts/${id}`, { data: { requesterId } }),
};

export const bugReportService = {
  create: (report: Pick<BugReport, 'title' | 'description' | 'location' | 'priority'>) =>
    api.post<BugReport>('/bugs', report),

  getAll: () =>
    api.get<BugReport[]>('/bugs'),

  updateStatus: (id: string, status: BugReportStatus, adminNotes: string) =>
    api.put<BugReport>(`/bugs/${id}/status`, { status, adminNotes }),
};

export const notificationService = {
  getAll: () =>
    api.get<UserNotification[]>('/notifications'),

  markRead: (id: string) =>
    api.put(`/notifications/${id}/read`),
};

export const quickLaunchService = {
  get: () =>
    api.get<QuickLaunchResponse>('/quick-launch'),

  save: (slots: QuickLaunchSlot[]) =>
    api.put<QuickLaunchResponse>('/quick-launch', { slots }),
};

export const mileageService = {
  getSummary: () =>
    api.get<MileageSummary>('/mileage/summary'),

  updateMilestone: (milestone: number) =>
    api.put<{ milestone: number }>('/mileage/milestone', { milestone }),
};

export const performanceEvaluationService = {
  getAll: () =>
    api.get<PerformanceEvaluation[]>('/performance-evaluations'),

  create: (evaluation: CreatePerformanceEvaluationPayload) =>
    api.post<PerformanceEvaluation>('/performance-evaluations', evaluation),

  sign: (id: string, signature: string, employeeComments: string) =>
    api.post<PerformanceEvaluation>(`/performance-evaluations/${id}/sign`, { signature, employeeComments }),

  remind: (id: string) =>
    api.post<PerformanceEvaluation>(`/performance-evaluations/${id}/remind`),
};

export default api;
