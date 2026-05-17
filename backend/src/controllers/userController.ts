import { Request, Response } from 'express';
import { User, UserModel } from '../models/User';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/u.test(password) && /[a-z]/u.test(password) && /\d/u.test(password);
}

async function canManageRoles(req: Request): Promise<boolean> {
  const account = await getSessionAccount(req);
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('roles:manage');
}

export class UserController {
  static async searchUsers(req: Request, res: Response) {
    try {
      const { q, rank, district, active, employmentType, status, sex, supervisor, badgeNumber, radioNumber, peNumber } = req.query;

      if (q !== undefined && typeof q !== 'string') {
        return res.status(400).json({ error: 'Search term must be a string' });
      }

      const filters: Partial<User> = {};
      if (typeof rank === 'string' && rank) filters.rank = rank;
      if (typeof district === 'string' && district) filters.district = district;
      if (typeof active === 'string' && active) filters.isActive = active === 'true';
      if (typeof employmentType === 'string' && employmentType) {
        filters.employmentType = employmentType;
      }
      if (typeof status === 'string' && status) filters.status = status;
      if (typeof sex === 'string' && sex) filters.sex = sex;
      if (typeof supervisor === 'string' && supervisor) filters.supervisor = supervisor;
      if (typeof badgeNumber === 'string' && badgeNumber) filters.badgeNumber = badgeNumber;
      if (typeof radioNumber === 'string' && radioNumber) filters.radioNumber = radioNumber;
      if (typeof peNumber === 'string' && peNumber) filters.peNumber = peNumber;

      const users = await UserModel.searchUsers(q ?? '', filters);
      res.json(users);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  }

  static async getAllUsers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      const users = await UserModel.getAllUsers(limit, offset);
      res.json({
        data: users,
        page,
        limit,
        count: users.length,
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  static async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = await UserModel.getUserById(id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }

  static async createUser(req: Request, res: Response) {
    try {
      const { password, email, role } = req.body as { password?: string; email?: string; role?: string };

      if (email && !isValidEmail(email.trim().toLowerCase())) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      if (password && !isStrongPassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, and a number' });
      }

      if (role && role !== 'user' && !(await canManageRoles(req))) {
        return res.status(403).json({ error: 'Role management permission required to assign that role' });
      }

      if (role && !(await AuthAccountModel.roleExists(role))) {
        return res.status(400).json({ error: 'Choose an existing role' });
      }

      const user = await UserModel.createUser(req.body);
      broadcastAppEvent({ type: 'user-updated', entityId: user.id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: user.id });
      res.status(201).json(user);
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (typeof req.body?.email === 'string' && req.body.email && !isValidEmail(req.body.email.trim().toLowerCase())) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      const success = await UserModel.updateUser(id, req.body);

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: id });
      res.json({ message: 'User updated successfully' });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await UserModel.deleteUser(id);

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: id });
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  static async uploadProfilePicture(req: Request, res: Response) {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Profile picture is required' });
      }

      const profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/profile-pictures/${file.filename}`;
      const success = await UserModel.updateUser(req.params.id, { profilePictureUrl });

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await UserModel.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: req.params.id });
      res.json({ profilePictureUrl, user });
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({ error: 'Failed to upload profile picture' });
    }
  }

  static async removeProfilePicture(req: Request, res: Response) {
    try {
      const success = await UserModel.updateUser(req.params.id, { profilePictureUrl: '' });

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await UserModel.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: req.params.id });
      res.json({ profilePictureUrl: '', user });
    } catch (error) {
      console.error('Profile picture remove error:', error);
      res.status(500).json({ error: 'Failed to remove profile picture' });
    }
  }
}
