import { Request, Response } from 'express';
import pool from '../config/database';

export class ReportController {
  static async getUsersByRank(req: Request, res: Response) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(`
        SELECT rank, COUNT(*) as count, 
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        GROUP BY rank
        ORDER BY count DESC
      `);
      conn.release();
      res.json(rows);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  static async getUsersByDistrict(req: Request, res: Response) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(`
        SELECT district, COUNT(*) as count,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        GROUP BY district
        ORDER BY count DESC
      `);
      conn.release();
      res.json(rows);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  static async getUsersByEmploymentType(req: Request, res: Response) {
    try {
      const conn = await pool.getConnection();
      const [rows] = await conn.query(`
        SELECT employmentType, COUNT(*) as count,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        GROUP BY employmentType
        ORDER BY count DESC
      `);
      conn.release();
      res.json(rows);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  static async getSystemStatistics(req: Request, res: Response) {
    try {
      const conn = await pool.getConnection();
      const [stats] = await conn.query(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN isActive = 0 THEN 1 ELSE 0 END) as inactiveUsers,
          COUNT(DISTINCT district) as totalDistricts,
          COUNT(DISTINCT rank) as totalRanks
        FROM users
      `);
      conn.release();
      res.json((stats as any[])[0]);
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate statistics' });
    }
  }

  static async getDetailedReport(req: Request, res: Response) {
    try {
      const { district, rank, active } = req.query;
      const conn = await pool.getConnection();

      let query = 'SELECT * FROM users WHERE 1=1';
      const params: any[] = [];

      if (district) {
        query += ' AND district = ?';
        params.push(district);
      }
      if (rank) {
        query += ' AND rank = ?';
        params.push(rank);
      }
      if (active !== undefined) {
        query += ' AND isActive = ?';
        params.push(active === 'true' ? 1 : 0);
      }

      query += ' ORDER BY lastName, firstName';

      const [rows] = await conn.query(query, params);
      conn.release();
      
      res.json({
        count: (rows as any[]).length,
        data: rows,
      });
    } catch (error) {
      console.error('Report error:', error);
      res.status(500).json({ error: 'Failed to generate detailed report' });
    }
  }
}
