import { Request, Response } from 'express';
import { User, UserModel } from '../models/User';

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
      const user = await UserModel.createUser(req.body);
      res.status(201).json(user);
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await UserModel.updateUser(id, req.body);

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

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

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
}
