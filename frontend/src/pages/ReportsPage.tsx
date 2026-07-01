import React, { useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, RotateCcw, Search, Table, Users, X } from 'lucide-react';
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
type DailyAnalyticsRange = '1d' | '7d' | '1m' | '3m' | '6m' | '1y' | 'custom';
type DailyGraphType = 'line' | 'bar';
type DailyCompareMode = 'none' | 'user' | 'district';
type TrooperDailyTab = 'graph' | 'table' | 'exports';

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

const AnalyticsChart: React.FC<{
  series: Array<{ name: string; points: Array<{ label: string; value: number }>; color: string }>;
  graphType: DailyGraphType;
  height?: number;
  valueLabel?: string;
}> = ({ series, graphType, height = 172, valueLabel = '' }) => {
  const [hoveredPoint, setHoveredPoint] = useState<{ name: string; label: string; value: number; x: number; y: number; color: string } | null>(null);
  const width = 640;
  const padding = { top: 14, right: 18, bottom: 32, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const allPoints = series.flatMap((item) => item.points);
  const values = allPoints.map((point) => Number(point.value) || 0);
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const range = Math.max(1, maxValue - minValue);
  const primaryPoints = series[0]?.points || [];
  const seriesCoordinates = series.map((item) => ({
    ...item,
    coordinates: item.points.map((point, index) => {
      const x = padding.left + (item.points.length <= 1 ? chartWidth : (index / (item.points.length - 1)) * chartWidth);
      const y = padding.top + chartHeight - (((Number(point.value) || 0) - minValue) / range) * chartHeight;
      return { ...point, value: Number(point.value) || 0, x, y };
    }),
  }));
  const labelIndexes = primaryPoints.length <= 6
    ? primaryPoints.map((_, index) => index)
    : [0, Math.floor((primaryPoints.length - 1) / 2), primaryPoints.length - 1];
  const ticks = [maxValue, (maxValue + minValue) / 2, minValue];

  if (allPoints.length === 0) {
    return <p className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No chart data yet.</p>;
  }

  return (
    <div className="relative h-full min-h-[150px] w-full">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" className="h-full min-h-[150px] w-full overflow-visible" onMouseLeave={() => setHoveredPoint(null)}>
        {ticks.map((tick) => {
          const y = padding.top + chartHeight - ((tick - minValue) / range) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-[11px] dark:fill-gray-400">
                {formatMetric(tick, tick % 1 === 0 ? 0 : 1)}
              </text>
            </g>
          );
        })}

        {graphType === 'bar' ? (
          seriesCoordinates.map((item, seriesIndex) => {
            const groupWidth = chartWidth / Math.max(1, item.coordinates.length);
            const barWidth = Math.min(24, Math.max(5, (groupWidth - 8) / Math.max(1, seriesCoordinates.length)));
            return item.coordinates.map((point, index) => {
              const x = padding.left + index * groupWidth + (groupWidth - barWidth * seriesCoordinates.length) / 2 + seriesIndex * barWidth;
              const barHeight = chartHeight - (point.y - padding.top);
              return (
                <rect
                  key={`${item.name}-${point.label}`}
                  x={x}
                  y={point.y}
                  width={barWidth}
                  height={Math.max(1, barHeight)}
                  rx="3"
                  fill={item.color}
                  opacity={seriesIndex === 0 ? 0.9 : 0.65}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPoint({ name: item.name, label: point.label, value: point.value, x: x + barWidth / 2, y: point.y, color: item.color })}
                  onMouseMove={() => setHoveredPoint({ name: item.name, label: point.label, value: point.value, x: x + barWidth / 2, y: point.y, color: item.color })}
                />
              );
            });
          })
        ) : (
          seriesCoordinates.map((item) => {
            const path = item.coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
            const fillPath = item.coordinates.length > 0
              ? `${path} L ${item.coordinates[item.coordinates.length - 1].x.toFixed(2)} ${padding.top + chartHeight} L ${item.coordinates[0].x.toFixed(2)} ${padding.top + chartHeight} Z`
              : '';
            return (
              <g key={item.name}>
                {fillPath && <path d={fillPath} fill={item.color} opacity="0.08" />}
                <path d={path} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {item.coordinates.map((point) => (
                  <circle
                    key={`${item.name}-${point.label}-${point.x}`}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={item.color}
                    stroke="white"
                    strokeWidth="2"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint({ name: item.name, label: point.label, value: point.value, x: point.x, y: point.y, color: item.color })}
                    onMouseMove={() => setHoveredPoint({ name: item.name, label: point.label, value: point.value, x: point.x, y: point.y, color: item.color })}
                  />
                ))}
              </g>
            );
          })
        )}

        {labelIndexes.map((index) => {
          const point = primaryPoints[index];
          const x = padding.left + (primaryPoints.length <= 1 ? chartWidth : (index / (primaryPoints.length - 1)) * chartWidth);
          return (
            <text key={`${point.label}-label`} x={x} y={height - 9} textAnchor={index === 0 ? 'start' : index === primaryPoints.length - 1 ? 'end' : 'middle'} className="fill-gray-500 text-[11px] dark:fill-gray-400">
              {formatAnalyticsLabel(point.label)}
            </text>
          );
        })}
      </svg>
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-950"
          style={{
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${(hoveredPoint.y / height) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          <div className="mb-1 flex items-center gap-2 font-black text-gray-900 dark:text-gray-100">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hoveredPoint.color }} />
            {hoveredPoint.name}
          </div>
          <p className="font-semibold text-gray-500 dark:text-gray-400">{formatAnalyticsLabel(hoveredPoint.label)}</p>
          <p className="text-sm font-black text-accent">{formatMetric(hoveredPoint.value, 1)}{valueLabel}</p>
        </div>
      )}
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
  const [dailyCompareMode, setDailyCompareMode] = useState<DailyCompareMode>('none');
  const [compareSearch, setCompareSearch] = useState('');
  const [selectedCompareUserQuery, setSelectedCompareUserQuery] = useState('');
  const [compareUserResults, setCompareUserResults] = useState<User[]>([]);
  const [isCompareUserSearchOpen, setIsCompareUserSearchOpen] = useState(false);
  const [compareUserSearchLoading, setCompareUserSearchLoading] = useState(false);
  const [compareDistrict, setCompareDistrict] = useState('');
  const [compareAnalytics, setCompareAnalytics] = useState<TrooperDailyAnalyticsResponse | null>(null);
  const [compareAnalyticsLoading, setCompareAnalyticsLoading] = useState(false);
  const [compareAnalyticsError, setCompareAnalyticsError] = useState<string | null>(null);
  const [dailyExportFormat, setDailyExportFormat] = useState<DailyExportFormat>('csv');
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
  const canReviewTrooperDailies = currentUser?.role === 'administrator' || Boolean(currentUser?.permissions?.includes('reports:trooper-dailies'));

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
        q: filters.q.trim() || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        district: filters.district || undefined,
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

  const getCompareFilters = (
    mode = dailyCompareMode,
    from = analyticsFrom,
    to = analyticsTo,
    search = compareSearch,
    district = compareDistrict,
  ) => {
    if (mode === 'user') {
      return { q: selectedCompareUserQuery || search, from, to, district: '' };
    }

    if (mode === 'district') {
      return { q: '', from, to, district };
    }

    return null;
  };

  const loadCompareAnalytics = async (
    showLoading = true,
    filters = getCompareFilters(),
  ) => {
    if (!filters) {
      setCompareAnalytics(null);
      setCompareAnalyticsError(null);
      return;
    }

    if (showLoading) {
      setCompareAnalyticsLoading(true);
    }
    setCompareAnalyticsError(null);

    try {
      const response = await reportService.getTrooperDailyAnalytics({
        q: filters.q.trim() || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        district: filters.district || undefined,
      });
      setCompareAnalytics(response.data);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load comparison analytics.');
      setCompareAnalyticsError(message);
      console.error(err);
    } finally {
      setCompareAnalyticsLoading(false);
    }
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
    if (selectedReportType === 'trooper-daily') {
      void loadTrooperDailies();
      void loadTrooperDailyAnalytics();
    }
    const handleReportsUpdate = () => {
      if (selectedReportType !== 'trooper-daily') {
        return;
      }

      if (dailyRefreshTimerRef.current) {
        window.clearTimeout(dailyRefreshTimerRef.current);
      }

      dailyRefreshTimerRef.current = window.setTimeout(() => {
        dailyRefreshTimerRef.current = null;
        void loadTrooperDailies(false);
        void loadTrooperDailyAnalytics(false);
        void loadCompareAnalytics(false);
      }, 500);
    };

    window.addEventListener('shield:user-updated', handleReportsUpdate);
    window.addEventListener('shield:dashboard-updated', handleReportsUpdate);
    window.addEventListener('shield:calendar-updated', handleReportsUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleReportsUpdate);
      window.removeEventListener('shield:dashboard-updated', handleReportsUpdate);
      window.removeEventListener('shield:calendar-updated', handleReportsUpdate);
      if (dailyRefreshTimerRef.current) {
        window.clearTimeout(dailyRefreshTimerRef.current);
        dailyRefreshTimerRef.current = null;
      }
    };
  }, [selectedReportType]);

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
      q: dailySearch,
      from: dailyFrom,
      to: dailyTo,
      district: dailyDistrict,
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
    void loadCompareAnalytics(true, getCompareFilters(dailyCompareMode, dates.from, dates.to));
  };

  const searchTrooperDailyAnalytics = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadTrooperDailyAnalytics(true, {
      q: analyticsSearch,
      from: analyticsFrom,
      to: analyticsTo,
      district: analyticsDistrict,
    });
    void loadCompareAnalytics(true);
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
    void loadCompareAnalytics(true, getCompareFilters(dailyCompareMode, dates.from, dates.to));
  };

  const changeCompareMode = (mode: DailyCompareMode) => {
    setDailyCompareMode(mode);
    if (mode === 'none') {
      setCompareAnalytics(null);
      setCompareAnalyticsError(null);
      setSelectedCompareUserQuery('');
      return;
    }
    void loadCompareAnalytics(true, getCompareFilters(mode));
  };

  const refreshCompareAnalytics = () => {
    void loadCompareAnalytics(true);
  };

  const selectCompareUser = (user: User) => {
    const label = formatUserOption(user);
    const query = user.email || user.peNumber || user.badgeNumber || label;
    setCompareSearch(label);
    setSelectedCompareUserQuery(query);
    setCompareUserResults([]);
    setIsCompareUserSearchOpen(false);
    void loadCompareAnalytics(true, { q: query, from: analyticsFrom, to: analyticsTo, district: '' });
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
  const dailyActivitySections = Array.isArray(dailyAnalytics?.activitySections) ? dailyAnalytics.activitySections : [];
  const compareFieldTrends = Array.isArray(compareAnalytics?.fieldTrends) ? compareAnalytics.fieldTrends : [];
  const visibleFieldTrends = dailyFieldTrends.filter((trend) => trend.total > 0);
  const selectedTrend = dailyFieldTrends.find((trend) => trend.key === selectedAnalyticsMetric)
    || visibleFieldTrends[0]
    || dailyFieldTrends[0]
    || null;
  const compareSelectedTrend = compareFieldTrends.find((trend) => trend.key === selectedTrend?.key);
  const primarySeriesName = analyticsSearch.trim()
    ? analyticsSearch.trim()
    : analyticsDistrict
      ? analyticsDistrict
      : 'Overall';
  const compareSeriesName = dailyCompareMode === 'user'
    ? compareSearch.trim() || 'Compare User'
    : dailyCompareMode === 'district'
      ? compareDistrict || 'Compare District'
      : '';
  const chartSeries = selectedTrend
    ? [
      { name: primarySeriesName, points: selectedTrend.points, color: 'rgb(157 134 92)' },
      ...(dailyCompareMode !== 'none' && compareSelectedTrend ? [{ name: compareSeriesName, points: compareSelectedTrend.points, color: 'rgb(37 99 235)' }] : []),
    ]
    : [];
  const groupedFieldTrends = dailyFieldTrends.reduce<Record<string, typeof dailyFieldTrends>>((groups, trend) => {
    const section = trooperDailyFieldSections.get(trend.key) || trend.section || 'Other';
    groups[section] = [...(groups[section] || []), trend];
    return groups;
  }, {});
  const activeGraphChips = [
    selectedTrend ? `Metric: ${selectedTrend.label}` : '',
    `Range: ${dailyAnalyticsRanges.find((range) => range.value === dailyAnalyticsRange)?.label || 'Custom'}`,
    analyticsSearch.trim() ? `Search: ${analyticsSearch.trim()}` : '',
    analyticsDistrict ? `District: ${analyticsDistrict}` : 'Overall',
    dailyCompareMode !== 'none' ? `Compare: ${compareSeriesName}` : '',
    `Type: ${dailyGraphTypes.find((type) => type.value === dailyGraphType)?.label || 'Line'}`,
  ].filter(Boolean);

  const exportAnalyticsChart = async () => {
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
      const link = document.createElement('a');
      const metric = selectedTrend?.label || 'trooper-daily-graph';
      link.download = `${metric.toLowerCase().replace(/[^a-z0-9]+/gu, '-') || 'trooper-daily-graph'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      onToast('success', 'Graph downloaded.');
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      onToast('error', 'Unable to export this graph.');
    };

    image.src = url;
  };

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
          <form onSubmit={searchTrooperDailies} className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto_auto]">
          <input
            value={dailySearch}
            onChange={(event) => setDailySearch(event.target.value)}
            placeholder="Name, email, PE, badge, rank, district..."
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
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
          <select value={dailyDistrict} onChange={(event) => setDailyDistrict(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
            <option value="">All Districts</option>
            {districtOptions.map((district) => <option key={district}>{district}</option>)}
          </select>
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
                View overall data, search a user, or narrow the graph to a district.
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
            <button type="button" onClick={clearTrooperDailyAnalyticsFilters} className="btn-secondary" aria-label="Show overall analytics" title="Overall Data">
              Overall
            </button>
          </form>

          {dailyAnalyticsError && <div className="error mb-4">{dailyAnalyticsError}</div>}
          {dailyAnalyticsLoading && !dailyAnalytics ? (
            <div className="loading">Loading Trooper Daily analytics...</div>
          ) : dailyAnalytics ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
                {[
                  { label: 'Reports', value: formatMetric(dailyAnalytics.totals.totalReports), icon: FileText },
                  { label: 'Total Hours', value: formatMetric(dailyAnalytics.totals.totalHours, 1), icon: Clock },
                  { label: 'Avg Hours', value: formatMetric(dailyAnalytics.totals.averageHours, 1), icon: Activity },
                  { label: 'Troopers', value: formatMetric(dailyAnalytics.totals.uniqueTroopers), icon: Users },
                ].map((metric) => {
                  const MetricIcon = metric.icon;
                  return (
                    <div key={metric.label} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                        <MetricIcon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{metric.label}</p>
                        <p className="truncate text-lg font-black text-gray-900 dark:text-gray-50">{metric.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Trooper Daily Graph</h4>
                    <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Select one report field and a date range.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedTrend?.key || selectedAnalyticsMetric}
                      onChange={(event) => setSelectedAnalyticsMetric(event.target.value)}
                      className="max-w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-950"
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
                </div>

                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {activeGraphChips.map((chip) => (
                    <span key={chip} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {chip}
                    </span>
                  ))}
                </div>

                <details className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                  <summary className="cursor-pointer text-sm font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Advanced</summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto_auto]">
                  <select
                    value={dailyCompareMode}
                    onChange={(event) => changeCompareMode(event.target.value as DailyCompareMode)}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-900"
                    aria-label="Compare graph mode"
                  >
                    <option value="none">No Compare</option>
                    <option value="user">Compare User</option>
                    <option value="district">Compare District</option>
                  </select>
                  {dailyCompareMode === 'user' ? (
                    <div className="relative">
                      <input
                        value={compareSearch}
                        onChange={(event) => {
                          setCompareSearch(event.target.value);
                          setSelectedCompareUserQuery('');
                          setIsCompareUserSearchOpen(true);
                        }}
                        onFocus={() => {
                          if (compareUserResults.length > 0) {
                            setIsCompareUserSearchOpen(true);
                          }
                        }}
                        placeholder="Start typing a user name..."
                        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                      />
                      {isCompareUserSearchOpen && (compareUserResults.length > 0 || compareUserSearchLoading) && (
                        <div className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-950">
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
                  ) : dailyCompareMode === 'district' ? (
                    <select
                      value={compareDistrict}
                      onChange={(event) => setCompareDistrict(event.target.value)}
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">Choose district</option>
                      {districtOptions.map((district) => <option key={district}>{district}</option>)}
                    </select>
                  ) : (
                    <div className="rounded border border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      Compare another user or district on the same graph.
                    </div>
                  )}
                  <button type="button" onClick={refreshCompareAnalytics} disabled={dailyCompareMode === 'none' || compareAnalyticsLoading} className="btn-secondary" aria-label="Refresh comparison" title="Refresh Compare">
                    {compareAnalyticsLoading ? 'Loading' : 'Compare'}
                  </button>
                  <button type="button" onClick={exportAnalyticsChart} className="btn-secondary" aria-label="Download graph" title="Download Graph">
                    <Download size={16} />
                  </button>
                  </div>
                </details>
                {compareAnalyticsError && <div className="error mb-4">{compareAnalyticsError}</div>}

                {selectedTrend ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-gray-900 dark:text-gray-100">{selectedTrend.label}</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{selectedTrend.section}</p>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-black text-accent">Total {formatMetric(selectedTrend.total, 1)}</span>
                    </div>
                    {dailyCompareMode !== 'none' && compareSelectedTrend && (
                      <div className="mb-3 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {chartSeries.map((item) => (
                          <span key={item.name} className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div ref={analyticsChartRef} className="h-72">
                      <AnalyticsChart series={chartSeries} graphType={dailyGraphType} height={260} />
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300">
                    <p className="font-black text-gray-900 dark:text-gray-100">No graph data for this view yet.</p>
                    <p className="mt-1">Try a wider date range, switch to Overall, choose another district, or select a different metric.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => applyDailyAnalyticsRange('1y')} className="btn-secondary">1 Year</button>
                      <button type="button" onClick={clearTrooperDailyAnalyticsFilters} className="btn-secondary">Overall</button>
                    </div>
                  </div>
                )}
              </div>

              <details className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <summary className="cursor-pointer text-sm font-black uppercase tracking-wide text-gray-700 dark:text-gray-200">Metric Shortcuts</summary>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                  {dailyActivitySections.map((section) => (
                    <section key={section.title} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                      <h5 className="mb-3 text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">{section.title}</h5>
                      <div className="space-y-2">
                        {section.totals.slice(0, 10).map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setSelectedAnalyticsMetric(item.key)}
                            className="flex w-full items-center justify-between gap-3 rounded border border-transparent px-2 py-1.5 text-left text-sm font-semibold text-gray-700 transition hover:border-accent/30 hover:bg-white dark:text-gray-200 dark:hover:bg-gray-900"
                          >
                            <span className="truncate">{item.label}</span>
                            <span className="shrink-0 font-black text-gray-950 dark:text-white">{formatMetric(item.value, 1)}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </details>
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
                        <RotateCcw size={16} />
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
