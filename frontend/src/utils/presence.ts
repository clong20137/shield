export type PresenceStatus = 'active' | 'away' | 'busy';
export type PresenceDisplayStatus = PresenceStatus | 'offline';

export interface PresenceState {
  online: boolean;
  away: boolean;
  status?: PresenceStatus | null;
  lastSeenAt?: string | null;
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

export function normalizePresenceStatus(status?: string | null): PresenceStatus {
  return status === 'away' || status === 'busy' ? status : 'active';
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
