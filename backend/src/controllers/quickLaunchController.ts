import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { QuickLaunchModel, QuickLaunchSlot } from '../models/QuickLaunch';
import { broadcastAccountEvent } from '../services/appEvents';

const SLOT_COUNT = 8;
const allowedAppIds = new Set([
  'dashboard',
  'messages',
  'calendar',
  'devices',
  'calculator',
  'search',
  'reports',
  'create-user',
  'audit',
  'permissions',
]);

function sanitizeExternalUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url.trim());
    return ['http:', 'https:'].includes(parsedUrl.protocol) ? parsedUrl.toString() : null;
  } catch {
    return null;
  }
}

function normalizeSlots(slots: unknown): QuickLaunchSlot[] {
  const parsedSlots = Array.isArray(slots) ? slots : [];
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = parsedSlots[index];
    if (typeof slot === 'string') return allowedAppIds.has(slot) ? slot : null;
    if (
      typeof slot === 'object' &&
      slot !== null &&
      (slot as { type?: unknown }).type === 'external' &&
      typeof (slot as { label?: unknown }).label === 'string' &&
      typeof (slot as { url?: unknown }).url === 'string'
    ) {
      const url = sanitizeExternalUrl((slot as { url: string }).url);
      if (!url) return null;

      return {
        type: 'external',
        label: (slot as { label: string }).label.trim().slice(0, 60),
        url,
      };
    }
    return null;
  });
}

export class QuickLaunchController {
  static async getSlots(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const slots = normalizeSlots(await QuickLaunchModel.getSlots(account.id));
      res.json({ slots });
    } catch (error) {
      console.error('Load quick launch error:', error);
      res.status(500).json({ error: 'Failed to load quick launch' });
    }
  }

  static async saveSlots(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const slots = normalizeSlots(req.body?.slots);
      const savedSlots = await QuickLaunchModel.saveSlots(account.id, slots);
      broadcastAccountEvent(account.id, { type: 'quick-launch-updated' });
      res.json({ slots: savedSlots });
    } catch (error) {
      console.error('Save quick launch error:', error);
      res.status(500).json({ error: 'Failed to save quick launch' });
    }
  }
}
