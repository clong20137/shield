export const QUICK_LAUNCH_MIN_SLOT_COUNT = 4;
export const QUICK_LAUNCH_MAX_SLOT_COUNT = 10;
export const QUICK_LAUNCH_DEFAULT_SLOT_COUNT = 8;
export const QUICK_LAUNCH_KEY = 'shield_quick_launch';

export type QuickLaunchPlacement = 'dock' | 'sidebar';
export type QuickLaunchAppId = 'dashboard' | 'messages' | 'calendar' | 'devices' | 'calculator' | 'search' | 'reports' | 'create-user' | 'audit' | 'permissions';

export function normalizeQuickLaunchSlotCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count)) {
    return QUICK_LAUNCH_DEFAULT_SLOT_COUNT;
  }

  return Math.min(QUICK_LAUNCH_MAX_SLOT_COUNT, Math.max(QUICK_LAUNCH_MIN_SLOT_COUNT, Math.round(count)));
}

export function getQuickLaunchStorageKey(accountId: string): string {
  return `${QUICK_LAUNCH_KEY}_${accountId}`;
}
