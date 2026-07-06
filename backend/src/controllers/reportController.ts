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

interface DeviceReportSummaryRow extends RowDataPacket {
  totalDevices: number;
  assignedDevices: number;
  unassignedDevices: number;
  availableDevices: number;
  maintenanceDevices: number;
  damagedDevices: number;
  lostDevices: number;
  retiredDevices: number;
}

interface DeviceReportGroupRow extends RowDataPacket {
  label: string;
  count: number;
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

interface TrooperDailyAnalyticsGroupRow extends RowDataPacket {
  label: string | null;
  count: number;
  hours: number | string;
}

interface TrooperDailyAnalyticsTrendRow extends RowDataPacket {
  label: string;
  count: number;
  hours: number | string;
}

interface TrooperDailyAnalyticsTotalsRow extends RowDataPacket {
  totalReports: number;
  totalHours: number | string;
  averageHours: number | string;
  uniqueTroopers: number;
}

interface TrooperDailyAnalyticsMonthlyRow extends RowDataPacket {
  label: string;
}

interface AccessReviewSummaryRow extends RowDataPacket {
  totalAccounts: number;
  activeAccounts: number;
  inactiveAccounts: number;
  administratorAccounts: number;
  mfaEnabledAccounts: number;
  mfaMissingAccounts: number;
  staleAccounts: number;
  neverSeenAccounts: number;
  activeSessions: number;
}

interface AccessReviewAccountRow extends RowDataPacket {
  id: string;
  displayName: string | null;
  email: string | null;
  role: string | null;
  district: string | null;
  rank: string | null;
  isActive: boolean | number;
  isHidden: boolean | number;
  twoFactorEnabled: boolean | number;
  lastSeenAt: Date | null;
  lastSsoLoginAt: Date | null;
  createdAt: Date;
  activeSessionCount: number;
  permissions: string | null;
}

interface PermissionDistributionRow extends RowDataPacket {
  role: string;
  accountCount: number;
  permissions: string | null;
}

const reviewStatuses = ['Approved', 'Returned'] as const;
const trooperDailyAnalyticsFields = [
  ['regularDutyHours', 'Regular Duty Hours'],
  ['regularDaysOff', 'Regular Days Off'],
  ['compHoursUsed', 'Comp Hours Used'],
  ['personalLeaveHours', 'Personal Leave Hours'],
  ['vacationHours', 'Vacation Hours'],
  ['holidayHours', 'Holiday Hours'],
  ['compOtHoursEarned', 'Comp/OT Hours Earned'],
  ['injuryIllnessHours', 'Injury/Illness Hours'],
  ['patrolHours', 'Patrol Hours'],
  ['crashInvestHours', 'Crash Investigation Hours'],
  ['trafficCourtHours', 'Traffic Court Hours'],
  ['incidentReportHours', 'Incident Report Hours'],
  ['criminalInvestHours', 'Criminal Investigation Hours'],
  ['criminalCourtHours', 'Criminal Court Hours'],
  ['mealBreakHours', 'Meal Break Hours'],
  ['regularDutyMiles', 'Regular Duty Miles'],
  ['policeServices', 'Police Services'],
  ['suspensions', 'Suspensions'],
  ['crashesInvestigated', 'Crashes Investigated'],
  ['crashCitations', 'Crash Citations'],
  ['seatBeltCitations', 'Seat Belt Citations'],
  ['childRestraintCitations', 'Child Restraint Citations'],
  ['under10kTruckCitations', 'Under 10K Truck Citations'],
  ['owiDefendants', 'OWI Defendants'],
  ['pbt', 'PBT'],
  ['certifiedBreathTests', 'Certified Breath Tests'],
  ['refusals', 'Refusals'],
  ['owiMisdemeanors', 'OWI Misdemeanors'],
  ['owiFelonies', 'OWI Felonies'],
  ['owiControlledSubstances', 'OWI Controlled Substances'],
  ['underAgeOwi', 'Under Age OWI'],
  ['dreTests', 'DRE Tests'],
  ['sfstTests', 'SFST Tests'],
  ['openContainers', 'Open Containers'],
  ['otherOwiViolations', 'Other OWI Violations'],
  ['movingCitations', 'Moving Citations'],
  ['nonMovingCitations', 'Non Moving Citations'],
  ['warnings', 'Warnings'],
  ['trucksInspected', 'Trucks Inspected'],
  ['outOfServices', 'Out of Services'],
  ['mcsapViolations', 'MCSAP Violations'],
  ['trucksMeasured', 'Trucks Measured'],
  ['inspectionOutOfServices', 'Inspection Out of Services'],
  ['owGrossCitations', 'OW Gross Citations'],
  ['owAxleCitations', 'OW Axle Citations'],
  ['owBridgeCitations', 'OW Bridge Citations'],
  ['portWeighed', 'Port Weighed'],
  ['owLoadAdjustments', 'OW Load Adjustments'],
  ['owVehicleOffLoaded', 'OW Vehicle Off Loaded'],
  ['criminalDefendants', 'Criminal Defendants'],
  ['totalCriminalArrests', 'Total Criminal Arrests'],
  ['totalFelonyArrests', 'Total Felony Arrests'],
  ['criminalActivityReports', 'Criminal Activity Reports'],
  ['stolenVehiclesRecovered', 'Stolen Vehicles Recovered'],
  ['gunsSeized', 'Guns Seized'],
  ['amountUscSeized', 'Amount of USC Seized'],
  ['htiInteractions', 'HTI Interactions'],
  ['htiArrests', 'HTI Arrests'],
  ['htiRescues', 'HTI Rescues'],
  ['heroinArrests', 'Heroin Arrests'],
  ['heroinGramsFound', 'Heroin Found (grams)'],
  ['heroinDefendants', 'Heroin Defendants'],
  ['cocaineArrests', 'Cocaine Arrests'],
  ['cocaineGramsFound', 'Cocaine Found (grams)'],
  ['cocaineDefendants', 'Cocaine Defendants'],
  ['marijuanaArrests', 'Marijuana Arrests'],
  ['marijuanaGramsFound', 'Marijuana Found (grams)'],
  ['marijuanaDefendants', 'Marijuana Defendants'],
  ['totalPlantsSeized', 'Total Plants Seized'],
  ['totalWeightSeizedGrams', 'Total Weight Seized (grams)'],
  ['methamphetamineArrests', 'Methamphetamine Arrests'],
  ['methamphetamineGramsFound', 'Methamphetamine Found (grams)'],
  ['methamphetamineDefendants', 'Methamphetamine Defendants'],
  ['prescriptionArrests', 'Prescription Arrests'],
  ['prescriptionDefendants', 'Prescription Defendants'],
  ['otherDrugArrests', 'Other Drug Arrests'],
  ['otherDrugDefendants', 'Other Drug Defendants'],
  ['totalDrugArrests', 'Total Drug Arrests'],
  ['totalDrugDefendants', 'Total Drug Defendants'],
] as const;
const trooperDailyAnalyticsSections = [
  { title: 'Attendance Hours', keys: ['regularDutyHours', 'regularDaysOff', 'compHoursUsed', 'personalLeaveHours', 'vacationHours', 'holidayHours', 'compOtHoursEarned', 'injuryIllnessHours'] },
  { title: 'Duty Hours', keys: ['patrolHours', 'crashInvestHours', 'trafficCourtHours', 'incidentReportHours', 'criminalInvestHours', 'criminalCourtHours', 'mealBreakHours'] },
  { title: 'Traffic Activity', keys: ['regularDutyMiles', 'policeServices', 'suspensions', 'crashesInvestigated', 'crashCitations', 'seatBeltCitations', 'childRestraintCitations', 'under10kTruckCitations'] },
  { title: 'OWI Offense Activity', keys: ['owiDefendants', 'pbt', 'certifiedBreathTests', 'refusals', 'owiMisdemeanors', 'owiFelonies', 'owiControlledSubstances', 'underAgeOwi', 'dreTests', 'sfstTests', 'openContainers', 'otherOwiViolations'] },
  { title: '10K Truck Activity', keys: ['movingCitations', 'nonMovingCitations', 'warnings', 'trucksInspected', 'outOfServices', 'mcsapViolations'] },
  { title: 'Level 1-3 Inspections', keys: ['trucksMeasured', 'inspectionOutOfServices', 'owGrossCitations', 'owAxleCitations', 'owBridgeCitations', 'portWeighed', 'owLoadAdjustments', 'owVehicleOffLoaded'] },
  { title: 'Criminal Activity', keys: ['criminalDefendants', 'totalCriminalArrests', 'totalFelonyArrests', 'criminalActivityReports', 'stolenVehiclesRecovered', 'gunsSeized', 'amountUscSeized', 'htiInteractions', 'htiArrests', 'htiRescues'] },
  { title: 'Drug Activity', keys: ['heroinArrests', 'heroinGramsFound', 'heroinDefendants', 'cocaineArrests', 'cocaineGramsFound', 'cocaineDefendants', 'marijuanaArrests', 'marijuanaGramsFound', 'marijuanaDefendants', 'totalPlantsSeized', 'totalWeightSeizedGrams', 'methamphetamineArrests', 'methamphetamineGramsFound', 'methamphetamineDefendants', 'prescriptionArrests', 'prescriptionDefendants', 'otherDrugArrests', 'otherDrugDefendants', 'totalDrugArrests', 'totalDrugDefendants'] },
] as const;
const trooperDailyAnalyticsFieldSections = new Map<string, string>(
  trooperDailyAnalyticsSections.flatMap((section) => section.keys.map((key) => [key, section.title] as const)),
);
const privilegedPermissions = new Set([
  'roles:manage',
  'audit:view',
  'users:create',
  'users:edit',
  'users:view-hidden',
  'users:profile-picture',
  'media:upload',
  'media:edit',
  'media:delete',
  'devices:manage',
  'fleet:bookings:manage',
  'fleet:vehicles:manage',
  'fleet:inventory:manage',
  'reports:trooper-dailies',
  'alerts:send',
  'dashboard:manage',
  'dashboard:create',
  'dashboard:edit',
  'dashboard:delete',
  'bugs:manage',
  'admin:access',
]);

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

function parsePermissionList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function isStaleLastSeen(value: Date | null, staleBefore: Date): boolean {
  return !value || value.getTime() < staleBefore.getTime();
}

async function canViewHiddenUsers(req: Request): Promise<boolean> {
  const account = await getSessionAccount(req);
  if (!account) return false;
  if (account.role === 'administrator') return true;

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:view-hidden');
}

async function buildTrooperDailyReportScope(req: Request) {
  const account = await getSessionAccount(req);
  if (!account) {
    return { error: 'Sign in required' as const };
  }

  const permissions = account.role === 'administrator' ? ['reports:trooper-dailies'] : await AuthAccountModel.getPermissionsForAccount(account.id);
  const canViewAllReports = account.role === 'administrator' || permissions.includes('reports:trooper-dailies');
  const { q, from, to, district } = req.query;
  const params: Array<string | number> = [];
  const whereParts = ["ce.`category` = 'Trooper Daily'", "COALESCE(ce.`submissionStatus`, 'Submitted') = 'Submitted'"];

  if (!canViewAllReports) {
    whereParts.push('ce.`ownerAccountId` = ?');
    params.push(account.id);
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

  return {
    account,
    canViewAllReports,
    fromClause: `
      FROM calendar_entries ce
      LEFT JOIN users u ON u.\`id\` = ce.\`ownerAccountId\`
      WHERE ${whereParts.join(' AND ')}
    `,
    params,
  };
}

export class ReportController {
  static async getDeviceManagementReports(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const [summaryRows] = await conn.query<DeviceReportSummaryRow[]>(
        `SELECT
          COUNT(*) AS totalDevices,
          SUM(CASE WHEN COALESCE(\`assignedTo\`, '') <> '' THEN 1 ELSE 0 END) AS assignedDevices,
          SUM(CASE WHEN COALESCE(\`assignedTo\`, '') = '' THEN 1 ELSE 0 END) AS unassignedDevices,
          SUM(CASE WHEN \`status\` = 'Available' THEN 1 ELSE 0 END) AS availableDevices,
          SUM(CASE WHEN \`status\` = 'Maintenance' THEN 1 ELSE 0 END) AS maintenanceDevices,
          SUM(CASE WHEN \`status\` = 'Damaged' THEN 1 ELSE 0 END) AS damagedDevices,
          SUM(CASE WHEN \`status\` = 'Lost' THEN 1 ELSE 0 END) AS lostDevices,
          SUM(CASE WHEN \`status\` = 'Retired' THEN 1 ELSE 0 END) AS retiredDevices
        FROM devices`,
      );
      const [typeRows] = await conn.query<DeviceReportGroupRow[]>(
        `SELECT COALESCE(NULLIF(\`type\`, ''), 'Unknown') AS label, COUNT(*) AS count
        FROM devices
        GROUP BY label
        ORDER BY count DESC, label`,
      );
      const [statusRows] = await conn.query<DeviceReportGroupRow[]>(
        `SELECT COALESCE(NULLIF(\`status\`, ''), 'Unknown') AS label, COUNT(*) AS count
        FROM devices
        GROUP BY label
        ORDER BY count DESC, label`,
      );
      const [carrierRows] = await conn.query<DeviceReportGroupRow[]>(
        `SELECT COALESCE(NULLIF(\`carrier\`, ''), 'Unknown') AS label, COUNT(*) AS count
        FROM devices
        GROUP BY label
        ORDER BY count DESC, label`,
      );
      const [modelRows] = await conn.query<DeviceReportGroupRow[]>(
        `SELECT COALESCE(NULLIF(\`makeModel\`, ''), 'Unknown') AS label, COUNT(*) AS count
        FROM devices
        GROUP BY label
        ORDER BY count DESC, label
        LIMIT 12`,
      );
      const [conditionRows] = await conn.query<DeviceReportGroupRow[]>(
        `SELECT COALESCE(NULLIF(\`condition\`, ''), 'Unknown') AS label, COUNT(*) AS count
        FROM devices
        GROUP BY label
        ORDER BY count DESC, label`,
      );

      const mapGroup = (rows: DeviceReportGroupRow[]) => rows.map((row) => ({
        label: row.label || 'Unknown',
        count: Number(row.count) || 0,
      }));
      const summary = summaryRows[0] || {
        totalDevices: 0,
        assignedDevices: 0,
        unassignedDevices: 0,
        availableDevices: 0,
        maintenanceDevices: 0,
        damagedDevices: 0,
        lostDevices: 0,
        retiredDevices: 0,
      };

      res.json({
        generatedAt: new Date().toISOString(),
        summary: {
          totalDevices: Number(summary.totalDevices) || 0,
          assignedDevices: Number(summary.assignedDevices) || 0,
          unassignedDevices: Number(summary.unassignedDevices) || 0,
          availableDevices: Number(summary.availableDevices) || 0,
          maintenanceDevices: Number(summary.maintenanceDevices) || 0,
          damagedDevices: Number(summary.damagedDevices) || 0,
          lostDevices: Number(summary.lostDevices) || 0,
          retiredDevices: Number(summary.retiredDevices) || 0,
        },
        byType: mapGroup(typeRows),
        byStatus: mapGroup(statusRows),
        byCarrier: mapGroup(carrierRows),
        byModel: mapGroup(modelRows),
        byCondition: mapGroup(conditionRows),
      });
    } catch (error) {
      console.error('Device management report error:', error);
      res.status(500).json({ error: 'Failed to load device management reports' });
    } finally {
      conn?.release();
    }
  }

  static async getAccessReview(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const staleBefore = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      const [summaryRows] = await conn.query<AccessReviewSummaryRow[]>(
        `SELECT
          COUNT(*) AS totalAccounts,
          SUM(CASE WHEN u.\`isActive\` = 1 THEN 1 ELSE 0 END) AS activeAccounts,
          SUM(CASE WHEN u.\`isActive\` = 0 THEN 1 ELSE 0 END) AS inactiveAccounts,
          SUM(CASE WHEN u.\`role\` = 'administrator' THEN 1 ELSE 0 END) AS administratorAccounts,
          SUM(CASE WHEN COALESCE(u.\`twoFactorEnabled\`, 0) = 1 THEN 1 ELSE 0 END) AS mfaEnabledAccounts,
          SUM(CASE WHEN COALESCE(u.\`twoFactorEnabled\`, 0) = 0 THEN 1 ELSE 0 END) AS mfaMissingAccounts,
          SUM(CASE WHEN u.\`lastSeenAt\` IS NULL THEN 1 ELSE 0 END) AS neverSeenAccounts,
          SUM(CASE WHEN u.\`lastSeenAt\` IS NULL OR u.\`lastSeenAt\` < ? THEN 1 ELSE 0 END) AS staleAccounts,
          (
            SELECT COUNT(*)
            FROM user_sessions s
            WHERE s.\`revokedAt\` IS NULL AND s.\`expiresAt\` > NOW()
          ) AS activeSessions
        FROM users u
        WHERE u.\`passwordHash\` IS NOT NULL`,
        [staleBefore],
      );

      const [accountRows] = await conn.query<AccessReviewAccountRow[]>(
        `SELECT
          u.\`id\`,
          u.\`displayName\`,
          u.\`email\`,
          u.\`role\`,
          u.\`district\`,
          u.\`rank\`,
          u.\`isActive\`,
          u.\`isHidden\`,
          u.\`twoFactorEnabled\`,
          u.\`lastSeenAt\`,
          u.\`lastSsoLoginAt\`,
          u.\`createdAt\`,
          COALESCE(activeSessions.\`activeSessionCount\`, 0) AS activeSessionCount,
          r.\`permissions\`
        FROM users u
        LEFT JOIN roles r ON r.\`name\` = u.\`role\`
        LEFT JOIN (
          SELECT \`userId\`, COUNT(*) AS activeSessionCount
          FROM user_sessions
          WHERE \`revokedAt\` IS NULL AND \`expiresAt\` > NOW()
          GROUP BY \`userId\`
        ) activeSessions ON activeSessions.\`userId\` = u.\`id\`
        WHERE u.\`passwordHash\` IS NOT NULL
        ORDER BY
          CASE WHEN u.\`role\` = 'administrator' THEN 0 ELSE 1 END,
          COALESCE(u.\`twoFactorEnabled\`, 0),
          u.\`lastSeenAt\`,
          u.\`displayName\`,
          u.\`email\`
        LIMIT 500`,
      );

      const [distributionRows] = await conn.query<PermissionDistributionRow[]>(
        `SELECT u.\`role\`, COUNT(*) AS accountCount, r.\`permissions\`
        FROM users u
        LEFT JOIN roles r ON r.\`name\` = u.\`role\`
        WHERE u.\`passwordHash\` IS NOT NULL
        GROUP BY u.\`role\`, r.\`permissions\`
        ORDER BY accountCount DESC, u.\`role\``,
      );

      const accounts = accountRows.map((row) => {
        const permissions = parsePermissionList(row.permissions);
        return {
          id: row.id,
          displayName: row.displayName || row.email || 'Unknown account',
          email: row.email || '',
          role: row.role || 'user',
          district: row.district || '',
          rank: row.rank || '',
          isActive: row.isActive !== false && row.isActive !== 0,
          isHidden: Boolean(row.isHidden),
          twoFactorEnabled: Boolean(row.twoFactorEnabled),
          lastSeenAt: row.lastSeenAt,
          lastSsoLoginAt: row.lastSsoLoginAt,
          createdAt: row.createdAt,
          activeSessionCount: Number(row.activeSessionCount) || 0,
          permissions,
          privilegedPermissions: permissions.filter((permission) => privilegedPermissions.has(permission)),
          reviewFlags: [
            row.role === 'administrator' && !row.twoFactorEnabled ? 'administrator_missing_mfa' : '',
            row.isActive !== false && row.isActive !== 0 && !row.twoFactorEnabled ? 'mfa_missing' : '',
            row.isActive !== false && row.isActive !== 0 && isStaleLastSeen(row.lastSeenAt, staleBefore) ? 'stale_or_never_seen' : '',
            Number(row.activeSessionCount) > 3 ? 'multiple_active_sessions' : '',
            Boolean(row.isHidden) ? 'hidden_account' : '',
          ].filter(Boolean),
        };
      });

      res.json({
        generatedAt: new Date(),
        staleAfterDays: 45,
        summary: summaryRows[0] || {
          totalAccounts: 0,
          activeAccounts: 0,
          inactiveAccounts: 0,
          administratorAccounts: 0,
          mfaEnabledAccounts: 0,
          mfaMissingAccounts: 0,
          staleAccounts: 0,
          neverSeenAccounts: 0,
          activeSessions: 0,
        },
        roles: distributionRows.map((row) => ({
          role: row.role || 'user',
          accountCount: Number(row.accountCount) || 0,
          permissions: parsePermissionList(row.permissions),
        })),
        accounts,
      });
    } catch (error) {
      console.error('Access review report error:', error);
      res.status(500).json({ error: 'Failed to generate access review' });
    } finally {
      conn?.release();
    }
  }

  static async getTrooperDailies(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const scope = await buildTrooperDailyReportScope(req);
      if ('error' in scope) {
        return res.status(401).json({ error: scope.error });
      }
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
      const offset = (page - 1) * pageSize;
      const [countRows] = await conn.query<CountRow[]>(
        `SELECT COUNT(*) as total ${scope.fromClause}`,
        scope.params
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
        ${scope.fromClause}
        ORDER BY ce.\`entryDate\` DESC, ce.\`updatedAt\` DESC, u.\`lastName\`, u.\`firstName\`
        LIMIT ? OFFSET ?
      `;

      const [rows] = await conn.query<TrooperDailyReportRow[]>(query, [...scope.params, pageSize, offset]);
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

      res.json({ count: data.length, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), scope: scope.canViewAllReports ? 'all' : 'own', data });
    } catch (error) {
      console.error('Trooper daily report error:', error);
      res.status(500).json({ error: 'Failed to load Trooper Daily reports' });
    } finally {
      conn?.release();
    }
  }

  static async getTrooperDailyAnalytics(req: Request, res: Response) {
    let conn;
    try {
      conn = await pool.getConnection();
      const scope = await buildTrooperDailyReportScope(req);
      if ('error' in scope) {
        return res.status(401).json({ error: scope.error });
      }

      const [totalRows] = await conn.query<TrooperDailyAnalyticsTotalsRow[]>(
        `SELECT
          COUNT(*) AS totalReports,
          COALESCE(SUM(ce.\`dutyHours\`), 0) AS totalHours,
          COALESCE(AVG(ce.\`dutyHours\`), 0) AS averageHours,
          COUNT(DISTINCT ce.\`ownerAccountId\`) AS uniqueTroopers
        ${scope.fromClause}`,
        scope.params,
      );

      const [districtRows] = await conn.query<TrooperDailyAnalyticsGroupRow[]>(
        `SELECT COALESCE(NULLIF(ce.\`districtWorked\`, ''), 'No District') AS label,
          COUNT(*) AS count,
          COALESCE(SUM(ce.\`dutyHours\`), 0) AS hours
        ${scope.fromClause}
        GROUP BY label
        ORDER BY hours DESC, count DESC
        LIMIT 12`,
        scope.params,
      );

      const [specialStatusRows] = await conn.query<TrooperDailyAnalyticsGroupRow[]>(
        `SELECT COALESCE(NULLIF(ce.\`specialStatus\`, ''), 'None') AS label,
          COUNT(*) AS count,
          COALESCE(SUM(ce.\`dutyHours\`), 0) AS hours
        ${scope.fromClause}
        GROUP BY label
        ORDER BY count DESC, hours DESC`,
        scope.params,
      );

      const [reviewRows] = await conn.query<TrooperDailyAnalyticsGroupRow[]>(
        `SELECT COALESCE(NULLIF(ce.\`reviewStatus\`, ''), 'Pending') AS label,
          COUNT(*) AS count,
          COALESCE(SUM(ce.\`dutyHours\`), 0) AS hours
        ${scope.fromClause}
        GROUP BY label
        ORDER BY count DESC`,
        scope.params,
      );

      const [trendRows] = await conn.query<TrooperDailyAnalyticsTrendRow[]>(
        `SELECT *
        FROM (
          SELECT DATE_FORMAT(ce.\`entryDate\`, '%Y-%m') AS label,
            COUNT(*) AS count,
            COALESCE(SUM(ce.\`dutyHours\`), 0) AS hours
          ${scope.fromClause}
          GROUP BY label
          ORDER BY label DESC
          LIMIT 18
        ) monthlyTrend
        ORDER BY label ASC`,
        scope.params,
      );

      const activitySelect = trooperDailyAnalyticsFields.map(([key]) =>
        `COALESCE(SUM(CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(ce.\`details\`, '$.${key}')), ''), '0') AS DECIMAL(14,2))), 0) AS \`${key}\``
      ).join(',\n');
      const [activityRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${activitySelect} ${scope.fromClause}`,
        scope.params,
      );
      const activityTotals = activityRows[0] || {};
      const [fieldTrendRows] = await conn.query<TrooperDailyAnalyticsMonthlyRow[]>(
        `SELECT *
        FROM (
          SELECT DATE_FORMAT(ce.\`entryDate\`, '%Y-%m') AS label,
            ${activitySelect}
          ${scope.fromClause}
          GROUP BY label
          ORDER BY label DESC
          LIMIT 18
        ) monthlyFieldTrend
        ORDER BY label ASC`,
        scope.params,
      );

      res.json({
        generatedAt: new Date().toISOString(),
        scope: scope.canViewAllReports ? 'all' : 'limited',
        totals: {
          totalReports: Number(totalRows[0]?.totalReports) || 0,
          totalHours: Number(totalRows[0]?.totalHours) || 0,
          averageHours: Number(totalRows[0]?.averageHours) || 0,
          uniqueTroopers: Number(totalRows[0]?.uniqueTroopers) || 0,
        },
        byDistrict: districtRows.map((row) => ({ label: row.label || 'No District', count: Number(row.count) || 0, hours: Number(row.hours) || 0 })),
        bySpecialStatus: specialStatusRows.map((row) => ({ label: row.label || 'None', count: Number(row.count) || 0, hours: Number(row.hours) || 0 })),
        byReviewStatus: reviewRows.map((row) => ({ label: row.label || 'Pending', count: Number(row.count) || 0, hours: Number(row.hours) || 0 })),
        trend: trendRows.map((row) => ({ label: row.label, count: Number(row.count) || 0, hours: Number(row.hours) || 0 })),
        activityTotals: trooperDailyAnalyticsFields
          .map(([key, label]) => ({ key, label, section: trooperDailyAnalyticsFieldSections.get(key) || 'Other', value: Number(activityTotals[key]) || 0 }))
          .filter((item) => item.value > 0)
          .sort((a, b) => b.value - a.value),
        activitySections: trooperDailyAnalyticsSections.map((section) => ({
          title: section.title,
          totals: section.keys
            .map((key) => {
              const field = trooperDailyAnalyticsFields.find(([fieldKey]) => fieldKey === key);
              return {
                key,
                label: field?.[1] || key,
                value: Number(activityTotals[key]) || 0,
              };
            })
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value),
        })).filter((section) => section.totals.length > 0),
        fieldTrends: trooperDailyAnalyticsFields.map(([key, label]) => ({
          key,
          label,
          section: trooperDailyAnalyticsFieldSections.get(key) || 'Other',
          total: Number(activityTotals[key]) || 0,
          points: fieldTrendRows.map((row) => ({ label: row.label, value: Number(row[key]) || 0 })),
        })),
      });
    } catch (error) {
      console.error('Trooper daily analytics error:', error);
      res.status(500).json({ error: 'Failed to load Trooper Daily analytics' });
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
