import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export type DispatchCallStatus = 'Active' | 'Cleared';
export type DispatchUnitStatus = 'Available' | 'Assigned' | 'En Route' | 'On Scene' | 'Clear';

export interface DispatchCall {
  id: string;
  callNumber: string;
  title: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  priority: string;
  status: DispatchCallStatus;
  trafficStatus: string;
  etaMinutes: number;
  distanceMiles: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchUnitAssignment {
  id: string;
  callId: string;
  accountId: string;
  unitLabel: string;
  status: DispatchUnitStatus;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastSpeedMph: number;
  lastDistanceMiles: number;
  lastGpsAt: Date | null;
  assignedAt: Date | null;
  enRouteAt: Date | null;
  onSceneAt: Date | null;
  clearedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchSummary {
  call: DispatchCall;
  assignment: DispatchUnitAssignment | null;
  nearestUnits: DispatchUnitAssignment[];
  automation: {
    enRouteSpeedMph: number;
    onSceneDistanceMiles: number;
  };
}

interface DispatchCallRow extends RowDataPacket, DispatchCall {}
interface DispatchUnitAssignmentRow extends RowDataPacket, DispatchUnitAssignment {}

const EN_ROUTE_SPEED_MPH = Number(process.env.DISPATCH_EN_ROUTE_SPEED_MPH || 3);
const ON_SCENE_DISTANCE_MILES = Number(process.env.DISPATCH_ON_SCENE_DISTANCE_MILES || 0.15);

const callColumns = [
  '`id`',
  '`callNumber`',
  '`title`',
  '`address`',
  '`latitude`',
  '`longitude`',
  '`priority`',
  '`status`',
  '`trafficStatus`',
  '`etaMinutes`',
  '`distanceMiles`',
  '`createdBy`',
  '`createdAt`',
  '`updatedAt`',
].join(', ');

const assignmentColumns = [
  '`id`',
  '`callId`',
  '`accountId`',
  '`unitLabel`',
  '`status`',
  '`lastLatitude`',
  '`lastLongitude`',
  '`lastSpeedMph`',
  '`lastDistanceMiles`',
  '`lastGpsAt`',
  '`assignedAt`',
  '`enRouteAt`',
  '`onSceneAt`',
  '`clearedAt`',
  '`createdAt`',
  '`updatedAt`',
].join(', ');

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function distanceMilesBetween(startLat: number, startLon: number, endLat: number, endLon: number): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(endLat - startLat);
  const dLon = toRadians(endLon - startLon);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Number((earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function getAutomatedStatus(currentStatus: DispatchUnitStatus, speedMph: number, distanceMiles: number): DispatchUnitStatus {
  if ((currentStatus === 'Assigned' || currentStatus === 'En Route') && distanceMiles <= ON_SCENE_DISTANCE_MILES) {
    return 'On Scene';
  }

  if (currentStatus === 'Assigned' && speedMph > EN_ROUTE_SPEED_MPH) {
    return 'En Route';
  }

  return currentStatus;
}

function getStatusTimestampFields(previousStatus: DispatchUnitStatus, nextStatus: DispatchUnitStatus): string {
  const updates: string[] = [];
  if (nextStatus === 'Assigned' && previousStatus !== 'Assigned') updates.push('`assignedAt` = COALESCE(`assignedAt`, ?)');
  if (nextStatus === 'En Route' && previousStatus !== 'En Route') updates.push('`enRouteAt` = COALESCE(`enRouteAt`, ?)');
  if (nextStatus === 'On Scene' && previousStatus !== 'On Scene') updates.push('`onSceneAt` = COALESCE(`onSceneAt`, ?)');
  if (nextStatus === 'Clear' && previousStatus !== 'Clear') updates.push('`clearedAt` = COALESCE(`clearedAt`, ?)');
  return updates.join(', ');
}

export class DispatchModel {
  static async getOrCreateActiveCall(createdBy?: string): Promise<DispatchCall> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DispatchCallRow[]>(
        `SELECT ${callColumns} FROM dispatch_calls WHERE \`status\` = 'Active' ORDER BY \`createdAt\` DESC LIMIT 1`,
      );

      if (rows[0]) {
        return rows[0];
      }

      const id = uuidv4();
      const now = new Date();
      const callNumber = `CALL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-001`;
      await conn.query<ResultSetHeader>(
        `INSERT INTO dispatch_calls (
          \`id\`, \`callNumber\`, \`title\`, \`address\`, \`latitude\`, \`longitude\`, \`priority\`,
          \`status\`, \`trafficStatus\`, \`etaMinutes\`, \`distanceMiles\`, \`createdBy\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', 'Checking', 6, 2.4, ?, ?, ?)`,
        [id, callNumber, 'I-70 WB / marker 91', 'I-70 WB / marker 91', 39.7684, -86.1581, 'Normal', createdBy || null, now, now],
      );

      const [createdRows] = await conn.query<DispatchCallRow[]>(
        `SELECT ${callColumns} FROM dispatch_calls WHERE \`id\` = ? LIMIT 1`,
        [id],
      );
      return createdRows[0];
    } finally {
      conn.release();
    }
  }

  static async getAssignment(callId: string, accountId: string): Promise<DispatchUnitAssignment | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DispatchUnitAssignmentRow[]>(
        `SELECT ${assignmentColumns} FROM dispatch_unit_assignments WHERE \`callId\` = ? AND \`accountId\` = ? LIMIT 1`,
        [callId, accountId],
      );
      return rows[0] || null;
    } finally {
      conn.release();
    }
  }

  static async assignUnit(callId: string, accountId: string, unitLabel: string): Promise<DispatchUnitAssignment> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO dispatch_unit_assignments (
          \`id\`, \`callId\`, \`accountId\`, \`unitLabel\`, \`status\`, \`lastDistanceMiles\`, \`assignedAt\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, 'Assigned', 2.4, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`unitLabel\` = VALUES(\`unitLabel\`),
          \`status\` = CASE WHEN \`status\` = 'Clear' THEN 'Assigned' ELSE \`status\` END,
          \`assignedAt\` = COALESCE(\`assignedAt\`, VALUES(\`assignedAt\`)),
          \`updatedAt\` = VALUES(\`updatedAt\`)`,
        [id, callId, accountId, unitLabel, now, now, now],
      );

      const assignment = await DispatchModel.getAssignment(callId, accountId);
      if (!assignment) {
        throw new Error('Failed to assign unit');
      }
      return assignment;
    } finally {
      conn.release();
    }
  }

  static async getAssignmentById(id: string): Promise<DispatchUnitAssignment | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DispatchUnitAssignmentRow[]>(
        `SELECT ${assignmentColumns} FROM dispatch_unit_assignments WHERE \`id\` = ? LIMIT 1`,
        [id],
      );
      return rows[0] || null;
    } finally {
      conn.release();
    }
  }

  static async updateAssignmentStatus(id: string, status: DispatchUnitStatus): Promise<DispatchUnitAssignment | null> {
    const current = await DispatchModel.getAssignmentById(id);
    if (!current) return null;

    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const timestampSql = getStatusTimestampFields(current.status, status);
      const timestampValues = timestampSql.split('?').slice(0, -1).map(() => now);
      await conn.query<ResultSetHeader>(
        `UPDATE dispatch_unit_assignments
        SET \`status\` = ?, ${timestampSql ? `${timestampSql},` : ''} \`updatedAt\` = ?
        WHERE \`id\` = ?`,
        [status, ...timestampValues, now, id],
      );

      return DispatchModel.getAssignmentById(id);
    } finally {
      conn.release();
    }
  }

  static async recordLocation(assignmentId: string, latitude: number, longitude: number, speedMph: number): Promise<DispatchUnitAssignment | null> {
    const assignment = await DispatchModel.getAssignmentById(assignmentId);
    if (!assignment) return null;

    const call = await DispatchModel.getCall(assignment.callId);
    const distanceMiles = call?.latitude && call.longitude
      ? distanceMilesBetween(latitude, longitude, toNumber(call.latitude), toNumber(call.longitude))
      : assignment.lastDistanceMiles;
    const nextStatus = getAutomatedStatus(assignment.status, speedMph, distanceMiles);
    const trafficStatus = speedMph >= 30 ? 'Moderate' : distanceMiles < 0.8 ? 'Light' : 'Checking';
    const etaMinutes = speedMph > EN_ROUTE_SPEED_MPH ? Math.max(1, Math.ceil((distanceMiles / speedMph) * 60)) : 0;

    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const timestampSql = getStatusTimestampFields(assignment.status, nextStatus);
      const timestampValues = timestampSql.split('?').slice(0, -1).map(() => now);

      await conn.query<ResultSetHeader>(
        `INSERT INTO dispatch_location_pings (
          \`id\`, \`assignmentId\`, \`callId\`, \`accountId\`, \`latitude\`, \`longitude\`, \`speedMph\`, \`distanceMiles\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), assignment.id, assignment.callId, assignment.accountId, latitude, longitude, speedMph, distanceMiles, now],
      );

      await conn.query<ResultSetHeader>(
        `UPDATE dispatch_unit_assignments
        SET
          \`status\` = ?,
          \`lastLatitude\` = ?,
          \`lastLongitude\` = ?,
          \`lastSpeedMph\` = ?,
          \`lastDistanceMiles\` = ?,
          \`lastGpsAt\` = ?,
          ${timestampSql ? `${timestampSql},` : ''}
          \`updatedAt\` = ?
        WHERE \`id\` = ?`,
        [nextStatus, latitude, longitude, speedMph, distanceMiles, now, ...timestampValues, now, assignment.id],
      );

      await conn.query<ResultSetHeader>(
        `UPDATE dispatch_calls SET \`distanceMiles\` = ?, \`etaMinutes\` = ?, \`trafficStatus\` = ?, \`updatedAt\` = ? WHERE \`id\` = ?`,
        [distanceMiles, etaMinutes, trafficStatus, now, assignment.callId],
      );

      return DispatchModel.getAssignmentById(assignment.id);
    } finally {
      conn.release();
    }
  }

  static async getCall(id: string): Promise<DispatchCall | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DispatchCallRow[]>(
        `SELECT ${callColumns} FROM dispatch_calls WHERE \`id\` = ? LIMIT 1`,
        [id],
      );
      return rows[0] || null;
    } finally {
      conn.release();
    }
  }

  static async getNearestUnits(callId: string, limit = 6): Promise<DispatchUnitAssignment[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DispatchUnitAssignmentRow[]>(
        `SELECT ${assignmentColumns}
        FROM dispatch_unit_assignments
        WHERE \`callId\` = ?
        ORDER BY \`lastDistanceMiles\` ASC, \`updatedAt\` DESC
        LIMIT ?`,
        [callId, limit],
      );
      return rows;
    } finally {
      conn.release();
    }
  }

  static async getSummary(accountId: string): Promise<DispatchSummary> {
    const call = await DispatchModel.getOrCreateActiveCall(accountId);
    const [assignment, nearestUnits] = await Promise.all([
      DispatchModel.getAssignment(call.id, accountId),
      DispatchModel.getNearestUnits(call.id),
    ]);

    return {
      call,
      assignment,
      nearestUnits,
      automation: {
        enRouteSpeedMph: EN_ROUTE_SPEED_MPH,
        onSceneDistanceMiles: ON_SCENE_DISTANCE_MILES,
      },
    };
  }
}
