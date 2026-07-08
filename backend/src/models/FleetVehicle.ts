import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface FleetVehicle {
  id: string;
  unitNumber: string;
  license: string;
  year: string;
  make: string;
  model: string;
  districtDepartment: string;
  peNumber: string;
  title: string;
  operatorName: string;
  assignedUserId: string | null;
  assignedUserName: string;
  assignedUserEmail: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FleetVehicleInput = Omit<FleetVehicle, 'id' | 'assignedUserName' | 'assignedUserEmail' | 'createdAt' | 'updatedAt'>;

interface FleetVehicleRow extends RowDataPacket, FleetVehicle {}
interface FleetVehicleCountRow extends RowDataPacket {
  total: number;
}
interface UserMatchRow extends RowDataPacket {
  id: string;
}

const fleetVehicleColumns = `
  fv.\`id\`,
  fv.\`unitNumber\`,
  COALESCE(fv.\`license\`, '') AS \`license\`,
  COALESCE(fv.\`year\`, '') AS \`year\`,
  COALESCE(fv.\`make\`, '') AS \`make\`,
  COALESCE(fv.\`model\`, '') AS \`model\`,
  COALESCE(fv.\`districtDepartment\`, '') AS \`districtDepartment\`,
  COALESCE(fv.\`peNumber\`, '') AS \`peNumber\`,
  COALESCE(fv.\`title\`, '') AS \`title\`,
  COALESCE(fv.\`operatorName\`, '') AS \`operatorName\`,
  fv.\`assignedUserId\`,
  COALESCE(TRIM(CONCAT(COALESCE(u.\`firstName\`, ''), ' ', COALESCE(u.\`lastName\`, ''))), '') AS \`assignedUserName\`,
  COALESCE(u.\`email\`, '') AS \`assignedUserEmail\`,
  fv.\`source\`,
  fv.\`createdAt\`,
  fv.\`updatedAt\`
`;

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function normalizePeNumber(value: unknown): string {
  return normalizeText(value, 50).replace(/^PE\s*/iu, '');
}

export class FleetVehicleModel {
  static async findUserIdByPeNumber(peNumber: string): Promise<string | null> {
    const normalizedPeNumber = normalizePeNumber(peNumber);
    if (!normalizedPeNumber) {
      return null;
    }

    const [rows] = await pool.query<UserMatchRow[]>(
      `SELECT \`id\`
      FROM users
      WHERE LOWER(COALESCE(\`peNumber\`, '')) = LOWER(?)
      LIMIT 1`,
      [normalizedPeNumber],
    );

    return rows[0]?.id || null;
  }

  static async list(filters: { q?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(Number(filters.limit) || 250, 1), 1000);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const where: string[] = [];
    const params: Array<string | number> = [];
    const searchTerm = filters.q?.trim();

    if (searchTerm) {
      const likeTerm = `%${searchTerm.toLowerCase()}%`;
      where.push(`(
        LOWER(fv.\`unitNumber\`) LIKE ?
        OR LOWER(COALESCE(fv.\`license\`, '')) LIKE ?
        OR LOWER(COALESCE(fv.\`make\`, '')) LIKE ?
        OR LOWER(COALESCE(fv.\`model\`, '')) LIKE ?
        OR LOWER(COALESCE(fv.\`districtDepartment\`, '')) LIKE ?
        OR LOWER(COALESCE(fv.\`peNumber\`, '')) LIKE ?
        OR LOWER(COALESCE(fv.\`title\`, '')) LIKE ?
        OR LOWER(COALESCE(fv.\`operatorName\`, '')) LIKE ?
      )`);
      params.push(...Array.from({ length: 8 }, () => likeTerm));
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await pool.query<FleetVehicleCountRow[]>(
      `SELECT COUNT(*) AS total FROM fleet_vehicles fv ${whereSql}`,
      params,
    );
    const [rows] = await pool.query<FleetVehicleRow[]>(
      `SELECT ${fleetVehicleColumns}
      FROM fleet_vehicles fv
      LEFT JOIN users u ON u.\`id\` = fv.\`assignedUserId\`
      ${whereSql}
      ORDER BY fv.\`unitNumber\`
      LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return {
      data: rows,
      total: Number(countRows[0]?.total || 0),
    };
  }

  static async upsertMany(vehicleInputs: FleetVehicleInput[]) {
    let createdCount = 0;
    let updatedCount = 0;
    let matchedCount = 0;

    for (const vehicleInput of vehicleInputs) {
      const vehicle = {
        unitNumber: normalizeText(vehicleInput.unitNumber, 100),
        license: normalizeText(vehicleInput.license, 100),
        year: normalizeText(vehicleInput.year, 10),
        make: normalizeText(vehicleInput.make, 100),
        model: normalizeText(vehicleInput.model, 150),
        districtDepartment: normalizeText(vehicleInput.districtDepartment, 150),
        peNumber: normalizePeNumber(vehicleInput.peNumber),
        title: normalizeText(vehicleInput.title, 150),
        operatorName: normalizeText(vehicleInput.operatorName, 150),
        assignedUserId: vehicleInput.assignedUserId || null,
        source: normalizeText(vehicleInput.source, 50) || 'pdf',
      };

      if (!vehicle.unitNumber) {
        continue;
      }

      if (!vehicle.assignedUserId && vehicle.peNumber) {
        vehicle.assignedUserId = await FleetVehicleModel.findUserIdByPeNumber(vehicle.peNumber);
      }

      if (vehicle.assignedUserId) {
        matchedCount += 1;
      }

      const id = uuidv4();
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO fleet_vehicles (
          \`id\`, \`unitNumber\`, \`license\`, \`year\`, \`make\`, \`model\`, \`districtDepartment\`,
          \`peNumber\`, \`title\`, \`operatorName\`, \`assignedUserId\`, \`source\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`license\` = VALUES(\`license\`),
          \`year\` = VALUES(\`year\`),
          \`make\` = VALUES(\`make\`),
          \`model\` = VALUES(\`model\`),
          \`districtDepartment\` = VALUES(\`districtDepartment\`),
          \`peNumber\` = VALUES(\`peNumber\`),
          \`title\` = VALUES(\`title\`),
          \`operatorName\` = VALUES(\`operatorName\`),
          \`assignedUserId\` = VALUES(\`assignedUserId\`),
          \`source\` = VALUES(\`source\`)`,
        [
          id,
          vehicle.unitNumber,
          vehicle.license,
          vehicle.year,
          vehicle.make,
          vehicle.model,
          vehicle.districtDepartment,
          vehicle.peNumber,
          vehicle.title,
          vehicle.operatorName,
          vehicle.assignedUserId,
          vehicle.source,
        ],
      );

      if (result.affectedRows === 1) {
        createdCount += 1;
      } else {
        updatedCount += 1;
      }
    }

    return { createdCount, updatedCount, matchedCount };
  }
}
