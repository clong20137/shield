import { NextFunction, Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { getSessionAccount } from './authSession';

export async function getRequestAccount(req: Request) {
  return getSessionAccount(req);
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await getRequestAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (account.role === 'administrator') {
        return next();
      }

      const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
      if (!permissions.includes(permission)) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}

export function requireAnyPermission(requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await getRequestAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (account.role === 'administrator') {
        return next();
      }

      const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
      if (!requiredPermissions.some((permission) => permissions.includes(permission))) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}

export function requireSelfOrPermission(getTargetId: (req: Request) => string | undefined, permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await getRequestAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (account.id === getTargetId(req) || account.role === 'administrator') {
        return next();
      }

      const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
      if (!permissions.includes(permission)) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}
