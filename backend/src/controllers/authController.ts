import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';

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
      res.status(201).json({ account });
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

      res.json({ account: result.account });
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
}
