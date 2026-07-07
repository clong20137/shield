import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
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
const deviceCarriers = ['Verizon', 'AT&T'] as const;

type PhoneImportRow = Record<string, unknown>;
type PhoneImportType = 'verizon-phone' | 'att-firstnet';
type PhoneImportSummary = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  matchedCount: number;
  unmatchedRows: Array<{ rowNumber: number; reason: string; row: PhoneImportRow }>;
  skippedRows: Array<{ rowNumber: number; reason: string; row: PhoneImportRow }>;
};
type UserMatcher = {
  departmentPhones: Map<string, string>;
  identities: Map<string, string>;
};
type PhoneImportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
type PhoneImportJob = {
  id: string;
  status: PhoneImportJobStatus;
  rows: PhoneImportRow[];
  actorId: string;
  actorName: string;
  processedRows: number;
  totalRows: number;
  summary: PhoneImportSummary;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  importType: PhoneImportType;
};
interface ImportJobRow extends RowDataPacket {
  id: string;
  type: string;
  status: PhoneImportJobStatus;
  actorId: string | null;
  actorName: string | null;
  payloadJson: string | null;
  resultJson: string | null;
  processedRows: number;
  totalRows: number;
  error: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
}

const phoneExportHeaders = [
  'assetTag',
  'makeModel',
  'serialNumber',
  'assignedTo',
  'status',
  'carrier',
  'location',
  'phoneNumber',
  'imei',
  'iccid',
  'replacementDueDate',
  'activationDate',
  'contractEndDate',
  'eligibilityDate',
  'monthlyCharge',
  'condition',
  'notes',
];
const phoneImportJobs = new Map<string, PhoneImportJob>();
const PHONE_IMPORT_JOB_CHUNK_SIZE = 100;
const PHONE_IMPORT_JOB_RETENTION_MS = 60 * 60 * 1000;

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D/gu, '');
}

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeLooseKey(value: unknown): string {
  return normalizeKey(value).replace(/[^a-z0-9]/gu, '');
}

function normalizePhoneImportType(value: unknown): PhoneImportType {
  return normalizeLooseKey(value) === 'attfirstnet' ? 'att-firstnet' : 'verizon-phone';
}

function detectPhoneImportType(rows: PhoneImportRow[], requestedType: PhoneImportType): PhoneImportType {
  if (requestedType === 'att-firstnet') {
    return requestedType;
  }

  const headerKeys = new Set(
    rows.flatMap((row) => Object.keys(row).map(normalizeLooseKey)),
  );
  const hasAttFirstNetHeaders = (
    headerKeys.has('wirelessnumber') &&
    (
      headerKeys.has('wirelessuserfullname') ||
      headerKeys.has('phoneordeviceid') ||
      headerKeys.has('phoneordeviceidimei') ||
      headerKeys.has('phoneordevicemodel')
    )
  );

  return hasAttFirstNetHeaders ? 'att-firstnet' : requestedType;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function parseCsvRows(text: string): PhoneImportRow[] {
  const [headerLine, ...lines] = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (!headerLine) {
    return [];
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim());
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<PhoneImportRow>((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

function waitForImportJobYield() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function toIsoDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getImportValue(row: PhoneImportRow, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeLooseKey);
  const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeLooseKey(key)));
  return cleanString(entry?.[1], 500);
}

function normalizeImportDate(value: string): string {
  const text = value.replace(/[–—]/gu, '-').trim();
  if (!text) {
    return '';
  }

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/u);
  if (isoMatch) {
    return isoMatch[1];
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/iu);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }

  const excelSerial = Number(text);
  if (Number.isFinite(excelSerial) && excelSerial > 20_000 && excelSerial < 80_000) {
    const date = new Date(Date.UTC(1899, 11, 30 + excelSerial));
    return date.toISOString().slice(0, 10);
  }

  return '';
}

function normalizeImportMoney(value: string): number {
  const amount = Number(value.replace(/[$,\s]/gu, ''));
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function isNewUserImportRow(row: PhoneImportRow): boolean {
  const rawAssignedTo = getImportValue(row, ['assignedTo', 'assigned to', 'userName', 'user name', 'wirelessUserFullName', 'wireless user full name', 'name', 'employeeName', 'employee name', 'user']);
  return normalizeLooseKey(rawAssignedTo) === 'newuser';
}

function hasImportAssignee(row: PhoneImportRow): boolean {
  return Boolean(getImportValue(row, ['assignedTo', 'assigned to', 'userName', 'user name', 'wirelessUserFullName', 'wireless user full name', 'name', 'employeeName', 'employee name', 'user']).trim());
}

function getDisplayName(user: User): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.id;
}

function getPhoneMatchKeys(value: unknown): string[] {
  const digits = normalizeDigits(value);
  if (digits.length < 7) {
    return [];
  }

  return [...new Set([digits, digits.length > 10 ? digits.slice(-10) : ''].filter(Boolean))];
}

function buildUserMatcher(users: User[]): UserMatcher {
  const departmentPhones = new Map<string, string>();
  const identities = new Map<string, string>();

  users.forEach((user) => {
    const label = user.email || getDisplayName(user);
    const addKey = (value: unknown, loose = false) => {
      const key = loose ? normalizeLooseKey(value) : normalizeKey(value);
      if (key && !identities.has(key)) {
        identities.set(key, label);
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

    getPhoneMatchKeys(user.departmentPhoneNumber).forEach((phoneKey) => {
      if (!departmentPhones.has(phoneKey)) {
        departmentPhones.set(phoneKey, label);
      }
    });
  });

  return { departmentPhones, identities };
}

function getIdentityMatchKeys(value: string): string[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  const keys = [
    normalizeKey(trimmedValue),
    normalizeLooseKey(trimmedValue),
    normalizeDigits(trimmedValue),
  ];
  const commaNameMatch = trimmedValue.match(/^([^,]+),\s*(.+)$/u);
  if (commaNameMatch) {
    const lastName = commaNameMatch[1].trim();
    const firstName = commaNameMatch[2].trim().split(/\s+/u)[0] || '';
    keys.push(normalizeLooseKey(`${firstName} ${lastName}`));
    keys.push(normalizeLooseKey(`${lastName} ${firstName}`));
  } else {
    const nameParts = trimmedValue.split(/\s+/u).filter(Boolean);
    if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      keys.push(normalizeLooseKey(`${firstName} ${lastName}`));
      keys.push(normalizeLooseKey(`${lastName} ${firstName}`));
    }
  }

  return [...new Set(keys.filter(Boolean))];
}

function resolveAssignedTo(row: PhoneImportRow, matcher: UserMatcher): { assignedTo: string; matched: boolean } {
  const identity = getImportValue(row, [
    'assignedTo',
    'assigned to',
    'userName',
    'user name',
    'wirelessUserFullName',
    'wireless user full name',
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
  const email = getImportValue(row, ['emailAddress', 'email address', 'email']);
  const number = getImportValue(row, ['phoneNumber', 'phone number', 'wirelessNumber', 'wireless number', 'wirlessNumber', 'wirless number', 'wireless', 'wirless', 'line', 'mobile']);

  if (isNewUserImportRow(row)) {
    return { assignedTo: '', matched: false };
  }

  for (const candidate of getPhoneMatchKeys(number)) {
    const match = matcher.departmentPhones.get(candidate);
    if (match) {
      return { assignedTo: match, matched: true };
    }
  }

  const identityCandidates = [
    ...getIdentityMatchKeys(identity),
    ...getIdentityMatchKeys(email),
  ];

  for (const candidate of identityCandidates) {
    const match = matcher.identities.get(candidate);
    if (match) {
      return { assignedTo: match, matched: true };
    }
  }

  return { assignedTo: '', matched: false };
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
  const normalizedValue = value
    .replace(/\b(black|white|red|blue|green|yellow|purple|pink|gold|silver|gray|grey|graphite|midnight|starlight|product\s+red)\b/giu, ' ')
    .replace(/\b\d+\s*(gb|tb)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (/cradlepoint/iu.test(normalizedValue)) {
    return 'Cradlepoint';
  }

  if (/(verizon\s+jetpack|inseego)/iu.test(normalizedValue)) {
    return normalizedValue.match(/inseego/iu) ? 'Inseego MiFi' : 'Verizon Jetpack';
  }

  const iphoneMatch = normalizedValue.match(/\bi\s*phone\s*(\d{1,2})(e)?(?:\s*(pro\s*max|pro|plus|mini))?/iu);

  if (iphoneMatch) {
    const suffix = iphoneMatch[2] ? 'e' : '';
    const variant = iphoneMatch[3]
      ? iphoneMatch[3].replace(/\s+/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase())
      : '';
    return `iPhone ${iphoneMatch[1]}${suffix}${variant ? ` ${variant}` : ''}`;
  }

  return normalizedValue || 'Agency Phone';
}

function getImportedDeviceType(modelName: string): DeviceInput['type'] {
  if (/cradlepoint/iu.test(modelName)) {
    return 'Cradlepoint';
  }

  if (/(verizon\s+jetpack|inseego)/iu.test(modelName)) {
    return 'MiFi Device';
  }

  return 'Cell Phone';
}

function getGeneratedAssetTag(type: string, phoneNumber: string, imei: string, simNumber: string, rowNumber?: number): string {
  const prefix = type === 'Cradlepoint' ? 'CRADLEPOINT' : type === 'MiFi Device' ? 'MIFI' : type === 'Cell Phone' ? 'PHONE' : normalizeLooseKey(type).toUpperCase() || 'DEVICE';
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

function buildImportedPhoneDevice(row: PhoneImportRow, assignedTo: string, rowNumber: number, importType: PhoneImportType): DeviceInput {
  const phoneNumber = normalizePhone(getImportValue(row, ['phoneNumber', 'phone number', 'wirelessNumber', 'wireless number', 'wirlessNumber', 'wirless number', 'wireless', 'wirless', 'line', 'mobile']));
  const imei = getImportValue(row, ['phoneOrDeviceIdImei', 'phone or device id imei', 'phone or device id (imei)', 'phone or device id', 'currentDeviceId4gOnly', 'current device id 4g only', 'current device id - 4g only', 'currentDeviceId', 'current device id', 'imei', 'imei1', 'imei 1']);
  const simNumber = getImportValue(row, ['sim', 'iccid', 'simNumber', 'sim number', 'eid']);
  const condition = getImportValue(row, ['condition']);
  const isNewUser = isNewUserImportRow(row);
  const importedModel = getImportValue(row, ['phoneOrDeviceModel', 'phone or device model', 'deviceModel', 'device model', 'deviceModelName', 'device model name', 'deviceModal', 'device modal', 'equipmentModel', 'equipment model', 'makeModel', 'make model', 'model', 'device', 'description']);
  const makeModel = cleanPhoneModelName(importedModel);
  const type = getImportedDeviceType(importedModel || makeModel);
  const assetTag = getGeneratedAssetTag(type, phoneNumber, imei, simNumber, rowNumber);

  return {
    type,
    assetTag,
    makeModel,
    serialNumber: getImportValue(row, ['serialNumber', 'serial number', 'serial']),
    assignedTo,
    status: assignedTo ? 'Assigned' : 'Available',
    carrier: importType === 'att-firstnet' ? 'AT&T' : 'Verizon',
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
    activationDate: normalizeImportDate(getImportValue(row, ['contractActivationDate', 'contract activation date', 'contractStartDate', 'contract start date', 'activationDate', 'activation date'])),
    contractEndDate: normalizeImportDate(getImportValue(row, ['contractEndDate', 'contract end date', 'contractExpirationDate', 'contract expiration date', 'contract end', 'contract expires'])),
    eligibilityDate: normalizeImportDate(getImportValue(row, ['upgradeEligibilityDate', 'upgrade eligibility date', 'upgradeElgibilityDate', 'upgrade elgibility date', 'upgradeEligibleDate', 'upgrade eligible date', 'eligibilityDate', 'eligibility date', 'elgibilityDate', 'elgibility date'])),
    monthlyCharge: normalizeImportMoney(getImportValue(row, ['totalCurrentCharges', 'total current charges', 'currentCharges', 'current charges', 'monthlyCharge', 'monthly charge'])),
    condition: condition === 'Excellent' ? 'New' : isOneOf(condition, deviceConditions) ? condition : 'Good',
  };
}

function validateDevicePayload(body: Record<string, unknown>) {
  const type = cleanString(body.type, 50);
  const phoneNumber = normalizePhone(body.phoneNumber);
  const imei = cleanString(body.imei, 100);
  const simNumber = cleanString(body.simNumber, 100);
  const assetTag = cleanString(body.assetTag, 100)
    || (type === 'Cell Phone' || type === 'MiFi Device' ? getGeneratedAssetTag(type, phoneNumber, imei, simNumber) : '');
  const makeModel = cleanString(body.makeModel, 150);
  const status = cleanString(body.status, 50) || 'Available';
  const carrier = cleanString(body.carrier, 50) || 'Verizon';
  const condition = cleanString(body.condition, 50) || 'Good';
  const monthlyCharge = normalizeImportMoney(String(body.monthlyCharge ?? ''));
  const dateFields = ['warrantyExpiration', 'replacementDueDate', 'maintenanceDueDate', 'lastServiceDate', 'purchaseDate', 'activationDate', 'contractEndDate', 'eligibilityDate'] as const;
  const dates = Object.fromEntries(dateFields.map((field) => [field, normalizeImportDate(String(body[field] ?? ''))])) as Record<typeof dateFields[number], string>;

  if (!type || !assetTag || !makeModel) {
    return { error: 'Device type, asset tag, and make/model are required' };
  }

  if (!isOneOf(type, deviceTypes)) {
    return { error: 'Choose a valid device type' };
  }

  if (!isOneOf(status, deviceStatuses)) {
    return { error: 'Choose a valid device status' };
  }

  if (!isOneOf(carrier, deviceCarriers)) {
    return { error: 'Choose a valid carrier' };
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
      carrier,
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
      activationDate: dates.activationDate,
      contractEndDate: dates.contractEndDate,
      eligibilityDate: dates.eligibilityDate,
      monthlyCharge,
      condition,
    },
  };
}

function createEmptyPhoneImportSummary(totalRows: number): PhoneImportSummary {
  return {
    totalRows,
    createdCount: 0,
    updatedCount: 0,
    matchedCount: 0,
    unmatchedRows: [],
    skippedRows: [],
  };
}

async function processPhoneImportRows(
  rows: PhoneImportRow[],
  options: {
    actorId: string;
    actorName: string;
    importType?: PhoneImportType;
    onProgress?: (processedRows: number, summary: PhoneImportSummary) => void;
    shouldYield?: boolean;
  },
) {
  const importType = detectPhoneImportType(rows, options.importType || 'verizon-phone');
  const users = await UserModel.getAllUsers(10000, 0, true);
  const userMatcher = buildUserMatcher(users);
  const existingPhones = await DeviceModel.listImportManagedDevices();
  const deviceMatcher = new Map<string, Device>();
  existingPhones.forEach((device) => {
    buildDeviceMatchKey(device).forEach((key) => {
      if (!deviceMatcher.has(key)) {
        deviceMatcher.set(key, device);
      }
    });
  });

  const summary = createEmptyPhoneImportSummary(rows.length);
  const changedDeviceIds = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const assignment = resolveAssignedTo(row, userMatcher);
    const importedDevice = buildImportedPhoneDevice(row, assignment.assignedTo, rowNumber, importType);
    const validation = validateDevicePayload(importedDevice as unknown as Record<string, unknown>);

    if (validation.error || !validation.value) {
      summary.skippedRows.push({ rowNumber, reason: validation.error || 'Invalid phone row', row });
      options.onProgress?.(index + 1, summary);
      continue;
    }

    if (assignment.matched) {
      summary.matchedCount += 1;
    } else if (isNewUserImportRow(row)) {
      summary.unmatchedRows.push({ rowNumber, reason: 'Marked NEW USER in import and left unassigned for review', row });
    } else if (hasImportAssignee(row)) {
      summary.unmatchedRows.push({ rowNumber, reason: 'Could not match assignment to a SHIELD user and left device unassigned', row });
    }

    const matchKeys = buildDeviceMatchKey(validation.value as Device);
    const existingDevice = matchKeys.map((key) => deviceMatcher.get(key)).find(Boolean);

    if (existingDevice) {
      const resolvedAssignedTo = assignment.matched || validation.value.assignedTo ? validation.value.assignedTo : existingDevice.assignedTo;
      const mergedDevice = {
        ...existingDevice,
        ...validation.value,
        assignedTo: resolvedAssignedTo,
        status: resolvedAssignedTo ? 'Assigned' : validation.value.status,
        serialNumber: validation.value.serialNumber || existingDevice.serialNumber,
        location: validation.value.location || existingDevice.location,
        notes: validation.value.notes || existingDevice.notes,
        replacementDueDate: validation.value.replacementDueDate || existingDevice.replacementDueDate,
        purchaseDate: validation.value.purchaseDate || existingDevice.purchaseDate,
        activationDate: validation.value.activationDate || existingDevice.activationDate,
        contractEndDate: validation.value.contractEndDate || existingDevice.contractEndDate,
        eligibilityDate: validation.value.eligibilityDate || existingDevice.eligibilityDate,
        monthlyCharge: validation.value.monthlyCharge || existingDevice.monthlyCharge,
        condition: validation.value.condition || existingDevice.condition,
      };
      const updated = await DeviceModel.updateDevice(existingDevice.id, mergedDevice, {
        action: 'Phone Import',
        actorId: options.actorId,
        actorName: options.actorName,
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
        actorId: options.actorId,
        actorName: options.actorName,
        assignedTo: validation.value.assignedTo,
        status: validation.value.status,
        notes: assignment.matched ? 'Created from phone import and matched to user.' : 'Created from phone import.',
      });
      summary.createdCount += 1;
      changedDeviceIds.add(created.id);
      buildDeviceMatchKey(created).forEach((key) => deviceMatcher.set(key, created));
    }

    options.onProgress?.(index + 1, summary);
    if (options.shouldYield && (index + 1) % PHONE_IMPORT_JOB_CHUNK_SIZE === 0) {
      await waitForImportJobYield();
    }
  }

  return { summary, changedDeviceCount: changedDeviceIds.size };
}

function getPublicPhoneImportJob(job: PhoneImportJob) {
  return {
    id: job.id,
    status: job.status,
    processedRows: job.processedRows,
    totalRows: job.totalRows,
    summary: job.summary,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

function importJobRowToPhoneJob(row: ImportJobRow): PhoneImportJob {
  const rows = safeParseJson<PhoneImportRow[]>(row.payloadJson, []);
  const summary = safeParseJson<PhoneImportSummary>(row.resultJson, createEmptyPhoneImportSummary(Number(row.totalRows) || rows.length));
  const importType = row.type === 'phone-import' ? 'verizon-phone' : normalizePhoneImportType(row.type.replace(/^phone-import:/u, ''));

  return {
    id: row.id,
    status: row.status,
    rows,
    actorId: row.actorId || '',
    actorName: row.actorName || '',
    processedRows: Number(row.processedRows) || 0,
    totalRows: Number(row.totalRows) || rows.length,
    summary,
    error: row.error || null,
    createdAt: toIsoDateTime(row.createdAt) || new Date().toISOString(),
    updatedAt: toIsoDateTime(row.updatedAt) || new Date().toISOString(),
    completedAt: toIsoDateTime(row.completedAt),
    importType,
  };
}

async function insertPhoneImportJob(job: PhoneImportJob) {
  await pool.query<ResultSetHeader>(
    `INSERT INTO import_jobs (
      \`id\`, \`type\`, \`status\`, \`actorId\`, \`actorName\`, \`payloadJson\`, \`resultJson\`,
      \`processedRows\`, \`totalRows\`, \`error\`, \`completedAt\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      `phone-import:${job.importType}`,
      job.status,
      job.actorId || null,
      job.actorName || null,
      JSON.stringify(job.rows),
      JSON.stringify(job.summary),
      job.processedRows,
      job.totalRows,
      job.error,
      job.completedAt,
    ],
  );
}

async function updatePhoneImportJob(job: PhoneImportJob, includePayload = false) {
  const payloadSql = includePayload ? ', `payloadJson` = ?' : '';
  const params: Array<string | number | Date | null> = [
    job.status,
    JSON.stringify(job.summary),
    job.processedRows,
    job.totalRows,
    job.error,
    job.completedAt ? new Date(job.completedAt) : null,
  ];

  if (includePayload) {
    params.push(JSON.stringify(job.rows));
  }
  params.push(job.id);

  await pool.query<ResultSetHeader>(
    `UPDATE import_jobs
     SET \`status\` = ?, \`resultJson\` = ?, \`processedRows\` = ?, \`totalRows\` = ?, \`error\` = ?, \`completedAt\` = ?${payloadSql}
     WHERE \`id\` = ? AND \`type\` LIKE 'phone-import%'`,
    params,
  );
}

async function loadPhoneImportJob(jobId: string): Promise<PhoneImportJob | null> {
  const [rows] = await pool.query<ImportJobRow[]>(
    "SELECT * FROM import_jobs WHERE `id` = ? AND `type` LIKE 'phone-import%' LIMIT 1",
    [jobId],
  );

  return rows[0] ? importJobRowToPhoneJob(rows[0]) : null;
}

async function loadRunnablePhoneImportJobs(): Promise<PhoneImportJob[]> {
  const [rows] = await pool.query<ImportJobRow[]>(
    "SELECT * FROM import_jobs WHERE `type` LIKE 'phone-import%' AND `status` IN ('queued', 'processing') ORDER BY `createdAt` ASC LIMIT 5",
  );

  return rows.map(importJobRowToPhoneJob).filter((job) => job.rows.length > 0);
}

function schedulePhoneImportJobCleanup(jobId: string) {
  setTimeout(() => {
    phoneImportJobs.delete(jobId);
  }, PHONE_IMPORT_JOB_RETENTION_MS).unref?.();
}

async function runPhoneImportJob(jobId: string) {
  const job = phoneImportJobs.get(jobId) || await loadPhoneImportJob(jobId);
  if (!job) {
    return;
  }

  phoneImportJobs.set(job.id, job);
  job.status = 'processing';
  job.updatedAt = new Date().toISOString();
  await updatePhoneImportJob(job);

  try {
    const result = await processPhoneImportRows(job.rows, {
      actorId: job.actorId,
      actorName: job.actorName,
      importType: job.importType,
      shouldYield: true,
      onProgress: (processedRows, summary) => {
        job.processedRows = processedRows;
        job.summary = {
          ...summary,
          unmatchedRows: summary.unmatchedRows.slice(-100),
          skippedRows: summary.skippedRows.slice(-100),
        };
        job.updatedAt = new Date().toISOString();
        if (processedRows % PHONE_IMPORT_JOB_CHUNK_SIZE === 0 || processedRows === job.totalRows) {
          void updatePhoneImportJob(job).catch((error) => console.error('Failed to update phone import job progress:', error));
        }
      },
    });

    job.summary = result.summary;
    job.processedRows = job.totalRows;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.rows = [];
    await updatePhoneImportJob(job, true);

    if (result.changedDeviceCount > 0) {
      broadcastAppEvent({ type: 'device-updated', entityId: 'phone-import' });
    }
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Failed to import phones';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    await updatePhoneImportJob(job).catch((updateError) => console.error('Failed to mark phone import job failed:', updateError));
    console.error('Phone import job error:', error);
  } finally {
    schedulePhoneImportJobCleanup(jobId);
  }
}

export async function resumePhoneImportJobs() {
  try {
    const jobs = await loadRunnablePhoneImportJobs();
    jobs.forEach((job) => {
      phoneImportJobs.set(job.id, job);
      setTimeout(() => void runPhoneImportJob(job.id), 0);
    });
    if (jobs.length > 0) {
      console.info(`Resumed ${jobs.length} phone import job${jobs.length === 1 ? '' : 's'}.`);
    }
  } catch (error) {
    console.error('Failed to resume phone import jobs:', error);
  }
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
        model: cleanString(req.query.model, 150),
        status: cleanString(req.query.status, 50),
        sortKey: cleanString(req.query.sortKey, 50),
      });
      res.json({
        data: result.data,
        total: result.total,
        statusCounts: result.statusCounts,
        typeStatusCounts: result.typeStatusCounts,
        modelCounts: result.modelCounts,
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
      const importType = detectPhoneImportType(rows, normalizePhoneImportType(req.body?.importType));

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Import rows are required' });
      }

      const result = await processPhoneImportRows(rows, { actorId, actorName, importType });
      if (result.changedDeviceCount > 0) {
        broadcastAppEvent({ type: 'device-updated', entityId: 'phone-import' });
      }
      res.json(result.summary);
    } catch (error) {
      if (isDuplicateAssetTagError(error)) {
        return res.status(409).json({ error: 'A phone with that asset tag already exists' });
      }

      console.error('Phone import error:', error);
      res.status(500).json({ error: 'Failed to import phones' });
    }
  }

  static async startPhoneImportJob(req: Request, res: Response) {
    try {
      const csvText = typeof req.body === 'string' ? req.body : '';
      const rows = parseCsvRows(csvText);
      const actorId = cleanString(req.query.actorId, 36);
      const actorName = cleanString(req.query.actorName, 150);
      const importType = detectPhoneImportType(rows, normalizePhoneImportType(req.query.importType));

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Phone import CSV is empty.' });
      }

      const now = new Date().toISOString();
      const job: PhoneImportJob = {
        id: uuidv4(),
        status: 'queued',
        rows,
        actorId,
        actorName,
        processedRows: 0,
        totalRows: rows.length,
        summary: createEmptyPhoneImportSummary(rows.length),
        error: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        importType,
      };

      phoneImportJobs.set(job.id, job);
      await insertPhoneImportJob(job);
      setTimeout(() => void runPhoneImportJob(job.id), 0);

      return res.status(202).json(getPublicPhoneImportJob(job));
    } catch (error) {
      console.error('Phone import job start error:', error);
      return res.status(500).json({ error: 'Failed to start phone import job' });
    }
  }

  static async getPhoneImportJob(req: Request, res: Response) {
    const job = phoneImportJobs.get(req.params.jobId) || await loadPhoneImportJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Import job not found or expired' });
    }

    return res.json(getPublicPhoneImportJob(job));
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
