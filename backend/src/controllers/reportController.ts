import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';

interface StatisticsRow extends RowDataPacket {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalDistricts: number;
  totalRanks: number;
}

interface AccountStatisticsRow extends RowDataPacket {
  totalAccounts: number;
  administratorAccounts: number;
  standardAccounts: number;
}

interface TrooperDailyReportRow extends RowDataPacket {
  id: string;
  ownerAccountId: string;
  entryDate: Date | string;
  dutyHours: number | string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  details: string | Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  peNumber: string;
  badgeNumber: string;
  rank: string;
  district: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

function formatReportDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDetails(value: string | Record<string, string> | null): Record<string, string> {
  if (!value) return {};
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

export class ReportController {
  static async getTrooperDailies(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const { q, from, to, district } = req.query;
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
      const offset = (page - 1) * pageSize;
      const params: Array<string | number> = [];
      const whereParts = ["ce.`category` = 'Trooper Daily'"];

      if (typeof q === 'string' && q.trim()) {
        const search = `%${q.trim().toLowerCase()}%`;
        whereParts.push(`
          (
            LOWER(u.\`firstName\`) LIKE ?
            OR LOWER(u.\`lastName\`) LIKE ?
            OR LOWER(u.\`email\`) LIKE ?
            OR LOWER(u.\`peNumber\`) LIKE ?
            OR LOWER(u.\`badgeNumber\`) LIKE ?
            OR LOWER(u.\`rank\`) LIKE ?
            OR LOWER(u.\`district\`) LIKE ?
            OR LOWER(ce.\`districtWorked\`) LIKE ?
          )
        `);
        params.push(search, search, search, search, search, search, search, search);
      }

      if (typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(from)) {
        whereParts.push('ce.`entryDate` >= ?');
        params.push(from);
      }

      if (typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(to)) {
        whereParts.push('ce.`entryDate` <= ?');
        params.push(to);
      }

      if (typeof district === 'string' && district.trim()) {
        whereParts.push('ce.`districtWorked` = ?');
        params.push(district.trim());
      }

      const fromClause = `
        FROM calendar_entries ce
        LEFT JOIN users u ON u.\`id\` = ce.\`ownerAccountId\`
        WHERE ${whereParts.join(' AND ')}
      `;
      const [countRows] = await conn.query<CountRow[]>(
        `SELECT COUNT(*) as total ${fromClause}`,
        params
      );
      const total = Number(countRows[0]?.total) || 0;
      const query = `
        SELECT
          ce.*,
          u.\`firstName\`,
          u.\`lastName\`,
          u.\`email\`,
          u.\`peNumber\`,
          u.\`badgeNumber\`,
          u.\`rank\`,
          u.\`district\`
        ${fromClause}
        ORDER BY ce.\`entryDate\` DESC, ce.\`updatedAt\` DESC, u.\`lastName\`, u.\`firstName\`
        LIMIT ? OFFSET ?
      `;

      const [rows] = await conn.query<TrooperDailyReportRow[]>(query, [...params, pageSize, offset]);
      const data = rows.map((row) => ({
        id: row.id,
        ownerAccountId: row.ownerAccountId,
        date: formatReportDate(row.entryDate),
        dutyHours: String(row.dutyHours).replace(/\.?0+$/u, ''),
        districtWorked: row.districtWorked,
        specialStatus: row.specialStatus,
        color: row.color,
        details: parseDetails(row.details),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        user: {
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          email: row.email || '',
          peNumber: row.peNumber || '',
          badgeNumber: row.badgeNumber || '',
          rank: row.rank || '',
          district: row.district || '',
        },
      }));

      res.json({ count: data.length, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), data });
    } catch (error) {
      console.error('Trooper daily report error:', error);
      res.status(500).json({ error: 'Failed to load Trooper Daily reports' });
    } finally {
      conn?.release();
    }
  }

  static async getUsersByRank(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.query(`
        SELECT \`rank\`, COUNT(*) as count,
        SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        GROUP BY \`rank\`
        ORDER BY count DESC
      `);
      res.json(rows);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    } finally {
      conn?.release();
    }
  }

  static async getUsersByDistrict(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.query(`
        SELECT \`district\`, COUNT(*) as count,
        SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        GROUP BY \`district\`
        ORDER BY count DESC
      `);
      res.json(rows);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    } finally {
      conn?.release();
    }
  }

  static async getUsersByEmploymentType(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.query(`
        SELECT \`employmentType\`, COUNT(*) as count,
        SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        GROUP BY \`employmentType\`
        ORDER BY count DESC
      `);
      res.json(rows);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    } finally {
      conn?.release();
    }
  }

  static async getSystemStatistics(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const [stats] = await conn.query<StatisticsRow[]>(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN \`isActive\` = 0 THEN 1 ELSE 0 END) as inactiveUsers,
          COUNT(DISTINCT \`district\`) as totalDistricts,
          COUNT(DISTINCT \`rank\`) as totalRanks
        FROM users
      `);
      const [accountStats] = await conn.query<AccountStatisticsRow[]>(`
        SELECT
          COUNT(*) as totalAccounts,
          SUM(CASE WHEN \`role\` = 'administrator' THEN 1 ELSE 0 END) as administratorAccounts,
          SUM(CASE WHEN \`role\` = 'user' THEN 1 ELSE 0 END) as standardAccounts
        FROM users
        WHERE \`passwordHash\` IS NOT NULL
      `);

      res.json({
        ...stats[0],
        totalAccounts: accountStats[0]?.totalAccounts || 0,
        administratorAccounts: accountStats[0]?.administratorAccounts || 0,
        standardAccounts: accountStats[0]?.standardAccounts || 0,
      });
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate statistics' });
    } finally {
      conn?.release();
    }
  }

  static async getDetailedReport(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const { district, rank, active } = req.query;

      let query = 'SELECT * FROM users WHERE 1=1';
      const params: Array<string | number> = [];

      if (typeof district === 'string' && district) {
        query += ' AND `district` = ?';
        params.push(district);
      }
      if (typeof rank === 'string' && rank) {
        query += ' AND `rank` = ?';
        params.push(rank);
      }
      if (typeof active === 'string' && active) {
        query += ' AND `isActive` = ?';
        params.push(active === 'true' ? 1 : 0);
      }

      query += ' ORDER BY `lastName`, `firstName`';

      const [rows] = await conn.query(query, params);
      
      res.json({
        count: (rows as RowDataPacket[]).length,
        data: rows,
      });
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate detailed report' });
    } finally {
      conn?.release();
    }
  }
}
