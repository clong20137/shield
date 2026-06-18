import { NextFunction, Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { getSessionAccount } from './authSession';
import { auditSecurityEvent } from '../utils/securityAudit';

export async function getRequestAccount(req: Request) {
  return getSessionAccount(req);
}

function shouldAllowRequiredAccountSetup(req: Request, accountId: string): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return true;
  }

  if (req.method === 'POST' && req.path === '/change-password' && req.body?.accountId === accountId) {
    return true;
  }

  if (req.method === 'PUT' && req.path === `/accounts/${accountId}/onboarding-complete`) {
    return true;
  }

  if (req.method === 'PUT' && req.path === `/accounts/${accountId}/app-scale-preference`) {
    return true;
  }

  if (req.method === 'PUT' && req.path === `/accounts/${accountId}/default-duty-hours-preference`) {
    return true;
  }

  return false;
}

function blockUntilPasswordChanged(req: Request, res: Response, account: { id: string; mustChangePassword?: boolean }): boolean {
  if (!account.mustChangePassword || shouldAllowRequiredAccountSetup(req, account.id)) {
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
        void auditSecurityEvent({
          req,
          action: 'security.auth_required',
          entityType: 'access-control',
          details: { permission, reason: 'missing_session' },
        }).catch((error) => console.error('Security audit error:', error));
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
        void auditSecurityEvent({
          req,
          actor: account,
          action: 'security.permission_denied',
          entityType: 'access-control',
          entityId: account.id,
          details: { permission, reason: 'permission_missing' },
        }).catch((error) => console.error('Security audit error:', error));
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
        void auditSecurityEvent({
          req,
          action: 'security.auth_required',
          entityType: 'access-control',
          details: { requiredPermissions, reason: 'missing_session' },
        }).catch((error) => console.error('Security audit error:', error));
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
        void auditSecurityEvent({
          req,
          actor: account,
          action: 'security.permission_denied',
          entityType: 'access-control',
          entityId: account.id,
          details: { requiredPermissions, reason: 'permission_missing' },
        }).catch((error) => console.error('Security audit error:', error));
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
        void auditSecurityEvent({
          req,
          action: 'security.auth_required',
          entityType: 'access-control',
          details: { permission, targetId: getTargetId(req), reason: 'missing_session' },
        }).catch((error) => console.error('Security audit error:', error));
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
        void auditSecurityEvent({
          req,
          actor: account,
          action: 'security.permission_denied',
          entityType: 'access-control',
          entityId: account.id,
          details: { permission, targetId: getTargetId(req), reason: 'not_self_or_permission_missing' },
        }).catch((error) => console.error('Security audit error:', error));
        return res.status(403).json({ error: 'Permission denied' });
      }

      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
}
