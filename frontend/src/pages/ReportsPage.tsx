import React, { useEffect, useRef, useState } from 'react';
import { BarChart3, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Search, Table, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AuthAccount, reportService, TrooperDailyReportEntry, TrooperDailyAnalyticsResponse, User, userService } from '../services/api';
import { districtOptions } from '../constants/districts';
import PerformanceEvaluationsPage from './PerformanceEvaluationsPage';
import { downloadTrooperDailiesCsv, downloadTrooperDailiesPdf, downloadTrooperDailiesXls } from '../utils/trooperDailyExport';

const trooperDailySections = [
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
      ['heroinGramsFound', 'Heroin Found (grams)'],
      ['heroinDefendants', 'Heroin Defendants'],
      ['cocaineArrests', 'Cocaine Arrests'],
      ['cocaineGramsFound', 'Cocaine Found (grams)'],
      ['cocaineDefendants', 'Cocaine Defendants'],
      ['marijuanaArrests', 'Marijuana Arrests'],
      ['marijuanaGramsFound', 'Marijuana Found (grams)'],
      ['marijuanaDefendants', 'Marijuana Defendants'],
      ['totalPlantsSeized', 'Total Plants Seized'],
      ['totalWeightSeizedGrams', 'Total Weight Seized(in Grams)'],
      ['methamphetamineArrests', 'Methamphetamine Arrests'],
      ['methamphetamineGramsFound', 'Methamphetamine Found (grams)'],
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

type DailyExportFormat = 'csv' | 'pdf' | 'xls';
type DailyAnalyticsExportFormat = 'csv' | 'pdf' | 'png';
type DailyAnalyticsRange = '1d' | '7d' | '1m' | '3m' | '6m' | '1y' | 'custom';
type DailyGraphType = 'line' | 'bar';
type DailyCompareMode = 'none' | 'user' | 'district';
type TrooperDailyTab = 'graph' | 'table' | 'exports';
type DailyCompareItem = {
  id: string;
  type: 'user' | 'district';
  label: string;
  query?: string;
  district?: string;
  color: string;
  analytics?: TrooperDailyAnalyticsResponse;
  loading?: boolean;
  error?: string | null;
};

const dailyAnalyticsRanges: Array<{ value: DailyAnalyticsRange; label: string }> = [
  { value: '1d', label: '1 Day' },
  { value: '7d', label: '7 Days' },
  { value: '1m', label: '1 Month' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' },
];

const dailyGraphTypes: Array<{ value: DailyGraphType; label: string }> = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
];

const compareSeriesColors = [
  'rgb(37 99 235)',
  'rgb(220 38 38)',
  'rgb(22 163 74)',
  'rgb(147 51 234)',
  'rgb(234 88 12)',
  'rgb(8 145 178)',
];

const LIVE_REPORT_REFRESH_MS = 15_000;

const trooperDailyTabs: Array<{ value: TrooperDailyTab; label: string }> = [
  { value: 'graph', label: 'Graph' },
  { value: 'table', label: 'Table' },
  { value: 'exports', label: 'Exports' },
];

const trooperDailyFieldSections = new Map<string, string>(
  trooperDailySections.flatMap((section) => section.fields.map(([key]) => [key, section.title] as const)),
);

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
  ) {
    return (error as { response: { data: { error: string } } }).response.data.error;
  }

  return fallback;
}

function formatMetric(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function formatAnalyticsLabel(label: string): string {
  if (/^\d{4}-\d{2}$/u.test(label)) {
    const date = new Date(`${label}-01T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  return label;
}

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRangeDates(range: DailyAnalyticsRange) {
  const to = new Date();
  const from = new Date(to);

  if (range === '1d') {
    from.setDate(to.getDate());
  } else if (range === '7d') {
    from.setDate(to.getDate() - 6);
  } else if (range === '1m') {
    from.setMonth(to.getMonth() - 1);
  } else if (range === '3m') {
    from.setMonth(to.getMonth() - 3);
  } else if (range === '6m') {
    from.setMonth(to.getMonth() - 6);
  } else if (range === '1y') {
    from.setFullYear(to.getFullYear() - 1);
  }

  return { from: formatDateInput(from), to: formatDateInput(to) };
}

function formatUserOption(user: User): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.id;
}

function cleanReportFilePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'trooper-daily-analytics';
}

function downloadReportBlob(content: BlobPart, type: string, filename: string) {
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

function escapeReportCsv(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/gu, ' ');
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function escapeReportPdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
    .replace(/\r?\n/gu, ' ');
}

function buildSimpleAnalyticsPdf(title: string, subtitle: string, headers: string[], rows: string[][]) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const rowHeight = 18;
  const colWidth = (pageWidth - margin * 2) / headers.length;
  const objects: string[] = [];
  const pages: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };
  const text = (x: number, y: number, value: unknown, size = 9, font = 'F1') =>
    `BT /${font} ${size} Tf 0.12 0.12 0.12 rg ${x} ${y} Td (${escapeReportPdfText(value)}) Tj ET`;
  const line = (x1: number, y1: number, x2: number, y2: number) => `0.78 0.78 0.78 RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`;
  const rect = (x: number, y: number, width: number, height: number, fill = '0.98 0.98 0.98') => `${fill} rg ${x} ${y} ${width} ${height} re f 0.78 0.78 0.78 RG 0.5 w ${x} ${y} ${width} ${height} re S`;

  const makePage = (pageRows: string[][], pageIndex: number, totalPages: number) => {
    const commands: string[] = [
      `0.071 0.161 0.302 rg 0 ${pageHeight - 82} ${pageWidth} 82 re f`,
      `0.612 0.525 0.361 rg 0 ${pageHeight - 82} 8 82 re f`,
      text(margin, pageHeight - 42, title, 18, 'F2').replace('0.12 0.12 0.12 rg', '1 1 1 rg'),
      text(margin, pageHeight - 62, subtitle, 9, 'F1').replace('0.12 0.12 0.12 rg', '0.86 0.9 0.95 rg'),
    ];
    let y = pageHeight - 122;

    headers.forEach((header, index) => {
      const x = margin + index * colWidth;
      commands.push(rect(x, y - rowHeight, colWidth, rowHeight, '0.071 0.161 0.302'));
      commands.push(text(x + 5, y - 12, header.slice(0, 18), 7.5, 'F2').replace('0.12 0.12 0.12 rg', '1 1 1 rg'));
    });
    y -= rowHeight;

    pageRows.forEach((row) => {
      row.forEach((cell, index) => {
        const x = margin + index * colWidth;
        commands.push(rect(x, y - rowHeight, colWidth, rowHeight, '1 1 1'));
        commands.push(text(x + 5, y - 12, String(cell).slice(0, 18), 7.5));
      });
      y -= rowHeight;
    });

    commands.push(line(margin, 34, pageWidth - margin, 34));
    commands.push(text(margin, 20, 'Generated by Shield', 8));
    commands.push(text(pageWidth - margin - 62, 20, `Page ${pageIndex} of ${totalPages}`, 8));
    return commands.join('\n');
  };

  const rowsPerPage = 30;
  const pageRows = rows.length > 0 ? rows : [['No data']];
  const chunks: string[][][] = [];
  for (let index = 0; index < pageRows.length; index += rowsPerPage) {
    chunks.push(pageRows.slice(index, index + rowsPerPage));
  }

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  chunks.forEach((chunk, index) => {
    const stream = makePage(chunk, index + 1, chunks.length);
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pages.push(`${pageId} 0 R`);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pages.join(' ')}] /Count ${pages.length} >>`;
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

const AnalyticsChart: React.FC<{
  series: Array<{ name: string; points: Array<{ label: string; value: number }>; color: string }>;
  graphType: DailyGraphType;
  height?: number;
  valueLabel?: string;
}> = ({ series, graphType, height = 172, valueLabel = '' }) => {
  const allPoints = series.flatMap((item) => item.points);

  if (allPoints.length === 0) {
    return <p className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No chart data yet.</p>;
  }

  const labels = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.label))));
  const data = labels.map((label) => {
    const row: Record<string, string | number> = {
      label,
      displayLabel: formatAnalyticsLabel(label),
    };
    series.forEach((item, index) => {
      row[`series-${index}`] = Number(item.points.find((point) => point.label === label)?.value) || 0;
    });
    return row;
  });
  const tooltipStyle = {
    border: '1px solid rgb(229 231 235)',
    borderRadius: 8,
    boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
    fontSize: 12,
  };

  return (
    <div className="h-full min-h-[320px] w-full">
      <ResponsiveContainer width="100%" height={height}>
        {graphType === 'bar' ? (
          <BarChart data={data} margin={{ top: 16, right: 22, bottom: 18, left: 8 }} barGap={8} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="displayLabel" tick={{ fontSize: 12, fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={{ fontSize: 12, fontWeight: 700 }} tickLine={false} axisLine={false} width={58} tickFormatter={(value) => formatMetric(Number(value), 1)} />
            <Tooltip
              cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }}
              contentStyle={tooltipStyle}
              labelStyle={{ fontWeight: 900, color: 'rgb(17 24 39)' }}
              formatter={(value, name) => [`${formatMetric(Number(value), 1)}${valueLabel}`, name]}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800, paddingTop: 8 }} />}
            {series.map((item, index) => (
              <Bar key={item.name} dataKey={`series-${index}`} name={item.name} fill={item.color} radius={[5, 5, 0, 0]} maxBarSize={42} />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 16, right: 22, bottom: 18, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="displayLabel" tick={{ fontSize: 12, fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={18} />
            <YAxis tick={{ fontSize: 12, fontWeight: 700 }} tickLine={false} axisLine={false} width={58} tickFormatter={(value) => formatMetric(Number(value), 1)} />
            <Tooltip
              cursor={{ stroke: 'rgba(37, 99, 235, 0.32)', strokeWidth: 2, strokeDasharray: '5 5' }}
              contentStyle={tooltipStyle}
              labelStyle={{ fontWeight: 900, color: 'rgb(17 24 39)' }}
              formatter={(value, name) => [`${formatMetric(Number(value), 1)}${valueLabel}`, name]}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800, paddingTop: 8 }} />}
            {series.map((item, index) => (
              <Line
                key={item.name}
                type="monotone"
                dataKey={`series-${index}`}
                name={item.name}
                stroke={item.color}
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                activeDot={{ r: 7, strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

const ReportsPage: React.FC<{
  currentUser: AuthAccount | null;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}> = ({ currentUser, onToast, getErrorMessage: getAppErrorMessage }) => {
  const initialAnalyticsDatesRef = useRef(getRangeDates('1m'));
  const [selectedReportType, setSelectedReportType] = useState<'trooper-daily' | 'cpar'>('trooper-daily');
  const [activeTrooperDailyTab, setActiveTrooperDailyTab] = useState<TrooperDailyTab>('graph');
  const [trooperDailies, setTrooperDailies] = useState<TrooperDailyReportEntry[]>([]);
  const [dailySearch, setDailySearch] = useState('');
  const [dailyFrom, setDailyFrom] = useState('');
  const [dailyTo, setDailyTo] = useState('');
  const [dailyDistrict, setDailyDistrict] = useState('');
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPageSize, setDailyPageSize] = useState(25);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [dailyTotalPages, setDailyTotalPages] = useState(1);
  const [dailyScope, setDailyScope] = useState<'all' | 'own'>('own');
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyAnalytics, setDailyAnalytics] = useState<TrooperDailyAnalyticsResponse | null>(null);
  const [dailyAnalyticsLoading, setDailyAnalyticsLoading] = useState(true);
  const [dailyAnalyticsError, setDailyAnalyticsError] = useState<string | null>(null);
  const [selectedAnalyticsMetric, setSelectedAnalyticsMetric] = useState('marijuanaGramsFound');
  const [dailyAnalyticsRange, setDailyAnalyticsRange] = useState<DailyAnalyticsRange>('1m');
  const [analyticsSearch, setAnalyticsSearch] = useState('');
  const [analyticsDistrict, setAnalyticsDistrict] = useState('');
  const [analyticsFrom, setAnalyticsFrom] = useState(initialAnalyticsDatesRef.current.from);
  const [analyticsTo, setAnalyticsTo] = useState(initialAnalyticsDatesRef.current.to);
  const [dailyGraphType, setDailyGraphType] = useState<DailyGraphType>('line');
  const [dailyCompareMode, setDailyCompareMode] = useState<DailyCompareMode>('user');
  const [compareSearch, setCompareSearch] = useState('');
  const [compareUserResults, setCompareUserResults] = useState<User[]>([]);
  const [isCompareUserSearchOpen, setIsCompareUserSearchOpen] = useState(false);
  const [compareUserSearchLoading, setCompareUserSearchLoading] = useState(false);
  const [compareDistrictSearch, setCompareDistrictSearch] = useState('');
  const [isCompareDistrictSearchOpen, setIsCompareDistrictSearchOpen] = useState(false);
  const [compareItems, setCompareItems] = useState<DailyCompareItem[]>([]);
  const [compareAnalyticsLoading, setCompareAnalyticsLoading] = useState(false);
  const [compareAnalyticsError, setCompareAnalyticsError] = useState<string | null>(null);
  const [dailyExportFormat, setDailyExportFormat] = useState<DailyExportFormat>('csv');
  const [isDailyAnalyticsExportMenuOpen, setIsDailyAnalyticsExportMenuOpen] = useState(false);
  const [isSelectedDailyExportMenuOpen, setIsSelectedDailyExportMenuOpen] = useState(false);
  const [rowDailyExportFormats, setRowDailyExportFormats] = useState<Record<string, DailyExportFormat>>({});
  const [dailyExporting, setDailyExporting] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [selectedDaily, setSelectedDaily] = useState<TrooperDailyReportEntry | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const dailyRefreshTimerRef = useRef<number | null>(null);
  const dailyLoadInFlightRef = useRef(false);
  const dailyLoadPendingRef = useRef(false);
  const analyticsChartRef = useRef<HTMLDivElement | null>(null);
  const canViewAllTrooperDailies = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('reports:trooper-dailies'));
  const canReviewTrooperDailies = canViewAllTrooperDailies;

  const loadTrooperDailyAnalytics = async (
    showLoading = true,
    filters = {
      q: analyticsSearch,
      from: analyticsFrom,
      to: analyticsTo,
      district: analyticsDistrict,
    },
  ) => {
    if (showLoading) {
      setDailyAnalyticsLoading(true);
    }
    setDailyAnalyticsError(null);

    try {
      const response = await reportService.getTrooperDailyAnalytics({
        q: canViewAllTrooperDailies ? filters.q.trim() || undefined : undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        district: canViewAllTrooperDailies ? filters.district || undefined : undefined,
      });
      setDailyAnalytics(response.data);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load Trooper Daily analytics.');
      setDailyAnalyticsError(message);
      console.error(err);
    } finally {
      setDailyAnalyticsLoading(false);
    }
  };

  const loadCompareItemAnalytics = async (
    item: DailyCompareItem,
    from = analyticsFrom,
    to = analyticsTo,
  ): Promise<DailyCompareItem> => {
    if (!canViewAllTrooperDailies) {
      return { ...item, loading: false, error: null };
    }

    try {
      const response = await reportService.getTrooperDailyAnalytics({
        q: item.type === 'user' ? item.query || item.label : undefined,
        from: from || undefined,
        to: to || undefined,
        district: item.type === 'district' ? item.district || item.label : undefined,
      });
      return { ...item, analytics: response.data, loading: false, error: null };
    } catch (err) {
      const message = getErrorMessage(err, `Failed to load ${item.label} comparison.`);
      console.error(err);
      return { ...item, loading: false, error: message };
    }
  };

  const reloadCompareItems = async (
    items = compareItems,
    from = analyticsFrom,
    to = analyticsTo,
    showLoading = true,
  ) => {
    if (!canViewAllTrooperDailies || items.length === 0) {
      setCompareAnalyticsError(null);
      return;
    }

    if (showLoading) {
      setCompareAnalyticsLoading(true);
      setCompareItems((current) => current.map((item) => ({ ...item, loading: true, error: null })));
    }
    setCompareAnalyticsError(null);

    const updatedItems = await Promise.all(items.map((item) => loadCompareItemAnalytics(item, from, to)));
    setCompareItems(updatedItems);
    const firstError = updatedItems.find((item) => item.error)?.error || null;
    setCompareAnalyticsError(firstError);
    setCompareAnalyticsLoading(false);
  };

  const loadTrooperDailies = async (
    showLoading = true,
    filters = {
      q: dailySearch,
      from: dailyFrom,
      to: dailyTo,
      district: dailyDistrict,
      page: dailyPage,
      pageSize: dailyPageSize,
    },
  ) => {
    if (dailyLoadInFlightRef.current) {
      dailyLoadPendingRef.current = true;
      return;
    }

    dailyLoadInFlightRef.current = true;
    if (showLoading) {
      setDailyLoading(true);
    }
    setDailyError(null);

    try {
      const response = await reportService.getTrooperDailies({
        q: filters.q.trim() || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        district: filters.district || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      setTrooperDailies(response.data.data);
      setDailyTotal(response.data.total);
      setDailyPage(response.data.page);
      setDailyPageSize(response.data.pageSize);
      setDailyTotalPages(response.data.totalPages);
      setDailyScope(response.data.scope);
    } catch (err) {
      setDailyError(getErrorMessage(err, 'Trooper Daily reports require permission.'));
      console.error(err);
    } finally {
      dailyLoadInFlightRef.current = false;
      setDailyLoading(false);
      if (dailyLoadPendingRef.current) {
        dailyLoadPendingRef.current = false;
        void loadTrooperDailies(false);
      }
    }
  };

  useEffect(() => {
    if (!canViewAllTrooperDailies) {
      setAnalyticsSearch('');
      setAnalyticsDistrict('');
      setCompareItems([]);
      setCompareSearch('');
      setCompareDistrictSearch('');
      setCompareAnalyticsError(null);
      setIsCompareUserSearchOpen(false);
      setIsCompareDistrictSearchOpen(false);
    }
  }, [canViewAllTrooperDailies]);

  useEffect(() => {
    if (selectedReportType === 'trooper-daily') {
      void loadTrooperDailies();
      void loadTrooperDailyAnalytics();
    }
    const refreshReportsQuietly = () => {
      if (selectedReportType !== 'trooper-daily') {
        return;
      }

      void loadTrooperDailies(false);
      void loadTrooperDailyAnalytics(false);
      void reloadCompareItems(compareItems, analyticsFrom, analyticsTo, false);
    };

    const handleReportsUpdate = () => {
      if (selectedReportType !== 'trooper-daily') {
        return;
      }

      if (dailyRefreshTimerRef.current) {
        window.clearTimeout(dailyRefreshTimerRef.current);
      }

      dailyRefreshTimerRef.current = window.setTimeout(() => {
        dailyRefreshTimerRef.current = null;
        refreshReportsQuietly();
      }, 500);
    };

    const liveRefreshInterval = selectedReportType === 'trooper-daily'
      ? window.setInterval(refreshReportsQuietly, LIVE_REPORT_REFRESH_MS)
      : null;

    window.addEventListener('shield:user-updated', handleReportsUpdate);
    window.addEventListener('shield:dashboard-updated', handleReportsUpdate);
    window.addEventListener('shield:calendar-updated', handleReportsUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleReportsUpdate);
      window.removeEventListener('shield:dashboard-updated', handleReportsUpdate);
      window.removeEventListener('shield:calendar-updated', handleReportsUpdate);
      if (liveRefreshInterval) {
        window.clearInterval(liveRefreshInterval);
      }
      if (dailyRefreshTimerRef.current) {
        window.clearTimeout(dailyRefreshTimerRef.current);
        dailyRefreshTimerRef.current = null;
      }
    };
  }, [selectedReportType, compareItems, analyticsFrom, analyticsTo]);

  useEffect(() => {
    if (dailyCompareMode !== 'user') {
      setCompareUserResults([]);
      setIsCompareUserSearchOpen(false);
      setCompareUserSearchLoading(false);
      return;
    }

    const query = compareSearch.trim();
    if (query.length < 2) {
      setCompareUserResults([]);
      setIsCompareUserSearchOpen(false);
      setCompareUserSearchLoading(false);
      return;
    }

    let cancelled = false;
    setCompareUserSearchLoading(true);
    const timer = window.setTimeout(() => {
      userService.search(query)
        .then((response) => {
          if (cancelled) return;
          setCompareUserResults(Array.isArray(response.data) ? response.data.slice(0, 6) : []);
          setIsCompareUserSearchOpen(true);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error(error);
          setCompareUserResults([]);
        })
        .finally(() => {
          if (!cancelled) {
            setCompareUserSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [compareSearch, dailyCompareMode]);

  const searchTrooperDailies = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadTrooperDailies(true, {
      q: canViewAllTrooperDailies ? dailySearch : '',
      from: dailyFrom,
      to: dailyTo,
      district: canViewAllTrooperDailies ? dailyDistrict : '',
      page: 1,
      pageSize: dailyPageSize,
    });
  };

  const clearTrooperDailyFilters = () => {
    setDailySearch('');
    setDailyFrom('');
    setDailyTo('');
    setDailyDistrict('');
    void loadTrooperDailies(true, { q: '', from: '', to: '', district: '', page: 1, pageSize: dailyPageSize });
  };

  const applyDailyAnalyticsRange = (range: DailyAnalyticsRange) => {
    const dates = getRangeDates(range);
    setDailyAnalyticsRange(range);
    setAnalyticsFrom(dates.from);
    setAnalyticsTo(dates.to);
    const filters = {
      q: analyticsSearch,
      from: dates.from,
      to: dates.to,
      district: analyticsDistrict,
    };
    void loadTrooperDailyAnalytics(true, filters);
    void reloadCompareItems(compareItems, dates.from, dates.to);
  };

  const searchTrooperDailyAnalytics = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadTrooperDailyAnalytics(true, {
      q: analyticsSearch,
      from: analyticsFrom,
      to: analyticsTo,
      district: analyticsDistrict,
    });
    void reloadCompareItems();
  };

  const clearTrooperDailyAnalyticsFilters = () => {
    const dates = getRangeDates(dailyAnalyticsRange === 'custom' ? '1m' : dailyAnalyticsRange);
    setAnalyticsSearch('');
    setAnalyticsDistrict('');
    setAnalyticsFrom(dates.from);
    setAnalyticsTo(dates.to);
    if (dailyAnalyticsRange === 'custom') {
      setDailyAnalyticsRange('1m');
    }
    void loadTrooperDailyAnalytics(true, { q: '', from: dates.from, to: dates.to, district: '' });
    void reloadCompareItems(compareItems, dates.from, dates.to);
  };

  const addCompareItem = async (item: Omit<DailyCompareItem, 'color' | 'loading' | 'error'>) => {
    if (!canViewAllTrooperDailies) {
      return;
    }

    const id = item.id;
    const alreadyAdded = compareItems.some((compareItem) => compareItem.id === id);
    if (alreadyAdded) {
      onToast('info', `${item.label} is already on the graph.`);
      return;
    }

    const nextItem: DailyCompareItem = {
      ...item,
      color: compareSeriesColors[compareItems.length % compareSeriesColors.length],
      loading: true,
      error: null,
    };
    setCompareItems((current) => [...current, nextItem]);
    setCompareAnalyticsLoading(true);
    const loadedItem = await loadCompareItemAnalytics(nextItem);
    setCompareItems((current) => current.map((compareItem) => (compareItem.id === loadedItem.id ? loadedItem : compareItem)));
    setCompareAnalyticsLoading(false);
    if (loadedItem.error) {
      setCompareAnalyticsError(loadedItem.error);
      onToast('error', loadedItem.error);
    }
  };

  const removeCompareItem = (id: string) => {
    setCompareItems((current) => current.filter((item) => item.id !== id));
  };

  const selectCompareUser = (user: User) => {
    const label = formatUserOption(user);
    const query = user.email || user.peNumber || user.badgeNumber || label;
    void addCompareItem({
      id: `user:${user.id || query}`,
      type: 'user',
      label,
      query,
    });
    setCompareSearch('');
    setCompareUserResults([]);
    setIsCompareUserSearchOpen(false);
  };

  const selectCompareDistrict = (district: string) => {
    void addCompareItem({
      id: `district:${district}`,
      type: 'district',
      label: district,
      district,
    });
    setCompareDistrictSearch('');
    setIsCompareDistrictSearchOpen(false);
  };

  const goToDailyPage = (page: number) => {
    void loadTrooperDailies(true, {
      q: dailySearch,
      from: dailyFrom,
      to: dailyTo,
      district: dailyDistrict,
      page,
      pageSize: dailyPageSize,
    });
  };

  const changeDailyPageSize = (pageSize: number) => {
    setDailyPageSize(pageSize);
    void loadTrooperDailies(true, {
      q: dailySearch,
      from: dailyFrom,
      to: dailyTo,
      district: dailyDistrict,
      page: 1,
      pageSize,
    });
  };

  const loadAllTrooperDailiesForExport = async () => {
    const pageSize = 500;
    const baseFilters = {
      q: dailySearch.trim() || undefined,
      from: dailyFrom || undefined,
      to: dailyTo || undefined,
      district: dailyDistrict || undefined,
      pageSize,
    };
    const firstResponse = await reportService.getTrooperDailies({ ...baseFilters, page: 1 });
    const allEntries = [...firstResponse.data.data];

    for (let page = 2; page <= firstResponse.data.totalPages; page += 1) {
      const response = await reportService.getTrooperDailies({ ...baseFilters, page });
      allEntries.push(...response.data.data);
    }

    return allEntries;
  };

  const exportTrooperDailies = async () => {
    setDailyExporting(true);
    setDailyError(null);
    try {
      const entries = await loadAllTrooperDailiesForExport();
      const label = `trooper-dailies-${dailyFrom || 'start'}-${dailyTo || 'end'}-${dailyDistrict || 'all-districts'}`;
      if (dailyExportFormat === 'csv') {
        downloadTrooperDailiesCsv(entries, label);
      } else if (dailyExportFormat === 'pdf') {
        downloadTrooperDailiesPdf(entries, label);
      } else {
        downloadTrooperDailiesXls(entries, label);
      }
      onToast('success', `Trooper Daily ${dailyExportFormat.toUpperCase()} export ready.`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to export Trooper Daily reports.');
      setDailyError(message);
      onToast('error', message);
    } finally {
      setDailyExporting(false);
    }
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSelectedDailyExportMenuOpen(false);
        setSelectedDaily(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const openDailyReport = (entry: TrooperDailyReportEntry) => {
    setIsSelectedDailyExportMenuOpen(false);
    setSelectedDaily(entry);
    setReviewNotes(entry.reviewNotes || '');
  };

  const getDailyExportLabel = (entry: TrooperDailyReportEntry) => {
    const user = `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email || entry.id;
    return `trooper-daily-${entry.date}-${user}`;
  };

  const exportSingleDaily = (entry: TrooperDailyReportEntry, format: DailyExportFormat = 'pdf') => {
    const label = getDailyExportLabel(entry);
    if (format === 'csv') {
      downloadTrooperDailiesCsv([entry], label);
    } else if (format === 'pdf') {
      downloadTrooperDailiesPdf([entry], label);
    } else {
      downloadTrooperDailiesXls([entry], label);
    }
    onToast('success', `Trooper Daily ${format.toUpperCase()} export ready.`);
  };

  const getRowDailyExportFormat = (entryId: string): DailyExportFormat => rowDailyExportFormats[entryId] || 'pdf';

  const reviewSelectedDaily = async (status: 'Approved' | 'Returned') => {
    if (!selectedDaily) return;
    if (status === 'Returned' && !reviewNotes.trim()) {
      onToast('error', 'Add return notes before sending this report back.');
      return;
    }

    setIsReviewSaving(true);
    setDailyError(null);
    try {
      const response = await reportService.reviewTrooperDaily(selectedDaily.id, status, reviewNotes);
      const updatedDaily = response.data;
      setSelectedDaily(updatedDaily);
      setReviewNotes(updatedDaily.reviewNotes || '');
      setTrooperDailies((items) => items.map((item) => (item.id === updatedDaily.id ? updatedDaily : item)));
      onToast('success', `Trooper Daily ${status.toLowerCase()}.`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to review Trooper Daily report.');
      setDailyError(message);
      onToast('error', message);
    } finally {
      setIsReviewSaving(false);
    }
  };

  const getReviewBadgeClass = (status?: string) => {
    if (status === 'Approved') return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200';
    if (status === 'Returned') return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200';
  };

  const selectedDailyUserName = selectedDaily
    ? `${selectedDaily.user.firstName || ''} ${selectedDaily.user.lastName || ''}`.trim() || selectedDaily.user.email || 'Unknown'
    : '';
  const dailyFieldTrends = Array.isArray(dailyAnalytics?.fieldTrends) ? dailyAnalytics.fieldTrends : [];
  const visibleFieldTrends = dailyFieldTrends.filter((trend) => trend.total > 0);
  const selectedTrend = dailyFieldTrends.find((trend) => trend.key === selectedAnalyticsMetric)
    || visibleFieldTrends[0]
    || dailyFieldTrends[0]
    || null;
  const primarySeriesName = analyticsSearch.trim()
    ? analyticsSearch.trim()
    : analyticsDistrict
      ? analyticsDistrict
      : 'Overall';
  const compareDistrictMatches = compareDistrictSearch.trim()
    ? districtOptions.filter((district) => district.toLowerCase().includes(compareDistrictSearch.trim().toLowerCase())).slice(0, 8)
    : districtOptions.slice(0, 8);
  const compareTrendSeries = selectedTrend
    ? compareItems.flatMap((item) => {
      const compareTrend = item.analytics?.fieldTrends?.find((trend) => trend.key === selectedTrend.key);
      return compareTrend ? [{ name: item.label, points: compareTrend.points, color: item.color }] : [];
    })
    : [];
  const chartSeries = selectedTrend
    ? [
      { name: primarySeriesName, points: selectedTrend.points, color: 'rgb(157 134 92)' },
      ...compareTrendSeries,
    ]
    : [];
  const groupedFieldTrends = dailyFieldTrends.reduce<Record<string, typeof dailyFieldTrends>>((groups, trend) => {
    const section = trooperDailyFieldSections.get(trend.key) || trend.section || 'Other';
    groups[section] = [...(groups[section] || []), trend];
    return groups;
  }, {});
  const exportAnalyticsPng = () => {
    const svg = analyticsChartRef.current?.querySelector('svg');
    if (!svg) {
      onToast('error', 'No graph is available to export.');
      return;
    }

    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgText = new XMLSerializer().serializeToString(clonedSvg);
    const image = new Image();
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 520;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        onToast('error', 'Unable to export this graph.');
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const metric = selectedTrend?.label || 'trooper-daily-graph';
      downloadReportBlob(
        Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (char) => char.charCodeAt(0)),
        'image/png',
        `${cleanReportFilePart(metric)}.png`,
      );
      onToast('success', 'Graph PNG export ready.');
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      onToast('error', 'Unable to export this graph.');
    };

    image.src = url;
  };

  const exportAnalyticsReport = (format: DailyAnalyticsExportFormat) => {
    setIsDailyAnalyticsExportMenuOpen(false);
    if (format === 'png') {
      exportAnalyticsPng();
      return;
    }

    if (!selectedTrend || chartSeries.length === 0) {
      onToast('error', 'No graph data is available to export.');
      return;
    }

    const labels = Array.from(new Set(chartSeries.flatMap((series) => series.points.map((point) => point.label))));
    const headers = ['Period', ...chartSeries.map((series) => series.name)];
    const rows = labels.map((label) => [
      formatAnalyticsLabel(label),
      ...chartSeries.map((series) => {
        const point = series.points.find((item) => item.label === label);
        return formatMetric(Number(point?.value) || 0, 1);
      }),
    ]);
    const filename = cleanReportFilePart(`${selectedTrend.label}-${dailyAnalyticsRange}-${primarySeriesName}`);

    if (format === 'csv') {
      const csv = [headers, ...rows].map((row) => row.map(escapeReportCsv).join(',')).join('\n');
      downloadReportBlob(csv, 'text/csv;charset=utf-8', `${filename}.csv`);
    } else {
      const subtitle = [
        selectedTrend.section,
        `Range: ${dailyAnalyticsRanges.find((range) => range.value === dailyAnalyticsRange)?.label || 'Custom'}`,
        analyticsDistrict ? `District: ${analyticsDistrict}` : '',
        analyticsSearch.trim() ? `Search: ${analyticsSearch.trim()}` : '',
      ].filter(Boolean).join(' | ');
      const pdf = buildSimpleAnalyticsPdf(`Trooper Daily Analytics - ${selectedTrend.label}`, subtitle, headers, rows);
      downloadReportBlob(pdf, 'application/pdf', `${filename}.pdf`);
    }

    onToast('success', `Graph ${format.toUpperCase()} export ready.`);
  };

  const renderAnalyticsExportDropdown = () => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsDailyAnalyticsExportMenuOpen((open) => !open)}
        className="btn-secondary"
        aria-haspopup="menu"
        aria-expanded={isDailyAnalyticsExportMenuOpen}
        aria-label="Export graph"
        title="Export graph"
      >
        <Download size={16} /> <ChevronDown size={14} />
      </button>
      {isDailyAnalyticsExportMenuOpen && (
        <div className="absolute right-0 top-11 z-40 min-w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-950">
          {[
            { format: 'csv' as const, label: 'CSV' },
            { format: 'pdf' as const, label: 'PDF' },
            { format: 'png' as const, label: 'PNG' },
          ].map((option) => (
            <button
              key={option.format}
              type="button"
              onClick={() => exportAnalyticsReport(option.format)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
              role="menuitem"
            >
              <Download size={14} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <h1 className="mb-8">Reports & Analytics</h1>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        <label className="block max-w-md">
          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Report to Load</span>
          <select
            value={selectedReportType}
            onChange={(event) => setSelectedReportType(event.target.value as 'trooper-daily' | 'cpar')}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="trooper-daily">Trooper Daily Reports</option>
            <option value="cpar">CPAR</option>
          </select>
        </label>
      </section>

      {selectedReportType === 'trooper-daily' ? (
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>Trooper Daily Reports</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {dailyScope === 'all'
                ? 'Search submitted Trooper Dailies by user, email, PE number, badge, rank, or district.'
                : `Search your submitted Trooper Dailies${currentUser?.displayName ? `, ${currentUser.displayName}` : ''}.`}
            </p>
          </div>
          <span className="rounded bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
            {dailyTotal.toLocaleString()} result{dailyTotal === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
          {trooperDailyTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTrooperDailyTab(tab.value)}
              className={`rounded px-4 py-2 text-sm font-black transition ${
                activeTrooperDailyTab === tab.value
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTrooperDailyTab === 'table' && (
        <section className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <div className="mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Report Table Filters</h3>
            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">These filters only affect the report entries table.</p>
          </div>
          <form onSubmit={searchTrooperDailies} className={`grid grid-cols-1 gap-3 ${canViewAllTrooperDailies ? 'xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto_auto]' : 'xl:grid-cols-[repeat(2,minmax(0,1fr))_auto_auto]'}`}>
          {canViewAllTrooperDailies && (
            <input
              value={dailySearch}
              onChange={(event) => setDailySearch(event.target.value)}
              placeholder="Name, email, PE, badge, rank, district..."
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
          )}
          <input
            type="date"
            value={dailyFrom}
            onChange={(event) => setDailyFrom(event.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
          <input
            type="date"
            value={dailyTo}
            onChange={(event) => setDailyTo(event.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
          {canViewAllTrooperDailies && (
            <select value={dailyDistrict} onChange={(event) => setDailyDistrict(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <option value="">All Districts</option>
              {districtOptions.map((district) => <option key={district}>{district}</option>)}
            </select>
          )}
          <button type="submit" className="btn-primary" aria-label="Search Trooper Daily reports" title="Search">
            <Search size={16} />
          </button>
          <button type="button" onClick={clearTrooperDailyFilters} className="btn-secondary" aria-label="Clear Trooper Daily filters" title="Clear">
            <X size={16} />
          </button>
          </form>
        </section>
        )}

        {activeTrooperDailyTab === 'graph' && (
        <section className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                <BarChart3 size={20} className="text-accent" /> Live Trooper Daily Analytics
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {canViewAllTrooperDailies ? 'View overall data, search a user, or narrow the graph to a district.' : 'View your submitted Trooper Daily analytics.'}
              </p>
            </div>
            {dailyAnalytics?.generatedAt && (
              <div className="flex flex-wrap items-center gap-2">
                {dailyAnalyticsLoading && (
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase text-accent">Updating</span>
                )}
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-400">
                  Updated {new Date(dailyAnalytics.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {canViewAllTrooperDailies && (
            <form onSubmit={searchTrooperDailyAnalytics} className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
              <input
                value={analyticsSearch}
                onChange={(event) => setAnalyticsSearch(event.target.value)}
                placeholder="Search user, email, PE, badge, rank..."
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <select
                value={analyticsDistrict}
                onChange={(event) => setAnalyticsDistrict(event.target.value)}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="">All Districts</option>
                {districtOptions.map((district) => <option key={district}>{district}</option>)}
              </select>
              <button type="submit" className="btn-primary" aria-label="Search analytics" title="Search Analytics">
                <Search size={16} />
              </button>
              <button type="button" onClick={clearTrooperDailyAnalyticsFilters} className="btn-secondary" aria-label="Clear analytics filters" title="Clear Filters">
                <X size={16} />
              </button>
            </form>
          )}

          {dailyAnalyticsError && <div className="error mb-4">{dailyAnalyticsError}</div>}
          {dailyAnalyticsLoading && !dailyAnalytics ? (
            <div className="loading">Loading Trooper Daily analytics...</div>
          ) : dailyAnalytics ? (
            <>
              <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(14rem,0.9fr)_minmax(0,1.6fr)_auto_auto] xl:items-center">
                  <div className="min-w-0">
                    <select
                      value={selectedTrend?.key || selectedAnalyticsMetric}
                      onChange={(event) => setSelectedAnalyticsMetric(event.target.value)}
                      className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-950"
                      aria-label="Graph metric"
                    >
                      {Object.entries(groupedFieldTrends).map(([section, trends]) => (
                        <optgroup key={section} label={section}>
                          {trends.map((trend) => (
                            <option key={trend.key} value={trend.key}>{trend.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dailyAnalyticsRanges.map((range) => (
                      <button
                        key={range.value}
                        type="button"
                        onClick={() => applyDailyAnalyticsRange(range.value)}
                        className={`rounded border px-3 py-2 text-xs font-black uppercase tracking-wide transition ${
                          dailyAnalyticsRange === range.value
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-accent/60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200'
                        }`}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dailyGraphTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setDailyGraphType(type.value)}
                        className={`rounded border px-3 py-2 text-xs font-black uppercase tracking-wide transition ${
                          dailyGraphType === type.value
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-primary-500/60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-start xl:justify-end">
                    {renderAnalyticsExportDropdown()}
                  </div>
                </div>

                {canViewAllTrooperDailies ? (
                  <>
                    <section className="relative z-40 mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h5 className="text-sm font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Compare</h5>
                        {compareAnalyticsLoading && (
                          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-black uppercase text-accent">Updating</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start">
                        <div className="inline-flex w-full rounded border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-900 xl:w-auto" aria-label="Compare graph mode">
                          {(['user', 'district'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                setDailyCompareMode(mode);
                                setCompareSearch('');
                                setCompareDistrictSearch('');
                                setIsCompareUserSearchOpen(false);
                                setIsCompareDistrictSearchOpen(false);
                              }}
                              className={`min-w-24 flex-1 rounded px-3 py-1.5 text-xs font-black uppercase tracking-wide transition xl:flex-none ${
                                dailyCompareMode === mode
                                  ? 'bg-primary-500 text-white'
                                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              {mode === 'user' ? 'Users' : 'Districts'}
                            </button>
                          ))}
                        </div>

                        {dailyCompareMode === 'user' ? (
                          <div className="relative">
                            <input
                              value={compareSearch}
                              onChange={(event) => {
                                setCompareSearch(event.target.value);
                                setIsCompareUserSearchOpen(true);
                              }}
                              onFocus={() => {
                                if (compareUserResults.length > 0) {
                                  setIsCompareUserSearchOpen(true);
                                }
                              }}
                              placeholder="Add user by name, email, PE, or badge..."
                              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                            {isCompareUserSearchOpen && (compareUserResults.length > 0 || compareUserSearchLoading) && (
                              <div className="absolute left-0 right-0 top-11 z-[90] max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-950">
                                {compareUserSearchLoading ? (
                                  <div className="px-3 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Searching users...</div>
                                ) : (
                                  compareUserResults.map((user) => (
                                    <button
                                      key={user.id}
                                      type="button"
                                      onClick={() => selectCompareUser(user)}
                                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-black text-gray-900 dark:text-gray-100">{formatUserOption(user)}</span>
                                        <span className="block truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
                                          {user.rank || 'No rank'}{user.district ? ` - ${user.district}` : ''}{user.peNumber ? ` - PE ${user.peNumber}` : ''}
                                        </span>
                                      </span>
                                      <span className="shrink-0 text-xs font-bold text-accent">{user.badgeNumber || user.email || ''}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              value={compareDistrictSearch}
                              onChange={(event) => {
                                setCompareDistrictSearch(event.target.value);
                                setIsCompareDistrictSearchOpen(true);
                              }}
                              onFocus={() => setIsCompareDistrictSearchOpen(true)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  const exactDistrict = districtOptions.find((district) => district.toLowerCase() === compareDistrictSearch.trim().toLowerCase());
                                  if (exactDistrict) {
                                    selectCompareDistrict(exactDistrict);
                                  }
                                }
                              }}
                              placeholder="Add district..."
                              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                            />
                            {isCompareDistrictSearchOpen && (
                              <div className="absolute left-0 right-0 top-11 z-[90] max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-950">
                                {compareDistrictMatches.length > 0 ? (
                                  compareDistrictMatches.map((district) => (
                                    <button
                                      key={district}
                                      type="button"
                                      onClick={() => selectCompareDistrict(district)}
                                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-bold text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900"
                                    >
                                      {district}
                                      <span className="text-xs font-black uppercase text-accent">Add</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400">No districts found.</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {compareItems.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {compareItems.map((item) => (
                            <span key={item.id} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.label}
                              {item.loading && <span className="font-bold text-gray-400">loading</span>}
                              <button type="button" onClick={() => removeCompareItem(item.id)} className="text-gray-400 transition hover:text-red-600" aria-label={`Remove ${item.label}`}>
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </section>
                    {compareAnalyticsError && <div className="error mb-4">{compareAnalyticsError}</div>}
                  </>
                ) : null}

                {selectedTrend ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-gray-900 dark:text-gray-100">{selectedTrend.label}</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{selectedTrend.section}</p>
                      </div>
                      <span className="text-sm font-black text-accent">Total {formatMetric(selectedTrend.total, 1)}</span>
                    </div>
                    {chartSeries.length > 1 && (
                      <div className="mb-3 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {chartSeries.map((item) => (
                          <span key={item.name} className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div ref={analyticsChartRef} className="h-[26rem] w-full">
                      <AnalyticsChart series={chartSeries} graphType={dailyGraphType} height={420} />
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300">
                    <p className="font-black text-gray-900 dark:text-gray-100">No graph data for this view yet.</p>
                    <p className="mt-1">Try a wider date range, clear the filters, choose another district, or select a different metric.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => applyDailyAnalyticsRange('1y')} className="btn-secondary">1 Year</button>
                      <button type="button" onClick={clearTrooperDailyAnalyticsFilters} className="btn-secondary">Clear Filters</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No analytics available yet.</p>
          )}
        </section>
        )}

        {activeTrooperDailyTab === 'exports' && (
          <section className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
            <div className="mb-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Exports</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                Export uses the current table filters for search, date range, and district.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={dailyExportFormat}
                onChange={(event) => setDailyExportFormat(event.target.value as DailyExportFormat)}
                className="min-w-28 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                aria-label="Export format"
              >
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
                <option value="xls">XLS</option>
              </select>
              <button type="button" onClick={exportTrooperDailies} className="btn-secondary" disabled={dailyExporting} aria-label="Export Trooper Daily reports" title={dailyExporting ? 'Exporting' : 'Export'}>
                <Download size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                {dailyTotal.toLocaleString()} matching report{dailyTotal === 1 ? '' : 's'}
              </span>
            </div>
          </section>
        )}

        {activeTrooperDailyTab === 'table' && (
        <>
        {dailyError && <div className="error">{dailyError}</div>}
        {dailyLoading ? (
          <div className="loading">Loading Trooper Daily reports...</div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Page {dailyPage.toLocaleString()} of {dailyTotalPages.toLocaleString()}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={dailyPageSize}
                  onChange={(event) => changeDailyPageSize(Number(event.target.value))}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  aria-label="Trooper Daily page size"
                >
                  {[25, 50, 100].map((pageSize) => (
                    <option key={pageSize} value={pageSize}>{pageSize} per page</option>
                  ))}
                </select>
                <button type="button" onClick={() => goToDailyPage(Math.max(1, dailyPage - 1))} disabled={dailyPage <= 1} className="btn-secondary" aria-label="Previous Trooper Daily report page" title="Previous Page">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => goToDailyPage(Math.min(dailyTotalPages, dailyPage + 1))} disabled={dailyPage >= dailyTotalPages} className="btn-secondary" aria-label="Next Trooper Daily report page" title="Next Page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-gray-700">
                  <th className="px-3 py-3 text-left font-semibold">Date</th>
                  <th className="px-3 py-3 text-left font-semibold">User</th>
                  <th className="px-3 py-3 text-left font-semibold">District Worked</th>
                  <th className="px-3 py-3 text-left font-semibold">Hours</th>
                  <th className="px-3 py-3 text-left font-semibold">Duty Status</th>
                  <th className="px-3 py-3 text-left font-semibold">Review</th>
                  <th className="px-3 py-3 text-left font-semibold">Narrative</th>
                  <th className="px-3 py-3 text-left font-semibold">Download</th>
                </tr>
              </thead>
              <tbody>
                {trooperDailies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">No submitted Trooper Dailies found.</td>
                  </tr>
                ) : (
                  trooperDailies.map((entry) => {
                    const userName = `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || entry.user.email || 'Unknown';
                    return (
                      <tr
                        key={entry.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => openDailyReport(entry)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openDailyReport(entry);
                          }
                        }}
                        className="cursor-pointer border-b border-gray-200 transition hover:bg-accent/5 focus:bg-accent/10 focus:outline-none dark:border-gray-800"
                      >
                        <td className="px-3 py-3 font-semibold">{new Date(`${entry.date}T00:00:00`).toLocaleDateString()}</td>
                        <td className="px-3 py-3">
                          <p className="font-bold text-gray-900 dark:text-gray-100">{userName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {entry.user.rank || 'No rank'}{entry.user.peNumber ? ` - PE ${entry.user.peNumber}` : ''}{entry.user.badgeNumber ? ` - Badge ${entry.user.badgeNumber}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3">{entry.districtWorked}</td>
                        <td className="px-3 py-3 font-bold text-accent">{entry.dutyHours}</td>
                        <td className="px-3 py-3">{entry.specialStatus}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${getReviewBadgeClass(entry.reviewStatus)}`}>
                            {entry.reviewStatus || 'Pending'}
                          </span>
                        </td>
                        <td className="max-w-sm px-3 py-3 text-gray-600 dark:text-gray-400">
                          <p className="line-clamp-2">{entry.details?.narrative || 'No narrative'}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={getRowDailyExportFormat(entry.id)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation();
                                setRowDailyExportFormats((formats) => ({
                                  ...formats,
                                  [entry.id]: event.target.value as DailyExportFormat,
                                }));
                              }}
                              className="rounded border border-gray-300 bg-white px-2 py-2 text-xs font-semibold dark:border-gray-700 dark:bg-gray-950"
                              aria-label="Individual report download format"
                            >
                              <option value="pdf">PDF</option>
                              <option value="csv">CSV</option>
                              <option value="xls">XLS</option>
                            </select>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              exportSingleDaily(entry, getRowDailyExportFormat(entry.id));
                            }}
                            className="btn-secondary"
                            aria-label="Download this Trooper Daily report"
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          </>
        )}
        </>
        )}
      </section>
      ) : (
        currentUser ? (
          <PerformanceEvaluationsPage currentUser={currentUser} onToast={onToast} getErrorMessage={getAppErrorMessage} compactTitle />
        ) : (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">Sign in to view CPAR reports.</div>
        )
      )}

      {selectedDaily && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center">
          <div className="modal-window flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-primary-500 px-5 py-4 text-white dark:border-gray-800">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Trooper Daily Report</p>
                <h2 className="text-2xl font-bold text-white">{selectedDailyUserName}</h2>
                <p className="mt-1 text-sm text-blue-100">
                  {new Date(`${selectedDaily.date}T00:00:00`).toLocaleDateString()} - {selectedDaily.dutyHours} hours - {selectedDaily.districtWorked}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsSelectedDailyExportMenuOpen((value) => !value);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-white/20"
                    aria-expanded={isSelectedDailyExportMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Export selected Trooper Daily report"
                    title="Export"
                  >
                    <Download size={18} />
                  </button>
                  {isSelectedDailyExportMenuOpen && (
                    <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-gray-800 shadow-xl dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" role="menu">
                      {([
                        { format: 'pdf' as const, label: 'PDF', icon: FileText },
                        { format: 'csv' as const, label: 'CSV', icon: Download },
                        { format: 'xls' as const, label: 'XLS', icon: Table },
                      ]).map((item) => {
                        const ExportIcon = item.icon;
                        return (
                          <button
                            key={item.format}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              exportSingleDaily(selectedDaily, item.format);
                              setIsSelectedDailyExportMenuOpen(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            role="menuitem"
                          >
                            <ExportIcon size={15} /> {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectedDailyExportMenuOpen(false);
                    setSelectedDaily(null);
                  }}
                  className="icon-close-button border-white/20 bg-white/10 text-white hover:bg-white/20 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  aria-label="Close Trooper Daily report"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                {[
                  ['Email', selectedDaily.user.email || ''],
                  ['Rank', selectedDaily.user.rank || 'No rank'],
                  ['PE Number', selectedDaily.user.peNumber || ''],
                  ['Badge', selectedDaily.user.badgeNumber || ''],
                  ['Home District', selectedDaily.user.district || ''],
                  ['District Worked', selectedDaily.districtWorked],
                  ['Special Status', selectedDaily.specialStatus],
                  ['Review Status', selectedDaily.reviewStatus || 'Pending'],
                  ['Reviewed By', selectedDaily.reviewedByName || 'Not reviewed'],
                  ['Submitted', new Date(selectedDaily.createdAt).toLocaleString()],
                  ['Reviewed At', selectedDaily.reviewedAt ? new Date(selectedDaily.reviewedAt).toLocaleString() : 'Not reviewed'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{value || 'Not entered'}</p>
                  </div>
                ))}
              </div>

              <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Supervisor Review</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Current status: <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${getReviewBadgeClass(selectedDaily.reviewStatus)}`}>{selectedDaily.reviewStatus || 'Pending'}</span>
                    </p>
                  </div>
                  {canReviewTrooperDailies && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => reviewSelectedDaily('Approved')}
                        className="btn-success"
                        disabled={isReviewSaving}
                        aria-label="Approve Trooper Daily"
                        title="Approve"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewSelectedDaily('Returned')}
                        className="btn-danger"
                        disabled={isReviewSaving}
                        aria-label="Return Trooper Daily for correction"
                        title="Return for Correction"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <label className="mt-4 block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Review Notes</span>
                  {canReviewTrooperDailies ? (
                    <textarea
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      className="min-h-24 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                      placeholder="Add approval notes or explain what needs corrected."
                      maxLength={2000}
                    />
                  ) : (
                    <p className="min-h-20 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
                      {selectedDaily.reviewNotes || 'No review notes yet.'}
                    </p>
                  )}
                </label>
              </section>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {trooperDailySections.map((section) => (
                  <section key={section.title} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{section.title}</h3>
                      <span className="h-1.5 w-10 rounded-full bg-accent" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {section.fields.map(([key, label]) => (
                        <div key={key} className="rounded border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                          <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</p>
                          <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{selectedDaily.details?.[key] || '0'}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950 xl:col-span-2">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Narrative</h3>
                    <span className="h-1.5 w-10 rounded-full bg-accent" />
                  </div>
                  <p className="min-h-32 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
                    {selectedDaily.details?.narrative || 'No narrative entered.'}
                  </p>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
