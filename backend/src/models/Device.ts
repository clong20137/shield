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

export type DeviceInput = Omit<Device, 'id' | 'createdAt' | 'updatedAt'>;

export interface DeviceEventInput {
  action?: string;
  actorId?: string;
  actorName?: string;
  assignedTo?: string;
  status?: string;
  notes?: string;
}

const deviceColumns = [
  '`id`',
  '`type`',
  '`assetTag`',
  '`makeModel`',
  '`serialNumber`',
  '`assignedTo`',
  '`status`',
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
    condition: device.condition || 'Good',
  };
}

export class DeviceModel {
  static async listDevices(): Promise<Device[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns} FROM devices ORDER BY \`updatedAt\` DESC, \`assetTag\``
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async listAssignedDevices(account: { email: string; displayName: string }): Promise<Device[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        `SELECT ${deviceColumns}
        FROM devices
        WHERE LOWER(\`assignedTo\`) IN (?, ?)
        ORDER BY \`updatedAt\` DESC, \`assetTag\``,
        [account.email.toLowerCase(), account.displayName.toLowerCase()]
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
          \`status\`, \`location\`, \`notes\`, \`phoneNumber\`, \`imei\`, \`simNumber\`,
          \`radioId\`, \`hostname\`, \`routerId\`, \`warrantyExpiration\`, \`replacementDueDate\`,
          \`maintenanceDueDate\`, \`lastServiceDate\`, \`purchaseDate\`, \`condition\`,
          \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          device.type,
          device.assetTag,
          device.makeModel,
          device.serialNumber,
          device.assignedTo,
          device.status,
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

  static async listEvents(deviceId: string): Promise<DeviceEvent[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceEventRow[]>(
        'SELECT * FROM device_events WHERE `deviceId` = ? ORDER BY `createdAt` DESC',
        [deviceId]
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
