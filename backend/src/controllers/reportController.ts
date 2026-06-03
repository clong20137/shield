import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { AuditLogModel } from '../models/AuditLog';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { cleanMultiline, cleanString, isOneOf } from '../utils/validation';
import { parsePagination } from '../utils/pagination';

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
  reviewStatus: 'Pending' | 'Approved' | 'Returned' | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
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

const reviewStatuses = ['Approved', 'Returned'] as const;

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

async function canViewHiddenUsers(req: Request): Promise<boolean> {
  const account = await getSessionAccount(req);
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:view-hidden');
}

export class ReportController {
  static async getTrooperDailies(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const permissions = account.role === 'administrator' ? ['reports:trooper-dailies'] : await AuthAccountModel.getPermissionsForAccount(account.id);
      const canViewAllReports = account.role === 'administrator' || permissions.includes('reports:trooper-dailies');
      const supervisorNames = Array.from(new Set([
        account.displayName,
        `${account.firstName || ''} ${account.lastName || ''}`.trim(),
        account.email,
      ]
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value))));
      const { q, from, to, district } = req.query;
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
      const offset = (page - 1) * pageSize;
      const params: Array<string | number> = [];
      const whereParts = ["ce.`category` = 'Trooper Daily'", "COALESCE(ce.`submissionStatus`, 'Submitted') = 'Submitted'"];

      if (!canViewAllReports) {
        if (supervisorNames.length > 0) {
          whereParts.push(`(ce.\`ownerAccountId\` = ? OR LOWER(COALESCE(u.\`supervisor\`, '')) IN (${supervisorNames.map(() => '?').join(', ')}))`);
          params.push(account.id, ...supervisorNames);
        } else {
          whereParts.push('ce.`ownerAccountId` = ?');
          params.push(account.id);
        }
      }

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
        reviewStatus: row.reviewStatus || 'Pending',
        reviewNotes: row.reviewNotes || '',
        reviewedBy: row.reviewedBy || null,
        reviewedByName: row.reviewedByName || null,
        reviewedAt: row.reviewedAt,
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

      const supervisorScope = !canViewAllReports && data.some((entry) => entry.ownerAccountId !== account.id);
      res.json({ count: data.length, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), scope: canViewAllReports ? 'all' : supervisorScope ? 'supervised' : 'own', data });
    } catch (error) {
      console.error('Trooper daily report error:', error);
      res.status(500).json({ error: 'Failed to load Trooper Daily reports' });
    } finally {
      conn?.release();
    }
  }

  static async reviewTrooperDaily(req: Request, res: Response) {
    let conn;
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const permissions = account.role === 'administrator' ? ['reports:trooper-dailies'] : await AuthAccountModel.getPermissionsForAccount(account.id);
      if (account.role !== 'administrator' && !permissions.includes('reports:trooper-dailies')) {
        return res.status(403).json({ error: 'Trooper Daily review permission required' });
      }

      const status = cleanString(req.body?.status, 30);
      const notes = cleanMultiline(req.body?.notes, 2000);
      if (!isOneOf(status, reviewStatuses)) {
        return res.status(400).json({ error: 'Choose approve or return for the review status' });
      }

      if (status === 'Returned' && !notes) {
        return res.status(400).json({ error: 'Return notes are required when sending a report back' });
      }

      conn = await pool.getConnection();
      const [ownerRows] = await conn.query<TrooperDailyReportRow[]>(
        `SELECT ce.*, u.\`firstName\`, u.\`lastName\`, u.\`email\`, u.\`peNumber\`, u.\`badgeNumber\`, u.\`rank\`, u.\`district\`
         FROM calendar_entries ce
         LEFT JOIN users u ON u.\`id\` = ce.\`ownerAccountId\`
         WHERE ce.\`id\` = ? AND ce.\`category\` = 'Trooper Daily' AND COALESCE(ce.\`submissionStatus\`, 'Submitted') = 'Submitted'
         LIMIT 1`,
        [req.params.id],
      );
      const existing = ownerRows[0];
      if (!existing) {
        return res.status(404).json({ error: 'Trooper Daily report not found' });
      }

      const reviewedEntry = await CalendarEntryModel.reviewEntry(req.params.id, status, notes, {
        id: account.id,
        name: account.displayName || account.email,
      });

      if (!reviewedEntry) {
        return res.status(404).json({ error: 'Trooper Daily report not found' });
      }

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: status === 'Approved' ? 'approved' : 'returned',
        entityType: 'trooper_daily',
        entityId: reviewedEntry.id,
        details: JSON.stringify({ status, notes }),
      });

      await UserNotificationModel.create({
        userId: reviewedEntry.ownerAccountId,
        type: 'trooper_daily_review',
        title: `Trooper Daily ${status.toLowerCase()}`,
        message: status === 'Approved'
          ? `Your Trooper Daily for ${reviewedEntry.date} was approved.`
          : `Your Trooper Daily for ${reviewedEntry.date} was returned for correction.`,
        entityType: 'trooper_daily',
        entityId: reviewedEntry.id,
      });

      broadcastAccountEvent(reviewedEntry.ownerAccountId, { type: 'notification-created', entityId: reviewedEntry.id });
      broadcastAppEvent({ type: 'calendar-updated', entityId: reviewedEntry.id });
      res.json({
        id: reviewedEntry.id,
        ownerAccountId: reviewedEntry.ownerAccountId,
        date: reviewedEntry.date,
        dutyHours: reviewedEntry.dutyHours,
        districtWorked: reviewedEntry.districtWorked,
        specialStatus: reviewedEntry.specialStatus,
        color: reviewedEntry.color,
        details: reviewedEntry.details,
        reviewStatus: reviewedEntry.reviewStatus,
        reviewNotes: reviewedEntry.reviewNotes,
        reviewedBy: reviewedEntry.reviewedBy,
        reviewedByName: reviewedEntry.reviewedByName,
        reviewedAt: reviewedEntry.reviewedAt,
        createdAt: reviewedEntry.createdAt,
        updatedAt: reviewedEntry.updatedAt,
        user: {
          firstName: existing.firstName || '',
          lastName: existing.lastName || '',
          email: existing.email || '',
          peNumber: existing.peNumber || '',
          badgeNumber: existing.badgeNumber || '',
          rank: existing.rank || '',
          district: existing.district || '',
        },
      });
    } catch (error) {
      console.error('Trooper daily review error:', error);
      res.status(500).json({ error: 'Failed to review Trooper Daily report' });
    } finally {
      conn?.release();
    }
  }

  static async getUsersByRank(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const hiddenFilter = (await canViewHiddenUsers(req)) ? '' : 'WHERE COALESCE(`isHidden`, 0) = 0';
      const [rows] = await conn.query(`
        SELECT \`rank\`, COUNT(*) as count,
        SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        ${hiddenFilter}
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
      const hiddenFilter = (await canViewHiddenUsers(req)) ? '' : 'WHERE COALESCE(`isHidden`, 0) = 0';
      const [rows] = await conn.query(`
        SELECT \`district\`, COUNT(*) as count,
        SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        ${hiddenFilter}
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
      const hiddenFilter = (await canViewHiddenUsers(req)) ? '' : 'WHERE COALESCE(`isHidden`, 0) = 0';
      const [rows] = await conn.query(`
        SELECT \`employmentType\`, COUNT(*) as count,
        SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeCount
        FROM users
        ${hiddenFilter}
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
      const hiddenFilter = (await canViewHiddenUsers(req)) ? '' : 'WHERE COALESCE(`isHidden`, 0) = 0';
      const accountHiddenFilter = (await canViewHiddenUsers(req)) ? 'WHERE `passwordHash` IS NOT NULL' : 'WHERE `passwordHash` IS NOT NULL AND COALESCE(`isHidden`, 0) = 0';
      const [stats] = await conn.query<StatisticsRow[]>(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN \`isActive\` = 1 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN \`isActive\` = 0 THEN 1 ELSE 0 END) as inactiveUsers,
          COUNT(DISTINCT \`district\`) as totalDistricts,
          COUNT(DISTINCT \`rank\`) as totalRanks
        FROM users
        ${hiddenFilter}
      `);
      const [accountStats] = await conn.query<AccountStatisticsRow[]>(`
        SELECT
          COUNT(*) as totalAccounts,
          SUM(CASE WHEN \`role\` = 'administrator' THEN 1 ELSE 0 END) as administratorAccounts,
          SUM(CASE WHEN \`role\` = 'user' THEN 1 ELSE 0 END) as standardAccounts
        FROM users
        ${accountHiddenFilter}
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
      const pagination = parsePagination(req.query, { defaultPageSize: 250, maxPageSize: 500 });

      let query = 'SELECT * FROM users WHERE 1=1';
      const params: Array<string | number> = [];

      if (!(await canViewHiddenUsers(req))) {
        query += ' AND COALESCE(`isHidden`, 0) = 0';
      }

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

      query += ' ORDER BY `lastName`, `firstName` LIMIT ? OFFSET ?';
      params.push(pagination.pageSize, pagination.offset);

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
