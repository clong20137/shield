import { Request, Response } from 'express';
import { PDFParse } from 'pdf-parse';
import { FleetVehicleInput, FleetVehicleModel } from '../models/FleetVehicle';
import { broadcastAppEvent } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';
import { AuditLogModel } from '../models/AuditLog';

type ParsedFleetVehicleRow = Omit<FleetVehicleInput, 'assignedUserId' | 'source'>;

const titleWords = new Set([
  'CAPT',
  'CAPTAIN',
  'CPL',
  'CORPORAL',
  'DET',
  'DETECTIVE',
  'LT',
  'LIEUTENANT',
  'MAJ',
  'MAJOR',
  'OFFICER',
  'SGT',
  'SERGEANT',
  'TFC',
  'TROOPER',
]);

function cleanCell(value: unknown, maxLength = 150): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function normalizeLine(line: string): string {
  return cleanCell(line.replace(/\t/gu, ' '), 500);
}

function isHeaderOrFooterLine(line: string): boolean {
  const normalized = line.toLowerCase();
  return (
    !line ||
    normalized.includes('unit number') ||
    normalized.includes('operator name') ||
    /^page\s+\d+/iu.test(line) ||
    /^generated\b/iu.test(line)
  );
}

function getTitleStartIndex(tokens: string[], peIndex: number): number {
  const fallbackIndex = Math.max(peIndex + 1, tokens.length - 3);
  for (let index = peIndex + 1; index < tokens.length; index += 1) {
    if (titleWords.has(tokens[index].replace(/[^a-z]/giu, '').toUpperCase())) {
      return index;
    }
  }

  return fallbackIndex;
}

function splitModelAndDepartment(tokens: string[], peIndex: number): { model: string; districtDepartment: string } {
  const betweenMakeAndPe = tokens.slice(4, peIndex);
  if (betweenMakeAndPe.length <= 1) {
    return { model: betweenMakeAndPe.join(' '), districtDepartment: '' };
  }

  const departmentIndex = betweenMakeAndPe.findIndex((token, index) => (
    index > 0 &&
    (
      /^D(?:IST)?\d+/iu.test(token) ||
      /^DEPT$/iu.test(token) ||
      /^\d{2,3}$/u.test(token) ||
      /^[A-Z]{2,6}$/u.test(token)
    )
  ));

  if (departmentIndex > 0) {
    return {
      model: betweenMakeAndPe.slice(0, departmentIndex).join(' '),
      districtDepartment: betweenMakeAndPe.slice(departmentIndex).join(' '),
    };
  }

  return {
    model: betweenMakeAndPe.slice(0, -1).join(' '),
    districtDepartment: betweenMakeAndPe.slice(-1).join(' '),
  };
}

function parseFleetVehicleLine(line: string): ParsedFleetVehicleRow | null {
  const normalizedLine = normalizeLine(line);
  if (isHeaderOrFooterLine(normalizedLine)) {
    return null;
  }

  const tokens = normalizedLine.split(/\s+/u).filter(Boolean);
  const yearIndex = tokens.findIndex((token, index) => index >= 2 && /^(?:19|20)\d{2}$/u.test(token));
  if (tokens.length < 8 || yearIndex < 2 || yearIndex > 3) {
    return null;
  }

  const peIndex = tokens.findIndex((token, index) => index > yearIndex + 2 && /^(?:PE)?\d{3,8}$/iu.test(token));
  if (peIndex < 0) {
    return null;
  }

  const titleStartIndex = getTitleStartIndex(tokens, peIndex);
  const titleTokens = tokens.slice(peIndex + 1, titleStartIndex);
  const operatorTokens = tokens.slice(titleStartIndex);
  const { model, districtDepartment } = splitModelAndDepartment(tokens, peIndex);

  return {
    unitNumber: cleanCell(tokens.slice(0, yearIndex - 1).join(' '), 100),
    license: cleanCell(tokens[yearIndex - 1], 100),
    year: cleanCell(tokens[yearIndex], 10),
    make: cleanCell(tokens[yearIndex + 1], 100),
    model: cleanCell(model, 150),
    districtDepartment: cleanCell(districtDepartment, 150),
    peNumber: cleanCell(tokens[peIndex].replace(/^PE/iu, ''), 50),
    title: cleanCell(titleTokens.join(' '), 150),
    operatorName: cleanCell(operatorTokens.join(' '), 150),
  };
}

function parseFleetVehicleText(text: string) {
  const normalizedText = text
    .replace(/\r/gu, '\n')
    .replace(/\u00a0/gu, ' ')
    .replace(/[ ]{2,}/gu, ' ');
  const rawLines = normalizedText.split(/\n+/u).map(normalizeLine).filter(Boolean);
  const parsedRows: ParsedFleetVehicleRow[] = [];
  const skippedRows: Array<{ lineNumber: number; reason: string; text: string }> = [];

  rawLines.forEach((line, index) => {
    if (isHeaderOrFooterLine(line)) {
      return;
    }

    const parsedRow = parseFleetVehicleLine(line);
    if (parsedRow?.unitNumber && parsedRow.license && parsedRow.year) {
      parsedRows.push(parsedRow);
    } else if (/(?:19|20)\d{2}/u.test(line)) {
      skippedRows.push({
        lineNumber: index + 1,
        reason: 'Could not map the PDF text into vehicle columns',
        text: line.slice(0, 240),
      });
    }
  });

  return { parsedRows, skippedRows: skippedRows.slice(0, 50), rawLineCount: rawLines.length };
}

export class FleetVehicleController {
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

  static async importPdf(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Upload a vehicle inventory PDF' });
      }

      const account = await getSessionAccount(req);
      const parser = new PDFParse({ data: req.file.buffer });
      const pdfData = await parser.getText();
      await parser.destroy();
      const { parsedRows, skippedRows, rawLineCount } = parseFleetVehicleText(pdfData.text || '');
      const importRows: FleetVehicleInput[] = parsedRows.map((row) => ({
        ...row,
        assignedUserId: null,
        source: 'pdf',
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
          skippedRows: skippedRows.length,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          matchedCount: result.matchedCount,
        }),
      });

      broadcastAppEvent({ type: 'fleet-vehicles-updated' });
      return res.json({
        totalRows: parsedRows.length,
        rawLineCount,
        skippedRows,
        ...result,
      });
    } catch (error) {
      console.error('Fleet vehicle PDF import error:', error);
      return res.status(500).json({ error: 'Failed to import fleet vehicle PDF' });
    }
  }
}
