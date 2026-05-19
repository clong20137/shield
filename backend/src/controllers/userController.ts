import { Request, Response } from 'express';
import fs from 'fs';
import { User, UserModel } from '../models/User';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';
import { cleanMultiline, cleanString, isOneOf, isStrongPassword, isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from '../utils/validation';
import { isSafeUploadedImage } from '../middleware/profileUpload';
import { parsePagination } from '../utils/pagination';

const employmentTypes = ['Civilian', 'Police', 'Recruit', 'MC Inspector', 'Inactive', 'Other', 'CPS'] as const;
const userStatuses = ['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Administrative Duty', 'Inactive'] as const;
const sexOptions = ['Male', 'Female'] as const;
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'] as const;
const selfEditableFields = new Set([
  'profilePictureUrl',
  'personalPhoneNumber',
  'departmentPhoneNumber',
  'residentialAddress',
  'mailingAddress',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
  'maritalStatus',
]);

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

function getDuplicateUserMessage(error: unknown): string {
  const text = typeof error === 'object' && error !== null
    ? `${(error as { sqlMessage?: string; message?: string }).sqlMessage || ''} ${(error as { message?: string }).message || ''}`.toLowerCase()
    : '';

  if (text.includes('penumber')) {
    return 'That PE number is already assigned to another user.';
  }

  if (text.includes('badgenumber')) {
    return 'That badge number is already assigned to another user.';
  }

  if (text.includes('publicsafetyid')) {
    return 'That public safety ID is already assigned to another user.';
  }

  if (text.includes('email')) {
    return 'That email is already assigned to another user.';
  }

  return 'A unique user identifier is already assigned to another user.';
}

function validateUserPayload(body: Record<string, unknown>, isCreate: boolean): { value?: Record<string, unknown>; error?: string } {
  const has = (field: string) => Object.prototype.hasOwnProperty.call(body, field);
  const firstName = cleanString(body.firstName, 100);
  const lastName = cleanString(body.lastName, 100);
  const email = normalizeEmail(body.email);
  const employmentType = cleanString(body.employmentType, 100);
  const status = cleanString(body.status, 100);
  const sex = cleanString(body.sex, 20);
  const maritalStatus = cleanString(body.maritalStatus, 30);
  const personalPhoneNumber = normalizePhone(body.personalPhoneNumber);
  const departmentPhoneNumber = normalizePhone(body.departmentPhoneNumber);
  const emergencyContactPhone = normalizePhone(body.emergencyContactPhone);

  if ((isCreate || has('firstName') || has('lastName')) && (!firstName || !lastName)) {
    return { error: 'First and last name are required' };
  }

  if (has('email') && email && !isValidEmail(email)) {
    return { error: 'Enter a valid email address' };
  }

  if (has('employmentType') && employmentType && !isOneOf(employmentType, employmentTypes)) {
    return { error: 'Choose a valid employee type' };
  }

  if (has('status') && status && !isOneOf(status, userStatuses)) {
    return { error: 'Choose a valid status' };
  }

  if (has('sex') && sex && !isOneOf(sex, sexOptions)) {
    return { error: 'Sex must be Male or Female' };
  }

  if (has('maritalStatus') && maritalStatus && !isOneOf(maritalStatus, maritalStatuses)) {
    return { error: 'Choose a valid marital status' };
  }

  if ((has('personalPhoneNumber') && !isValidPhone(personalPhoneNumber)) || (has('departmentPhoneNumber') && !isValidPhone(departmentPhoneNumber))) {
    return { error: 'Phone numbers must be valid 10-digit phone numbers' };
  }

  if (has('emergencyContactPhone') && !isValidPhone(emergencyContactPhone)) {
    return { error: 'Emergency contact phone must be a valid 10-digit phone number' };
  }

  const cleaned: Record<string, unknown> = {};
  const setCleanString = (field: string, maxLength: number) => {
    if (isCreate || has(field)) cleaned[field] = cleanString(body[field], maxLength);
  };
  const setCleanMultiline = (field: string, maxLength: number) => {
    if (isCreate || has(field)) cleaned[field] = cleanMultiline(body[field], maxLength);
  };

  setCleanString('firstName', 100);
  setCleanString('lastName', 100);
  if (isCreate || has('email')) cleaned.email = email;
  setCleanString('profilePictureUrl', 500);
  setCleanString('peNumber', 50);
  setCleanString('peopleSoftId', 50);
  setCleanString('carNumber', 50);
  setCleanString('badgeNumber', 50);
  setCleanString('radioNumber', 50);
  if (isCreate || has('personalPhoneNumber')) cleaned.personalPhoneNumber = personalPhoneNumber;
  if (isCreate || has('departmentPhoneNumber')) cleaned.departmentPhoneNumber = departmentPhoneNumber;
  setCleanString('assignedTo', 150);
  setCleanString('district', 100);
  setCleanString('rank', 100);
  if (isCreate || has('isActive')) cleaned.isActive = body.isActive !== false;
  if (isCreate || has('employmentType')) cleaned.employmentType = employmentType || 'Other';
  setCleanString('typeDetails', 100);
  if (isCreate || has('status')) cleaned.status = status || 'Active';
  setCleanString('supervisor', 150);
  setCleanMultiline('specialtyCertifications', 2000);
  setCleanString('publicSafetyId', 50);
  setCleanString('race', 50);
  if (isCreate || has('sex')) cleaned.sex = sex;
  if (isCreate || has('maritalStatus')) cleaned.maritalStatus = maritalStatus;
  setCleanMultiline('residentialAddress', 1000);
  setCleanMultiline('mailingAddress', 1000);
  setCleanString('emergencyContactName', 150);
  setCleanString('emergencyContactRelationship', 100);
  if (isCreate || has('emergencyContactPhone')) cleaned.emergencyContactPhone = emergencyContactPhone;
  if (isCreate || has('receivesMessages')) cleaned.receivesMessages = body.receivesMessages !== false;

  return {
    value: cleaned,
  };
}

async function canEditProtectedUserFields(req: Request): Promise<boolean> {
  const account = await getSessionAccount(req);
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:edit');
}

function includesProtectedSelfUpdate(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => !selfEditableFields.has(key));
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
      const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 250 });

      const users = await UserModel.getAllUsers(pageSize, offset);
      res.json({
        data: users,
        page,
        limit: pageSize,
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
        return res.status(409).json({ error: getDuplicateUserMessage(error) });
      }

      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (sessionAccount?.id === id && !(await canEditProtectedUserFields(req)) && includesProtectedSelfUpdate(req.body)) {
        return res.status(403).json({ error: 'User management permission required to edit personnel fields' });
      }

      const validation = validateUserPayload(req.body, false);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid user data' });
      }

      if (sessionAccount?.id === id && validation.value.isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }

      const success = await UserModel.updateUser(id, validation.value);

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (validation.value.isActive === false) {
        broadcastAccountEvent(id, { type: 'session-revoked', entityId: id });
        await AuthSessionModel.revokeAllSessions(id);
      }

      broadcastAppEvent({ type: 'user-updated', entityId: id });
      broadcastAppEvent({ type: 'dashboard-updated', entityId: id });

      res.json({ message: 'User updated successfully' });
    } catch (error) {
      if (isDuplicateUserError(error)) {
        return res.status(409).json({ error: getDuplicateUserMessage(error) });
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

      const profilePictureUrl = `/uploads/profile-pictures/${file.filename}`;
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
