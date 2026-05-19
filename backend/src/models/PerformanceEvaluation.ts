import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export type PerformanceEvaluationStatus = 'Sent' | 'Signed';

export interface PerformanceEvaluation {
  id: string;
  employeeAccountId: string;
  employeeName: string;
  employeeEmail: string;
  supervisorAccountId: string;
  supervisorName: string;
  evaluationPeriod: string;
  positionTitle: string;
  district: string;
  ratings: Record<string, string>;
  strengths: string;
  improvements: string;
  goals: string;
  supervisorComments: string;
  employeeComments: string;
  status: PerformanceEvaluationStatus;
  supervisorSignature: string;
  supervisorSignedAt: Date | null;
  employeeSignature: string;
  employeeSignedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePerformanceEvaluationInput {
  employeeAccountId: string;
  employeeName: string;
  employeeEmail: string;
  supervisorAccountId: string;
  supervisorName: string;
  evaluationPeriod: string;
  positionTitle: string;
  district: string;
  ratings: Record<string, string>;
  strengths: string;
  improvements: string;
  goals: string;
  supervisorComments: string;
}

interface PerformanceEvaluationRow extends RowDataPacket {
  id: string;
  employeeAccountId: string;
  employeeName: string;
  employeeEmail: string;
  supervisorAccountId: string;
  supervisorName: string;
  evaluationPeriod: string;
  positionTitle: string | null;
  district: string | null;
  ratings: string | Record<string, string> | null;
  strengths: string | null;
  improvements: string | null;
  goals: string | null;
  supervisorComments: string | null;
  employeeComments: string | null;
  status: PerformanceEvaluationStatus;
  supervisorSignature: string | null;
  supervisorSignedAt: Date | null;
  employeeSignature: string | null;
  employeeSignedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function parseRatings(value: PerformanceEvaluationRow['ratings']): Record<string, string> {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toEvaluation(row: PerformanceEvaluationRow): PerformanceEvaluation {
  return {
    id: row.id,
    employeeAccountId: row.employeeAccountId,
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail,
    supervisorAccountId: row.supervisorAccountId,
    supervisorName: row.supervisorName,
    evaluationPeriod: row.evaluationPeriod,
    positionTitle: row.positionTitle || '',
    district: row.district || '',
    ratings: parseRatings(row.ratings),
    strengths: row.strengths || '',
    improvements: row.improvements || '',
    goals: row.goals || '',
    supervisorComments: row.supervisorComments || '',
    employeeComments: row.employeeComments || '',
    status: row.status,
    supervisorSignature: row.supervisorSignature || '',
    supervisorSignedAt: row.supervisorSignedAt,
    employeeSignature: row.employeeSignature || '',
    employeeSignedAt: row.employeeSignedAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PerformanceEvaluationModel {
  static async listForAccount(accountId: string, includeAll: boolean, limit = 200, offset = 0): Promise<PerformanceEvaluation[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = includeAll
        ? await conn.query<PerformanceEvaluationRow[]>(
            'SELECT * FROM performance_evaluations ORDER BY `createdAt` DESC LIMIT ? OFFSET ?',
            [limit, offset]
          )
        : await conn.query<PerformanceEvaluationRow[]>(
            `SELECT * FROM performance_evaluations
            WHERE \`employeeAccountId\` = ? OR \`supervisorAccountId\` = ?
            ORDER BY \`createdAt\` DESC
            LIMIT ? OFFSET ?`,
            [accountId, accountId, limit, offset]
          );

      return rows.map(toEvaluation);
    } finally {
      conn.release();
    }
  }

  static async getById(id: string): Promise<PerformanceEvaluation | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<PerformanceEvaluationRow[]>(
        'SELECT * FROM performance_evaluations WHERE `id` = ? LIMIT 1',
        [id]
      );

      return rows[0] ? toEvaluation(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async create(input: CreatePerformanceEvaluationInput): Promise<PerformanceEvaluation> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO performance_evaluations (
          \`id\`, \`employeeAccountId\`, \`employeeName\`, \`employeeEmail\`,
          \`supervisorAccountId\`, \`supervisorName\`, \`evaluationPeriod\`, \`positionTitle\`, \`district\`,
          \`ratings\`, \`strengths\`, \`improvements\`, \`goals\`, \`supervisorComments\`,
          \`status\`, \`supervisorSignature\`, \`supervisorSignedAt\`, \`sentAt\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sent', ?, ?, ?, ?, ?)`,
        [
          id,
          input.employeeAccountId,
          input.employeeName,
          input.employeeEmail,
          input.supervisorAccountId,
          input.supervisorName,
          input.evaluationPeriod,
          input.positionTitle,
          input.district,
          JSON.stringify(input.ratings || {}),
          input.strengths,
          input.improvements,
          input.goals,
          input.supervisorComments,
          input.supervisorName,
          now,
          now,
          now,
          now,
        ]
      );

      const created = await this.getById(id);
      if (!created) {
        throw new Error('Failed to load created evaluation');
      }

      return created;
    } finally {
      conn.release();
    }
  }

  static async sign(id: string, employeeAccountId: string, signature: string, employeeComments: string): Promise<PerformanceEvaluation | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE performance_evaluations
        SET \`status\` = 'Signed',
          \`employeeSignature\` = ?,
          \`employeeComments\` = ?,
          \`employeeSignedAt\` = ?,
          \`updatedAt\` = ?
        WHERE \`id\` = ? AND \`employeeAccountId\` = ? AND \`status\` = 'Sent'`,
        [signature, employeeComments, now, now, id, employeeAccountId]
      );

      if (result.affectedRows === 0) {
        return null;
      }

      return this.getById(id);
    } finally {
      conn.release();
    }
  }

  static async updateSentAt(id: string): Promise<PerformanceEvaluation | null> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        'UPDATE performance_evaluations SET `sentAt` = ?, `updatedAt` = ? WHERE `id` = ? AND `status` = ?',
        [new Date(), new Date(), id, 'Sent']
      );

      return this.getById(id);
    } finally {
      conn.release();
    }
  }
}
