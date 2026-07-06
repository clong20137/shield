type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DEVICE_REPORT_CACHE_TTL_MS = 45_000;
const DASHBOARD_SUMMARY_CACHE_TTL_MS = 20_000;

let deviceReportCache: CacheEntry<unknown> | null = null;
const dashboardSummaryCache = new Map<string, CacheEntry<unknown>>();

function isFresh(entry: CacheEntry<unknown> | null | undefined): boolean {
  return Boolean(entry && entry.expiresAt > Date.now());
}

export function getCachedDeviceReport<T>(): T | null {
  return isFresh(deviceReportCache) ? deviceReportCache?.value as T : null;
}

export function setCachedDeviceReport<T>(value: T) {
  deviceReportCache = {
    value,
    expiresAt: Date.now() + DEVICE_REPORT_CACHE_TTL_MS,
  };
}

export function clearDeviceReportCache() {
  deviceReportCache = null;
}

export function getCachedDashboardSummary<T>(accountId: string): T | null {
  const entry = dashboardSummaryCache.get(accountId);
  if (!isFresh(entry)) {
    if (entry) {
      dashboardSummaryCache.delete(accountId);
    }
    return null;
  }

  return entry ? entry.value as T : null;
}

export function setCachedDashboardSummary<T>(accountId: string, value: T) {
  dashboardSummaryCache.set(accountId, {
    value,
    expiresAt: Date.now() + DASHBOARD_SUMMARY_CACHE_TTL_MS,
  });
}

export function clearDashboardSummaryCacheForAccount(accountId: string | null | undefined) {
  if (!accountId) return;
  dashboardSummaryCache.delete(accountId);
}

export function clearDashboardSummaryCache() {
  dashboardSummaryCache.clear();
}

export function clearCachesForAppEvent(type: string) {
  if (type === 'device-updated') {
    clearDeviceReportCache();
  }

  if (['calendar-updated', 'dashboard-updated', 'user-updated', 'urgent-alert-created', 'urgent-alert-updated'].includes(type)) {
    clearDashboardSummaryCache();
  }
}

export function clearCachesForAccountEvent(accountId: string | null | undefined, type: string) {
  if (['reminder-updated', 'notification-created', 'notification-updated'].includes(type)) {
    clearDashboardSummaryCacheForAccount(accountId);
  }
}
