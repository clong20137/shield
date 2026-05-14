import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date;
}

interface AuditLogRow extends RowDataPacket, AuditLog {}

export class AuditLogModel {
  static async create(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `INSERT INTO audit_logs (
          \`id\`, \`actorId\`, \`actorName\`, \`action\`, \`entityType\`, \`entityId\`, \`details\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), log.actorId, log.actorName, log.action, log.entityType, log.entityId, log.details]
      );
    } finally {
      conn.release();
    }
  }

  static async list(limit = 100): Promise<AuditLog[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuditLogRow[]>(
        'SELECT * FROM audit_logs ORDER BY `createdAt` DESC LIMIT ?',
        [limit]
      );

      return rows;
    } finally {
      conn.release();
    }
  }
}
