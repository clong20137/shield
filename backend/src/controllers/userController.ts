import { Request, Response } from 'express';
import fs from 'fs';
import { User, UserModel } from '../models/User';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { cleanMultiline, cleanString, isOneOf, isStrongPassword, isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from '../utils/validation';
import { isSafeUploadedImage } from '../middleware/profileUpload';

const employmentTypes = ['Civilian', 'Police', 'Recruit', 'MC Inspector', 'Inactive', 'Other', 'CPS'] as const;
const userStatuses = ['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Administrative Duty', 'Inactive'] as const;
const sexOptions = ['Male', 'Female'] as const;
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'] as const;

async function canManageRoles(req: Request): Promise<boolean> {
  const account = await getSessionAccount(req);
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('roles:manage');
}

function isDuplicateUserError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

function validateUserPayload(body: Record<string, unknown>, isCreate: boolean): { value?: Record<string, unknown>; error?: string } {
  const firstName = cleanString(body.firstName, 100);
  const lastName = cleanString(body.lastName, 100);
  const email = normalizeEmail(body.email);
  const employmentType = cleanString(body.employmentType, 100);
  const status = cleanString(body.status, 100) || 'Active';
  const sex = cleanString(body.sex, 20);
  const maritalStatus = cleanString(body.maritalStatus, 30);
  const personalPhoneNumber = normalizePhone(body.personalPhoneNumber);
  const departmentPhoneNumber = normalizePhone(body.departmentPhoneNumber);

  if (isCreate && (!firstName || !lastName)) {
    return { error: 'First and last name are required' };
  }

  if (email && !isValidEmail(email)) {
    return { error: 'Enter a valid email address' };
  }

  if (employmentType && !isOneOf(employmentType, employmentTypes)) {
    return { error: 'Choose a valid employee type' };
  }

  if (status && !isOneOf(status, userStatuses)) {
    return { error: 'Choose a valid status' };
  }

  if (sex && !isOneOf(sex, sexOptions)) {
    return { error: 'Sex must be Male or Female' };
  }

  if (maritalStatus && !isOneOf(maritalStatus, maritalStatuses)) {
    return { error: 'Choose a valid marital status' };
  }

  if (!isValidPhone(personalPhoneNumber) || !isValidPhone(departmentPhoneNumber)) {
    return { error: 'Phone numbers must be valid 10-digit phone numbers' };
  }

  return {
    value: {
      ...body,
      firstName,
      lastName,
      email,
      profilePictureUrl: cleanString(body.profilePictureUrl, 500),
      peNumber: cleanString(body.peNumber, 50),
      peopleSoftId: cleanString(body.peopleSoftId, 50),
      carNumber: cleanString(body.carNumber, 50),
      badgeNumber: cleanString(body.badgeNumber, 50),
      radioNumber: cleanString(body.radioNumber, 50),
      personalPhoneNumber,
      departmentPhoneNumber,
      assignedTo: cleanString(body.assignedTo, 150),
      district: cleanString(body.district, 100),
      rank: cleanString(body.rank, 100),
      isActive: body.isActive !== false,
      employmentType: employmentType || 'Other',
      typeDetails: cleanString(body.typeDetails, 100),
      status,
      supervisor: cleanString(body.supervisor, 150),
      specialtyCertifications: cleanMultiline(body.specialtyCertifications, 2000),
      publicSafetyId: cleanString(body.publicSafetyId, 50),
      race: cleanString(body.race, 50),
      sex,
      maritalStatus,
      residentialAddress: cleanMultiline(body.residentialAddress, 1000),
      mailingAddress: cleanMultiline(body.mailingAddress, 1000),
      receivesMessages: body.receivesMessages !== false,
    },
  };
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
      const { password, role } = req.body as { password?: string; role?: string };
      const validation = validateUserPayload(req.body, true);

      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid user data' });
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

      const user = await UserModel.createUser({ ...validation.value, password, role } as Parameters<typeof UserModel.createUser>[0]);
      broadcastAppEvent({ type: 'user-updated', entityId: user.id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: user.id });
      res.status(201).json(user);
    } catch (error) {
      if (isDuplicateUserError(error)) {
        return res.status(409).json({ error: 'A user with that email, PE number, badge number, or identifier already exists' });
      }

      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const validation = validateUserPayload(req.body, false);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid user data' });
      }

      const success = await UserModel.updateUser(id, validation.value);

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: id });
      res.json({ message: 'User updated successfully' });
    } catch (error) {
      if (isDuplicateUserError(error)) {
        return res.status(409).json({ error: 'A user with that email, PE number, badge number, or identifier already exists' });
      }

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

      if (!isSafeUploadedImage(file.path)) {
        fs.rmSync(file.path, { force: true });
        return res.status(400).json({ error: 'Only valid image uploads are allowed' });
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
