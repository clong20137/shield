import { TrooperDailyReportEntry } from '../services/api';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const PRIMARY = '0.071 0.161 0.302';
const ACCENT = '0.612 0.525 0.361';
const TEXT = '0.125 0.125 0.125';
const MUTED = '0.42 0.42 0.42';
const BORDER = '0.84 0.84 0.84';

const reportSections = [
  {
    title: 'Regular Duty',
    fields: [
      ['regularDutyStartTime', 'Start Time'],
      ['regularDutyEndTime', 'End Time'],
      ['splitStartTime', 'Split Start Time'],
      ['splitEndTime', 'Split End Time'],
      ['secondSplitStartTime', '2nd Split Start Time'],
      ['secondSplitEndTime', '2nd Split End Time'],
      ['thirdSplitStartTime', '3rd Split Start Time'],
      ['thirdSplitEndTime', '3rd Split End Time'],
      ['regularDutyMiles', 'Regular Duty Miles'],
    ],
  },
  {
    title: 'Attendance Hours',
    fields: [
      ['regularDutyHours', 'Regular Duty Hrs'],
      ['regularDaysOff', 'Regular Days Off'],
      ['compHoursUsed', 'Comp Hrs Used'],
      ['personalLeaveHours', 'Personal Leave Hrs'],
      ['vacationHours', 'Vacation Hrs'],
      ['holidayHours', 'Holiday Hrs'],
      ['compOtHoursEarned', 'Comp/OT Hrs Earned'],
      ['injuryIllnessHours', 'Injury/Illness Hrs'],
    ],
  },
  {
    title: 'Duty Hours',
    fields: [
      ['patrolHours', 'Patrol Hrs'],
      ['crashInvestHours', 'Crash Invest. Hrs'],
      ['trafficCourtHours', 'Traffic Court Hrs'],
      ['incidentReportHours', 'Incident Report Hrs'],
      ['criminalInvestHours', 'Criminal Invest. Hrs'],
      ['criminalCourtHours', 'Criminal Court Hrs'],
      ['mealBreakHours', 'Meal Break Hrs'],
    ],
  },
  {
    title: 'Traffic Activity',
    fields: [
      ['policeServices', 'Police Services'],
      ['suspensions', 'Suspensions'],
      ['crashesInvestigated', 'Crashes Investigated'],
      ['crashCitations', 'Crash Citations'],
      ['seatBeltCitations', 'Seat Belt Citations'],
      ['childRestraintCitations', 'Child Restraint Citations'],
      ['under10kTruckCitations', 'Under 10K Truck Citations'],
    ],
  },
  {
    title: 'OWI Offense Activity',
    fields: [
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
    ],
  },
  {
    title: '10K Truck Activity',
    fields: [
      ['movingCitations', 'Moving Citations'],
      ['nonMovingCitations', 'Non Moving Citations'],
      ['warnings', 'Warnings'],
      ['trucksInspected', 'Trucks Inspected'],
      ['outOfServices', 'Out of Services'],
      ['mcsapViolations', 'MCSAP Violations'],
    ],
  },
  {
    title: 'Level 1-3 Regular Duty Inspections',
    fields: [
      ['trucksMeasured', 'Trucks Measured'],
      ['inspectionOutOfServices', 'Out of Services'],
      ['owGrossCitations', 'OW Gross Citations'],
      ['owAxleCitations', 'OW Axle Citations'],
      ['owBridgeCitations', 'OW Bridge Citations'],
      ['portWeighed', 'Port Weighed'],
      ['owLoadAdjustments', 'OW Load Adjustments'],
      ['owVehicleOffLoaded', 'OW Vehicle Off Loaded'],
    ],
  },
  {
    title: 'Criminal Activity',
    fields: [
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
    ],
  },
  {
    title: 'Drug Activity',
    fields: [
      ['heroinArrests', 'Heroin Arrests'],
      ['heroinDefendants', 'Heroin Defendants'],
      ['cocaineArrests', 'Cocaine Arrests'],
      ['cocaineDefendants', 'Cocaine Defendants'],
      ['marijuanaArrests', 'Marijuana Arrests'],
      ['marijuanaDefendants', 'Marijuana Defendants'],
      ['totalPlantsSeized', 'Total Plants Seized'],
      ['totalWeightSeizedGrams', 'Total Weight Seized(in Grams)'],
      ['methamphetamineArrests', 'Methamphetamine Arrests'],
      ['methamphetamineDefendants', 'Methamphetamine Defendants'],
      ['prescriptionArrests', 'Prescription Arrests'],
      ['prescriptionDefendants', 'Prescription Defendants'],
      ['otherDrugArrests', 'Other Drug Arrests'],
      ['otherDrugDefendants', 'Other Drug Defendants'],
      ['totalDrugArrests', 'Total Drug Arrests'],
      ['totalDrugDefendants', 'Total Drug Defendants'],
    ],
  },
] as const;

interface PdfPage {
  commands: string[];
  pageNumber: number;
}

function cleanFilePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'trooper-dailies';
}

function userName(entry: TrooperDailyReportEntry) {
  return `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email || 'Unknown';
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/gu, ' ');
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function getDetailKeys(entries: TrooperDailyReportEntry[]) {
  const orderedKeys = reportSections.flatMap((section) => section.fields.map(([key]) => key as string));
  const extraKeys = entries
    .flatMap((entry) => Object.keys(entry.details || {}))
    .filter((key) => key !== 'narrative' && !orderedKeys.includes(key))
    .sort();

  return [...orderedKeys, ...extraKeys];
}

function getExportRows(entries: TrooperDailyReportEntry[]) {
  const detailKeys = getDetailKeys(entries);
  const fieldLabels = new Map<string, string>(
    reportSections.flatMap((section) => section.fields.map(([key, label]) => [key as string, label as string])),
  );
  const headers = [
    'Date',
    'User',
    'Email',
    'Rank',
    'PE Number',
    'Badge',
    'Home District',
    'District Worked',
    'Duty Hours',
    'Special Status',
    'Review Status',
    'Review Notes',
    'Reviewed By',
    'Reviewed At',
    'Narrative',
    ...detailKeys.map((key) => fieldLabels.get(key) || key),
  ];
  const rows = entries.map((entry) => [
    entry.date,
    userName(entry),
    entry.user.email || '',
    entry.user.rank || '',
    entry.user.peNumber || '',
    entry.user.badgeNumber || '',
    entry.user.district || '',
    entry.districtWorked,
    entry.dutyHours,
    entry.specialStatus,
    entry.reviewStatus || 'Pending',
    entry.reviewNotes || '',
    entry.reviewedByName || '',
    entry.reviewedAt ? new Date(entry.reviewedAt).toLocaleString() : '',
    entry.details?.narrative || '',
    ...detailKeys.map((key) => entry.details?.[key] || ''),
  ]);

  return { headers, rows };
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
    .replace(/\r?\n/gu, ' ');
}

function textLine(x: number, y: number, text: string, size = 9, font = 'F1', color = TEXT) {
  return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function line(x1: number, y1: number, x2: number, y2: number, color = BORDER, width = 0.5) {
  return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function rect(x: number, y: number, width: number, height: number, strokeColor = BORDER, fillColor?: string) {
  const fill = fillColor ? `${fillColor} rg ${x} ${y} ${width} ${height} re f` : '';
  return `${fill} ${strokeColor} RG 0.6 w ${x} ${y} ${width} ${height} re S`;
}

function wrapText(value: unknown, maxChars: number) {
  const words = String(value || 'Not recorded').replace(/\s+/gu, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  });

  if (line) lines.push(line);
  return lines.length ? lines : ['Not recorded'];
}

function newPage(pageNumber: number): PdfPage {
  return { commands: [], pageNumber };
}

function addHeader(page: PdfPage, title: string, subtitle: string) {
  page.commands.push(`${PRIMARY} rg 0 ${PAGE_HEIGHT - 82} ${PAGE_WIDTH} 82 re f`);
  page.commands.push(`${ACCENT} rg 0 ${PAGE_HEIGHT - 82} 8 82 re f`);
  page.commands.push(textLine(MARGIN, PAGE_HEIGHT - 38, 'SHIELD', 10, 'F2', '1 1 1'));
  page.commands.push(textLine(MARGIN, PAGE_HEIGHT - 60, title, 18, 'F2', '1 1 1'));
  page.commands.push(textLine(MARGIN, PAGE_HEIGHT - 74, subtitle, 8, 'F1', '0.86 0.9 0.95'));
}

function addFooter(page: PdfPage, totalPages: number) {
  page.commands.push(line(MARGIN, 34, PAGE_WIDTH - MARGIN, 34));
  page.commands.push(textLine(MARGIN, 20, 'Generated by SHIELD', 8, 'F1', MUTED));
  page.commands.push(textLine(PAGE_WIDTH - MARGIN - 56, 20, `Page ${page.pageNumber} of ${totalPages}`, 8, 'F1', MUTED));
}

function buildPdf(pages: PdfPage[]) {
  pages.forEach((page) => addFooter(page, pages.length));

  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageObjectIds: number[] = [];

  pages.forEach((page) => {
    const stream = page.commands.filter(Boolean).join('\n');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageObjectIds.push(pageId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function addField(page: PdfPage, x: number, y: number, width: number, label: string, value: unknown) {
  page.commands.push(rect(x, y - 34, width, 34, BORDER, '0.98 0.98 0.98'));
  page.commands.push(textLine(x + 7, y - 13, label.toUpperCase(), 6.5, 'F2', MUTED));
  page.commands.push(textLine(x + 7, y - 27, String(value || 'Not recorded').slice(0, 36), 8.5, 'F1', TEXT));
}

function addReportSection(page: PdfPage, entry: TrooperDailyReportEntry, y: number, section: typeof reportSections[number]) {
  const x = MARGIN;
  const width = PAGE_WIDTH - MARGIN * 2;
  const colWidth = (width - 18) / 3;
  const rows = Math.ceil(section.fields.length / 3);
  const height = 24 + rows * 24 + 10;
  page.commands.push(rect(x, y - height, width, height));
  page.commands.push(`${PRIMARY} rg ${x} ${y - 20} ${width} 20 re f`);
  page.commands.push(textLine(x + 9, y - 14, section.title, 8.5, 'F2', '1 1 1'));

  section.fields.forEach(([key, label], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const fieldX = x + 9 + col * (colWidth + 6);
    const fieldY = y - 36 - row * 24;
    page.commands.push(textLine(fieldX, fieldY, `${label}:`, 7, 'F2', MUTED));
    page.commands.push(textLine(fieldX, fieldY - 11, String(entry.details?.[key] || '0').slice(0, 24), 8, 'F1', TEXT));
  });

  return y - height - 12;
}

function buildDetailedReportPages(entry: TrooperDailyReportEntry, startPage: number, totalReports: number) {
  const pages = [newPage(startPage)];
  let page = pages[0];
  const subtitle = `${userName(entry)} | ${entry.date} | Report ${totalReports > 1 ? `${startPage} of ${totalReports}` : 'detail'}`;
  addHeader(page, 'Trooper Daily Report', subtitle);
  let y = PAGE_HEIGHT - 112;
  const fieldWidth = (PAGE_WIDTH - MARGIN * 2 - 18) / 3;

  [
    ['Employee', userName(entry)],
    ['Email', entry.user.email],
    ['Rank', entry.user.rank],
    ['PE Number', entry.user.peNumber],
    ['Badge', entry.user.badgeNumber],
    ['Home District', entry.user.district],
    ['Date', entry.date],
    ['District Worked', entry.districtWorked],
    ['Duty Hours', entry.dutyHours],
    ['Special Status', entry.specialStatus || 'None'],
    ['Review Status', entry.reviewStatus || 'Pending'],
    ['Reviewed By', entry.reviewedByName || 'Not reviewed'],
    ['Reviewed At', entry.reviewedAt ? new Date(entry.reviewedAt).toLocaleString() : 'Not reviewed'],
    ['Submitted', new Date(entry.createdAt).toLocaleString()],
    ['Updated', new Date(entry.updatedAt).toLocaleString()],
  ].forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    addField(page, MARGIN + col * (fieldWidth + 9), y - row * 42, fieldWidth, label, value);
  });
  y -= 182;

  const reviewLines = wrapText(entry.reviewNotes || 'No review notes entered.', 96);
  const reviewHeight = Math.max(54, 32 + reviewLines.length * 12);
  if (y - reviewHeight < 72) {
    page = newPage(startPage + pages.length);
    pages.push(page);
    addHeader(page, 'Trooper Daily Report', subtitle);
    y = PAGE_HEIGHT - 112;
  }
  page.commands.push(rect(MARGIN, y - reviewHeight, PAGE_WIDTH - MARGIN * 2, reviewHeight));
  page.commands.push(`${ACCENT} rg ${MARGIN} ${y - 20} ${PAGE_WIDTH - MARGIN * 2} 20 re f`);
  page.commands.push(textLine(MARGIN + 9, y - 14, 'Supervisor Review', 8.5, 'F2', '1 1 1'));
  reviewLines.forEach((lineText, index) => {
    page.commands.push(textLine(MARGIN + 9, y - 39 - index * 12, lineText, 8.5, 'F1', TEXT));
  });
  y -= reviewHeight + 12;

  reportSections.forEach((section) => {
    const neededRows = Math.ceil(section.fields.length / 3);
    const neededHeight = 24 + neededRows * 24 + 22;
    if (y - neededHeight < 72) {
      page = newPage(startPage + pages.length);
      pages.push(page);
      addHeader(page, 'Trooper Daily Report', subtitle);
      y = PAGE_HEIGHT - 112;
    }
    y = addReportSection(page, entry, y, section);
  });

  const narrativeLines = wrapText(entry.details?.narrative || 'No narrative entered.', 96);
  const narrativeHeight = Math.max(58, 32 + narrativeLines.length * 12);
  if (y - narrativeHeight < 72) {
    page = newPage(startPage + pages.length);
    pages.push(page);
    addHeader(page, 'Trooper Daily Report', subtitle);
    y = PAGE_HEIGHT - 112;
  }
  page.commands.push(rect(MARGIN, y - narrativeHeight, PAGE_WIDTH - MARGIN * 2, narrativeHeight));
  page.commands.push(`${ACCENT} rg ${MARGIN} ${y - 20} ${PAGE_WIDTH - MARGIN * 2} 20 re f`);
  page.commands.push(textLine(MARGIN + 9, y - 14, 'Narrative', 8.5, 'F2', '1 1 1'));
  narrativeLines.forEach((lineText, index) => {
    page.commands.push(textLine(MARGIN + 9, y - 39 - index * 12, lineText, 8.5, 'F1', TEXT));
  });

  return pages;
}

export function downloadTrooperDailiesCsv(entries: TrooperDailyReportEntry[], label = 'trooper-dailies') {
  const { headers, rows } = getExportRows(entries);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  downloadBlob(csv, 'text/csv;charset=utf-8', `${cleanFilePart(label)}.csv`);
}

export function downloadTrooperDailiesXls(entries: TrooperDailyReportEntry[], label = 'trooper-dailies') {
  const { headers, rows } = getExportRows(entries);
  const title = cleanFilePart(label);
  const tableRows = [headers, ...rows]
    .map((row, rowIndex) => (
      `<tr>${row.map((cell) => {
        const tag = rowIndex === 0 ? 'th' : 'td';
        return `<${tag}>${escapeHtml(cell)}</${tag}>`;
      }).join('')}</tr>`
    ))
    .join('');
  const workbook = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; }
    h1 { color: #12294d; font-size: 18px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #12294d; color: #fff; font-weight: 700; }
    th, td { border: 1px solid #d6d6d6; padding: 6px 8px; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f7f7f7; }
  </style>
</head>
<body>
  <h1>SHIELD Trooper Daily Reports</h1>
  <table>${tableRows}</table>
</body>
</html>`;
  downloadBlob(workbook, 'application/vnd.ms-excel;charset=utf-8', `${title}.xls`);
}

export function downloadTrooperDailiesPdf(entries: TrooperDailyReportEntry[], label = 'trooper-dailies') {
  let pages = entries.length > 0
    ? entries.flatMap((entry, index) => buildDetailedReportPages(entry, index + 1, entries.length))
    : [newPage(1)];

  if (entries.length === 0) {
    const page = pages[0];
    addHeader(page, 'Trooper Daily Reports', 'No matching records');
    page.commands.push(textLine(MARGIN, PAGE_HEIGHT - 132, 'No Trooper Daily reports matched the selected filters.', 11, 'F1'));
  }

  pages = pages.map((page, index) => ({ ...page, pageNumber: index + 1 }));

  downloadBlob(buildPdf(pages), 'application/pdf', `${cleanFilePart(label)}.pdf`);
}
