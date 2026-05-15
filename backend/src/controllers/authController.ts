import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';
import { getBearerToken, getSessionAccount } from '../middleware/authSession';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isDuplicateEmailError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

async function canManageRoles(accountId?: string): Promise<boolean> {
  if (!accountId) {
    return false;
  }

  const account = await AuthAccountModel.getAccountById(accountId);
  if (account?.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  return permissions.includes('roles:manage');
}

async function canListAccounts(accountId?: string): Promise<boolean> {
  if (!accountId) {
    return false;
  }

  const account = await AuthAccountModel.getAccountById(accountId);
  if (account?.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  return permissions.includes('roles:manage') || permissions.includes('devices:manage');
}

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { email, password, displayName } = req.body as {
        email?: string;
        password?: string;
        displayName?: string;
      };

      if (!email || !password || !displayName) {
        return res.status(400).json({ error: 'Email, password, and display name are required' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const account = await AuthAccountModel.createAccount(email, password, displayName);
      const token = await AuthSessionModel.createSession(account.id);
      res.status(201).json({ account, token });
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'An account already exists for that email' });
      }

      console.error('Register error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password, twoFactorCode } = req.body as {
        email?: string;
        password?: string;
        twoFactorCode?: string;
      };

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const result = await AuthAccountModel.verifyLogin(email, password, twoFactorCode);

      if (result.requiresTwoFactor) {
        return res.status(202).json({ requiresTwoFactor: true });
      }

      if (!result.account) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = await AuthSessionModel.createSession(result.account.id);
      res.json({ account: result.account, token });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to sign in' });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const { accountId, currentPassword, newPassword } = req.body as {
        accountId?: string;
        currentPassword?: string;
        newPassword?: string;
      };

      if (!accountId || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Account, current password, and new password are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }

      const changed = await AuthAccountModel.changePassword(accountId, currentPassword, newPassword);

      if (!changed) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  }

  static async getSession(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      res.json({ account });
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to load session' });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const token = getBearerToken(req);

      if (token) {
        await AuthSessionModel.revokeToken(token);
      }

      res.json({ message: 'Signed out' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to sign out' });
    }
  }

  static async setupTwoFactor(req: Request, res: Response) {
    try {
      const { accountId } = req.body as { accountId?: string };

      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const setup = await AuthAccountModel.createTwoFactorSetup(accountId);

      if (!setup) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json(setup);
    } catch (error) {
      console.error('Setup 2FA error:', error);
      res.status(500).json({ error: 'Failed to set up 2FA' });
    }
  }

  static async enableTwoFactor(req: Request, res: Response) {
    try {
      const { accountId, code } = req.body as { accountId?: string; code?: string };

      if (!accountId || !code) {
        return res.status(400).json({ error: 'Account and verification code are required' });
      }

      const account = await AuthAccountModel.enableTwoFactor(accountId, code);

      if (!account) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      res.json({ account });
    } catch (error) {
      console.error('Enable 2FA error:', error);
      res.status(500).json({ error: 'Failed to enable 2FA' });
    }
  }

  static async disableTwoFactor(req: Request, res: Response) {
    try {
      const { accountId, password } = req.body as { accountId?: string; password?: string };

      if (!accountId || !password) {
        return res.status(400).json({ error: 'Account and password are required' });
      }

      const account = await AuthAccountModel.disableTwoFactor(accountId, password);

      if (!account) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }

      res.json({ account });
    } catch (error) {
      console.error('Disable 2FA error:', error);
      res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  }

  static async listAccounts(req: Request, res: Response) {
    try {
      const requesterId = typeof req.query.requesterId === 'string' ? req.query.requesterId : undefined;

      if (!(await canListAccounts(requesterId))) {
        return res.status(403).json({ error: 'Account list permission required' });
      }

      const accounts = await AuthAccountModel.listAccounts();
      res.json(accounts);
    } catch (error) {
      console.error('List accounts error:', error);
      res.status(500).json({ error: 'Failed to load accounts' });
    }
  }

  static async updateRole(req: Request, res: Response) {
    try {
      const { requesterId, role } = req.body as {
        requesterId?: string;
        role?: string;
      };
      const { accountId } = req.params;

      if (!(await canManageRoles(requesterId))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      if (!role || !(await AuthAccountModel.roleExists(role))) {
        return res.status(400).json({ error: 'Choose an existing role' });
      }

      const accounts = await AuthAccountModel.listAccounts();
      const administratorCount = accounts.filter((account) => account.role === 'administrator').length;
      const targetAccount = accounts.find((account) => account.id === accountId);

      if (!targetAccount) {
        return res.status(404).json({ error: 'Account not found' });
      }

      if (targetAccount.role === 'administrator' && role !== 'administrator' && administratorCount <= 1) {
        return res.status(400).json({ error: 'At least one administrator account is required' });
      }

      const account = await AuthAccountModel.updateRole(accountId, role);
      res.json({ account });
    } catch (error) {
      console.error('Update account role error:', error);
      res.status(500).json({ error: 'Failed to update account role' });
    }
  }

  static async updateMessagePreferences(req: Request, res: Response) {
    try {
      const { receiveMessages } = req.body as { receiveMessages?: boolean };
      const { accountId } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (!sessionAccount || sessionAccount.id !== accountId) {
        return res.status(403).json({ error: 'You can only update your own message preferences' });
      }

      if (typeof receiveMessages !== 'boolean') {
        return res.status(400).json({ error: 'Message preference is required' });
      }

      const account = await AuthAccountModel.updateMessagePreferences(accountId, receiveMessages);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json({ account });
    } catch (error) {
      console.error('Update message preferences error:', error);
      res.status(500).json({ error: 'Failed to update message preferences' });
    }
  }

  static async listRoles(req: Request, res: Response) {
    try {
      const requesterId = typeof req.query.requesterId === 'string' ? req.query.requesterId : undefined;

      if (!(await canManageRoles(requesterId))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      const roles = await AuthAccountModel.listRoles();
      res.json(roles);
    } catch (error) {
      console.error('List roles error:', error);
      res.status(500).json({ error: 'Failed to load roles' });
    }
  }

  static async createRole(req: Request, res: Response) {
    try {
      const { requesterId, name, permissions } = req.body as {
        requesterId?: string;
        name?: string;
        permissions?: string[];
      };

      if (!(await canManageRoles(requesterId))) {
        return res.status(403).json({ error: 'Role management permission required' });
      }

      if (!name?.trim()) {
        return res.status(400).json({ error: 'Role name is required' });
      }

      const role = await AuthAccountModel.createRole(name, Array.isArray(permissions) ? permissions : []);
      res.status(201).json(role);
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: 'A role with that name already exists' });
      }

      console.error('Create role error:', error);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
}
