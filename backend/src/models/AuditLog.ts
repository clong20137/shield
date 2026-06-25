import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { broadcastAppEvent } from '../services/appEvents';
import { evaluateSecurityAuditLog } from '../services/securityMonitoring';

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

interface AuditLogRow extends RowDataPacket, AuditLog {}
interface CountRow extends RowDataPacket {
  total: number;
}

export interface AuditLogFilters {
  q?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

export interface AuditLogListResult {
  data: AuditLog[];
  total: number;
  actions: string[];
  entityTypes: string[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

export class AuditLogModel {
  static async create(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      await conn.query(
        `INSERT INTO audit_logs (
          \`id\`, \`actorId\`, \`actorName\`, \`action\`, \`entityType\`, \`entityId\`, \`details\`, \`ipAddress\`, \`userAgent\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          log.actorId,
          log.actorName,
          log.action,
          log.entityType,
          log.entityId,
          log.details,
          log.ipAddress || null,
          log.userAgent || null,
        ]
      );
      broadcastAppEvent({ type: 'audit-updated', entityId: log.entityId || undefined });
      void evaluateSecurityAuditLog({ ...log, id, createdAt: new Date() }).catch((error) => {
        console.error('Security monitoring error:', error);
      });
    } finally {
      conn.release();
    }
  }

  static async list(filters: AuditLogFilters = {}, limit = 100, offset = 0): Promise<AuditLogListResult> {
    const conn = await pool.getConnection();
    try {
      const where: string[] = [];
      const params: Array<string | number> = [];

      if (filters.q) {
        const q = `%${escapeLike(filters.q)}%`;
        where.push(`(
          \`actorName\` LIKE ? ESCAPE '\\\\'
          OR \`actorId\` LIKE ? ESCAPE '\\\\'
          OR \`action\` LIKE ? ESCAPE '\\\\'
          OR \`entityType\` LIKE ? ESCAPE '\\\\'
          OR \`entityId\` LIKE ? ESCAPE '\\\\'
          OR \`details\` LIKE ? ESCAPE '\\\\'
          OR \`ipAddress\` LIKE ? ESCAPE '\\\\'
        )`);
        params.push(q, q, q, q, q, q, q);
      }

      if (filters.actorId) {
        where.push('`actorId` = ?');
        params.push(filters.actorId);
      }

      if (filters.action) {
        where.push('`action` = ?');
        params.push(filters.action);
      }

      if (filters.entityType) {
        where.push('`entityType` = ?');
        params.push(filters.entityType);
      }

      if (filters.from) {
        where.push('`createdAt` >= ?');
        params.push(filters.from);
      }

      if (filters.to) {
        where.push('`createdAt` <= ?');
        params.push(filters.to);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await conn.query<AuditLogRow[]>(
        `SELECT * FROM audit_logs ${whereSql} ORDER BY \`createdAt\` DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [countRows] = await conn.query<CountRow[]>(
        `SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`,
        params
      );
      const [actionRows] = await conn.query<Array<RowDataPacket & { action: string }>>(
        'SELECT DISTINCT `action` FROM audit_logs ORDER BY `action`'
      );
      const [entityTypeRows] = await conn.query<Array<RowDataPacket & { entityType: string }>>(
        'SELECT DISTINCT `entityType` FROM audit_logs ORDER BY `entityType`'
      );

      return {
        data: rows,
        total: countRows[0]?.total || 0,
        actions: actionRows.map((row) => row.action).filter(Boolean),
        entityTypes: entityTypeRows.map((row) => row.entityType).filter(Boolean),
      };
    } finally {
      conn.release();
    }
  }
}
