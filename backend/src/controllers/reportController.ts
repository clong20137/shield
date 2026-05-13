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

export class ReportController {
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
        FROM auth_accounts
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
