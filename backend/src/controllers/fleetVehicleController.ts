import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { FleetVehicleInput, FleetVehicleModel } from '../models/FleetVehicle';
import { UserModel } from '../models/User';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { AuditLogModel } from '../models/AuditLog';

type ParsedFleetVehicleRow = Omit<FleetVehicleInput, 'assignedUserId' | 'source'>;
type FleetVehicleImportRow = Record<string, unknown>;
type WorksheetCellValue = string | number | boolean | Date | null | undefined;

function cleanCell(value: unknown, maxLength = 150): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function normalizeLooseKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function getRowValue(row: FleetVehicleImportRow, aliases: string[], maxLength = 150): string {
  const normalizedAliases = new Set(aliases.map(normalizeLooseKey));
  const matchingKey = Object.keys(row).find((key) => normalizedAliases.has(normalizeLooseKey(key)));
  return cleanCell(matchingKey ? row[matchingKey] : '', maxLength);
}

function buildRowsFromWorksheet(worksheet: XLSX.WorkSheet): { rows: FleetVehicleImportRow[]; headerRowIndex: number } {
  const sheetRows = XLSX.utils.sheet_to_json<WorksheetCellValue[]>(worksheet, {
    blankrows: false,
    defval: '',
    header: 1,
    raw: false,
  });
  const headerRowIndex = sheetRows.findIndex((row, index) => {
    if (index > 20) {
      return false;
    }

    const normalizedHeaders = new Set(row.map(normalizeLooseKey));
    return normalizedHeaders.has('unitno') && normalizedHeaders.has('license');
  });
  const safeHeaderRowIndex = headerRowIndex >= 0 ? headerRowIndex : 0;
  const headers = sheetRows[safeHeaderRowIndex].map((header, index) => cleanCell(header, 100) || `Column ${index + 1}`);
  const dataRows = sheetRows.slice(safeHeaderRowIndex + 1);

  return {
    headerRowIndex: safeHeaderRowIndex,
    rows: dataRows.map((row) => headers.reduce<FleetVehicleImportRow>((record, header, index) => {
      record[header] = row[index] ?? '';
      return record;
    }, {})).filter((row) => Object.values(row).some((value) => cleanCell(value))),
  };
}

function parseFleetVehicleWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { parsedRows: [], skippedRows: [{ lineNumber: 1, reason: 'Workbook does not contain a worksheet', text: '' }], rawRowCount: 0 };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const { rows, headerRowIndex } = buildRowsFromWorksheet(worksheet);
  const parsedRows: ParsedFleetVehicleRow[] = [];
  const skippedRows: Array<{ lineNumber: number; reason: string; text: string }> = [];

  rows.forEach((row, index) => {
    const parsedRow = {
      unitNumber: getRowValue(row, ['UNIT NO', 'Unit No', 'Unit Number', 'Unit'], 100),
      license: getRowValue(row, ['License', 'License Plate', 'Plate'], 100),
      year: getRowValue(row, ['Year'], 10),
      make: getRowValue(row, ['Make'], 100),
      model: getRowValue(row, ['Model'], 150),
      districtDepartment: getRowValue(row, ['Dist / Dept', 'Dist Dept', 'District Department', 'District/Department'], 150),
      peNumber: getRowValue(row, ['PE #', 'PE Number', 'PE'], 50).replace(/^PE\s*/iu, ''),
      title: getRowValue(row, ['Title'], 150),
      operatorName: getRowValue(row, ['Operator Name', 'Operator'], 150),
    };

    if (parsedRow.unitNumber) {
      parsedRows.push(parsedRow);
    } else {
      skippedRows.push({
        lineNumber: headerRowIndex + index + 2,
        reason: 'Missing UNIT NO',
        text: Object.values(row).map((value) => cleanCell(value, 40)).filter(Boolean).join(' | ').slice(0, 240),
      });
    }
  });

  return { parsedRows, skippedRows: skippedRows.slice(0, 50), rawRowCount: rows.length };
}

export class FleetVehicleController {
  static async lookupOperatorsByPe(req: Request, res: Response) {
    try {
      const rawPeNumbers: unknown[] = Array.isArray(req.body?.peNumbers) ? req.body.peNumbers : [];
      const peNumbers = Array.from(
        new Set(
          rawPeNumbers
            .map((value: unknown) => cleanCell(value, 50).replace(/^PE\s*/iu, ''))
            .filter((value): value is string => Boolean(value))
            .slice(0, 500),
        ),
      );
      const operators: Array<{ id: string; displayName: string; email: string; peNumber: string }> = [];

      for (const peNumber of peNumbers) {
        const user = await UserModel.getUserByPeNumber(peNumber);
        if (user?.id) {
          operators.push({
            id: user.id,
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            email: user.email,
            peNumber: user.peNumber,
          });
        }
      }

      return res.json({ operators });
    } catch (error) {
      console.error('Fleet operator PE lookup error:', error);
      return res.status(500).json({ error: 'Failed to look up Fleet operators' });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const { q, page, pageSize } = req.query;
      const limit = Math.min(Math.max(Number(pageSize) || 250, 1), 1000);
      const pageNumber = Math.max(Number(page) || 1, 1);
      const result = await FleetVehicleModel.list({
        q: typeof q === 'string' ? q : '',
        limit,
        offset: (pageNumber - 1) * limit,
      });

      res.json({ ...result, page: pageNumber, pageSize: limit });
    } catch (error) {
      console.error('Fleet vehicle list error:', error);
      res.status(500).json({ error: 'Failed to load fleet vehicles' });
    }
  }

  static async importSpreadsheet(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Upload a vehicle inventory XLSX file' });
      }

      const account = await getSessionAccount(req);
      const { parsedRows, skippedRows, rawRowCount } = parseFleetVehicleWorkbook(req.file.buffer);
      const importRows: FleetVehicleInput[] = parsedRows.map((row) => ({
        ...row,
        assignedUserId: null,
        source: 'xlsx',
      }));
      const result = await FleetVehicleModel.upsertMany(importRows);

      await AuditLogModel.create({
        actorId: account?.id || null,
        actorName: account?.displayName || account?.email || 'System',
        action: 'fleet.vehicles_imported',
        entityType: 'fleet_vehicle',
        entityId: 'bulk-import',
        details: JSON.stringify({
          fileName: req.file.originalname,
          totalRows: parsedRows.length,
          rawRowCount,
          skippedRows: skippedRows.length,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          matchedCount: result.matchedCount,
        }),
      });

      broadcastAppEvent({ type: 'fleet-vehicles-updated' });
      return res.json({
        totalRows: parsedRows.length,
        rawLineCount: rawRowCount,
        rawRowCount,
        skippedRows,
        ...result,
      });
    } catch (error) {
      console.error('Fleet vehicle XLSX import error:', error);
      return res.status(500).json({ error: 'Failed to import fleet vehicle XLSX' });
    }
  }
}
