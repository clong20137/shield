import axios from 'axios';

function getRuntimeApiBaseUrl(value?: string): string {
  const defaultUrl = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';
  const rawValue = (value || defaultUrl).trim();
  const withApiPath = rawValue.replace(/\/+$/u, '');

  if (!withApiPath) {
    return defaultUrl;
  }

  if (withApiPath.startsWith('//')) {
    return `${window.location.protocol}${withApiPath}`;
  }

  if (/^:\d+(?:\/|$)/u.test(withApiPath)) {
    const origin = typeof window === 'undefined' ? 'http://localhost' : `${window.location.protocol}//${window.location.hostname}`;
    return `${origin}${withApiPath}`;
  }

  if (/^\d+(?:\/|$)/u.test(withApiPath)) {
    const origin = typeof window === 'undefined' ? 'http://localhost' : `${window.location.protocol}//${window.location.hostname}`;
    return `${origin}:${withApiPath}`;
  }

  if (/^[\w.-]+(?::\d+)?\/api(?:\/|$)/iu.test(withApiPath)) {
    const protocol = typeof window === 'undefined' ? 'http:' : window.location.protocol;
    return `${protocol}//${withApiPath}`;
  }

  return withApiPath;
}

const API_BASE_URL = getRuntimeApiBaseUrl(import.meta.env.VITE_API_URL);
const API_ORIGIN_URL = (() => {
  try {
    const parsedUrl = new URL(API_BASE_URL);
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/api$/u, '') || '/';
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString().replace(/\/+$/u, '');
  } catch {
    return API_BASE_URL.replace(/\/api$/u, '');
  }
})();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  withCredentials: true,
});

const AUTH_TOKEN_KEY = 'shield_auth_token';
const API_CONNECTION_LOST_EVENT = 'shield:api-connection-lost';
const API_CONNECTION_RESTORED_EVENT = 'shield:api-connection-restored';
let consecutiveNetworkFailures = 0;
let lastNetworkFailureAt = 0;

function dispatchApiConnectionEvent(type: typeof API_CONNECTION_LOST_EVENT | typeof API_CONNECTION_RESTORED_EVENT) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(type));
}

api.interceptors.request.use((config) => {
  const legacyToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (legacyToken) {
    config.headers.Authorization = `Bearer ${legacyToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    consecutiveNetworkFailures = 0;
    dispatchApiConnectionEvent(API_CONNECTION_RESTORED_EVENT);
    return response;
  },
  (error) => {
    if (!navigator.onLine) {
      dispatchApiConnectionEvent(API_CONNECTION_LOST_EVENT);
      return Promise.reject(error);
    }

    if (axios.isAxiosError(error) && !error.response && error.code === 'ERR_NETWORK') {
      const now = Date.now();
      consecutiveNetworkFailures = now - lastNetworkFailureAt < 10000 ? consecutiveNetworkFailures + 1 : 1;
      lastNetworkFailureAt = now;

      if (consecutiveNetworkFailures >= 2) {
        dispatchApiConnectionEvent(API_CONNECTION_LOST_EVENT);
      }
    }

    return Promise.reject(error);
  },
);

export function setAuthToken(token: string) {
  if (token) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getAuthToken(): string | null {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  return null;
}

export function getMessageEventsUrl(): string {
  return `${API_BASE_URL}/messages/events`;
}

export function getAppEventsUrl(): string {
  return `${API_BASE_URL}/events`;
}

export function getApiHealthUrl(): string {
  return `${API_ORIGIN_URL}/health`;
}

export function getAssetUrl(value?: string | null): string {
  if (!value) {
    return '';
  }

  const rawValue = value.trim().replace(/\\/gu, '/');

  if (rawValue.startsWith('data:') || rawValue.startsWith('blob:')) {
    return rawValue;
  }

  const uploadMatch = rawValue.match(/(?:^|\/)(?:api\/)?uploads\/(.+)$/u);
  if (uploadMatch?.[1]) {
    const safeAssetPath = uploadMatch[1]
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join('/');

    return `${API_BASE_URL}/uploads/${safeAssetPath}`;
  }

  try {
    const parsedUrl = new URL(rawValue);

    return parsedUrl.toString();
  } catch {
    const normalizedPath = rawValue.startsWith('/') ? rawValue : `/${rawValue}`;
    const safePath = normalizedPath
      .split('/')
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join('/');

    return `${API_BASE_URL}${safePath}`;
  }
}

export function getAssetThumbnailUrl(value?: string | null, width = 96): string {
  if (!value) {
    return '';
  }

  const rawValue = value.trim().replace(/\\/gu, '/');
  const uploadMatch = rawValue.match(/(?:^|\/)(?:api\/)?uploads\/(.+)$/u);
  if (!uploadMatch?.[1]) {
    return getAssetUrl(value);
  }

  const assetPath = uploadMatch[1];
  if (assetPath.includes('/thumbs/')) {
    return getAssetUrl(value);
  }

  const pathParts = assetPath.split('/').filter(Boolean);
  const fileName = pathParts.pop();
  if (!fileName) {
    return getAssetUrl(value);
  }

  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const thumbnailPath = [...pathParts, 'thumbs', `${baseName}-${width}.webp`]
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join('/');

  return `${API_BASE_URL}/uploads/${thumbnailPath}`;
}

export function getAssetFullImageUrl(value?: string | null): string {
  const assetUrl = getAssetUrl(value);
  if (!assetUrl) {
    return '';
  }

  const normalizedValue = (value || '').trim().replace(/\\/gu, '/');
  if (!normalizedValue.includes('/thumbs/') || !/-\d+\.webp(?:[?#].*)?$/iu.test(normalizedValue)) {
    return assetUrl;
  }

  const separator = assetUrl.includes('?') ? '&' : '?';
  return `${assetUrl}${separator}full=1`;
}

export function handleAssetImageError(event: { currentTarget: HTMLImageElement }) {
  const image = event.currentTarget;
  const currentSource = image.currentSrc || image.src;

  if (
    image.dataset.assetFallback !== 'origin' &&
    currentSource.includes('/uploads/') &&
    currentSource.includes('/api/uploads/')
  ) {
    image.dataset.assetFallback = 'origin';
    image.src = currentSource.replace('/api/uploads/', '/uploads/');
    return;
  }

  image.style.display = 'none';
}

export function handleAssetThumbnailError(event: { currentTarget: HTMLImageElement }, fallbackValue?: string | null) {
  const image = event.currentTarget;
  const fallbackUrl = getAssetUrl(fallbackValue);

  if (fallbackUrl && image.src !== fallbackUrl) {
    image.src = fallbackUrl;
    return;
  }

  handleAssetImageError(event);
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
  isHidden: boolean;
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
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  role: string;
  receivesMessages: boolean;
  presenceHidden?: boolean;
  calendarHidden?: boolean;
  isMemorial?: boolean;
  endOfWatchDate?: string | null;
  memorialSummary?: string;
  serviceYears?: string;
  memorialExternalUrl?: string;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PinnedProfile = User & {
  pinnedAt: string;
};

export interface QuickNote {
  accountId: string;
  content: string;
  updatedAt: string;
}

export type DistrictFeedPostCategory = 'Announcement' | 'Update' | 'News' | 'Alert';

export interface DistrictFeedPost {
  id: string;
  district: string;
  category: DistrictFeedPostCategory;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  calendarEntries: CalendarEntry[];
  reminders: Reminder[];
  pinnedProfiles: PinnedProfile[];
  posts: DashboardPost[];
  quickNote: QuickNote;
  districtFeedPosts: DistrictFeedPost[];
  dueReminderNotificationsCreated: number;
}

export interface CreateUserPayload extends Omit<User, 'id' | 'createdAt' | 'updatedAt'> {
  password?: string;
}

export interface UserFilters {
  rank?: string;
  district?: string;
  active?: string;
  memorial?: string;
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
  hasMore?: boolean;
}

export interface MemorialProfile {
  id: string;
  linkedUserId?: string | null;
  firstName: string;
  lastName: string;
  rank?: string | null;
  district?: string | null;
  appointedDate?: string | null;
  deceasedDate?: string | null;
  photoUrl?: string | null;
  serviceYears?: string | null;
  memorialSummary?: string | null;
  memorialExternalUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemorialProfileListResponse {
  data: MemorialProfile[];
  page: number;
  limit: number;
  count: number;
  hasMore?: boolean;
}

export type MemorialProfilePayload = Omit<MemorialProfile, 'id' | 'createdAt' | 'updatedAt'>;

export interface UserImportResponse {
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  createdUsers: Array<Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'peNumber'> & { temporaryPassword: string }>;
  skippedRows: Array<{ rowNumber: number; reason: string }>;
}

export interface UserPhotoImportResponse {
  totalFiles: number;
  uploadedCount: number;
  skippedCount: number;
  overwriteExisting: boolean;
  uploaded: Array<Pick<User, 'id' | 'firstName' | 'lastName' | 'peNumber'> & { profilePictureUrl: string; fileName: string }>;
  skippedFiles: Array<{ fileName: string; peNumber: string; reason: string }>;
}

export interface ProfilePictureRepairResponse {
  scannedCount: number;
  repairedCount: number;
  repairedUsers: Array<Pick<User, 'id' | 'firstName' | 'lastName' | 'peNumber'> & { missingProfilePictureUrl: string }>;
}

export interface ProfilePictureDeleteAllResponse {
  deletedCount: number;
  clearedUserCount: number;
  totalCount: number;
  remainingCount: number;
  done: boolean;
}

export interface FleetVehicleRecord {
  id: string;
  unitNumber: string;
  license: string;
  year: string;
  make: string;
  model: string;
  districtDepartment: string;
  peNumber: string;
  title: string;
  operatorName: string;
  assignedUserId: string | null;
  assignedUserName: string;
  assignedUserEmail: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface FleetVehicleListResponse {
  data: FleetVehicleRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FleetVehicleImportResponse {
  totalRows: number;
  rawLineCount: number;
  rawRowCount?: number;
  createdCount: number;
  updatedCount: number;
  matchedCount: number;
  skippedRows: Array<{ lineNumber: number; reason: string; text: string }>;
}

export interface MediaLibraryItem {
  id: string;
  folder: string;
  label: string;
  fileName: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  updatedAt: string;
}

export interface MediaLibraryFolder {
  key: string;
  label: string;
  count: number;
  size: number;
  updatedAt: string | null;
  parentKey: string;
  depth: number;
  protected: boolean;
}

export interface MediaLibraryResponse {
  items: MediaLibraryItem[];
  folders: MediaLibraryFolder[];
  page: number;
  limit: number;
  total: number;
  totalItems: number;
  totalSize: number;
}

export interface MediaUsageRecord {
  url: string;
  source: 'user-profile' | 'dashboard-post' | 'message-thread';
  label: string;
  detail: string;
  entityId: string;
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

export interface AccessReviewAccount {
  id: string;
  displayName: string;
  email: string;
  role: string;
  district: string;
  rank: string;
  isActive: boolean;
  isHidden: boolean;
  twoFactorEnabled: boolean;
  lastSeenAt: string | null;
  lastSsoLoginAt: string | null;
  createdAt: string;
  activeSessionCount: number;
  permissions: string[];
  privilegedPermissions: string[];
  reviewFlags: string[];
}

export interface AccessReviewResponse {
  generatedAt: string;
  staleAfterDays: number;
  summary: {
    totalAccounts: number;
    activeAccounts: number;
    inactiveAccounts: number;
    administratorAccounts: number;
    mfaEnabledAccounts: number;
    mfaMissingAccounts: number;
    staleAccounts: number;
    neverSeenAccounts: number;
    activeSessions: number;
  };
  roles: Array<{
    role: string;
    accountCount: number;
    permissions: string[];
  }>;
  accounts: AccessReviewAccount[];
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
  firstName: string;
  lastName: string;
  displayName: string;
  profilePictureUrl: string;
  role: string;
  permissions?: string[];
  explicitPermissions?: string[];
  district: string;
  isActive: boolean;
  mustChangePassword: boolean;
  ssoProvider?: string | null;
  microsoftUserId?: string | null;
  lastSsoLoginAt?: string | null;
  receivesMessages: boolean;
  presenceHidden: boolean;
  calendarHidden: boolean;
  appScale: 'compact' | 'comfortable' | 'large';
  defaultDutyHours: string;
  hasCompletedOnboarding: boolean;
  trooperDailyHiddenSections: string[];
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
  appName?: string;
  siteName?: string;
  brandLogoDataUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  maintenanceMode: boolean;
  loginWarningEnabled: boolean;
  loginWarningMessage: string;
  sessionTimeoutMinutes: number;
}

export interface ThemeSettings {
  seasonalTheme: 'auto' | 'default' | 'christmas' | 'summer' | 'thanksgiving' | 'fall' | 'spring' | 'winter' | 'patriotic';
}

export interface NotificationSound {
  id: string;
  label: string;
  url: string;
  size: number;
  updatedAt: string;
}

export interface MicrosoftSsoStatus {
  enabled: boolean;
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
  recoveryCodes?: string[];
}

export interface SetupStatus {
  setupRequired: boolean;
  installed?: boolean;
  setupCompleted: boolean;
  accountCount: number;
  database: {
    connected: boolean;
    initialized: boolean;
    name?: string;
  };
  appName?: string;
  siteName?: string;
  brandLogoDataUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  apiUrl?: string;
  appBaseUrl?: string;
  registrationMode?: RegistrationMode;
  features?: string[];
  error?: string;
}

export interface CompleteSetupPayload {
  appName: string;
  siteName: string;
  brandLogoDataUrl: string;
  primaryColor: string;
  secondaryColor: string;
  appBaseUrl: string;
  apiUrl: string;
  registrationMode: RegistrationMode;
  maintenanceMode: boolean;
  loginWarningEnabled: boolean;
  loginWarningMessage: string;
  sessionTimeoutMinutes: number;
  features: string[];
  admin: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
}

export interface SetupEnvironmentValues {
  NODE_ENV: string;
  PORT: string;
  DB_HOST: string;
  DB_PORT: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  ALLOWED_ORIGINS: string;
  APP_BASE_URL: string;
  API_BASE_URL: string;
  SESSION_COOKIE_SECURE: string;
  SESSION_COOKIE_SAMESITE: string;
  TRUST_PROXY: string;
}

export interface SetupEnvironmentResponse {
  canWrite: boolean;
  envFileExists: boolean;
  requiresRestart: boolean;
  values: SetupEnvironmentValues;
  message?: string;
}

export interface SetupDatabaseTestResponse {
  connected: boolean;
  database?: string;
  created?: boolean;
  message?: string;
  error?: string;
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
  submissionStatus: 'Draft' | 'Submitted';
  reviewStatus: 'Pending' | 'Approved' | 'Returned';
  reviewNotes: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEntryPayload = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;

export interface FleetBookingCalendarPayload {
  bookingId: string;
  ownerAccountId: string;
  title: string;
  serviceType?: string;
  startAt: string;
  endAt: string;
  location?: string;
  vehicleLabel?: string;
  vehicle?: string;
  status: 'requested' | 'approved' | 'denied' | 'canceled' | string;
  notes?: string;
  reminderLeadMinutes?: number;
}

export interface FleetBookingCalendarSyncResponse {
  calendarEntry?: CalendarEntry;
  reminder?: Reminder | null;
  deletedCalendarEntries?: number;
  deletedReminders?: number;
}

export interface CalendarShortcut {
  id: string;
  ownerAccountId?: string;
  name: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  details: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface TrooperDailyReportEntry {
  id: string;
  ownerAccountId: string;
  date: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  details: Record<string, string>;
  reviewStatus: 'Pending' | 'Approved' | 'Returned';
  reviewNotes: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    peNumber: string;
    badgeNumber: string;
    rank: string;
    district: string;
  };
}

export interface TrooperDailyAnalyticsGroup {
  label: string;
  count: number;
  hours: number;
}

export interface TrooperDailyAnalyticsActivity {
  key: string;
  label: string;
  section?: string;
  value: number;
}

export interface TrooperDailyAnalyticsPoint {
  label: string;
  value: number;
}

export interface TrooperDailyAnalyticsFieldTrend {
  key: string;
  label: string;
  section: string;
  total: number;
  points: TrooperDailyAnalyticsPoint[];
}

export interface TrooperDailyAnalyticsSection {
  title: string;
  totals: TrooperDailyAnalyticsActivity[];
}

export interface TrooperDailyAnalyticsResponse {
  generatedAt: string;
  scope: 'all' | 'limited';
  totals: {
    totalReports: number;
    totalHours: number;
    averageHours: number;
    uniqueTroopers: number;
  };
  byDistrict: TrooperDailyAnalyticsGroup[];
  bySpecialStatus: TrooperDailyAnalyticsGroup[];
  byReviewStatus: TrooperDailyAnalyticsGroup[];
  trend: TrooperDailyAnalyticsGroup[];
  activityTotals: TrooperDailyAnalyticsActivity[];
  activitySections: TrooperDailyAnalyticsSection[];
  fieldTrends: TrooperDailyAnalyticsFieldTrend[];
}

export interface DeviceReportGroup {
  label: string;
  count: number;
}

export interface DeviceReportCarrierGroup extends DeviceReportGroup {
  carrier: string;
}

export interface DeviceReportMonthlySnapshot {
  reportMonth: string;
  carrier: string;
  importType: string;
  totalDevices: number;
  assignedDevices: number;
  unassignedDevices: number;
  availableDevices: number;
  possibleInactiveDevices: number;
  estimatedMonthlyTotal: number;
}

export interface DeviceCostBreakdown {
  label: string;
  count: number;
  monthlyRate: number;
  monthlyTotal: number;
  carrier?: string;
}

export interface DeviceManagementReportResponse {
  generatedAt: string;
  summary: {
    totalDevices: number;
    assignedDevices: number;
    unassignedDevices: number;
    availableDevices: number;
    possibleInactiveDevices: number;
    maintenanceDevices: number;
    damagedDevices: number;
    lostDevices: number;
    retiredDevices: number;
  };
  byType: DeviceReportGroup[];
  byStatus: DeviceReportGroup[];
  byCarrier: DeviceReportGroup[];
  byModel: DeviceReportGroup[];
  byCondition: DeviceReportGroup[];
  byTypeCarrier?: DeviceReportCarrierGroup[];
  byStatusCarrier?: DeviceReportCarrierGroup[];
  byModelCarrier?: DeviceReportCarrierGroup[];
  byConditionCarrier?: DeviceReportCarrierGroup[];
  monthlySnapshots?: DeviceReportMonthlySnapshot[];
  costEstimate?: {
    estimatedMonthlyTotal: number;
    estimatedAnnualTotal: number;
    breakdown: DeviceCostBreakdown[];
    carrierBreakdown?: DeviceCostBreakdown[];
  };
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  q?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogResponse {
  data: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  actions: string[];
  entityTypes: string[];
}

export interface ErrorLog {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ErrorLogFilters {
  q?: string;
  level?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ErrorLogResponse {
  data: ErrorLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DeviceRecord {
  id: string;
  type: 'Cell Phone' | 'MiFi Device' | 'Tablet' | 'Computer' | 'Radio' | 'Cradlepoint';
  assetTag: string;
  makeModel: string;
  serialNumber: string;
  assignedTo: string;
  status: 'Available' | 'Assigned' | 'Maintenance' | 'Retired' | 'Damaged' | 'Lost';
  carrier: 'Verizon' | 'AT&T';
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
  activationDate: string;
  contractEndDate: string;
  eligibilityDate: string;
  monthlyCharge: number;
  dataUsageGb: number;
  mobileMinutes: number;
  possibleInactive: boolean;
  condition: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceListResponse {
  data: DeviceRecord[];
  total: number;
  statusCounts?: Record<string, number>;
  typeStatusCounts?: Record<string, Record<string, number>>;
  modelCounts?: Record<string, number>;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PhoneImportResponse {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  matchedCount: number;
  unmatchedRows: Array<{ rowNumber: number; reason: string; row: Record<string, unknown> }>;
  skippedRows: Array<{ rowNumber: number; reason: string; row: Record<string, unknown> }>;
}

export interface PhoneImportJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  processedRows: number;
  totalRows: number;
  summary: PhoneImportResponse;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reportMonth?: string | null;
  forceInventorySync?: boolean;
}

export type PhoneImportType = 'verizon-phone' | 'att-firstnet';

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
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletedByAccountId?: string | null;
  senderDeleted?: boolean;
  recipientDeleted?: boolean;
  senderReaction?: string | null;
  recipientReaction?: string | null;
  threadId?: string | null;
  threadType?: 'direct' | 'group' | 'district' | string | null;
  threadTitle?: string | null;
  threadParticipantIds?: string | null;
  threadParticipantNames?: string | null;
  threadImageUrl?: string | null;
  groupMessageId?: string | null;
  createdAt: string;
  senderName?: string;
  senderEmail?: string;
  senderRank?: string;
  senderProfilePictureUrl?: string;
  senderLastSeenAt?: string | null;
  recipientName?: string;
  recipientEmail?: string;
  recipientRank?: string;
  recipientProfilePictureUrl?: string;
  recipientLastSeenAt?: string | null;
  senderReceivesMessages?: boolean;
  recipientReceivesMessages?: boolean;
}

export interface UserRecentConversation {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  threadType: string;
  directParticipantId: string;
  directLastSeenAt: string | null;
  threadParticipantIds: string[];
  threadParticipantNames: string[];
  latestMessage?: UserMessage;
  unreadPreview: string;
  unreadCount: number;
  unreadMessageIds: string[];
}

export interface DashboardPost {
  id: string;
  title: string;
  body: string;
  category: 'Update' | 'News' | 'Alert';
  imageUrl: string | null;
  allowComments: boolean;
  authorId: string | null;
  authorName: string | null;
  reactions: Record<string, number>;
  myReaction?: DashboardReaction | null;
  createdAt: string;
  updatedAt: string;
}

export type DashboardReaction = 'like' | 'celebrate' | 'important' | 'thanks';

export interface DashboardPostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string | null;
  authorEmail?: string | null;
  authorRank?: string | null;
  authorDistrict?: string | null;
  authorProfilePictureUrl?: string | null;
  authorRole?: string | null;
  parentCommentId: string | null;
  body: string;
  isFlagged: boolean;
  flaggedBy: string | null;
  flaggedAt: string | null;
  flagReason: string | null;
  isPinned: boolean;
  pinnedBy: string | null;
  pinnedAt: string | null;
  isAdminHighlighted: boolean;
  adminHighlightedBy: string | null;
  adminHighlightedAt: string | null;
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

export type UrgentAlertSeverity = 'Advisory' | 'Important' | 'Urgent' | 'Critical';
export type UrgentAlertAudienceType = 'everyone' | 'district' | 'users';

export interface UrgentAlert {
  id: string;
  title: string;
  message: string;
  severity: UrgentAlertSeverity;
  audienceType: UrgentAlertAudienceType;
  audienceLabel: string | null;
  targetDistrict: string | null;
  targetUserIds: string[];
  requireAcknowledgement: boolean;
  expiresAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  acknowledgedAt?: string | null;
  deliveredAt?: string | null;
  recipientIds?: string[];
  recipientCount?: number;
  acknowledgedCount?: number;
}

export interface Reminder {
  id: string;
  accountId: string;
  title: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  notes: string;
  remindOn: string;
  remindAt: string | null;
  recurrenceRule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  notifiedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MileageSummary {
  mileage: number;
  milestone: number;
  achievements?: MileageAchievement[];
  nextAchievement?: MileageAchievement | null;
}

export interface MileageAchievement {
  id: string;
  title: string;
  mileage: number;
  achievementType: string;
  targetValue: number;
  targetLabel: string;
  description: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export type AchievementPayload = Pick<MileageAchievement, 'title' | 'mileage' | 'achievementType' | 'targetValue' | 'targetLabel' | 'description' | 'icon'>;

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
  getSetupStatus: () =>
    api.get<SetupStatus>('/auth/setup/status'),

  getSetupEnvironment: () =>
    api.get<SetupEnvironmentResponse>('/auth/setup/environment'),

  saveSetupEnvironment: (values: SetupEnvironmentValues) =>
    api.post<SetupEnvironmentResponse>('/auth/setup/environment', values),

  testSetupDatabase: (values: SetupEnvironmentValues) =>
    api.post<SetupDatabaseTestResponse>('/auth/setup/database-test', values),

  completeSetup: (payload: CompleteSetupPayload) =>
    api.post<AuthResponse>('/auth/setup/complete', payload),

  register: (email: string, password: string, firstName: string, lastName: string, inviteToken?: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, firstName, lastName, displayName: `${firstName} ${lastName}`.trim(), inviteToken }),

  login: (email: string, password: string, twoFactorCode?: string) =>
    api.post<AuthResponse>('/auth/login', { email, password, twoFactorCode }),
  getMicrosoftSsoStatus: () =>
    api.get<MicrosoftSsoStatus>('/auth/microsoft/status'),
  getMicrosoftSsoStartUrl: (returnTo = '/') =>
    `${API_BASE_URL}/auth/microsoft/start?returnTo=${encodeURIComponent(returnTo)}`,

  requestPasswordReset: (email: string) =>
    api.post<{ message: string }>('/auth/password-reset/request', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/password-reset/confirm', { token, password }),

  getSession: () =>
    api.get<AuthResponse>('/auth/session'),

  verifyPassword: (password: string, account?: Pick<AuthAccount, 'id' | 'email'>) =>
    api.post<AuthResponse>('/auth/verify-password', { password, accountId: account?.id, email: account?.email }),

  logout: () =>
    api.post('/auth/logout'),

  getSessions: () =>
    api.get<AuthSession[]>('/auth/sessions'),

  revokeSession: (sessionId: string) =>
    api.delete(`/auth/sessions/${sessionId}`),

  revokeOtherSessions: () =>
    api.post<{ revokedCount: number }>('/auth/sessions/revoke-others'),

  changePassword: (accountId: string, currentPassword: string, newPassword: string) =>
    api.post<AuthResponse & { message?: string }>('/auth/change-password', { accountId, currentPassword, newPassword }),

  adminResetPassword: (accountId: string) =>
    api.post<{ account: AuthAccount; temporaryPassword: string; message: string }>(`/auth/accounts/${accountId}/reset-password`),

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

  updateRoleDefinition: (roleId: string, name: string, permissions: string[]) =>
    api.put<AuthRole>(`/auth/roles/${roleId}`, { name, permissions }),

  getRegistrationSettings: () =>
    api.get<RegistrationSettings>('/auth/registration-settings'),

  updateRegistrationSettings: (settings: RegistrationSettings) =>
    api.put<RegistrationSettings>('/auth/registration-settings', settings),

  getThemeSettings: () =>
    api.get<ThemeSettings>('/auth/theme-settings'),

  updateThemeSettings: (settings: ThemeSettings) =>
    api.put<ThemeSettings>('/auth/theme-settings', settings),

  createInvite: (email: string, requesterId: string) =>
    api.post<AuthInvite>('/auth/invites', { email, requesterId }),

  listInvites: () =>
    api.get<AuthInvite[]>('/auth/invites'),

  updateMessagePreferences: (accountId: string, receiveMessages: boolean) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/message-preferences`, { receiveMessages }),

  updatePresencePreference: (accountId: string, presenceHidden: boolean) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/presence-preference`, { presenceHidden }),

  updateCalendarPreferences: (accountId: string, calendarHidden: boolean) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/calendar-preferences`, { calendarHidden }),

  updateAppScalePreference: (accountId: string, appScale: AuthAccount['appScale']) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/app-scale-preference`, { appScale }),

  updateDefaultDutyHoursPreference: (accountId: string, defaultDutyHours: string | number) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/default-duty-hours-preference`, { defaultDutyHours }),

  updateTrooperDailyPreferences: (accountId: string, hiddenSections: string[]) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/trooper-daily-preferences`, { hiddenSections }),

  completeOnboarding: (accountId: string) =>
    api.put<AuthResponse>(`/auth/accounts/${accountId}/onboarding-complete`),
};

export const systemService = {
  restartApi: () =>
    api.post<{ message: string; managedByPm2: boolean }>('/system/restart-api'),
};

export const userService = {
  search: (searchTerm: string, filters?: UserFilters) =>
    api.get('/users/search', { params: { q: searchTerm, ...filters } }),

  searchPaged: (searchTerm: string, filters?: UserFilters, page: number = 1, pageSize: number = 50) =>
    api.get<UserListResponse>('/users/search', { params: { q: searchTerm, ...filters, page, pageSize } }),
  
  getAll: (page: number = 1, limit: number = 50) =>
    api.get<UserListResponse>('/users/all', { params: { page, limit } }),
  
  getById: (id: string) =>
    api.get(`/users/${id}`),

  getAddressSuggestions: (query: string) =>
    api.get<string[]>('/users/address-suggestions', { params: { q: query } }),
  
  create: (user: CreateUserPayload) =>
    api.post('/users', user),

  importSpreadsheet: (file: File) => {
    const formData = new FormData();
    formData.append('spreadsheet', file);
    return api.post<UserImportResponse>('/users/import', formData, { timeout: 30000 });
  },

  importProfilePictures: (files: File[], onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('overwriteExisting', 'true');
    files.forEach((file) => formData.append('photos', file));
    return api.post<UserPhotoImportResponse>('/users/profile-pictures/import', formData, {
      timeout: 300000,
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
  },

  repairMissingProfilePictures: () =>
    api.post<ProfilePictureRepairResponse>('/users/profile-pictures/repair-missing'),
  
  update: (id: string, updates: Partial<User>) =>
    api.put(`/users/${id}`, updates),

  uploadProfilePicture: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return api.post<{ profilePictureUrl: string; user: User }>(`/users/${id}/profile-picture`, formData);
  },

  setProfilePicture: (id: string, profilePictureUrl: string) =>
    api.put<{ profilePictureUrl: string; user: User }>(`/users/${id}/profile-picture`, { profilePictureUrl }),

  removeProfilePicture: (id: string) =>
    api.delete<{ profilePictureUrl: string; user: User }>(`/users/${id}/profile-picture`),
  
  delete: (id: string) =>
    api.delete(`/users/${id}`),
};

export const memorialProfileService = {
  list: (searchTerm: string = '', page: number = 1, limit: number = 24) =>
    api.get<MemorialProfileListResponse>('/memorial-profiles', { params: { q: searchTerm, page, limit } }),

  create: (payload: MemorialProfilePayload) =>
    api.post<MemorialProfile>('/memorial-profiles', payload),

  update: (id: string, payload: MemorialProfilePayload) =>
    api.put<MemorialProfile>(`/memorial-profiles/${id}`, payload),

  delete: (id: string) =>
    api.delete<{ deleted: boolean }>(`/memorial-profiles/${id}`),

  uploadPhoto: (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post<{ photoUrl: string }>('/memorial-profiles/photo', formData);
  },
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

  getAccessReview: () =>
    api.get<AccessReviewResponse>('/reports/access-review'),
  
  getDetailedReport: (filters?: UserFilters) =>
    api.get('/reports/detailed', { params: filters }),

  getTrooperDailies: (filters?: { q?: string; from?: string; to?: string; district?: string; page?: number; pageSize?: number }) =>
    api.get<{ count: number; total: number; page: number; pageSize: number; totalPages: number; scope: 'all' | 'own'; data: TrooperDailyReportEntry[] }>('/reports/trooper-dailies', { params: filters }),

  getTrooperDailyAnalytics: (filters?: { q?: string; from?: string; to?: string; district?: string }) =>
    api.get<TrooperDailyAnalyticsResponse>('/reports/trooper-dailies/analytics', { params: filters }),

  getDeviceManagementReports: () =>
    api.get<DeviceManagementReportResponse>('/reports/devices'),

  deleteDeviceReportSnapshots: () =>
    api.delete<{ deletedCount: number }>('/reports/devices/snapshots'),

  deleteSelectedDeviceReportSnapshots: (snapshots: Array<{ reportMonth: string; carrier: string }>) =>
    api.delete<{ deletedCount: number }>('/reports/devices/snapshots/selected', { data: { snapshots } }),

  reviewTrooperDaily: (id: string, status: 'Approved' | 'Returned', notes: string) =>
    api.put<TrooperDailyReportEntry>(`/reports/trooper-dailies/${id}/review`, { status, notes }),
};

export const calendarService = {
  getAll: (accountId: string) =>
    api.get<CalendarEntry[]>('/calendar', { params: { accountId } }),

  getProfileEntries: (accountId: string) =>
    api.get<CalendarEntry[]>(`/calendar/profile/${accountId}`),

  create: (entry: CalendarEntryPayload & { accountId: string; actorId?: string; actorName?: string }) =>
    api.post<CalendarEntry>('/calendar', entry),

  update: (id: string, entry: CalendarEntryPayload & { accountId: string; actorId?: string; actorName?: string }) =>
    api.put<CalendarEntry>(`/calendar/${id}`, entry),

  autosaveDraft: (entry: CalendarEntryPayload & { accountId: string; entryId?: string | null }) =>
    api.post<CalendarEntry>('/calendar/autosave', entry),

  delete: (id: string, actor?: { accountId?: string; actorId?: string; actorName?: string }) =>
    api.delete(`/calendar/${id}`, { data: actor }),

  syncFleetBooking: (booking: FleetBookingCalendarPayload) =>
    api.put<FleetBookingCalendarSyncResponse>(`/calendar/fleet-bookings/${encodeURIComponent(booking.bookingId)}`, booking),

  deleteFleetBooking: (bookingId: string, ownerAccountId: string) =>
    api.delete<FleetBookingCalendarSyncResponse>(`/calendar/fleet-bookings/${encodeURIComponent(bookingId)}`, { data: { ownerAccountId } }),

  getShortcuts: () =>
    api.get<CalendarShortcut[]>('/calendar/shortcuts'),

  getTCodeOptions: () =>
    api.get<{ options: string[] }>('/calendar/t-code-options'),

  updateTCodeOptions: (options: string[]) =>
    api.put<{ options: string[] }>('/calendar/t-code-options', { options }),

  createShortcut: (shortcut: Omit<CalendarShortcut, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<CalendarShortcut>('/calendar/shortcuts', shortcut),

  updateShortcut: (id: string, shortcut: Omit<CalendarShortcut, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.put<CalendarShortcut>(`/calendar/shortcuts/${id}`, shortcut),

  deleteShortcut: (id: string) =>
    api.delete(`/calendar/shortcuts/${id}`),
};

export const auditService = {
  getAll: (filters: AuditLogFilters = {}) =>
    api.get<AuditLogResponse>('/audit', { params: filters }),
};

export const errorLogService = {
  getAll: (filters: ErrorLogFilters = {}) =>
    api.get<ErrorLogResponse>('/errors', { params: filters }),

  createClientLog: (log: { level?: string; message: string; context?: string; route?: string }) =>
    api.post<{ ok: boolean }>('/errors/client', log),
};

export const deviceService = {
  getAll: (params?: { q?: string; type?: string; model?: string; status?: string; carrier?: string; assignedUserId?: string; possibleInactive?: boolean; sortKey?: string; page?: number; pageSize?: number }) =>
    api.get<DeviceListResponse>('/devices', { params }),

  getAssignedToMe: () =>
    api.get<DeviceRecord[]>('/devices/assigned/me'),

  getAssignedToUser: (accountId: string) =>
    api.get<DeviceRecord[]>(`/devices/assigned/${accountId}`),

  exportPhones: () =>
    api.get<Blob>('/devices/phones/export', { responseType: 'blob' }),

  importPhones: (payload: { rows: Record<string, string>[]; actorId?: string; actorName?: string; importType?: PhoneImportType; reportMonth?: string; forceInventorySync?: boolean }) =>
    api.post<PhoneImportResponse>('/devices/phones/import', payload, { timeout: 60000 }),
  startPhoneImportJob: (csvText: string, actor?: { actorId?: string; actorName?: string }, importType: PhoneImportType = 'verizon-phone', reportMonth?: string, forceInventorySync = false) =>
    api.post<PhoneImportJob>('/devices/phones/import-jobs', csvText, {
      headers: { 'Content-Type': 'text/csv' },
      params: { ...actor, importType, reportMonth, forceInventorySync },
      timeout: 60000,
    }),
  getPhoneImportJob: (jobId: string) =>
    api.get<PhoneImportJob>(`/devices/phones/import-jobs/${jobId}`),

  deletePhones: () =>
    api.delete<{ deletedCount: number }>('/devices/phones'),

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

export const fleetVehicleService = {
  getAll: (params?: { q?: string; page?: number; pageSize?: number }) =>
    api.get<FleetVehicleListResponse>('/fleet/vehicles', { params }),

  importSpreadsheet: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<FleetVehicleImportResponse>('/fleet/vehicles/import', formData, {
      timeout: 90000,
      onUploadProgress: (event) => {
        if (!event.total || !onProgress) {
          return;
        }

        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
  },
};

const MESSAGE_REQUEST_OPTIONS = { timeout: 20000 };

export const messageService = {
  resolveRecipient: (accountId: string) =>
    api.get<{ account: AuthAccount }>(`/messages/recipient/${accountId}`, MESSAGE_REQUEST_OPTIONS),

  send: (message: Pick<UserMessage, 'senderAccountId' | 'recipientUserId' | 'subject' | 'body'>) =>
    api.post<UserMessage>('/messages', message, MESSAGE_REQUEST_OPTIONS),

  sendGroup: (message: {
    senderAccountId: string;
    recipientUserIds: string[];
    subject: string;
    body: string;
    audienceType?: 'group' | 'district';
    threadId?: string;
    threadTitle?: string;
  }) => api.post<{ threadId: string; groupMessageId: string; messages: UserMessage[] }>('/messages/group', message, MESSAGE_REQUEST_OPTIONS),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ imageUrl: string }>('/messages/images', formData);
  },

  uploadAttachment: (file: File) => {
    const formData = new FormData();
    formData.append('attachment', file);
    return api.post<{ fileUrl: string; fileName: string }>('/messages/attachments', formData);
  },

  updateThreadImage: (threadId: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.put<{ threadId: string; imageUrl: string }>(`/messages/thread/${threadId}/image`, formData);
  },

  updateThreadTitle: (threadId: string, threadTitle: string) =>
    api.put<{ threadId: string; threadTitle: string }>(`/messages/thread/${threadId}/title`, { threadTitle }),

  getForUser: (userId: string) =>
    api.get<UserMessage[]>(`/messages/user/${userId}`, MESSAGE_REQUEST_OPTIONS),

  getInbox: (accountId: string, pageSize?: number) =>
    api.get<UserMessage[]>(`/messages/inbox/${accountId}`, {
      ...MESSAGE_REQUEST_OPTIONS,
      params: pageSize ? { pageSize } : undefined,
    }),

  getThread: (threadId: string, accountId: string, page = 1, pageSize = 40, beforeCreatedAt?: string, beforeMessageId?: string) =>
    api.get<UserMessage[]>(`/messages/thread/${threadId}/messages`, {
      ...MESSAGE_REQUEST_OPTIONS,
      params: { accountId, page, pageSize, beforeCreatedAt, beforeMessageId },
    }),

  getUnreadCount: (accountId: string) =>
    api.get<{ unreadCount: number }>(`/messages/unread-count/${accountId}`),

  getRecentConversations: (accountId: string, limit = 5) =>
    api.get<UserRecentConversation[]>(`/messages/recent/${accountId}`, {
      ...MESSAGE_REQUEST_OPTIONS,
      params: { limit },
    }),

  getSent: (accountId: string, pageSize?: number) =>
    api.get<UserMessage[]>(`/messages/sent/${accountId}`, {
      ...MESSAGE_REQUEST_OPTIONS,
      params: pageSize ? { pageSize } : undefined,
    }),

  markRead: (messageId: string, recipientUserId: string) =>
    api.put(`/messages/${messageId}/read`, { recipientUserId }),

  react: (messageId: string, accountId: string, reaction: string | null) =>
    api.put<UserMessage>(`/messages/${messageId}/reaction`, { accountId, reaction }),

  sendTyping: (senderAccountId: string, recipientUserId: string, typingName: string, isTyping = true) =>
    api.post('/messages/typing', { senderAccountId, recipientUserId, typingName, isTyping }),

  updatePresence: (status: 'active' | 'away' | 'busy') =>
    api.post<{ ok: boolean; status: 'active' | 'away' | 'busy' }>('/messages/presence', { status }),

  archive: (messageId: string, recipientUserId: string) =>
    api.put(`/messages/${messageId}/archive`, { recipientUserId }),

  delete: (messageId: string, accountId: string) =>
    api.delete<UserMessage>(`/messages/${messageId}`, { data: { accountId } }),

  deleteThread: (threadId: string, accountId: string) =>
    api.delete(`/messages/thread/${threadId}`, { data: { accountId } }),
};

export const dashboardPostService = {
  getAll: (limit = 10) =>
    api.get<DashboardPost[]>('/dashboard-posts', { params: { limit } }),

  getById: (id: string) =>
    api.get<DashboardPost>(`/dashboard-posts/${id}`),

  create: (post: Pick<DashboardPost, 'title' | 'body' | 'category' | 'imageUrl' | 'allowComments'> & { requesterId?: string; authorName?: string }) =>
    api.post<DashboardPost>('/dashboard-posts', post),

  update: (id: string, post: Pick<DashboardPost, 'title' | 'body' | 'category' | 'imageUrl' | 'allowComments'>) =>
    api.put<DashboardPost>(`/dashboard-posts/${id}`, post),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ imageUrl: string }>('/dashboard-posts/images', formData, { timeout: 30000 });
  },

  delete: (id: string, requesterId?: string) =>
    api.delete(`/dashboard-posts/${id}`, { data: { requesterId } }),

  react: (id: string, reaction: DashboardReaction | null) =>
    api.put<DashboardPost>(`/dashboard-posts/${id}/reaction`, { reaction }),

  getComments: (id: string) =>
    api.get<DashboardPostComment[]>(`/dashboard-posts/${id}/comments`),

  addComment: (id: string, body: string, parentCommentId?: string | null) =>
    api.post<DashboardPostComment>(`/dashboard-posts/${id}/comments`, { body, parentCommentId }),

  updateComment: (id: string, commentId: string, body: string) =>
    api.put<DashboardPostComment>(`/dashboard-posts/${id}/comments/${commentId}`, { body }),

  flagComment: (id: string, commentId: string, reason: string) =>
    api.post<DashboardPostComment>(`/dashboard-posts/${id}/comments/${commentId}/flag`, { reason }),

  unflagComment: (id: string, commentId: string) =>
    api.delete<DashboardPostComment>(`/dashboard-posts/${id}/comments/${commentId}/flag`),

  pinComment: (id: string, commentId: string, isPinned: boolean) =>
    api.put<DashboardPostComment>(`/dashboard-posts/${id}/comments/${commentId}/pin`, { isPinned }),

  deleteComment: (id: string, commentId: string) =>
    api.delete(`/dashboard-posts/${id}/comments/${commentId}`),
};

export const dashboardSummaryService = {
  get: () =>
    api.get<DashboardSummary>('/dashboard/summary'),
};

export const districtFeedService = {
  createPost: (post: { category: DistrictFeedPostCategory; title: string; body: string }) =>
    api.post<DistrictFeedPost>('/district-feed/posts', post),
  updatePost: (id: string, post: { category: DistrictFeedPostCategory; title: string; body: string }) =>
    api.put<DistrictFeedPost>(`/district-feed/posts/${id}`, post),
  deletePost: (id: string) =>
    api.delete(`/district-feed/posts/${id}`),
};

export const mediaService = {
  getAll: (params?: { folder?: string; q?: string; page?: number; limit?: number }) =>
    api.get<MediaLibraryResponse>('/media', { params }),
  createFolder: (name: string, parent?: string) =>
    api.post<MediaLibraryFolder>('/media/folders', { name, parent }),
  renameFolder: (folder: string, name: string) =>
    api.put<Pick<MediaLibraryFolder, 'key' | 'label'>>('/media/folders', { folder, name }),
  deleteFolder: (folder: string) =>
    api.delete('/media/folders', { data: { folder } }),
  uploadImages: (folder: string, files: File[], onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('folder', folder);
    files.forEach((file) => formData.append('images', file));
    return api.post<{ uploadedCount: number; skippedCount: number; uploaded: string[]; skipped: Array<{ fileName: string; reason: string }> }>('/media/images', formData, {
      timeout: 300000,
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
  },
  renameImage: (folder: string, fileName: string, name: string) =>
    api.put<{ fileName: string }>('/media/images/rename', { folder, fileName, name }),
  deleteImage: (folder: string, fileName: string) =>
    mediaService.deleteImages([{ folder, fileName }]),
  moveImages: (items: Array<Pick<MediaLibraryItem, 'folder' | 'fileName'>>, targetFolder: string) =>
    api.post<{ movedCount: number; skipped: Array<{ fileName: string; reason: string }> }>('/media/images/move', { items, targetFolder }),
  getImageUsage: (items: Array<Pick<MediaLibraryItem, 'folder' | 'fileName'>>) =>
    api.post<{ usages: MediaUsageRecord[] }>('/media/images/usage', { items }),
  deleteImages: (items: Array<Pick<MediaLibraryItem, 'folder' | 'fileName'>>) =>
    api.post<{ deletedCount: number; skipped: Array<{ fileName: string; reason: string }> }>('/media/images/delete', { items }),
  deleteAllProfilePictures: (batchSize?: number) =>
    api.delete<ProfilePictureDeleteAllResponse>('/media/profile-pictures', {
      params: batchSize ? { batchSize } : undefined,
    }),
};

export const notificationSoundService = {
  getAll: () =>
    api.get<{ sounds: NotificationSound[] }>('/notification-sounds'),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('sound', file);
    return api.post<{ sound: NotificationSound }>('/notification-sounds', formData, { timeout: 60000 });
  },
  delete: (id: string) =>
    api.delete('/notification-sounds/' + encodeURIComponent(id)),
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

  clearAll: () =>
    api.delete<{ message: string; cleared: number }>('/notifications'),
};

export const urgentAlertService = {
  getPending: () =>
    api.get<UrgentAlert[]>('/urgent-alerts'),

  getRecent: () =>
    api.get<UrgentAlert[]>('/urgent-alerts/recent'),

  create: (alert: {
    title: string;
    message: string;
    severity: UrgentAlertSeverity;
    audienceType: UrgentAlertAudienceType;
    targetDistrict?: string;
    targetUserIds?: string[];
    requireAcknowledgement: boolean;
    expiresAt?: string;
  }) =>
    api.post<UrgentAlert>('/urgent-alerts', alert),

  acknowledge: (id: string) =>
    api.put<{ message: string }>(`/urgent-alerts/${id}/acknowledge`),

  remove: (id: string) =>
    api.delete<{ message: string }>(`/urgent-alerts/${id}`),
};

export const quickLaunchService = {
  get: () =>
    api.get<QuickLaunchResponse>('/quick-launch'),

  save: (slots: QuickLaunchSlot[]) =>
    api.put<QuickLaunchResponse>('/quick-launch', { slots }),
};

export const reminderService = {
  getAll: () =>
    api.get<Reminder[]>('/reminders'),

  create: (title: string, remindOn: string, priority: Reminder['priority'] = 'Normal', notes = '', remindAt?: string | null, recurrenceRule: Reminder['recurrenceRule'] = 'none') =>
    api.post<Reminder>('/reminders', { title, remindOn, priority, notes, remindAt, recurrenceRule }),

  update: (id: string, updates: { title?: string; remindOn?: string; remindAt?: string | null; priority?: Reminder['priority']; notes?: string; recurrenceRule?: Reminder['recurrenceRule']; completed?: boolean }) =>
    api.put<Reminder>(`/reminders/${id}`, updates),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/reminders/${id}`),
};

export const pinnedProfileService = {
  getAll: () =>
    api.get<PinnedProfile[]>('/pinned-profiles'),

  pin: (userId: string) =>
    api.post<PinnedProfile>(`/pinned-profiles/${userId}`),

  unpin: (userId: string) =>
    api.delete<{ message: string }>(`/pinned-profiles/${userId}`),
};

export const quickNoteService = {
  get: () =>
    api.get<QuickNote>('/quick-notes'),

  save: (content: string) =>
    api.put<QuickNote>('/quick-notes', { content }),
};

export const mileageService = {
  getSummary: (accountId?: string) =>
    api.get<MileageSummary>(accountId ? `/mileage/summary/${accountId}` : '/mileage/summary'),

  updateMilestone: (milestone: number) =>
    api.put<{ milestone: number }>('/mileage/milestone', { milestone }),

  getAchievements: () =>
    api.get<MileageAchievement[]>('/mileage/achievements'),

  createAchievement: (achievement: AchievementPayload) =>
    api.post<MileageAchievement>('/mileage/achievements', achievement),

  updateAchievement: (id: string, achievement: AchievementPayload) =>
    api.put<MileageAchievement>(`/mileage/achievements/${id}`, achievement),

  deleteAchievement: (id: string) =>
    api.delete(`/mileage/achievements/${id}`),
};

export const performanceEvaluationService = {
  getAll: (params?: { page?: number; pageSize?: number }) =>
    api.get<PerformanceEvaluation[]>('/performance-evaluations', { params }),

  create: (evaluation: CreatePerformanceEvaluationPayload) =>
    api.post<PerformanceEvaluation>('/performance-evaluations', evaluation),

  sign: (id: string, signature: string, employeeComments: string) =>
    api.post<PerformanceEvaluation>(`/performance-evaluations/${id}/sign`, { signature, employeeComments }),

  remind: (id: string) =>
    api.post<PerformanceEvaluation>(`/performance-evaluations/${id}/remind`),
};

export default api;
