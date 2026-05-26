import { NextFunction, Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { getSessionAccount } from './authSession';

export async function getRequestAccount(req: Request) {
  return getSessionAccount(req);
}

function shouldAllowPasswordChange(req: Request, accountId: string): boolean {
  return req.method === 'POST' && req.path === '/change-password' && req.body?.accountId === accountId;
}

function blockUntilPasswordChanged(req: Request, res: Response, account: { id: string; mustChangePassword?: boolean }): boolean {
  if (!account.mustChangePassword || shouldAllowPasswordChange(req, account.id)) {
    return false;
  }

  res.status(403).json({ error: 'Password change required before continuing', mustChangePassword: true });
  return true;
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await getRequestAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (blockUntilPasswordChanged(req, res, account)) {
        return;
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

      if (blockUntilPasswordChanged(req, res, account)) {
        return;
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

      if (blockUntilPasswordChanged(req, res, account)) {
        return;
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
