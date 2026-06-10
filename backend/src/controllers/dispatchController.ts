import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { DispatchModel, DispatchUnitStatus } from '../models/Dispatch';
import { getSessionAccount } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { cleanString, isOneOf } from '../utils/validation';

const unitStatuses = ['Available', 'Assigned', 'En Route', 'On Scene', 'Clear'] as const;

async function canManageDispatch(account: { id: string; role: string } | null): Promise<boolean> {
  if (!account) return false;
  if (account.role === 'administrator' || account.role === 'supervisor') return true;
  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('dispatch:manage');
}

function getUnitLabel(account: { displayName?: string; email?: string; id: string }, requestedLabel?: unknown): string {
  return cleanString(requestedLabel, 80) || account.displayName || account.email || account.id;
}

function cleanCoordinate(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export class DispatchController {
  static async getActiveSummary(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const summary = await DispatchModel.getSummary(account.id);
      const includeNearestUnits = await canManageDispatch(account);
      res.json({
        ...summary,
        nearestUnits: includeNearestUnits ? summary.nearestUnits : [],
      });
    } catch (error) {
      console.error('Dispatch summary error:', error);
      res.status(500).json({ error: 'Failed to load dispatch summary' });
    }
  }

  static async assignSelf(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const call = await DispatchModel.getCall(req.params.callId);
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      const assignment = await DispatchModel.assignUnit(call.id, account.id, getUnitLabel(account, req.body?.unitLabel));
      broadcastAppEvent({ type: 'dispatch-updated', entityId: assignment.id });
      res.status(201).json(assignment);
    } catch (error) {
      console.error('Dispatch assignment error:', error);
      res.status(500).json({ error: 'Failed to assign unit' });
    }
  }

  static async updateAssignmentStatus(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const status = cleanString(req.body?.status, 30);
      if (!isOneOf(status, unitStatuses)) {
        return res.status(400).json({ error: 'Choose a valid unit status' });
      }

      const assignment = await DispatchModel.getAssignmentById(req.params.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      const canUpdate = assignment.accountId === account.id || await canManageDispatch(account);
      if (!canUpdate) {
        return res.status(403).json({ error: 'Dispatch permission required' });
      }

      const updated = await DispatchModel.updateAssignmentStatus(assignment.id, status as DispatchUnitStatus);
      broadcastAppEvent({ type: 'dispatch-updated', entityId: assignment.id });
      res.json(updated);
    } catch (error) {
      console.error('Dispatch status update error:', error);
      res.status(500).json({ error: 'Failed to update unit status' });
    }
  }

  static async recordLocation(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const assignment = await DispatchModel.getAssignmentById(req.params.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      const canUpdate = assignment.accountId === account.id || await canManageDispatch(account);
      if (!canUpdate) {
        return res.status(403).json({ error: 'Dispatch permission required' });
      }

      const latitude = cleanCoordinate(req.body?.latitude);
      const longitude = cleanCoordinate(req.body?.longitude);
      const speedMph = Math.max(0, Number(req.body?.speedMph) || 0);
      if (latitude === null || longitude === null) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
      }

      const updated = await DispatchModel.recordLocation(assignment.id, latitude, longitude, speedMph);
      broadcastAppEvent({ type: 'dispatch-updated', entityId: assignment.id });
      res.json(updated);
    } catch (error) {
      console.error('Dispatch location update error:', error);
      res.status(500).json({ error: 'Failed to update unit location' });
    }
  }
}
