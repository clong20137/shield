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
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const account = await AuthAccountModel.verifyLogin(email, password);

      if (!account) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      res.json({ account });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to sign in' });
    }
  }
}
