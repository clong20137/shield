import { Request, Response } from 'express';
import { Device, DeviceInput, DeviceModel } from '../models/Device';
import { AuthAccountModel } from '../models/AuthAccount';
import { User, UserModel } from '../models/User';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { cleanMultiline, cleanString, isOneOf, isValidIsoDate, isValidPhone, normalizePhone } from '../utils/validation';
import { parsePagination } from '../utils/pagination';

function isDuplicateAssetTagError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

const deviceTypes = ['Cell Phone', 'MiFi Device', 'Computer', 'Radio', 'Cradlepoint'] as const;
const deviceStatuses = ['Available', 'Assigned', 'Maintenance', 'Retired', 'Damaged', 'Lost'] as const;
const deviceConditions = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const;

type PhoneImportRow = Record<string, unknown>;

const phoneExportHeaders = [
  'assetTag',
  'makeModel',
  'serialNumber',
  'assignedTo',
  'status',
  'location',
  'phoneNumber',
  'imei',
  'iccid',
  'replacementDueDate',
  'condition',
  'notes',
];

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D/gu, '');
}

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeLooseKey(value: unknown): string {
  return normalizeKey(value).replace(/[^a-z0-9]/gu, '');
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function getImportValue(row: PhoneImportRow, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeLooseKey);
  const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeLooseKey(key)));
  return cleanString(entry?.[1], 500);
}

function isNewUserImportRow(row: PhoneImportRow): boolean {
  const rawAssignedTo = getImportValue(row, ['assignedTo', 'assigned to', 'userName', 'user name', 'name', 'employeeName', 'employee name', 'user']);
  return normalizeLooseKey(rawAssignedTo) === 'newuser';
}

function getDisplayName(user: User): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.id;
}

function buildUserMatcher(users: User[]): Map<string, string> {
  const matcher = new Map<string, string>();

  users.forEach((user) => {
    const label = user.email || getDisplayName(user);
    const addKey = (value: unknown, loose = false) => {
      const key = loose ? normalizeLooseKey(value) : normalizeKey(value);
      if (key && !matcher.has(key)) {
        matcher.set(key, label);
      }
    };
    const fullName = getDisplayName(user);
    const lastFirst = `${user.lastName || ''} ${user.firstName || ''}`.trim();

    addKey(user.email);
    addKey(fullName);
    addKey(lastFirst);
    addKey(fullName, true);
    addKey(lastFirst, true);
    addKey(user.peNumber, true);
    addKey(normalizeLooseKey(user.peNumber).replace(/^pe/u, '').replace(/^0+/u, ''), true);
    addKey(user.badgeNumber, true);
    addKey(user.radioNumber, true);

    [user.departmentPhoneNumber, user.personalPhoneNumber].forEach((phone) => {
      const digits = normalizeDigits(phone);
      if (digits.length >= 7 && !matcher.has(digits)) {
        matcher.set(digits, label);
      }
    });
  });

  return matcher;
}

function resolveAssignedTo(row: PhoneImportRow, matcher: Map<string, string>): { assignedTo: string; matched: boolean } {
  const identity = getImportValue(row, [
    'assignedTo',
    'assigned to',
    'userName',
    'user name',
    'name',
    'employeeName',
    'employee name',
    'user',
    'email',
    'peNumber',
    'pe',
    'badgeNumber',
    'badge',
    'radioNumber',
    'radio',
  ]);
  const number = getImportValue(row, ['phoneNumber', 'phone number', 'wirelessNumber', 'wireless number', 'line', 'mobile']);

  if (isNewUserImportRow(row)) {
    return { assignedTo: '', matched: false };
  }

  const candidates = [
    normalizeKey(identity),
    normalizeLooseKey(identity),
    normalizeDigits(identity),
    normalizeDigits(number),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = matcher.get(candidate);
    if (match) {
      return { assignedTo: match, matched: true };
    }
  }

  return { assignedTo: identity, matched: false };
}

function buildDeviceMatchKey(device: Device): string[] {
  return [
    device.assetTag ? `asset:${normalizeKey(device.assetTag)}` : '',
    normalizeDigits(device.phoneNumber) ? `phone:${normalizeDigits(device.phoneNumber)}` : '',
    device.imei ? `imei:${normalizeLooseKey(device.imei)}` : '',
    device.simNumber ? `sim:${normalizeLooseKey(device.simNumber)}` : '',
    device.serialNumber ? `serial:${normalizeLooseKey(device.serialNumber)}` : '',
  ].filter(Boolean);
}

function cleanPhoneModelName(value: string): string {
  const normalizedValue = value.replace(/\s+/gu, ' ').trim();
  if (/cradlepoint/iu.test(normalizedValue)) {
    return 'Cradlepoint';
  }

  const iphoneMatch = normalizedValue.match(/\bi\s*phone\s*(\d{1,2})(?:\s*(pro\s*max|pro|plus|mini))?/iu);

  if (iphoneMatch) {
    const variant = iphoneMatch[2]
      ? iphoneMatch[2].replace(/\s+/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase())
      : '';
    return `iPhone ${iphoneMatch[1]}${variant ? ` ${variant}` : ''}`;
  }

  return normalizedValue || 'Agency Phone';
}

function getGeneratedAssetTag(type: string, phoneNumber: string, imei: string, simNumber: string, rowNumber?: number): string {
  const prefix = type === 'Cradlepoint' ? 'CRADLEPOINT' : type === 'Cell Phone' ? 'PHONE' : normalizeLooseKey(type).toUpperCase() || 'DEVICE';
  const phoneDigits = normalizeDigits(phoneNumber);
  const imeiKey = normalizeLooseKey(imei);
  const simKey = normalizeLooseKey(simNumber);

  if (phoneDigits) {
    return `${prefix}-${phoneDigits}`;
  }

  if (imeiKey) {
    return `${prefix}-IMEI-${imeiKey.slice(-6)}`;
  }

  if (simKey) {
    return `${prefix}-ICCID-${simKey.slice(-6)}`;
  }

  return `${prefix}-IMPORT-${rowNumber || Date.now()}`;
}

function buildImportedPhoneDevice(row: PhoneImportRow, assignedTo: string, rowNumber: number): DeviceInput {
  const phoneNumber = normalizePhone(getImportValue(row, ['phoneNumber', 'phone number', 'wirelessNumber', 'wireless number', 'line', 'mobile']));
  const imei = getImportValue(row, ['currentDeviceId4gOnly', 'current device id 4g only', 'current device id - 4g only', 'current device id', 'imei', 'imei1', 'imei 1']);
  const simNumber = getImportValue(row, ['sim', 'iccid', 'simNumber', 'sim number', 'eid']);
  const condition = getImportValue(row, ['condition']);
  const isNewUser = isNewUserImportRow(row);
  const importedModel = getImportValue(row, ['deviceModel', 'device model', 'deviceModal', 'device modal', 'makeModel', 'make model', 'model', 'device', 'description']);
  const makeModel = cleanPhoneModelName(importedModel);
  const type = /cradlepoint/iu.test(importedModel) || makeModel === 'Cradlepoint' ? 'Cradlepoint' : 'Cell Phone';
  const assetTag = getGeneratedAssetTag(type, phoneNumber, imei, simNumber, rowNumber);

  return {
    type,
    assetTag,
    makeModel,
    serialNumber: getImportValue(row, ['serialNumber', 'serial number', 'serial']),
    assignedTo,
    status: assignedTo ? 'Assigned' : 'Available',
    location: getImportValue(row, ['location', 'site', 'district']),
    notes: isNewUser ? [getImportValue(row, ['notes', 'note']), 'Phone import marked this line as NEW USER.'].filter(Boolean).join('\n') : getImportValue(row, ['notes', 'note']),
    phoneNumber,
    imei,
    simNumber,
    radioId: '',
    hostname: '',
    routerId: '',
    warrantyExpiration: '',
    replacementDueDate: getImportValue(row, ['replacementDueDate', 'replacement due date']),
    maintenanceDueDate: '',
    lastServiceDate: '',
    purchaseDate: getImportValue(row, ['purchaseDate', 'purchase date']),
    condition: condition === 'Excellent' ? 'New' : isOneOf(condition, deviceConditions) ? condition : 'Good',
  };
}

function validateDevicePayload(body: Record<string, unknown>) {
  const type = cleanString(body.type, 50);
  const phoneNumber = normalizePhone(body.phoneNumber);
  const imei = cleanString(body.imei, 100);
  const simNumber = cleanString(body.simNumber, 100);
  const assetTag = cleanString(body.assetTag, 100) || (type === 'Cell Phone' ? getGeneratedAssetTag(type, phoneNumber, imei, simNumber) : '');
  const makeModel = cleanString(body.makeModel, 150);
  const status = cleanString(body.status, 50) || 'Available';
  const condition = cleanString(body.condition, 50) || 'Good';
  const dateFields = ['warrantyExpiration', 'replacementDueDate', 'maintenanceDueDate', 'lastServiceDate', 'purchaseDate'] as const;
  const dates = Object.fromEntries(dateFields.map((field) => [field, cleanString(body[field], 20)])) as Record<typeof dateFields[number], string>;

  if (!type || !assetTag || !makeModel) {
    return { error: 'Device type, asset tag, and make/model are required' };
  }

  if (!isOneOf(type, deviceTypes)) {
    return { error: 'Choose a valid device type' };
  }

  if (!isOneOf(status, deviceStatuses)) {
    return { error: 'Choose a valid device status' };
  }

  if (!isOneOf(condition, deviceConditions)) {
    return { error: 'Choose a valid device condition' };
  }

  if (!isValidPhone(phoneNumber)) {
    return { error: 'Device phone number must be a valid 10-digit phone number' };
  }

  for (const field of dateFields) {
    if (dates[field] && !isValidIsoDate(dates[field])) {
      return { error: `${field} must use YYYY-MM-DD format` };
    }
  }

  return {
    value: {
      type,
      assetTag,
      makeModel,
      serialNumber: cleanString(body.serialNumber, 150),
      assignedTo: cleanString(body.assignedTo, 150),
      status,
      location: cleanString(body.location, 150),
      notes: cleanMultiline(body.notes, 5000),
      phoneNumber,
      imei,
      simNumber,
      radioId: cleanString(body.radioId, 100),
      hostname: cleanString(body.hostname, 150),
      routerId: cleanString(body.routerId, 150),
      warrantyExpiration: dates.warrantyExpiration,
      replacementDueDate: dates.replacementDueDate,
      maintenanceDueDate: dates.maintenanceDueDate,
      lastServiceDate: dates.lastServiceDate,
      purchaseDate: dates.purchaseDate,
      condition,
    },
  };
}

export class DeviceController {
  static async listAssignedDevices(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 100, maxPageSize: 200 });
      const devices = await DeviceModel.listAssignedDevices(account, pagination.pageSize, pagination.offset);
      res.json(devices);
    } catch (error) {
      console.error('Assigned device list error:', error);
      res.status(500).json({ error: 'Failed to load assigned devices' });
    }
  }

  static async listAssignedDevicesForUser(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const targetUser = await UserModel.getUserById(req.params.accountId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const permissions = account.role === 'administrator' ? ['users:view', 'devices:manage'] : await AuthAccountModel.getPermissionsForAccount(account.id);
      const canViewTarget = account.id === targetUser.id || account.role === 'administrator' || permissions.includes('users:view') || permissions.includes('devices:manage');
      if (!canViewTarget) {
        return res.status(403).json({ error: 'User profile permission required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 100, maxPageSize: 200 });
      const displayName = `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email || targetUser.id;
      const devices = await DeviceModel.listAssignedDevices({
        email: targetUser.email || '',
        displayName,
      }, pagination.pageSize, pagination.offset);
      res.json(devices);
    } catch (error) {
      console.error('Assigned user device list error:', error);
      res.status(500).json({ error: 'Failed to load assigned devices' });
    }
  }

  static async listDevices(req: Request, res: Response) {
    try {
      const pagination = parsePagination(req.query, { defaultPageSize: 250, maxPageSize: 500 });
      const result = await DeviceModel.listDevices(pagination.pageSize, pagination.offset, {
        q: cleanString(req.query.q, 150),
        type: cleanString(req.query.type, 50),
        status: cleanString(req.query.status, 50),
        sortKey: cleanString(req.query.sortKey, 50),
      });
      res.json({
        data: result.data,
        total: result.total,
        statusCounts: result.statusCounts,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / pagination.pageSize)),
      });
    } catch (error) {
      console.error('Device list error:', error);
      res.status(500).json({ error: 'Failed to load devices' });
    }
  }

  static async exportPhones(req: Request, res: Response) {
    try {
      const phones = await DeviceModel.listPhoneDevices();
      const rows = phones.map((device) =>
        phoneExportHeaders.map((header) => {
          const value = header === 'iccid' ? device.simNumber : device[header as keyof Device];
          return csvEscape(value);
        }).join(','),
      );
      const csv = [phoneExportHeaders.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="shield-phone-inventory.csv"');
      res.send(csv);
    } catch (error) {
      console.error('Phone export error:', error);
      res.status(500).json({ error: 'Failed to export phones' });
    }
  }

  static async importPhones(req: Request, res: Response) {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows as PhoneImportRow[] : [];
      const actorId = cleanString(req.body?.actorId, 36);
      const actorName = cleanString(req.body?.actorName, 150);

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Import rows are required' });
      }

      const users = await UserModel.getAllUsers(10000, 0, true);
      const userMatcher = buildUserMatcher(users);
      const existingPhones = await DeviceModel.listPhoneDevices();
      const deviceMatcher = new Map<string, Device>();
      existingPhones.forEach((device) => {
        buildDeviceMatchKey(device).forEach((key) => {
          if (!deviceMatcher.has(key)) {
            deviceMatcher.set(key, device);
          }
        });
      });

      const summary = {
        totalRows: rows.length,
        createdCount: 0,
        updatedCount: 0,
        matchedCount: 0,
        unmatchedRows: [] as Array<{ rowNumber: number; reason: string; row: PhoneImportRow }>,
        skippedRows: [] as Array<{ rowNumber: number; reason: string; row: PhoneImportRow }>,
      };
      const changedDeviceIds = new Set<string>();

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const assignment = resolveAssignedTo(row, userMatcher);
        const importedDevice = buildImportedPhoneDevice(row, assignment.assignedTo, rowNumber);
        const validation = validateDevicePayload(importedDevice as unknown as Record<string, unknown>);

        if (validation.error || !validation.value) {
          summary.skippedRows.push({ rowNumber, reason: validation.error || 'Invalid phone row', row });
          continue;
        }

        if (assignment.matched) {
          summary.matchedCount += 1;
        } else if (isNewUserImportRow(row)) {
          summary.unmatchedRows.push({ rowNumber, reason: 'Marked NEW USER in import and left unassigned for review', row });
        } else if (assignment.assignedTo) {
          summary.unmatchedRows.push({ rowNumber, reason: 'Could not match assignment to a SHIELD user', row });
        }

        const matchKeys = buildDeviceMatchKey(validation.value as Device);
        const existingDevice = matchKeys.map((key) => deviceMatcher.get(key)).find(Boolean);

        if (existingDevice) {
          const mergedDevice = {
            ...existingDevice,
            ...validation.value,
            serialNumber: validation.value.serialNumber || existingDevice.serialNumber,
            location: validation.value.location || existingDevice.location,
            notes: validation.value.notes || existingDevice.notes,
            replacementDueDate: validation.value.replacementDueDate || existingDevice.replacementDueDate,
            purchaseDate: validation.value.purchaseDate || existingDevice.purchaseDate,
            condition: validation.value.condition || existingDevice.condition,
          };
          const updated = await DeviceModel.updateDevice(existingDevice.id, mergedDevice, {
            action: 'Phone Import',
            actorId,
            actorName,
            assignedTo: mergedDevice.assignedTo,
            status: mergedDevice.status,
            notes: assignment.matched ? 'Updated from phone import and matched to user.' : 'Updated from phone import.',
          });

          if (updated) {
            summary.updatedCount += 1;
            changedDeviceIds.add(updated.id);
            buildDeviceMatchKey(updated).forEach((key) => deviceMatcher.set(key, updated));
          }
        } else {
          const created = await DeviceModel.createDevice(validation.value, {
            action: 'Phone Import',
            actorId,
            actorName,
            assignedTo: validation.value.assignedTo,
            status: validation.value.status,
            notes: assignment.matched ? 'Created from phone import and matched to user.' : 'Created from phone import.',
          });
          summary.createdCount += 1;
          changedDeviceIds.add(created.id);
          buildDeviceMatchKey(created).forEach((key) => deviceMatcher.set(key, created));
        }
      }

      changedDeviceIds.forEach((id) => broadcastAppEvent({ type: 'device-updated', entityId: id }));
      res.json(summary);
    } catch (error) {
      if (isDuplicateAssetTagError(error)) {
        return res.status(409).json({ error: 'A phone with that asset tag already exists' });
      }

      console.error('Phone import error:', error);
      res.status(500).json({ error: 'Failed to import phones' });
    }
  }

  static async deletePhones(req: Request, res: Response) {
    try {
      const deletedCount = await DeviceModel.deletePhoneDevices();
      broadcastAppEvent({ type: 'device-updated', entityId: 'phone-inventory' });
      res.json({ deletedCount });
    } catch (error) {
      console.error('Phone delete all error:', error);
      res.status(500).json({ error: 'Failed to delete phone inventory' });
    }
  }

  static async createDevice(req: Request, res: Response) {
    try {
      const { actorId, actorName, eventNotes } = req.body;
      const validation = validateDevicePayload(req.body);

      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid device data' });
      }

      const device = await DeviceModel.createDevice(validation.value, {
        actorId: cleanString(actorId, 36),
        actorName: cleanString(actorName, 150),
        notes: cleanMultiline(eventNotes, 2000),
      });

      broadcastAppEvent({ type: 'device-updated', entityId: device.id });
      res.status(201).json(device);
    } catch (error) {
      if (isDuplicateAssetTagError(error)) {
        return res.status(409).json({ error: 'A device with that asset tag already exists' });
      }

      console.error('Device create error:', error);
      res.status(500).json({ error: 'Failed to create device' });
    }
  }

  static async updateDevice(req: Request, res: Response) {
    try {
      const { actorId, actorName, eventAction, eventNotes } = req.body;
      const validation = validateDevicePayload(req.body);

      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid device data' });
      }

      const device = await DeviceModel.updateDevice(req.params.id, validation.value, {
        action: cleanString(eventAction, 100) || 'Updated',
        actorId: cleanString(actorId, 36),
        actorName: cleanString(actorName, 150),
        assignedTo: validation.value.assignedTo,
        status: validation.value.status,
        notes: cleanMultiline(eventNotes, 2000),
      });

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      broadcastAppEvent({ type: 'device-updated', entityId: device.id });
      res.json(device);
    } catch (error) {
      if (isDuplicateAssetTagError(error)) {
        return res.status(409).json({ error: 'A device with that asset tag already exists' });
      }

      console.error('Device update error:', error);
      res.status(500).json({ error: 'Failed to update device' });
    }
  }

  static async deleteDevice(req: Request, res: Response) {
    try {
      const deleted = await DeviceModel.deleteDevice(req.params.id, {
        actorId: cleanString(req.body?.actorId, 36),
        actorName: cleanString(req.body?.actorName, 150),
        notes: cleanMultiline(req.body?.eventNotes, 2000),
      });

      if (!deleted) {
        return res.status(404).json({ error: 'Device not found' });
      }

      broadcastAppEvent({ type: 'device-updated', entityId: req.params.id });
      res.json({ message: 'Device deleted successfully' });
    } catch (error) {
      console.error('Device delete error:', error);
      res.status(500).json({ error: 'Failed to delete device' });
    }
  }

  static async listDeviceEvents(req: Request, res: Response) {
    try {
      const pagination = parsePagination(req.query, { defaultPageSize: 100, maxPageSize: 250 });
      const events = await DeviceModel.listEvents(req.params.id, pagination.pageSize, pagination.offset);
      res.json(events);
    } catch (error) {
      console.error('Device events error:', error);
      res.status(500).json({ error: 'Failed to load device history' });
    }
  }

  static async addDeviceEvent(req: Request, res: Response) {
    try {
      const { action, actorId, actorName, assignedTo, status, notes } = req.body;
      const cleanAction = cleanString(action, 100);
      const cleanStatus = cleanString(status, 50);

      if (!cleanAction) {
        return res.status(400).json({ error: 'Action is required' });
      }

      if (cleanStatus && !isOneOf(cleanStatus, deviceStatuses)) {
        return res.status(400).json({ error: 'Choose a valid device status' });
      }

      const event = await DeviceModel.createEvent(req.params.id, {
        action: cleanAction,
        actorId: cleanString(actorId, 36),
        actorName: cleanString(actorName, 150),
        assignedTo: cleanString(assignedTo, 150),
        status: cleanStatus,
        notes: cleanMultiline(notes, 2000),
      });

      broadcastAppEvent({ type: 'device-updated', entityId: req.params.id });
      res.status(201).json(event);
    } catch (error) {
      console.error('Device event create error:', error);
      res.status(500).json({ error: 'Failed to add device history event' });
    }
  }
}
