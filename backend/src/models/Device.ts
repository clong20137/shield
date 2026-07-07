import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface Device {
  id: string;
  type: string;
  assetTag: string;
  makeModel: string;
  serialNumber: string;
  assignedTo: string;
  status: string;
  carrier: string;
  location: string;
  notes: string;
  phoneNumber: string;
  imei: string;
  simNumber: string;
  radioId: string;
  hostname: string;
  routerId: string;
  warrantyExpiration: string;
  replacementDueDate: string;
  maintenanceDueDate: string;
  lastServiceDate: string;
  purchaseDate: string;
  activationDate: string;
  contractEndDate: string;
  eligibilityDate: string;
  monthlyCharge: number;
  dataUsageGb: number;
  mobileMinutes: number;
  possibleInactive: boolean;
  condition: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceEvent {
  id: string;
  deviceId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  assignedTo: string;
  status: string;
  notes: string;
  createdAt: Date;
}

interface DeviceRow extends RowDataPacket, Device {}
interface DeviceEventRow extends RowDataPacket, DeviceEvent {}
interface DeviceCountRow extends RowDataPacket {
  total: number;
}
interface DeviceStatusCountRow extends RowDataPacket {
  statusGroup: string;
  total: number;
}
interface DeviceTypeStatusCountRow extends RowDataPacket {
  type: string;
  statusGroup: string;
  total: number;
}
interface DeviceModelCountRow extends RowDataPacket {
  makeModel: string;
  total: number;
}

export type DeviceInput = Omit<Device, 'id' | 'createdAt' | 'updatedAt'>;

export interface DeviceEventInput {
  action?: string;
  actorId?: string;
  actorName?: string;
  assignedTo?: string;
  status?: string;
  notes?: string;
}

export interface DeviceListFilters {
  q?: string;
  type?: string;
  model?: string;
  status?: string;
  sortKey?: string;
}

export interface DeviceListResult {
  data: Device[];
  total: number;
  statusCounts: Record<string, number>;
  typeStatusCounts: Record<string, Record<string, number>>;
  modelCounts: Record<string, number>;
}

function buildDeviceWhere(filters: DeviceListFilters = {}, options: { includeType?: boolean; includeModel?: boolean; includeStatus?: boolean } = {}) {
  const where: string[] = [];
  const params: Array<string | number> = [];
  const searchTerm = filters.q?.trim();

  if (options.includeType !== false && filters.type && filters.type !== 'All') {
    where.push('`type` = ?');
    params.push(filters.type);
  }

  if (options.includeModel !== false && filters.model && filters.model !== 'All') {
    if (filters.model === 'Unknown') {
      where.push("COALESCE(NULLIF(`makeModel`, ''), 'Unknown') = ?");
      params.push('Unknown');
    } else {
      where.push('`makeModel` = ?');
      params.push(filters.model);
    }
  }

  if (options.includeStatus !== false && filters.status && filters.status !== 'All') {
    if (filters.status === 'Unassigned') {
      where.push("COALESCE(`assignedTo`, '') = ''");
    } else {
      where.push('`status` = ?');
      params.push(filters.status);
    }
  }

  if (searchTerm) {
    const likeTerm = `%${searchTerm.toLowerCase()}%`;
    const digitSearchTerm = searchTerm.replace(/\D/gu, '');
    const digitLikeTerm = digitSearchTerm ? `%${digitSearchTerm}%` : '__NO_DIGIT_PHONE_MATCH__';
    where.push(`(
      LOWER(\`assetTag\`) LIKE ?
      OR LOWER(\`makeModel\`) LIKE ?
      OR LOWER(\`serialNumber\`) LIKE ?
      OR LOWER(\`assignedTo\`) LIKE ?
      OR LOWER(\`status\`) LIKE ?
      OR LOWER(\`carrier\`) LIKE ?
      OR LOWER(\`location\`) LIKE ?
      OR LOWER(\`phoneNumber\`) LIKE ?
      OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(\`phoneNumber\`, ''), '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?
      OR LOWER(\`imei\`) LIKE ?
      OR LOWER(\`simNumber\`) LIKE ?
      OR LOWER(\`radioId\`) LIKE ?
      OR LOWER(\`hostname\`) LIKE ?
      OR LOWER(\`routerId\`) LIKE ?
    )`);
    params.push(...Array.from({ length: 8 }, () => likeTerm), digitLikeTerm, ...Array.from({ length: 5 }, () => likeTerm));
  }

  return {
    params,
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
  };
}

const deviceColumns = [
  '`id`',
  '`type`',
  '`assetTag`',
  '`makeModel`',
  '`serialNumber`',
  '`assignedTo`',
  '`status`',
  '`carrier`',
  '`location`',
  '`notes`',
  '`phoneNumber`',
  '`imei`',
  '`simNumber`',
  '`radioId`',
  '`hostname`',
  '`routerId`',
  "DATE_FORMAT(`warrantyExpiration`, '%Y-%m-%d') AS `warrantyExpiration`",
  "DATE_FORMAT(`replacementDueDate`, '%Y-%m-%d') AS `replacementDueDate`",
  "DATE_FORMAT(`maintenanceDueDate`, '%Y-%m-%d') AS `maintenanceDueDate`",
  "DATE_FORMAT(`lastServiceDate`, '%Y-%m-%d') AS `lastServiceDate`",
  "DATE_FORMAT(`purchaseDate`, '%Y-%m-%d') AS `purchaseDate`",
  "DATE_FORMAT(`activationDate`, '%Y-%m-%d') AS `activationDate`",
  "DATE_FORMAT(`contractEndDate`, '%Y-%m-%d') AS `contractEndDate`",
  "DATE_FORMAT(`eligibilityDate`, '%Y-%m-%d') AS `eligibilityDate`",
  'COALESCE(`monthlyCharge`, 0) AS `monthlyCharge`',
  'COALESCE(`dataUsageGb`, 0) AS `dataUsageGb`',
  'COALESCE(`mobileMinutes`, 0) AS `mobileMinutes`',
  'COALESCE(`possibleInactive`, 0) AS `possibleInactive`',
  '`condition`',
  '`createdAt`',
  '`updatedAt`',
].join(', ');

function nullableDate(value: string | undefined | null) {
  return value ? value : null;
}

function normalizeDeviceInput(device: DeviceInput): DeviceInput {
  return {
    ...device,
    serialNumber: device.serialNumber || '',
    assignedTo: device.assignedTo || '',
    status: device.status || 'Available',
    carrier: device.carrier || 'Verizon',
    location: device.location || '',
    notes: device.notes || '',
    phoneNumber: device.phoneNumber || '',
    imei: device.imei || '',
    simNumber: device.simNumber || '',
    radioId: device.radioId || '',
    hostname: device.hostname || '',
    routerId: device.routerId || '',
    warrantyExpiration: device.warrantyExpiration || '',
    replacementDueDate: device.replacementDueDate || '',
    maintenanceDueDate: device.maintenanceDueDate || '',
    lastServiceDate: device.lastServiceDate || '',
    purchaseDate: device.purchaseDate || '',
    activationDate: device.activationDate || '',
    contractEndDate: device.contractEndDate || '',
    eligibilityDate: device.eligibilityDate || '',
    monthlyCharge: Number(device.monthlyCharge) || 0,
    dataUsageGb: Number(device.dataUsageGb) || 0,
    mobileMinutes: Number(device.mobileMinutes) || 0,
    possibleInactive: Boolean(device.possibleInactive),
    condition: device.condition || 'Good',
  };
}

export class DeviceModel {
  static async listPhoneDevices(): Promise<Device[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns}
        FROM devices
        WHERE \`type\` = ?
        ORDER BY \`assignedTo\`, \`assetTag\``,
        ['Cell Phone']
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async listImportManagedDevices(): Promise<Device[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns}
        FROM devices
        WHERE \`type\` IN (?, ?, ?)
        ORDER BY \`type\`, \`assignedTo\`, \`assetTag\``,
        ['Cell Phone', 'MiFi Device', 'Cradlepoint']
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async deletePhoneDevices(): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>('DELETE FROM devices WHERE `type` IN (?, ?, ?)', ['Cell Phone', 'MiFi Device', 'Cradlepoint']);
      return result.affectedRows;
    } finally {
      conn.release();
    }
  }

  static async listDevices(limit = 250, offset = 0, filters: DeviceListFilters = {}): Promise<DeviceListResult> {
    const conn = await pool.getConnection();
    try {
      const { params, whereSql } = buildDeviceWhere(filters);
      const statusWhere = buildDeviceWhere(filters, { includeStatus: false });
      const treeWhere = buildDeviceWhere(filters, { includeType: false, includeStatus: false });
      const modelWhere = buildDeviceWhere(filters, { includeModel: false, includeStatus: false });

      const sortColumns: Record<string, string> = {
        assetTag: '`assetTag`',
        assignedTo: '`assignedTo`',
        carrier: '`carrier`',
        location: '`location`',
        maintenanceDueDate: '`maintenanceDueDate`',
        makeModel: '`makeModel`',
        replacementDueDate: '`replacementDueDate`',
        status: '`status`',
        type: '`type`',
        updatedAt: '`updatedAt`',
      };
      const sortColumn = sortColumns[filters.sortKey || ''] || '`updatedAt`';
      const sortDirection = sortColumn === '`updatedAt`' ? 'DESC' : 'ASC';

      const [countRows] = await conn.query<DeviceCountRow[]>(
        `SELECT COUNT(*) as total FROM devices ${whereSql}`,
        params,
      );
      const [statusRows] = await conn.query<DeviceStatusCountRow[]>(
        `SELECT
          CASE
            WHEN COALESCE(\`assignedTo\`, '') = '' THEN 'Unassigned'
            ELSE \`status\`
          END as \`statusGroup\`,
          COUNT(*) as total
        FROM devices
        ${statusWhere.whereSql}
        GROUP BY 1`,
        statusWhere.params,
      );
      const [typeStatusRows] = await conn.query<DeviceTypeStatusCountRow[]>(
        `SELECT
          \`type\`,
          CASE
            WHEN COALESCE(\`assignedTo\`, '') = '' THEN 'Unassigned'
            ELSE \`status\`
          END as \`statusGroup\`,
          COUNT(*) as total
        FROM devices
        ${treeWhere.whereSql}
        GROUP BY \`type\`, 2
        ORDER BY \`type\`, 2`,
        treeWhere.params,
      );
      const [modelRows] = await conn.query<DeviceModelCountRow[]>(
        `SELECT COALESCE(NULLIF(\`makeModel\`, ''), 'Unknown') as \`makeModel\`, COUNT(*) as total
        FROM devices
        ${modelWhere.whereSql}
        GROUP BY 1
        ORDER BY \`makeModel\``,
        modelWhere.params,
      );
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns}
        FROM devices
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDirection}, \`assetTag\`
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return {
        data: rows,
        total: Number(countRows[0]?.total || 0),
        statusCounts: statusRows.reduce<Record<string, number>>((counts, row) => {
          counts[row.statusGroup || 'Unassigned'] = Number(row.total || 0);
          return counts;
        }, {}),
        typeStatusCounts: typeStatusRows.reduce<Record<string, Record<string, number>>>((counts, row) => {
          const type = row.type || 'Other';
          counts[type] = counts[type] || {};
          counts[type][row.statusGroup || 'Unassigned'] = Number(row.total || 0);
          return counts;
        }, {}),
        modelCounts: modelRows.reduce<Record<string, number>>((counts, row) => {
          const makeModel = row.makeModel || 'Unknown';
          counts[makeModel] = Number(row.total || 0);
          return counts;
        }, {}),
      };
    } finally {
      conn.release();
    }
  }

  static async listAssignedDevices(account: { email: string; displayName: string }, limit = 100, offset = 0): Promise<Device[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns}
        FROM devices
        WHERE LOWER(\`assignedTo\`) IN (?, ?)
        ORDER BY \`updatedAt\` DESC, \`assetTag\`
        LIMIT ? OFFSET ?`,
        [account.email.toLowerCase(), account.displayName.toLowerCase(), limit, offset]
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async getDevice(id: string): Promise<Device | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns} FROM devices WHERE \`id\` = ? LIMIT 1`,
        [id]
      );

      return rows[0] || null;
    } finally {
      conn.release();
    }
  }

  static async createDevice(deviceInput: DeviceInput, event?: DeviceEventInput): Promise<Device> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      const device = normalizeDeviceInput(deviceInput);

      await conn.query<ResultSetHeader>(
        `INSERT INTO devices (
          \`id\`, \`type\`, \`assetTag\`, \`makeModel\`, \`serialNumber\`, \`assignedTo\`,
          \`status\`, \`carrier\`, \`location\`, \`notes\`, \`phoneNumber\`, \`imei\`, \`simNumber\`,
          \`radioId\`, \`hostname\`, \`routerId\`, \`warrantyExpiration\`, \`replacementDueDate\`,
          \`maintenanceDueDate\`, \`lastServiceDate\`, \`purchaseDate\`, \`activationDate\`,
          \`contractEndDate\`, \`eligibilityDate\`, \`monthlyCharge\`, \`dataUsageGb\`,
          \`mobileMinutes\`, \`possibleInactive\`, \`condition\`,
          \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          device.type,
          device.assetTag,
          device.makeModel,
          device.serialNumber,
          device.assignedTo,
          device.status,
          device.carrier,
          device.location,
          device.notes,
          device.phoneNumber,
          device.imei,
          device.simNumber,
          device.radioId,
          device.hostname,
          device.routerId,
          nullableDate(device.warrantyExpiration),
          nullableDate(device.replacementDueDate),
          nullableDate(device.maintenanceDueDate),
          nullableDate(device.lastServiceDate),
          nullableDate(device.purchaseDate),
          nullableDate(device.activationDate),
          nullableDate(device.contractEndDate),
          nullableDate(device.eligibilityDate),
          device.monthlyCharge,
          device.dataUsageGb,
          device.mobileMinutes,
          device.possibleInactive,
          device.condition,
          now,
          now,
        ]
      );

      await DeviceModel.createEvent(id, {
        action: 'Created',
        assignedTo: device.assignedTo,
        status: device.status,
        notes: event?.notes || 'Device record created.',
        actorId: event?.actorId,
        actorName: event?.actorName,
      });

      return { ...device, id, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async updateDevice(id: string, deviceInput: DeviceInput, event?: DeviceEventInput): Promise<Device | null> {
    const conn = await pool.getConnection();
    try {
      const previousDevice = await DeviceModel.getDevice(id);
      const device = normalizeDeviceInput(deviceInput);

      await conn.query<ResultSetHeader>(
        `UPDATE devices SET
          \`type\` = ?,
          \`assetTag\` = ?,
          \`makeModel\` = ?,
          \`serialNumber\` = ?,
          \`assignedTo\` = ?,
          \`status\` = ?,
          \`carrier\` = ?,
          \`location\` = ?,
          \`notes\` = ?,
          \`phoneNumber\` = ?,
          \`imei\` = ?,
          \`simNumber\` = ?,
          \`radioId\` = ?,
          \`hostname\` = ?,
          \`routerId\` = ?,
          \`warrantyExpiration\` = ?,
          \`replacementDueDate\` = ?,
          \`maintenanceDueDate\` = ?,
          \`lastServiceDate\` = ?,
          \`purchaseDate\` = ?,
          \`activationDate\` = ?,
          \`contractEndDate\` = ?,
          \`eligibilityDate\` = ?,
          \`monthlyCharge\` = ?,
          \`dataUsageGb\` = ?,
          \`mobileMinutes\` = ?,
          \`possibleInactive\` = ?,
          \`condition\` = ?,
          \`updatedAt\` = ?
        WHERE \`id\` = ?`,
        [
          device.type,
          device.assetTag,
          device.makeModel,
          device.serialNumber,
          device.assignedTo,
          device.status,
          device.carrier,
          device.location,
          device.notes,
          device.phoneNumber,
          device.imei,
          device.simNumber,
          device.radioId,
          device.hostname,
          device.routerId,
          nullableDate(device.warrantyExpiration),
          nullableDate(device.replacementDueDate),
          nullableDate(device.maintenanceDueDate),
          nullableDate(device.lastServiceDate),
          nullableDate(device.purchaseDate),
          nullableDate(device.activationDate),
          nullableDate(device.contractEndDate),
          nullableDate(device.eligibilityDate),
          device.monthlyCharge,
          device.dataUsageGb,
          device.mobileMinutes,
          device.possibleInactive,
          device.condition,
          new Date(),
          id,
        ]
      );

      const updatedDevice = await DeviceModel.getDevice(id);

      if (!updatedDevice) {
        return null;
      }

      if (
        event ||
        previousDevice?.assignedTo !== updatedDevice.assignedTo ||
        previousDevice?.status !== updatedDevice.status
      ) {
        await DeviceModel.createEvent(id, {
          action: event?.action || 'Updated',
          assignedTo: updatedDevice.assignedTo,
          status: updatedDevice.status,
          notes: event?.notes || 'Device record updated.',
          actorId: event?.actorId,
          actorName: event?.actorName,
        });
      }

      return updatedDevice;
    } finally {
      conn.release();
    }
  }

  static async createEvent(deviceId: string, event: DeviceEventInput): Promise<DeviceEvent> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO device_events (
          \`id\`, \`deviceId\`, \`action\`, \`actorId\`, \`actorName\`, \`assignedTo\`, \`status\`, \`notes\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          deviceId,
          event.action || 'Updated',
          event.actorId || null,
          event.actorName || null,
          event.assignedTo || '',
          event.status || '',
          event.notes || '',
          now,
        ]
      );

      return {
        id,
        deviceId,
        action: event.action || 'Updated',
        actorId: event.actorId || null,
        actorName: event.actorName || null,
        assignedTo: event.assignedTo || '',
        status: event.status || '',
        notes: event.notes || '',
        createdAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async listEvents(deviceId: string, limit = 100, offset = 0): Promise<DeviceEvent[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceEventRow[]>(
        'SELECT * FROM device_events WHERE `deviceId` = ? ORDER BY `createdAt` DESC LIMIT ? OFFSET ?',
        [deviceId, limit, offset]
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async deleteDevice(id: string, event?: DeviceEventInput): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const device = await DeviceModel.getDevice(id);
      if (!device) {
        return false;
      }

      await DeviceModel.createEvent(id, {
        action: 'Deleted',
        assignedTo: device.assignedTo,
        status: device.status,
        notes: event?.notes || 'Device record deleted.',
        actorId: event?.actorId,
        actorName: event?.actorName,
      });

      const [result] = await conn.query<ResultSetHeader>('DELETE FROM devices WHERE `id` = ?', [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
