export type PresenceStatus = 'active' | 'away' | 'busy';
export type PresenceDisplayStatus = PresenceStatus | 'offline';

export interface PresenceState {
  online: boolean;
  away: boolean;
  status?: PresenceStatus | null;
  lastSeenAt?: string | null;
}

export interface PresenceRealtimePayload {
  actorAccountId?: string;
  actorOnline?: boolean;
  actorAway?: boolean;
  actorStatus?: string | null;
  actorLastSeenAt?: string | null;
}

export interface PresenceSnapshot {
  online: boolean;
  away: boolean;
  status: PresenceStatus;
  displayStatus: PresenceDisplayStatus;
  lastSeenAt: string | null;
  label: string;
  showPulse: boolean;
}

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const AWAY_WINDOW_MS = 5 * 60 * 1000;
const PRESENCE_CACHE_KEY = 'shield_presence_cache';
export const PRESENCE_UPDATED_EVENT = 'shield:presence-updated';

const presenceCache: Record<string, PresenceState> = (() => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRESENCE_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
})();

export function normalizePresenceStatus(status?: string | null): PresenceStatus {
  return status === 'away' || status === 'busy' ? status : 'active';
}

function persistPresenceCache() {
  try {
    window.localStorage.setItem(PRESENCE_CACHE_KEY, JSON.stringify(presenceCache));
  } catch {
    // Presence should stay best-effort; storage limits should not affect messaging.
  }
}

function ageCachedPresence(presence: PresenceState): PresenceState {
  if (!presence.online || !presence.lastSeenAt) {
    return presence;
  }

  const lastSeenTime = new Date(presence.lastSeenAt).getTime();
  if (Number.isNaN(lastSeenTime) || Date.now() - lastSeenTime < AWAY_WINDOW_MS) {
    return presence;
  }

  return {
    ...presence,
    online: false,
    away: false,
  };
}

export function getCachedPresence(accountId?: string | null): PresenceState | null {
  if (!accountId) {
    return null;
  }

  const presence = presenceCache[accountId];
  return presence ? ageCachedPresence(presence) : null;
}

export function getCachedPresenceMap(accountIds: string[]): Record<string, PresenceState> {
  return accountIds.reduce<Record<string, PresenceState>>((map, accountId) => {
    const presence = getCachedPresence(accountId);
    if (presence) {
      map[accountId] = presence;
    }
    return map;
  }, {});
}

export function parsePresenceRealtimeEvent(event: Event): PresenceRealtimePayload | null {
  try {
    return JSON.parse((event as MessageEvent).data || '{}') as PresenceRealtimePayload;
  } catch {
    return null;
  }
}

export function syncPresenceFromPayload(payload: PresenceRealtimePayload | null): { accountId: string; presence: PresenceState } | null {
  if (!payload?.actorAccountId) {
    return null;
  }

  const presence: PresenceState = {
    online: payload.actorOnline === true,
    away: payload.actorAway === true,
    status: normalizePresenceStatus(payload.actorStatus),
    lastSeenAt: payload.actorLastSeenAt || null,
  };
  presenceCache[payload.actorAccountId] = presence;
  persistPresenceCache();
  window.dispatchEvent(new CustomEvent(PRESENCE_UPDATED_EVENT, {
    detail: {
      accountId: payload.actorAccountId,
      presence,
    },
  }));

  return { accountId: payload.actorAccountId, presence };
}

export function subscribePresenceCache(listener: (accountId: string, presence: PresenceState) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ accountId?: string; presence?: PresenceState }>).detail;
    if (detail?.accountId && detail.presence) {
      listener(detail.accountId, detail.presence);
    }
  };

  window.addEventListener(PRESENCE_UPDATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(PRESENCE_UPDATED_EVENT, handler as EventListener);
}

function getLastSeenTime(lastSeenAt?: string | null): number | null {
  if (!lastSeenAt) {
    return null;
  }

  const value = new Date(lastSeenAt).getTime();
  return Number.isNaN(value) ? null : value;
}

export function getLastSeenPresence(lastSeenAt?: string | null): Pick<PresenceSnapshot, 'online' | 'away' | 'status' | 'displayStatus' | 'lastSeenAt' | 'label' | 'showPulse'> {
  const lastSeenTime = getLastSeenTime(lastSeenAt);
  if (!lastSeenTime) {
    return {
      online: false,
      away: false,
      status: 'active',
      displayStatus: 'offline',
      lastSeenAt: lastSeenAt || null,
      label: 'Offline',
      showPulse: false,
    };
  }

  const diffMs = Date.now() - lastSeenTime;
  if (diffMs < ACTIVE_WINDOW_MS) {
    return {
      online: true,
      away: false,
      status: 'active',
      displayStatus: 'active',
      lastSeenAt: lastSeenAt || null,
      label: 'Active',
      showPulse: true,
    };
  }

  if (diffMs < AWAY_WINDOW_MS) {
    return {
      online: false,
      away: true,
      status: 'away',
      displayStatus: 'away',
      lastSeenAt: lastSeenAt || null,
      label: 'Away',
      showPulse: true,
    };
  }

  return {
    online: false,
    away: false,
    status: 'active',
    displayStatus: 'offline',
    lastSeenAt: lastSeenAt || null,
    label: 'Offline',
    showPulse: false,
  };
}

export function getPresenceSnapshot(realtime?: PresenceState | null, fallbackLastSeenAt?: string | null): PresenceSnapshot {
  if (!realtime) {
    return getLastSeenPresence(fallbackLastSeenAt);
  }

  const status = normalizePresenceStatus(realtime.status);
  const online = realtime.online === true;
  if (!online) {
    return {
      online: false,
      away: false,
      status,
      displayStatus: 'offline',
      lastSeenAt: realtime.lastSeenAt || fallbackLastSeenAt || null,
      label: 'Offline',
      showPulse: false,
    };
  }

  if (status === 'busy') {
    return {
      online: true,
      away: false,
      status,
      displayStatus: 'busy',
      lastSeenAt: realtime.lastSeenAt || fallbackLastSeenAt || null,
      label: 'Busy',
      showPulse: true,
    };
  }

  if (status === 'away' || realtime.away === true) {
    return {
      online: true,
      away: true,
      status: 'away',
      displayStatus: 'away',
      lastSeenAt: realtime.lastSeenAt || fallbackLastSeenAt || null,
      label: 'Away',
      showPulse: true,
    };
  }

  return {
    online: true,
    away: false,
    status: 'active',
    displayStatus: 'active',
    lastSeenAt: realtime.lastSeenAt || fallbackLastSeenAt || null,
    label: 'Active',
    showPulse: true,
  };
}

export function getLastOnlineLabel(snapshot: PresenceSnapshot): string {
  if (snapshot.displayStatus === 'active') {
    return 'Active';
  }

  if (snapshot.displayStatus === 'away') {
    return 'Away';
  }

  if (snapshot.displayStatus === 'busy') {
    return 'Busy';
  }

  const lastSeenTime = getLastSeenTime(snapshot.lastSeenAt);
  if (!lastSeenTime) {
    return 'Last online: Never';
  }

  const diffMs = Date.now() - lastSeenTime;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return `Last online ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last online ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Last online ${days} day${days === 1 ? '' : 's'} ago`;
  }

  return `Last online ${new Date(lastSeenTime).toLocaleString()}`;
}
