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
  createdAt: Date;
  updatedAt: Date;
}

interface DeviceRow extends RowDataPacket, Device {}

export type DeviceInput = Omit<Device, 'id' | 'createdAt' | 'updatedAt'>;

export class DeviceModel {
  static async listDevices(): Promise<Device[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DeviceRow[]>(
        'SELECT * FROM devices ORDER BY `updatedAt` DESC, `assetTag`'
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async createDevice(device: DeviceInput): Promise<Device> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO devices (
          \`id\`, \`type\`, \`assetTag\`, \`makeModel\`, \`serialNumber\`, \`assignedTo\`,
          \`status\`, \`location\`, \`notes\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          now,
          now,
        ]
      );

      return { ...device, id, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async updateDevice(id: string, device: DeviceInput): Promise<Device | null> {
    const conn = await pool.getConnection();
    try {
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
          new Date(),
          id,
        ]
      );

      const [rows] = await conn.query<DeviceRow[]>(
        'SELECT * FROM devices WHERE `id` = ? LIMIT 1',
        [id]
      );

      return rows[0] || null;
    } finally {
      conn.release();
    }
  }

  static async deleteDevice(id: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>('DELETE FROM devices WHERE `id` = ?', [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
