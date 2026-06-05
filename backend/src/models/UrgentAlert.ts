import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export type UrgentAlertSeverity = 'Advisory' | 'Important' | 'Urgent' | 'Critical';
export type UrgentAlertAudienceType = 'everyone' | 'district' | 'users';

export interface UrgentAlert {
  id: string;
  title: string;
  message: string;
  severity: UrgentAlertSeverity;
  audienceType: UrgentAlertAudienceType;
  audienceLabel: string | null;
  targetDistrict: string | null;
  targetUserIds: string[];
  requireAcknowledgement: boolean;
  expiresAt: Date | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  acknowledgedAt?: Date | null;
  deliveredAt?: Date | null;
}

export interface CreateUrgentAlertInput {
  title: string;
  message: string;
  severity: UrgentAlertSeverity;
  audienceType: UrgentAlertAudienceType;
  targetDistrict?: string | null;
  targetUserIds?: string[];
  requireAcknowledgement: boolean;
  expiresAt?: Date | null;
  createdBy: string;
  createdByName: string;
}

interface UrgentAlertRow extends RowDataPacket {
  id: string;
  title: string;
  message: string;
  severity: UrgentAlertSeverity;
  audienceType: UrgentAlertAudienceType;
  audienceLabel: string | null;
  targetDistrict: string | null;
  targetUserIds: string | null;
  requireAcknowledgement: boolean | number;
  expiresAt: Date | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  acknowledgedAt?: Date | null;
  deliveredAt?: Date | null;
}

function parseTargetUserIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toAlert(row: UrgentAlertRow): UrgentAlert {
  return {
    ...row,
    targetUserIds: parseTargetUserIds(row.targetUserIds),
    requireAcknowledgement: Boolean(row.requireAcknowledgement),
  };
}

export class UrgentAlertModel {
  private static async resolveRecipientIds(input: CreateUrgentAlertInput): Promise<string[]> {
    const conn = await pool.getConnection();
    try {
      if (input.audienceType === 'users') {
        const ids = Array.from(new Set((input.targetUserIds || []).filter(Boolean)));
        if (ids.length === 0) {
          return [];
        }

        const placeholders = ids.map(() => '?').join(', ');
        const [rows] = await conn.query<Array<RowDataPacket & { id: string }>>(
          `SELECT \`id\` FROM users WHERE \`id\` IN (${placeholders}) AND \`isActive\` = 1`,
          ids,
        );
        return rows.map((row) => row.id);
      }

      if (input.audienceType === 'district') {
        const [rows] = await conn.query<Array<RowDataPacket & { id: string }>>(
          'SELECT `id` FROM users WHERE LOWER(COALESCE(`district`, \'\')) = LOWER(?) AND `isActive` = 1',
          [input.targetDistrict || ''],
        );
        return rows.map((row) => row.id);
      }

      const [rows] = await conn.query<Array<RowDataPacket & { id: string }>>(
        'SELECT `id` FROM users WHERE `isActive` = 1',
      );
      return rows.map((row) => row.id);
    } finally {
      conn.release();
    }
  }

  private static getAudienceLabel(input: CreateUrgentAlertInput, recipientCount: number): string {
    if (input.audienceType === 'district') {
      return `${input.targetDistrict || 'District'} (${recipientCount})`;
    }

    if (input.audienceType === 'users') {
      return `${recipientCount} selected ${recipientCount === 1 ? 'person' : 'people'}`;
    }

    return `Everyone (${recipientCount})`;
  }

  static async create(input: CreateUrgentAlertInput): Promise<UrgentAlert & { recipientIds: string[] }> {
    const recipientIds = await UrgentAlertModel.resolveRecipientIds(input);
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      const audienceLabel = UrgentAlertModel.getAudienceLabel(input, recipientIds.length);

      await conn.beginTransaction();
      await conn.query<ResultSetHeader>(
        `INSERT INTO urgent_alerts (
          \`id\`, \`title\`, \`message\`, \`severity\`, \`audienceType\`, \`audienceLabel\`,
          \`targetDistrict\`, \`targetUserIds\`, \`requireAcknowledgement\`, \`expiresAt\`,
          \`createdBy\`, \`createdByName\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.title,
          input.message,
          input.severity,
          input.audienceType,
          audienceLabel,
          input.targetDistrict || null,
          JSON.stringify(input.targetUserIds || []),
          input.requireAcknowledgement,
          input.expiresAt || null,
          input.createdBy,
          input.createdByName,
          now,
        ],
      );

      if (recipientIds.length > 0) {
        await conn.query<ResultSetHeader>(
          `INSERT INTO urgent_alert_acknowledgements (\`alertId\`, \`userId\`)
          VALUES ${recipientIds.map(() => '(?, ?)').join(', ')}`,
          recipientIds.flatMap((recipientId) => [id, recipientId]),
        );
      }

      await conn.commit();
      return {
        id,
        title: input.title,
        message: input.message,
        severity: input.severity,
        audienceType: input.audienceType,
        audienceLabel,
        targetDistrict: input.targetDistrict || null,
        targetUserIds: input.targetUserIds || [],
        requireAcknowledgement: input.requireAcknowledgement,
        expiresAt: input.expiresAt || null,
        createdBy: input.createdBy,
        createdByName: input.createdByName,
        createdAt: now,
        recipientIds,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async listPendingForUser(userId: string): Promise<UrgentAlert[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UrgentAlertRow[]>(
        `SELECT a.*, ack.\`acknowledgedAt\`, ack.\`deliveredAt\`
        FROM urgent_alert_acknowledgements ack
        INNER JOIN urgent_alerts a ON a.\`id\` = ack.\`alertId\`
        WHERE ack.\`userId\` = ?
          AND ack.\`acknowledgedAt\` IS NULL
          AND (a.\`expiresAt\` IS NULL OR a.\`expiresAt\` > NOW())
        ORDER BY
          FIELD(a.\`severity\`, 'Critical', 'Urgent', 'Important', 'Advisory'),
          a.\`createdAt\` ASC`,
        [userId],
      );

      return rows.map(toAlert);
    } finally {
      conn.release();
    }
  }

  static async listRecent(limit = 50): Promise<Array<UrgentAlert & { recipientCount: number; acknowledgedCount: number }>> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<Array<UrgentAlertRow & { recipientCount: number; acknowledgedCount: number }>>(
        `SELECT a.*,
          COUNT(ack.\`userId\`) as recipientCount,
          SUM(CASE WHEN ack.\`acknowledgedAt\` IS NULL THEN 0 ELSE 1 END) as acknowledgedCount
        FROM urgent_alerts a
        LEFT JOIN urgent_alert_acknowledgements ack ON ack.\`alertId\` = a.\`id\`
        GROUP BY a.\`id\`
        ORDER BY a.\`createdAt\` DESC
        LIMIT ?`,
        [limit],
      );

      return rows.map((row) => ({
        ...toAlert(row),
        recipientCount: Number(row.recipientCount || 0),
        acknowledgedCount: Number(row.acknowledgedCount || 0),
      }));
    } finally {
      conn.release();
    }
  }

  static async acknowledge(alertId: string, userId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE urgent_alert_acknowledgements
        SET \`acknowledgedAt\` = COALESCE(\`acknowledgedAt\`, ?)
        WHERE \`alertId\` = ? AND \`userId\` = ?`,
        [new Date(), alertId, userId],
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async remove(alertId: string): Promise<UrgentAlert | null> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<UrgentAlertRow[]>(
        'SELECT * FROM urgent_alerts WHERE `id` = ? LIMIT 1',
        [alertId],
      );

      if (rows.length === 0) {
        await conn.commit();
        return null;
      }

      await conn.query<ResultSetHeader>(
        'DELETE FROM urgent_alert_acknowledgements WHERE `alertId` = ?',
        [alertId],
      );
      await conn.query<ResultSetHeader>(
        'DELETE FROM urgent_alerts WHERE `id` = ?',
        [alertId],
      );

      await conn.commit();
      return toAlert(rows[0]);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}
