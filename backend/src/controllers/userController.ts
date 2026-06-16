import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { User, UserModel } from '../models/User';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';
import { AuditLogModel } from '../models/AuditLog';
import { cleanMultiline, cleanString, isOneOf, isStrongPassword, isValidEmail, isValidPhone, normalizeEmail, normalizePhone, strongPasswordMessage } from '../utils/validation';
import { isSafeUploadedImage } from '../middleware/profileUpload';
import { parsePagination } from '../utils/pagination';
import { createImageThumbnails } from '../services/imageThumbnails';

const employmentTypes = ['Civilian', 'Police', 'Recruit', 'MC Inspector', 'Inactive', 'Other', 'CPS'] as const;
const userStatuses = ['Active', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', 'Administrative Duty', 'Inactive'] as const;
const sexOptions = ['Male', 'Female'] as const;
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'] as const;
const DEFAULT_IMPORT_PASSWORD = 'SHIELD2026!Temp';
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

function requestAuditFields(req: Request) {
  return {
    ipAddress: cleanString(req.ip || req.socket.remoteAddress, 45) || null,
    userAgent: cleanString(req.get('user-agent'), 255) || null,
  };
}

function safeUserDetails(user: User) {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    district: user.district,
    rank: user.rank,
    peNumber: user.peNumber,
    badgeNumber: user.badgeNumber,
    isActive: user.isActive,
    isHidden: user.isHidden,
  };
}

type ImportRow = Record<string, unknown>;

function normalizeImportHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function getImportValue(row: ImportRow, aliases: string[], maxLength: number): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null) {
      const cleanedValue = cleanString(String(value), maxLength);
      if (cleanedValue) {
        return cleanedValue;
      }
    }
  }

  return '';
}

function buildSupervisorName(row: ImportRow): string {
  const supervisorFirstName = getImportValue(row, ['supervisorfirstname'], 100);
  const supervisorPe = getImportValue(row, ['supervisorpe'], 50);

  if (supervisorFirstName && supervisorPe) {
    return `${supervisorFirstName} (PE ${supervisorPe})`;
  }

  return supervisorFirstName || (supervisorPe ? `PE ${supervisorPe}` : '');
}

function isImportUserActive(status: string): boolean {
  const normalizedStatus = status.trim().toLowerCase();
  return !['inactive', 'terminated', 'separated', 'retired'].includes(normalizedStatus);
}

function getPeCandidatesFromFileName(fileName: string): string[] {
  const baseName = path.parse(fileName).name.trim();
  const compactName = baseName.replace(/[^a-z0-9]/giu, '');
  const withoutPePrefix = compactName.replace(/^pe/iu, '');

  return Array.from(
    new Set([baseName, compactName, withoutPePrefix].map((value) => value.trim()).filter(Boolean)),
  );
}

function formatImportedName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/gu, (letter) => letter.toUpperCase());
}

function mapImportRow(row: ImportRow) {
  const status = getImportValue(row, ['status'], 100) || 'Active';
  const departmentCell = normalizePhone(getImportValue(row, ['departmentcell'], 50));
  const officePhone = normalizePhone(getImportValue(row, ['officephone'], 50));

  return {
    firstName: formatImportedName(getImportValue(row, ['firstname'], 100)),
    lastName: formatImportedName(getImportValue(row, ['lastname'], 100)),
    email: normalizeEmail(getImportValue(row, ['email'], 255)),
    profilePictureUrl: '',
    peNumber: getImportValue(row, ['pe'], 50),
    peopleSoftId: getImportValue(row, ['peoplesoftnumber'], 50),
    carNumber: '',
    badgeNumber: '',
    radioNumber: '',
    personalPhoneNumber: '',
    departmentPhoneNumber: departmentCell || officePhone,
    assignedTo: getImportValue(row, ['assignedto'], 150),
    district: getImportValue(row, ['assignmentlocation'], 100) || getImportValue(row, ['physicallocation'], 100),
    rank: getImportValue(row, ['rank'], 100) || getImportValue(row, ['title'], 100),
    isActive: isImportUserActive(status),
    isHidden: false,
    employmentType: getImportValue(row, ['employementtype', 'employmenttype'], 100) || 'Other',
    typeDetails: getImportValue(row, ['employementtypedetails', 'employmenttypedetails'], 100),
    status,
    supervisor: buildSupervisorName(row),
    specialtyCertifications: '',
    publicSafetyId: '',
    race: '',
    sex: '',
    maritalStatus: '',
    residentialAddress: '',
    mailingAddress: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',
    role: 'user',
    receivesMessages: true,
    password: DEFAULT_IMPORT_PASSWORD,
  };
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
  if (isCreate || has('isHidden')) cleaned.isHidden = body.isHidden === true;
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

async function canViewHiddenUsers(req: Request): Promise<boolean> {
  const account = await getSessionAccount(req);
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:view-hidden');
}

function isHiddenFromRequester(user: User, requesterId: string | undefined, canViewHidden: boolean): boolean {
  return Boolean(user.isHidden) && user.id !== requesterId && !canViewHidden;
}

function includesProtectedSelfUpdate(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => !selfEditableFields.has(key));
}

export class UserController {
  static async suggestAddresses(req: Request, res: Response) {
    try {
      const query = cleanString(req.query.q, 200);
      if (query.length < 3) {
        return res.json([]);
      }

      const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
      url.searchParams.set('address', query);
      url.searchParams.set('benchmark', 'Public_AR_Current');
      url.searchParams.set('format', 'json');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          return res.json([]);
        }

        const data = await response.json() as {
          result?: { addressMatches?: Array<{ matchedAddress?: string }> };
        };
        const suggestions = Array.from(
          new Set(
            (data.result?.addressMatches || [])
              .map((match) => cleanString(match.matchedAddress, 300))
              .filter(Boolean),
          ),
        ).slice(0, 8);

        return res.json(suggestions);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.error('Address suggestion error:', error);
      return res.json([]);
    }
  }

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

      const isPagedRequest = req.query.page !== undefined || req.query.pageSize !== undefined || req.query.limit !== undefined;
      const includeHidden = await canViewHiddenUsers(req);

      if (isPagedRequest) {
        const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 250 });
        const rows = await UserModel.searchUsers(q ?? '', filters, { includeHidden, limit: pageSize + 1, offset });
        const hasMore = rows.length > pageSize;
        const users = hasMore ? rows.slice(0, pageSize) : rows;
        return res.json({
          data: users,
          page,
          limit: pageSize,
          count: users.length,
          hasMore,
        });
      }

      const users = await UserModel.searchUsers(q ?? '', filters, { includeHidden });
      res.json(users);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  }

  static async getAllUsers(req: Request, res: Response) {
    try {
      const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 250 });

      const users = await UserModel.getAllUsers(pageSize, offset, await canViewHiddenUsers(req));
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
      const sessionAccount = await getSessionAccount(req);

      if (!user || isHiddenFromRequester(user, sessionAccount?.id, await canViewHiddenUsers(req))) {
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
        return res.status(400).json({ error: strongPasswordMessage });
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
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'users.created',
        entityType: 'user',
        entityId: user.id,
        details: JSON.stringify({ user: safeUserDetails(user), passwordAssigned: Boolean(password) }),
        ...requestAuditFields(req),
      });
      res.status(201).json(user);
    } catch (error) {
      if (isDuplicateUserError(error)) {
        return res.status(409).json({ error: getDuplicateUserMessage(error) });
      }

      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  static async importUsers(req: Request, res: Response) {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'XLSX file is required' });
      }

      const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

      if (!worksheet) {
        return res.status(400).json({ error: 'The workbook does not contain any sheets' });
      }

      const rows = XLSX.utils.sheet_to_json<ImportRow>(worksheet, {
        defval: '',
        raw: false,
      }).map((row) => Object.entries(row).reduce<ImportRow>((normalizedRow, [key, value]) => {
        normalizedRow[normalizeImportHeader(key)] = value;
        return normalizedRow;
      }, {}));

      const actor = await getSessionAccount(req);
      const createdUsers: Array<Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'peNumber'>> = [];
      const skippedRows: Array<{ rowNumber: number; reason: string }> = [];
      const seenEmails = new Set<string>();
      const seenPeNumbers = new Set<string>();

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const importUser = mapImportRow(row);
        const normalizedEmail = importUser.email.toLowerCase();
        const normalizedPeNumber = importUser.peNumber.toLowerCase();

        if (!importUser.firstName || !importUser.lastName || !importUser.email) {
          skippedRows.push({ rowNumber, reason: 'First name, last name, and email are required' });
          continue;
        }

        if (!isValidEmail(importUser.email)) {
          skippedRows.push({ rowNumber, reason: 'Email is invalid' });
          continue;
        }

        if (seenEmails.has(normalizedEmail) || (normalizedPeNumber && seenPeNumbers.has(normalizedPeNumber))) {
          skippedRows.push({ rowNumber, reason: 'Duplicate email or PE number in the import file' });
          continue;
        }

        const existingUser = await UserModel.findByImportIdentity(importUser.email, importUser.peNumber);
        if (existingUser) {
          skippedRows.push({ rowNumber, reason: 'A user with that email or PE number already exists' });
          continue;
        }

        try {
          const createdUser = await UserModel.createUser(importUser);
          createdUsers.push({
            id: createdUser.id,
            firstName: createdUser.firstName,
            lastName: createdUser.lastName,
            email: createdUser.email,
            peNumber: createdUser.peNumber,
          });
          seenEmails.add(normalizedEmail);
          if (normalizedPeNumber) {
            seenPeNumbers.add(normalizedPeNumber);
          }
        } catch (error) {
          skippedRows.push({
            rowNumber,
            reason: isDuplicateUserError(error) ? getDuplicateUserMessage(error) : 'Failed to create user',
          });
        }
      }

      if (createdUsers.length > 0) {
        broadcastAppEvent({ type: 'user-updated' });
        broadcastAppEvent({ type: 'dashboard-updated' });
      }

      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'users.imported',
        entityType: 'user',
        entityId: null,
        details: JSON.stringify({
          fileName: file.originalname,
          totalRows: rows.length,
          createdCount: createdUsers.length,
          skippedCount: skippedRows.length,
          defaultPasswordAssigned: true,
          mustChangePassword: true,
          hasCompletedOnboarding: false,
        }),
        ...requestAuditFields(req),
      });

      res.status(201).json({
        totalRows: rows.length,
        createdCount: createdUsers.length,
        skippedCount: skippedRows.length,
        createdUsers,
        skippedRows,
        defaultPassword: DEFAULT_IMPORT_PASSWORD,
      });
    } catch (error) {
      console.error('Import users error:', error);
      if (res.headersSent) {
        return;
      }

      res.status(500).json({ error: 'Failed to import users' });
    }
  }

  static async importProfilePictures(req: Request, res: Response) {
    try {
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'At least one profile photo is required' });
      }

      const actor = await getSessionAccount(req);
      const canViewHidden = await canViewHiddenUsers(req);
      const uploaded: Array<Pick<User, 'id' | 'firstName' | 'lastName' | 'peNumber'> & { profilePictureUrl: string; fileName: string }> = [];
      const skippedFiles: Array<{ fileName: string; peNumber: string; reason: string }> = [];

      for (const file of files) {
        const candidates = getPeCandidatesFromFileName(file.originalname);
        const displayPeNumber = candidates[0] || '';

        const skipFile = (reason: string) => {
          skippedFiles.push({ fileName: file.originalname, peNumber: displayPeNumber, reason });
          if (file.path) {
            fs.rmSync(file.path, { force: true });
          }
        };

        if (candidates.length === 0) {
          skipFile('File name does not include a PE number');
          continue;
        }

        if (!isSafeUploadedImage(file.path)) {
          skipFile('File is not a valid image');
          continue;
        }

        let targetUser: User | null = null;
        for (const candidate of candidates) {
          targetUser = await UserModel.getUserByPeNumber(candidate);
          if (targetUser) {
            break;
          }
        }

        if (!targetUser) {
          skipFile('No user found with that PE number');
          continue;
        }

        if (isHiddenFromRequester(targetUser, actor?.id, canViewHidden)) {
          skipFile('No user found with that PE number');
          continue;
        }

        if (targetUser.profilePictureUrl?.trim()) {
          skipFile('Profile picture already exists');
          continue;
        }

        await createImageThumbnails(file.path, [96, 256]);
        const profilePictureUrl = `/uploads/profile-pictures/${file.filename}`;
        const success = await UserModel.updateUser(targetUser.id, { profilePictureUrl });

        if (!success) {
          skipFile('Failed to update user profile picture');
          continue;
        }

        uploaded.push({
          id: targetUser.id,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          peNumber: targetUser.peNumber,
          profilePictureUrl,
          fileName: file.originalname,
        });
      }

      if (uploaded.length > 0) {
        broadcastAppEvent({ type: 'user-updated' });
        broadcastAppEvent({ type: 'dashboard-updated' });
      }

      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'users.profile_pictures_imported',
        entityType: 'user',
        entityId: null,
        details: JSON.stringify({
          totalFiles: files.length,
          uploadedCount: uploaded.length,
          skippedCount: skippedFiles.length,
        }),
        ...requestAuditFields(req),
      });

      res.status(201).json({
        totalFiles: files.length,
        uploadedCount: uploaded.length,
        skippedCount: skippedFiles.length,
        uploaded,
        skippedFiles,
      });
    } catch (error) {
      console.error('Import profile pictures error:', error);
      res.status(500).json({ error: 'Failed to import profile pictures' });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sessionAccount = await getSessionAccount(req);

      if (sessionAccount?.id === id && !(await canEditProtectedUserFields(req)) && includesProtectedSelfUpdate(req.body)) {
        return res.status(403).json({ error: 'User management permission required to edit personnel fields' });
      }

      const canViewHidden = await canViewHiddenUsers(req);

      if (Object.prototype.hasOwnProperty.call(req.body, 'isHidden') && !canViewHidden) {
        return res.status(403).json({ error: 'Hidden user permission required' });
      }

      const validation = validateUserPayload(req.body, false);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid user data' });
      }

      if (sessionAccount?.id === id && validation.value.isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }

      const before = await UserModel.getUserById(id);
      if (!before || isHiddenFromRequester(before, sessionAccount?.id, canViewHidden)) {
        return res.status(404).json({ error: 'User not found' });
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
      const after = await UserModel.getUserById(id);
      await AuditLogModel.create({
        actorId: sessionAccount?.id || null,
        actorName: sessionAccount?.displayName || sessionAccount?.email || null,
        action: validation.value.isActive === false ? 'users.deactivated' : 'users.updated',
        entityType: 'user',
        entityId: id,
        details: JSON.stringify({
          changedFields: Object.keys(validation.value),
          before: before ? safeUserDetails(before) : null,
          after: after ? safeUserDetails(after) : null,
          sessionsRevoked: validation.value.isActive === false,
        }),
        ...requestAuditFields(req),
      });

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
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'users.deleted',
        entityType: 'user',
        entityId: id,
        details: JSON.stringify({ id }),
        ...requestAuditFields(req),
      });
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  static async uploadProfilePicture(req: Request, res: Response) {
    try {
      const file = req.file;
      const targetUser = await UserModel.getUserById(req.params.id);
      const sessionAccount = await getSessionAccount(req);

      if (!file) {
        return res.status(400).json({ error: 'Profile picture is required' });
      }

      if (!targetUser || isHiddenFromRequester(targetUser, sessionAccount?.id, await canViewHiddenUsers(req))) {
        if (file.path) {
          fs.rmSync(file.path, { force: true });
        }
        return res.status(404).json({ error: 'User not found' });
      }

      if (!isSafeUploadedImage(file.path)) {
        fs.rmSync(file.path, { force: true });
        return res.status(400).json({ error: 'Only valid image uploads are allowed' });
      }

      await createImageThumbnails(file.path, [96, 256]);

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
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'users.profile_picture_updated',
        entityType: 'user',
        entityId: req.params.id,
        details: JSON.stringify({ profilePictureUrl }),
        ...requestAuditFields(req),
      });
      res.json({ profilePictureUrl, user });
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({ error: 'Failed to upload profile picture' });
    }
  }

  static async removeProfilePicture(req: Request, res: Response) {
    try {
      const targetUser = await UserModel.getUserById(req.params.id);
      const sessionAccount = await getSessionAccount(req);

      if (!targetUser || isHiddenFromRequester(targetUser, sessionAccount?.id, await canViewHiddenUsers(req))) {
        return res.status(404).json({ error: 'User not found' });
      }

      const success = await UserModel.updateUser(req.params.id, { profilePictureUrl: '' });

      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await UserModel.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      broadcastAppEvent({ type: 'user-updated', entityId: req.params.id });
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'users.profile_picture_removed',
        entityType: 'user',
        entityId: req.params.id,
        details: JSON.stringify({ id: req.params.id }),
        ...requestAuditFields(req),
      });
      res.json({ profilePictureUrl: '', user });
    } catch (error) {
      console.error('Profile picture remove error:', error);
      res.status(500).json({ error: 'Failed to remove profile picture' });
    }
  }
}
