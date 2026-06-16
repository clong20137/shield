import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, Eye, EyeOff, Pencil, Save, Sparkles, Trash2, X } from 'lucide-react';
import { AuthAccount, CalendarEntry, CalendarShortcut, authService, calendarService, reminderService } from '../services/api';
import { districtOptions } from '../constants/districts';

type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;
type TimePeriod = 'AM' | 'PM';
type CalendarView = 'day' | 'week' | 'month';
type BackendDraftStatus = 'idle' | 'saving' | 'saved' | 'error';
type StoredTrooperDailyDraft = {
  form: CalendarEntryForm;
  editingEntryId: string | null;
  savedAt: number;
};

const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty'];
const narrativeCharacterLimit = 1000;
const dailyInputCharacterLimit = 5;
const trooperDailyDraftStoragePrefix = 'shield_trooper_daily_draft';

const entryColors = [
  { label: 'Accent', value: '#9C865C' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Green', value: '#16A34A' },
  { label: 'Orange', value: '#EA580C' },
  { label: 'Red', value: '#DC2626' },
  { label: 'Purple', value: '#7C3AED' },
];

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

const timeDetailFields = new Set<string>([
  'regularDutyStartTime',
  'regularDutyEndTime',
  'splitStartTime',
  'splitEndTime',
  'secondSplitStartTime',
  'secondSplitEndTime',
  'thirdSplitStartTime',
  'thirdSplitEndTime',
]);

const mileageDetailFields = new Set<string>(['regularDutyMiles']);

const attendanceHourFields = [
  'regularDutyHours',
  'compHoursUsed',
  'personalLeaveHours',
  'vacationHours',
  'holidayHours',
  'compOtHoursEarned',
  'injuryIllnessHours',
];

const dutyActivityHourFields = [
  'patrolHours',
  'crashInvestHours',
  'trafficCourtHours',
  'incidentReportHours',
  'criminalInvestHours',
  'criminalCourtHours',
  'mealBreakHours',
];

const numericDetailFields: string[] = trooperDailySections
  .flatMap((section) => section.fields.map(([key]) => key))
  .filter((key) => !timeDetailFields.has(key));

const wholeNumberDetailFields = new Set<string>(
  trooperDailySections
    .filter((section) => !['Regular Duty', 'Attendance Hours', 'Duty Hours'].includes(section.title))
    .flatMap((section) => section.fields.map(([key]) => key)),
);

const getDefaultDistrict = (currentUser?: AuthAccount) =>
  currentUser?.district && districtOptions.includes(currentUser.district)
    ? currentUser.district
    : districtOptions[0];

const createDefaultEntryForm = (date: string, currentUser?: AuthAccount): CalendarEntryForm => ({
  category: 'Trooper Daily',
  date,
  dutyHours: '',
  districtWorked: getDefaultDistrict(currentUser),
  specialStatus: specialStatusOptions[0],
  color: entryColors[0].value,
  submissionStatus: 'Draft',
  details: {},
});

const createEntryFormFromEntry = (entry: CalendarEntry): CalendarEntryForm => ({
  category: 'Trooper Daily',
  date: entry.date,
  dutyHours: entry.dutyHours,
  districtWorked: entry.districtWorked,
  specialStatus: entry.specialStatus,
  color: entry.color,
  submissionStatus: entry.submissionStatus || 'Submitted',
  details: entry.details || {},
});

function getTrooperDailyDraftKey(accountId: string, date: string): string {
  return `${trooperDailyDraftStoragePrefix}:${accountId}:${date}`;
}

function readTrooperDailyDraft(accountId: string, date: string): StoredTrooperDailyDraft | null {
  try {
    const rawDraft = window.localStorage.getItem(getTrooperDailyDraftKey(accountId, date));
    if (!rawDraft) {
      return null;
    }

    const draft = JSON.parse(rawDraft) as StoredTrooperDailyDraft;
    if (!draft?.form || draft.form.date !== date || typeof draft.savedAt !== 'number') {
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

function writeTrooperDailyDraft(accountId: string, form: CalendarEntryForm, editingEntryId: string | null) {
  try {
    const savedAt = Date.now();
    window.localStorage.setItem(
      getTrooperDailyDraftKey(accountId, form.date),
      JSON.stringify({
        form: { ...form, submissionStatus: 'Draft' },
        editingEntryId,
        savedAt,
      } satisfies StoredTrooperDailyDraft),
    );
    return savedAt;
  } catch {
    return null;
  }
}

function removeTrooperDailyDraft(accountId: string, date: string) {
  try {
    window.localStorage.removeItem(getTrooperDailyDraftKey(accountId, date));
  } catch {
    // Ignore local storage cleanup failures.
  }
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const startOfWeek = (date: Date) => addDays(date, -date.getDay());

const getDayLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const getShortDayLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const getReadableDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

function getApiErrorMessage(error: unknown, fallback: string): string {
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

function parseNumericDetail(details: Record<string, string>, key: string): number {
  const value = Number(details[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value || !/^\d{2}:\d{2}$/u.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function calculateTimeRangeHours(details: Record<string, string>, startKey: string, endKey: string): number {
  const start = parseTimeToMinutes(details[startKey]);
  const end = parseTimeToMinutes(details[endKey]);

  if (start === null || end === null) {
    return 0;
  }

  const minutes = end >= start ? end - start : end + 24 * 60 - start;
  return minutes / 60;
}

function formatHours(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/u, '');
}

function sanitizeDecimalInput(value: string, maxIntegerDigits?: number, maxLength = dailyInputCharacterLimit): string {
  const cleanedValue = value.replace(/[^\d.]/gu, '');
  const [rawInteger = '', ...decimalParts] = cleanedValue.split('.');
  const integerPart = (maxIntegerDigits ? rawInteger.slice(0, maxIntegerDigits) : rawInteger) || (cleanedValue.startsWith('.') ? '0' : '');
  const hasDecimal = cleanedValue.includes('.');
  const decimalPart = decimalParts.join('').slice(0, 2);
  const nextValue = hasDecimal ? `${integerPart}.${decimalPart}` : integerPart;

  return nextValue.slice(0, maxLength);
}

function sanitizeWholeNumberInput(value: string): string {
  return value.replace(/\D/gu, '').slice(0, dailyInputCharacterLimit);
}

function formatTimePart(value: number): string {
  return String(value).padStart(2, '0');
}

function parseTimeInput(value?: string): { time: string; period: TimePeriod } {
  const parsedMinutes = parseTimeToMinutes(value);
  if (parsedMinutes === null) {
    return {
      time: '',
      period: 'AM',
    };
  }

  const hours24 = Math.floor(parsedMinutes / 60);
  const minutes = parsedMinutes % 60;
  const period: TimePeriod = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return {
    time: `${formatTimePart(hours12)}:${formatTimePart(minutes)}`,
    period,
  };
}

function sanitizeTimeInput(value: string): string {
  const digits = value.replace(/\D/gu, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function buildTimeValue(time: string, period: TimePeriod): string {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time);
  if (!match) {
    return '';
  }

  const numericHour = Number(match[1]);
  const numericMinute = Number(match[2]);

  if (!Number.isFinite(numericHour) || !Number.isFinite(numericMinute) || numericHour < 1 || numericHour > 12 || numericMinute < 0 || numericMinute > 59) {
    return '';
  }

  const hours24 = period === 'PM'
    ? numericHour === 12 ? 12 : numericHour + 12
    : numericHour === 12 ? 0 : numericHour;

  return `${formatTimePart(hours24)}:${formatTimePart(numericMinute)}`;
}

function buildMilitaryTimeValue(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time);
  if (!match) return '';

  const numericHour = Number(match[1]);
  const numericMinute = Number(match[2]);
  if (!Number.isFinite(numericHour) || !Number.isFinite(numericMinute) || numericHour < 0 || numericHour > 23 || numericMinute < 0 || numericMinute > 59) {
    return '';
  }

  return `${formatTimePart(numericHour)}:${formatTimePart(numericMinute)}`;
}

function getDifferenceLabel(firstValue: number, secondValue: number): string {
  const difference = Math.abs(firstValue - secondValue);
  return difference <= 0.01 ? 'Matches' : `${formatHours(difference)} hr off`;
}

function isHourMatch(reportedHours: number, comparisonHours: number): boolean {
  return reportedHours > 0 && comparisonHours > 0 && Math.abs(reportedHours - comparisonHours) <= 0.01;
}

function areEntryFormsEqual(firstForm: CalendarEntryForm, secondForm: CalendarEntryForm): boolean {
  return JSON.stringify(firstForm) === JSON.stringify(secondForm);
}

function isDetailComplete(details: Record<string, string> | undefined, key: string): boolean {
  return Boolean(details?.[key]?.trim());
}

function isSectionComplete(details: Record<string, string> | undefined, section: typeof trooperDailySections[number]): boolean {
  return section.fields.every(([key]) => isDetailComplete(details, key));
}

function HourSummaryCard({
  label,
  value,
  tone,
  helper,
  isMatch = false,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'accent';
  helper?: string;
  isMatch?: boolean;
}) {
  return (
    <div
      className={`rounded border p-3 transition-all duration-300 ${
        isMatch
          ? 'trooper-daily-match border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100'
          : 'border-transparent'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-bold uppercase ${isMatch ? 'text-green-700 dark:text-green-200' : 'text-gray-500 dark:text-gray-400'}`}>{label}</p>
        {isMatch && <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={19} />}
      </div>
      <p className={`mt-1 text-2xl font-bold ${isMatch ? 'text-green-700 dark:text-green-200' : tone === 'accent' ? 'text-accent' : 'text-primary-500 dark:text-blue-100'}`}>
        {value}
      </p>
      {helper && (
        <p className={`text-xs font-semibold ${isMatch ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>{helper}</p>
      )}
    </div>
  );
}

function TimeDetailInput({
  value,
  onChange,
  isComplete = false,
  useMilitaryTime = false,
  fieldId,
}: {
  value: string;
  onChange: (value: string) => void;
  isComplete?: boolean;
  useMilitaryTime?: boolean;
  fieldId?: string;
}) {
  const parsedTime = parseTimeInput(value);
  const [displayTime, setDisplayTime] = useState(useMilitaryTime ? value : parsedTime.time);
  const [displayPeriod, setDisplayPeriod] = useState<TimePeriod>(parsedTime.period);

  useEffect(() => {
    setDisplayTime(useMilitaryTime ? value : parsedTime.time);
    setDisplayPeriod(parsedTime.period);
  }, [parsedTime.period, parsedTime.time, useMilitaryTime, value]);

  const commitTime = (time: string, period = displayPeriod) => {
    if (!time) {
      onChange('');
      return;
    }

    const nextValue = useMilitaryTime ? buildMilitaryTimeValue(time) : buildTimeValue(time, period);
    if (nextValue) {
      onChange(nextValue);
    }
  };

  return (
    <div className={`grid gap-2 ${useMilitaryTime ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
      <div className="relative min-w-0">
        <input
          type="text"
          value={displayTime}
          onChange={(event) => {
            const nextTime = sanitizeTimeInput(event.target.value);
            setDisplayTime(nextTime);
            commitTime(nextTime, displayPeriod);
          }}
          onBlur={(event) => {
            const sanitizedValue = sanitizeTimeInput(event.target.value);
            const [hour = '', minute = ''] = sanitizedValue.split(':');
            if (!hour || !minute) return;
            const normalizedTime = `${formatTimePart(Number(hour))}:${formatTimePart(Number(minute))}`;
            setDisplayTime(normalizedTime);
            commitTime(normalizedTime, displayPeriod);
          }}
          placeholder={useMilitaryTime ? '00:00' : 'HH:MM'}
          inputMode="numeric"
          maxLength={5}
          data-daily-field={fieldId}
          className={`w-full rounded border bg-white px-3 py-2 pr-8 text-sm transition dark:bg-gray-900 ${
            isComplete
              ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
              : 'border-gray-300 dark:border-gray-700'
          }`}
          aria-label="Time"
        />
        {isComplete && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-600 dark:text-green-300">
            <CheckCircle2 className="trooper-daily-check" size={16} />
          </span>
        )}
      </div>
      {!useMilitaryTime && <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900" aria-label="AM or PM">
        {(['AM', 'PM'] as const).map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => {
              setDisplayPeriod(period);
              commitTime(displayTime, period);
            }}
            className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
              displayPeriod === period
                ? 'bg-primary-500 text-white'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {period}
          </button>
        ))}
      </div>}
    </div>
  );
}

function calculateShiftHours(details: Record<string, string>): number {
  return (
    calculateTimeRangeHours(details, 'regularDutyStartTime', 'regularDutyEndTime') +
    calculateTimeRangeHours(details, 'splitStartTime', 'splitEndTime') +
    calculateTimeRangeHours(details, 'secondSplitStartTime', 'secondSplitEndTime') +
    calculateTimeRangeHours(details, 'thirdSplitStartTime', 'thirdSplitEndTime')
  );
}

function CalendarPage({
  currentUser,
  onAccountUpdate,
  onToast,
  useMilitaryTime = false,
  isFloatingApp = false,
}: {
  currentUser: AuthAccount;
  onAccountUpdate?: (account: AuthAccount) => void;
  onToast?: (type: 'success' | 'error' | 'info', message: string) => void;
  useMilitaryTime?: boolean;
  isFloatingApp?: boolean;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [calendarFocusDate, setCalendarFocusDate] = useState(() => new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<CalendarEntryForm>(() =>
    createDefaultEntryForm(formatDateKey(new Date()), currentUser),
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [entryPendingDelete, setEntryPendingDelete] = useState<CalendarEntry | null>(null);
  const [activeDailyPanel, setActiveDailyPanel] = useState<string>('Administrative');
  const [dailyUseMilitaryTime, setDailyUseMilitaryTime] = useState(useMilitaryTime);
  const [hiddenDailySections, setHiddenDailySections] = useState<string[]>(currentUser.trooperDailyHiddenSections || []);
  const [shortcuts, setShortcuts] = useState<CalendarShortcut[]>([]);
  const [selectedShortcutId, setSelectedShortcutId] = useState('');
  const [shortcutName, setShortcutName] = useState('');
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isDutyHoursManual, setIsDutyHoursManual] = useState(false);
  const [isReminderFormOpen, setIsReminderFormOpen] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderPriority, setReminderPriority] = useState<'Low' | 'Normal' | 'High' | 'Critical'>('Normal');
  const [reminderNotes, setReminderNotes] = useState('');
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [dailyDraftSavedAt, setDailyDraftSavedAt] = useState<number | null>(null);
  const [backendDraftStatus, setBackendDraftStatus] = useState<BackendDraftStatus>('idle');
  const [backendDraftSavedAt, setBackendDraftSavedAt] = useState<number | null>(null);
  const lastAutoDutyHoursRef = useRef('');
  const dailyFormRef = useRef<HTMLFormElement | null>(null);
  const skipNextDailyDraftWriteRef = useRef(false);
  const backendAutosaveRequestRef = useRef(0);
  const dailyUndoStackRef = useRef<CalendarEntryForm[]>([]);
  const dailyRedoStackRef = useRef<CalendarEntryForm[]>([]);
  const previousEntryFormRef = useRef<CalendarEntryForm | null>(entryForm);
  const isRestoringDailyHistoryRef = useRef(false);
  const pendingDailyFocusRef = useRef<'field' | 'submit' | null>(null);

  const actor = {
    actorId: currentUser.id,
    actorName: currentUser.displayName || currentUser.email,
  };

  useEffect(() => {
    setDailyUseMilitaryTime(useMilitaryTime);
  }, [useMilitaryTime]);

  const loadCalendarEntries = async (showLoading = true) => {
    if (showLoading) {
      setIsCalendarLoading(true);
    }
    setCalendarError(null);
    try {
      const response = await calendarService.getAll(currentUser.id);
      setEntries(response.data);
    } catch (err) {
      console.error('Failed to load calendar entries:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to load calendar entries.'));
    } finally {
      setIsCalendarLoading(false);
    }
  };

  const loadShortcuts = async () => {
    try {
      const response = await calendarService.getShortcuts();
      setShortcuts(response.data);
    } catch (err) {
      console.error('Failed to load calendar shortcuts:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to load daily shortcuts.'));
    }
  };

  useEffect(() => {
    loadCalendarEntries();
    void loadShortcuts();
    const handleCalendarUpdate = () => loadCalendarEntries(false);

    window.addEventListener('shield:calendar-updated', handleCalendarUpdate);
    return () => window.removeEventListener('shield:calendar-updated', handleCalendarUpdate);
  }, [currentUser.id]);

  useEffect(() => {
    setHiddenDailySections(currentUser.trooperDailyHiddenSections || []);
  }, [currentUser.trooperDailyHiddenSections]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (entryPendingDelete) {
        event.stopPropagation();
        setEntryPendingDelete(null);
        return;
      }

      if (selectedDate) {
        event.stopPropagation();
        setSelectedDate(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [entryPendingDelete, selectedDate]);

  const openDay = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const existingEntry = entries.find((entry) => entry.date === dateKey);
    const localDraft = readTrooperDailyDraft(currentUser.id, dateKey);
    const existingUpdatedAt = existingEntry?.updatedAt ? new Date(existingEntry.updatedAt).getTime() : 0;
    const shouldRestoreLocalDraft = Boolean(localDraft && localDraft.savedAt > existingUpdatedAt);
    const nextForm = shouldRestoreLocalDraft && localDraft
      ? localDraft.form
      : existingEntry
        ? createEntryFormFromEntry(existingEntry)
        : createDefaultEntryForm(dateKey, currentUser);
    backendAutosaveRequestRef.current += 1;
    dailyUndoStackRef.current = [];
    dailyRedoStackRef.current = [];
    previousEntryFormRef.current = nextForm;
    isRestoringDailyHistoryRef.current = false;
    pendingDailyFocusRef.current = null;
    setCalendarFocusDate(new Date(year, month - 1, day));
    setSelectedDate(dateKey);
    setEntryForm(nextForm);
    setIsDutyHoursManual(Boolean(existingEntry));
    lastAutoDutyHoursRef.current = '';
    setEditingEntryId(shouldRestoreLocalDraft && localDraft ? localDraft.editingEntryId || existingEntry?.id || null : existingEntry?.id || null);
    setDailyDraftSavedAt(shouldRestoreLocalDraft && localDraft ? localDraft.savedAt : null);
    setBackendDraftStatus(existingEntry?.submissionStatus === 'Draft' && !shouldRestoreLocalDraft ? 'saved' : 'idle');
    setBackendDraftSavedAt(existingEntry?.submissionStatus === 'Draft' && existingEntry.updatedAt && !shouldRestoreLocalDraft ? new Date(existingEntry.updatedAt).getTime() : null);
    setIsReminderFormOpen(false);
    setReminderTitle('');
    setReminderPriority('Normal');
    setReminderNotes('');
  };

  useEffect(() => {
    if (!selectedDate) {
      previousEntryFormRef.current = entryForm;
      dailyUndoStackRef.current = [];
      dailyRedoStackRef.current = [];
      return;
    }

    if (isRestoringDailyHistoryRef.current) {
      previousEntryFormRef.current = entryForm;
      isRestoringDailyHistoryRef.current = false;
      return;
    }

    const previousForm = previousEntryFormRef.current;
    if (previousForm && !areEntryFormsEqual(previousForm, entryForm)) {
      dailyUndoStackRef.current = [...dailyUndoStackRef.current.slice(-39), previousForm];
      dailyRedoStackRef.current = [];
    }

    previousEntryFormRef.current = entryForm;
  }, [entryForm, selectedDate]);

  useEffect(() => {
    if (!pendingDailyFocusRef.current) {
      return undefined;
    }

    const focusTarget = pendingDailyFocusRef.current;
    pendingDailyFocusRef.current = null;
    const timer = window.setTimeout(() => {
      const selector = focusTarget === 'submit'
        ? '[data-daily-submit]'
        : '[data-daily-field]:not([disabled])';
      dailyFormRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeDailyPanel]);

  useEffect(() => {
    if (!selectedDate || entryForm.date !== selectedDate) {
      return undefined;
    }

    if (skipNextDailyDraftWriteRef.current) {
      skipNextDailyDraftWriteRef.current = false;
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const savedAt = writeTrooperDailyDraft(currentUser.id, entryForm, editingEntryId);
      if (savedAt) {
        setDailyDraftSavedAt(savedAt);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentUser.id, editingEntryId, entryForm, selectedDate]);

  useEffect(() => {
    if (!selectedDate || entryForm.date !== selectedDate) {
      return undefined;
    }

    if (entryForm.submissionStatus === 'Submitted') {
      return undefined;
    }

    const hours = Number(entryForm.dutyHours || 0);
    if (!entryForm.date || !Number.isFinite(hours) || hours < 0 || hours > 24) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const requestId = backendAutosaveRequestRef.current + 1;
      backendAutosaveRequestRef.current = requestId;
      setBackendDraftStatus('saving');

      const payload = {
        ...entryForm,
        category: 'Trooper Daily' as const,
        submissionStatus: 'Draft' as const,
        dutyHours: hours.toFixed(2).replace(/\.?0+$/u, ''),
        accountId: currentUser.id,
        entryId: editingEntryId,
      };

      void calendarService.autosaveDraft(payload)
        .then((response) => {
          if (backendAutosaveRequestRef.current !== requestId) {
            return;
          }

          setEntries((currentEntries) => {
            const hasEntry = currentEntries.some((entry) => entry.id === response.data.id);
            if (hasEntry) {
              return currentEntries.map((entry) => (entry.id === response.data.id ? response.data : entry));
            }

            return [response.data, ...currentEntries];
          });
          setEditingEntryId(response.data.id);
          setBackendDraftStatus('saved');
          setBackendDraftSavedAt(Date.now());
        })
        .catch((err) => {
          if (backendAutosaveRequestRef.current !== requestId) {
            return;
          }

          console.error('Failed to autosave calendar draft:', err);
          setBackendDraftStatus('error');
        });
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [currentUser.id, editingEntryId, entryForm, selectedDate]);

  const undoDailyChange = () => {
    const previousForm = dailyUndoStackRef.current.pop();
    if (!previousForm) {
      return;
    }

    dailyRedoStackRef.current.push(entryForm);
    isRestoringDailyHistoryRef.current = true;
    setEntryForm(previousForm);
  };

  const redoDailyChange = () => {
    const nextForm = dailyRedoStackRef.current.pop();
    if (!nextForm) {
      return;
    }

    dailyUndoStackRef.current.push(entryForm);
    isRestoringDailyHistoryRef.current = true;
    setEntryForm(nextForm);
  };

  const advanceDailyPanel = () => {
    const currentIndex = dailyPanelOptions.indexOf(activeDailyPanel);
    const nextPanel = dailyPanelOptions
      .slice(currentIndex + 1)
      .find((panel) => !hiddenDailySections.includes(panel));

    if (nextPanel) {
      pendingDailyFocusRef.current = 'field';
      setActiveDailyPanel(nextPanel);
      return;
    }

    pendingDailyFocusRef.current = 'submit';
    window.setTimeout(() => {
      pendingDailyFocusRef.current = null;
      dailyFormRef.current?.querySelector<HTMLElement>('[data-daily-submit]')?.focus();
    }, 0);
  };

  const handleDailyKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    const key = event.key.toLowerCase();
    const isCommandKey = event.ctrlKey || event.metaKey;

    if (isCommandKey && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redoDailyChange();
      } else {
        undoDailyChange();
      }
      return;
    }

    if (isCommandKey && key === 'y') {
      event.preventDefault();
      redoDailyChange();
      return;
    }

    if (isCommandKey && key === 's') {
      event.preventDefault();
      void saveEntry(event, 'Draft');
      return;
    }

    if (isCommandKey && key === 'enter') {
      event.preventDefault();
      void saveEntry(event, 'Submitted');
      return;
    }

    if (key !== 'enter' || event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      return;
    }

    const fields = Array.from(dailyFormRef.current?.querySelectorAll<HTMLElement>('[data-daily-field]') || [])
      .filter((field) => !field.hasAttribute('disabled'));
    const currentIndex = fields.indexOf(target);
    if (currentIndex === -1) {
      return;
    }

    event.preventDefault();
    const nextField = fields[currentIndex + 1];
    if (nextField) {
      nextField.focus();
      return;
    }

    advanceDailyPanel();
  };

  const changeMonth = (offset: number) => {
    setCalendarMonth((currentMonth) => {
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(currentMonth.getMonth() + offset);
      return nextMonth;
    });
  };

  const changeCalendarPeriod = (offset: number) => {
    if (calendarView === 'month') {
      changeMonth(offset);
      setCalendarFocusDate((currentDate) => {
        const nextDate = new Date(currentDate);
        nextDate.setMonth(currentDate.getMonth() + offset);
        return nextDate;
      });
      return;
    }

    const days = calendarView === 'week' ? offset * 7 : offset;
    setCalendarFocusDate((currentDate) => {
      const nextDate = addDays(currentDate, days);
      setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
      return nextDate;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setCalendarFocusDate(today);
  };

  const saveEntry = async (event: React.SyntheticEvent, submissionStatus: CalendarEntry['submissionStatus'] = 'Draft') => {
    event.preventDefault();

    const hours = Number(entryForm.dutyHours);

    if (!entryForm.date || !entryForm.dutyHours.trim() || Number.isNaN(hours) || hours < 0) {
      setActiveDailyPanel('Administrative');
      setCalendarError('Date and duty hours are required.');
      return;
    }

    setCalendarError(null);
    try {
      const payload = {
        ...entryForm,
        submissionStatus,
        dutyHours: hours.toFixed(2).replace(/\.?0+$/u, ''),
        accountId: currentUser.id,
        ...actor,
      };

      const existingEntryForDate = entries.find((entry) => entry.date === entryForm.date);
      const targetEntryId = editingEntryId || existingEntryForDate?.id || null;

      if (targetEntryId) {
        const response = await calendarService.update(targetEntryId, payload);
        setEntries((currentEntries) =>
          currentEntries.map((entry) => (entry.id === targetEntryId ? response.data : entry)),
        );
        removeTrooperDailyDraft(currentUser.id, response.data.date);
        skipNextDailyDraftWriteRef.current = true;
        setSelectedDate(response.data.date);
        setEditingEntryId(response.data.id);
        setEntryForm(createEntryFormFromEntry(response.data));
      } else {
        const response = await calendarService.create(payload);
        setEntries((currentEntries) => [response.data, ...currentEntries]);
        removeTrooperDailyDraft(currentUser.id, response.data.date);
        skipNextDailyDraftWriteRef.current = true;
        setSelectedDate(response.data.date);
        setEditingEntryId(response.data.id);
        setEntryForm(createEntryFormFromEntry(response.data));
      }
      setDailyDraftSavedAt(null);
      setBackendDraftStatus('saved');
      setBackendDraftSavedAt(Date.now());
      setIsDutyHoursManual(true);
      lastAutoDutyHoursRef.current = '';
    } catch (err) {
      console.error('Failed to save calendar entry:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to save calendar entry.'));
    }
  };

  const deleteEntry = async (entry: CalendarEntry) => {
    setCalendarError(null);
    try {
      await calendarService.delete(entry.id, { ...actor, accountId: currentUser.id });
      setEntries((currentEntries) => currentEntries.filter((currentEntry) => currentEntry.id !== entry.id));
      removeTrooperDailyDraft(currentUser.id, entry.date);
      if (editingEntryId === entry.id) {
        setEditingEntryId(null);
        skipNextDailyDraftWriteRef.current = true;
        setEntryForm(createDefaultEntryForm(selectedDate || entry.date, currentUser));
        setIsDutyHoursManual(false);
        lastAutoDutyHoursRef.current = '';
      }
      setDailyDraftSavedAt(null);
      setBackendDraftStatus('idle');
      setBackendDraftSavedAt(null);
      setEntryPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete calendar entry:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to delete calendar entry.'));
    }
  };

  const updateDailyDetail = (key: string, value: string) => {
    setEntryForm((currentForm) => {
      const nextValue = wholeNumberDetailFields.has(key)
        ? sanitizeWholeNumberInput(value)
        : numericDetailFields.includes(key)
          ? sanitizeDecimalInput(value, mileageDetailFields.has(key) ? 5 : undefined)
        : key === 'narrative'
          ? value.slice(0, narrativeCharacterLimit)
        : value;
      const details = {
        ...(currentForm.details || {}),
        [key]: nextValue,
      };
      const nextForm = {
        ...currentForm,
        details,
      };

      if (timeDetailFields.has(key) && !isDutyHoursManual) {
        const shiftHours = calculateShiftHours(details);
        if (shiftHours > 0) {
          const formattedHours = formatHours(shiftHours);
          nextForm.dutyHours = formattedHours;
          lastAutoDutyHoursRef.current = formattedHours;
        }
      }

      return nextForm;
    });
  };

  const updateDutyHours = (value: string) => {
    const nextValue = sanitizeDecimalInput(value);
    setIsDutyHoursManual(nextValue !== '' && nextValue !== lastAutoDutyHoursRef.current);
    setEntryForm((currentForm) => ({ ...currentForm, dutyHours: nextValue }));
  };

  const applyShortcut = (shortcut: CalendarShortcut) => {
    setEntryForm((currentForm) => ({
      ...currentForm,
      dutyHours: shortcut.dutyHours,
      districtWorked: shortcut.districtWorked || currentForm.districtWorked,
      specialStatus: shortcut.specialStatus,
      color: shortcut.color,
      details: {
        ...(currentForm.details || {}),
        ...(shortcut.details || {}),
      },
    }));
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const startEditingShortcut = (shortcut: CalendarShortcut) => {
    setSelectedShortcutId(shortcut.id);
    setShortcutName(shortcut.name);
    setEditingShortcutId(shortcut.id);
    applyShortcut(shortcut);
  };

  const resetShortcutEditor = () => {
    setShortcutName('');
    setEditingShortcutId(null);
  };

  const saveShortcut = async () => {
    if (!shortcutName.trim()) {
      setCalendarError('Enter a shortcut name.');
      return;
    }

    setIsSavingShortcut(true);
    setCalendarError(null);

    const payload = {
      ownerAccountId: currentUser.id,
      name: shortcutName.trim(),
      dutyHours: entryForm.dutyHours || '0',
      districtWorked: entryForm.districtWorked,
      specialStatus: entryForm.specialStatus,
      color: entryForm.color,
      details: entryForm.details || {},
    };

    try {
      if (editingShortcutId) {
        const response = await calendarService.updateShortcut(editingShortcutId, payload);
        setShortcuts((items) => items.map((item) => (item.id === editingShortcutId ? response.data : item)));
      } else {
        const response = await calendarService.createShortcut(payload);
        setShortcuts((items) => [...items, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      resetShortcutEditor();
    } catch (err) {
      console.error('Failed to save shortcut:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to save shortcut.'));
    } finally {
      setIsSavingShortcut(false);
    }
  };

  const deleteShortcut = async (shortcut: CalendarShortcut) => {
    setCalendarError(null);
    try {
      await calendarService.deleteShortcut(shortcut.id);
      setShortcuts((items) => items.filter((item) => item.id !== shortcut.id));
      if (selectedShortcutId === shortcut.id) {
        setSelectedShortcutId('');
      }
      if (editingShortcutId === shortcut.id) {
        resetShortcutEditor();
      }
    } catch (err) {
      console.error('Failed to delete shortcut:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to delete shortcut.'));
    }
  };

  const saveHiddenDailySections = async (sections: string[]) => {
    setHiddenDailySections(sections);
    try {
      const response = await authService.updateTrooperDailyPreferences(currentUser.id, sections);
      if (response.data.account) {
        onAccountUpdate?.(response.data.account);
      }
    } catch (err) {
      console.error('Failed to save Trooper Daily section preferences:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to save section preferences.'));
      setHiddenDailySections(currentUser.trooperDailyHiddenSections || []);
    }
  };

  const hideDailySection = (sectionTitle: string) => {
    if (hiddenDailySections.includes(sectionTitle)) {
      return;
    }

    if (activeDailyPanel === sectionTitle) {
      setActiveDailyPanel('Administrative');
    }
    void saveHiddenDailySections([...hiddenDailySections, sectionTitle]);
  };

  const showDailySection = (sectionTitle: string) => {
    setActiveDailyPanel(sectionTitle);
    void saveHiddenDailySections(hiddenDailySections.filter((title) => title !== sectionTitle));
  };

  const fillBlankNumericDetailsWithZero = () => {
    setEntryForm((currentForm) => {
      const details = { ...(currentForm.details || {}) };
      numericDetailFields.forEach((key) => {
        if (!details[key]) {
          details[key] = '0';
        }
      });

      return {
        ...currentForm,
        details,
      };
    });
  };

  const copyPreviousDaily = () => {
    if (!selectedDate) {
      return;
    }

    const previousEntry = entries
      .filter((entry) => entry.date < selectedDate)
      .sort((firstEntry, secondEntry) => secondEntry.date.localeCompare(firstEntry.date))[0];

    if (!previousEntry) {
      setCalendarError('No previous Trooper Daily entry found to copy.');
      return;
    }

    setCalendarError(null);
    setEntryForm({
      category: 'Trooper Daily',
      date: selectedDate,
      dutyHours: previousEntry.dutyHours,
      districtWorked: previousEntry.districtWorked || getDefaultDistrict(currentUser),
      specialStatus: previousEntry.specialStatus,
      color: previousEntry.color,
      submissionStatus: 'Draft',
      details: { ...(previousEntry.details || {}) },
    });
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const createCalendarReminder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDate || !reminderTitle.trim()) {
      setCalendarError('Enter a reminder title.');
      return;
    }

    setIsSavingReminder(true);
    setCalendarError(null);
    try {
      await reminderService.create(reminderTitle.trim(), selectedDate, reminderPriority, reminderNotes.trim());
      window.dispatchEvent(new CustomEvent('shield:reminder-updated'));
      setReminderTitle('');
      setReminderPriority('Normal');
      setReminderNotes('');
      setIsReminderFormOpen(false);
      onToast?.('success', 'Reminder created.');
    } catch (err) {
      console.error('Failed to create reminder:', err);
      const message = getApiErrorMessage(err, 'Failed to create reminder.');
      setCalendarError(message);
      onToast?.('error', message);
    } finally {
      setIsSavingReminder(false);
    }
  };

  const visibleEntries = entries.filter((entry) => {
    const matchesDistrict = !districtFilter || entry.districtWorked === districtFilter;
    const matchesStatus = !statusFilter || entry.specialStatus === statusFilter;
    return matchesDistrict && matchesStatus;
  });

  const editingEntry = editingEntryId ? entries.find((entry) => entry.id === editingEntryId) : null;

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const leadingEmptyDays = monthStart.getDay();
  const calendarCells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - leadingEmptyDays + 1;

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return null;
    }

    return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNumber);
  });
  const todayKey = formatDateKey(new Date());
  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthEntries = visibleEntries.filter((entry) => entry.date.startsWith(monthKey));
  const weekStart = startOfWeek(calendarFocusDate);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekDateKeys = weekDates.map(formatDateKey);
  const focusDateKey = formatDateKey(calendarFocusDate);
  const activeViewEntries = calendarView === 'month'
    ? monthEntries
    : calendarView === 'week'
      ? visibleEntries.filter((entry) => weekDateKeys.includes(entry.date))
      : visibleEntries.filter((entry) => entry.date === focusDateKey);
  const activeViewDutyHours = activeViewEntries.reduce((total, entry) => total + (Number(entry.dutyHours) || 0), 0);
  const activeViewLabel = calendarView === 'month'
    ? getMonthLabel(calendarMonth)
    : calendarView === 'week'
      ? `${getShortDayLabel(weekDates[0])} - ${getShortDayLabel(weekDates[6])}`
      : getDayLabel(calendarFocusDate);
  const reportedDutyHours = Number(entryForm.dutyHours) || 0;
  const entryDetails = entryForm.details || {};
  const calculatedShiftHours = calculateShiftHours(entryDetails);
  const attendanceHours = attendanceHourFields.reduce((total, key) => total + parseNumericDetail(entryDetails, key), 0);
  const dutyActivityHours = dutyActivityHourFields.reduce((total, key) => total + parseNumericDetail(entryDetails, key), 0);
  const hasShiftTime = calculatedShiftHours > 0;
  const hasReportedHours = reportedDutyHours > 0;
  const shiftHoursMatch = isHourMatch(reportedDutyHours, calculatedShiftHours);
  const attendanceHoursMatch = isHourMatch(reportedDutyHours, attendanceHours);
  const dutyActivityHoursMatch = isHourMatch(reportedDutyHours, dutyActivityHours);
  const hasHourMismatch =
    hasReportedHours &&
    ((hasShiftTime && Math.abs(calculatedShiftHours - reportedDutyHours) > 0.01) ||
      (attendanceHours > 0 && Math.abs(attendanceHours - reportedDutyHours) > 0.01) ||
      (dutyActivityHours > 0 && Math.abs(dutyActivityHours - reportedDutyHours) > 0.01));
  const visibleDailySections = useMemo(
    () => trooperDailySections.filter((section) => !hiddenDailySections.includes(section.title)),
    [hiddenDailySections],
  );
  const dailyPanelOptions = useMemo(
    () => ['Administrative', ...trooperDailySections.map((section) => section.title), 'Narrative'],
    [],
  );
  const activeDailySection = visibleDailySections.find((section) => section.title === activeDailyPanel);
  const activeHourGuidance = (() => {
    if (!activeDailySection || !hasReportedHours) {
      return null;
    }

    const sectionComparisons: Record<string, { label: string; value: number; isMatch: boolean }> = {
      'Regular Duty': { label: 'Shift time', value: calculatedShiftHours, isMatch: shiftHoursMatch },
      'Attendance Hours': { label: 'Attendance hours', value: attendanceHours, isMatch: attendanceHoursMatch },
      'Duty Hours': { label: 'Duty activity hours', value: dutyActivityHours, isMatch: dutyActivityHoursMatch },
    };
    const comparison = sectionComparisons[activeDailySection.title];
    if (!comparison || comparison.value <= 0) {
      return null;
    }

    const difference = Math.abs(comparison.value - reportedDutyHours);
    return {
      ...comparison,
      difference,
      direction: comparison.value > reportedDutyHours ? 'over' : 'under',
    };
  })();

  useEffect(() => {
    if (!dailyPanelOptions.includes(activeDailyPanel)) {
      setActiveDailyPanel('Administrative');
    }
  }, [activeDailyPanel, dailyPanelOptions]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {(!selectedDate || isFloatingApp) && (
      <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => changeCalendarPeriod(-1)} className="btn-secondary" aria-label="Previous calendar period" title="Previous">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-32 text-center text-lg font-bold text-primary-500 dark:text-blue-100 sm:min-w-40 sm:text-2xl">
            {activeViewLabel}
          </div>
          <button type="button" onClick={() => changeCalendarPeriod(1)} className="btn-secondary" aria-label="Next calendar period" title="Next">
            <ChevronRight size={16} />
          </button>
          <button type="button" onClick={goToToday} className="btn-secondary" aria-label="Go to today" title="Today">
            <CalendarClock size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Personal duty information for {currentUser.displayName || currentUser.email}.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950">
        {(['day', 'week', 'month'] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setCalendarView(view)}
            className={`rounded px-3 py-2 text-sm font-bold capitalize transition ${
              calendarView === view
                ? 'bg-primary-500 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
          <option value="">All Districts</option>
          {districtOptions.map((district) => <option key={district}>{district}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
          <option value="">All Special Status</option>
          {specialStatusOptions.map((status) => <option key={status}>{status}</option>)}
        </select>
        <button
          type="button"
          onClick={() => {
            setDistrictFilter('');
            setStatusFilter('');
          }}
          aria-label="Clear calendar filters"
          title="Clear Filters"
          className="btn-secondary"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400">This {calendarView}</p>
          <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{activeViewEntries.length}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400">Duty Hours</p>
          <p className="mt-1 text-2xl font-bold text-accent">{activeViewDutyHours.toFixed(2).replace(/\.?0+$/u, '')}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400">Visible Entries</p>
          <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{visibleEntries.length}</p>
        </div>
      </div>

      {calendarError && <div className="error">{calendarError}</div>}
      {isCalendarLoading && <div className="loading">Loading calendar entries...</div>}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {calendarView === 'month' && (
        <>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 sm:gap-2 sm:text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="min-h-14 rounded border border-transparent sm:min-h-24" />;
            }

            const dateKey = formatDateKey(date);
            const dayEntries = visibleEntries.filter((entry) => entry.date === dateKey);
            const isToday = dateKey === todayKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => openDay(dateKey)}
                className={`min-h-14 rounded border bg-gray-50 p-1 text-left transition hover:border-accent hover:bg-accent/5 dark:bg-gray-950 sm:min-h-24 sm:p-2 ${
                  isToday
                    ? 'border-accent ring-2 ring-accent/20'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="mb-1 flex items-center justify-between sm:mb-2">
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-100 sm:text-sm">{date.getDate()}</span>
                  {dayEntries.length > 0 && (
                    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent sm:px-2 sm:text-xs">
                      {dayEntries.length}
                    </span>
                  )}
                </div>
                <div className="hidden space-y-1 sm:block">
                  {dayEntries.slice(0, 3).map((entry) => (
                    <div
                      key={entry.id}
                      className="truncate rounded px-2 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: entry.color }}
                      title={`${entry.dutyHours} hours - ${entry.districtWorked}`}
                    >
                      {entry.submissionStatus === 'Draft' ? 'Draft - ' : ''}{entry.dutyHours}h {entry.districtWorked}
                    </div>
                  ))}
                  {dayEntries.length > 3 && (
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      +{dayEntries.length - 3} more
                    </div>
                  )}
                </div>
                {dayEntries.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 sm:hidden">
                    {dayEntries.slice(0, 4).map((entry) => (
                      <span key={entry.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        </>
        )}

        {calendarView === 'week' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
            {weekDates.map((date) => {
              const dateKey = formatDateKey(date);
              const dayEntries = visibleEntries.filter((entry) => entry.date === dateKey);
              const isToday = dateKey === todayKey;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => openDay(dateKey)}
                  className={`min-h-36 rounded-lg border bg-gray-50 p-3 text-left transition hover:border-accent hover:bg-accent/5 dark:bg-gray-950 ${
                    isToday ? 'border-accent ring-2 ring-accent/20' : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{getShortDayLabel(date)}</span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">{dayEntries.length}</span>
                  </div>
                  <div className="space-y-2">
                    {dayEntries.length === 0 ? (
                      <p className="text-xs font-semibold text-gray-400">No report</p>
                    ) : dayEntries.map((entry) => (
                      <div key={entry.id} className="rounded px-2 py-1.5 text-xs font-bold text-white" style={{ backgroundColor: entry.color }}>
                        {entry.submissionStatus === 'Draft' && <span className="mb-1 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase">Draft</span>}
                        {entry.dutyHours}h<br />{entry.districtWorked}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {calendarView === 'day' && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Daily View</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{getDayLabel(calendarFocusDate)}</h3>
              </div>
              <button type="button" onClick={() => openDay(focusDateKey)} className="btn-primary" aria-label="Open daily report" title="Open Daily Report">
                <CalendarClock size={16} />
              </button>
            </div>
            {activeViewEntries.length === 0 ? (
              <button
                type="button"
                onClick={() => openDay(focusDateKey)}
                className="empty-state w-full rounded border border-dashed border-gray-300 py-10 text-left dark:border-gray-700"
              >
                No Trooper Daily report for this day. Click to create one.
              </button>
            ) : (
              <div className="space-y-3">
                {activeViewEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => openDay(entry.date)}
                    className="w-full rounded border border-gray-200 p-4 text-left transition hover:border-accent hover:bg-accent/5 dark:border-gray-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-gray-100">{entry.districtWorked}</p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {entry.submissionStatus === 'Draft' ? 'Draft - ' : 'Submitted - '}{entry.dutyHours} duty hours - {entry.specialStatus}
                        </p>
                      </div>
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: entry.color }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {selectedDate && (
        <div className={isFloatingApp ? 'absolute inset-0 z-20 flex min-h-0 bg-white dark:bg-gray-900' : 'min-h-0 flex-1 pt-14 lg:pt-16'}>
          <div className={isFloatingApp ? 'h-full min-h-0 w-full overflow-y-auto rounded-lg bg-white p-3 shadow-none dark:bg-gray-900 sm:p-4' : 'h-full min-h-0 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5'}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Trooper Daily</p>
                <h2 className="mt-1">{getReadableDate(selectedDate)}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {editingEntryId ? 'Update this daily report.' : 'Fill out this daily report.'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReminderFormOpen((value) => !value)}
                  className="btn-secondary"
                  aria-label="Create reminder"
                  title="Create Reminder"
                >
                  <Bell size={16} />
                  <span className="hidden sm:inline">Create Reminder</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className={isFloatingApp ? 'icon-close-button' : 'btn-secondary'}
                  aria-label={isFloatingApp ? 'Close calendar day' : 'Back to calendar'}
                  title={isFloatingApp ? 'Close' : 'Back to Calendar'}
                >
                  {isFloatingApp ? <X size={20} /> : <ChevronLeft size={16} />}
                  {!isFloatingApp && <span>Back</span>}
                </button>
              </div>
            </div>
            {isReminderFormOpen && (
              <form onSubmit={createCalendarReminder} className="mb-5 grid grid-cols-1 gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto]">
                <input
                  value={reminderTitle}
                  onChange={(event) => setReminderTitle(event.target.value)}
                  placeholder={`Reminder for ${getReadableDate(selectedDate)}`}
                  maxLength={90}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  autoFocus
                />
                <select
                  value={reminderPriority}
                  onChange={(event) => setReminderPriority(event.target.value as typeof reminderPriority)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  aria-label="Reminder priority"
                >
                  {['Low', 'Normal', 'High', 'Critical'].map((priority) => <option key={priority}>{priority}</option>)}
                </select>
                <button type="submit" className="btn-primary" disabled={isSavingReminder} aria-label="Save reminder" title="Save Reminder">
                  <Save size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReminderTitle('');
                    setReminderPriority('Normal');
                    setReminderNotes('');
                    setIsReminderFormOpen(false);
                  }}
                  className="btn-secondary"
                  aria-label="Cancel reminder"
                  title="Cancel"
                >
                  <X size={16} />
                </button>
                <textarea
                  value={reminderNotes}
                  onChange={(event) => setReminderNotes(event.target.value)}
                  placeholder="Notes"
                  maxLength={1000}
                  className="min-h-20 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 sm:col-span-4"
                />
              </form>
            )}

            <form ref={dailyFormRef} onSubmit={(event) => saveEntry(event, 'Draft')} onKeyDown={handleDailyKeyDown} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2 md:col-span-2 lg:grid-cols-[auto_minmax(12rem,18rem)_auto_minmax(10rem,1fr)_auto]">
                <div className="px-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-accent">Shortcuts</p>
                </div>
                <select
                  value={selectedShortcutId}
                  onChange={(event) => {
                    const shortcut = shortcuts.find((item) => item.id === event.target.value);
                    setSelectedShortcutId(event.target.value);
                    if (shortcut) {
                      applyShortcut(shortcut);
                    }
                  }}
                  className="h-10 rounded border border-gray-300 bg-white px-3 text-sm font-semibold dark:border-gray-700 dark:bg-gray-950"
                  aria-label="Apply saved Trooper Daily shortcut"
                  disabled={shortcuts.length === 0}
                >
                  <option value="">{shortcuts.length > 0 ? 'Apply saved shortcut' : 'No saved shortcuts'}</option>
                  {shortcuts.map((shortcut) => (
                    <option key={shortcut.id} value={shortcut.id}>{shortcut.name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copyPreviousDaily} className="btn-secondary" aria-label="Copy previous daily" title="Copy Previous Daily">
                    <ClipboardCopy size={16} />
                  </button>
                  <button type="button" onClick={fillBlankNumericDetailsWithZero} className="btn-secondary" aria-label="Fill blank numeric fields with zero" title="Fill Blanks With Zero">
                    <Sparkles size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const shortcut = shortcuts.find((item) => item.id === selectedShortcutId);
                      if (shortcut) {
                        startEditingShortcut(shortcut);
                      }
                    }}
                    className="btn-secondary"
                    disabled={!selectedShortcutId}
                    aria-label="Edit selected shortcut"
                    title="Edit Selected Shortcut"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <input
                  value={shortcutName}
                  onChange={(event) => setShortcutName(event.target.value)}
                  placeholder={editingShortcutId ? 'Update shortcut name' : 'Save current form as...'}
                  className="h-10 rounded border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-950"
                  aria-label="Shortcut name"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveShortcut} className="btn-primary" disabled={isSavingShortcut || !shortcutName.trim()} aria-label={editingShortcutId ? 'Update shortcut from current daily form' : 'Save current daily form as shortcut'} title={editingShortcutId ? 'Update Shortcut' : 'Save Shortcut'}>
                    <Save size={16} />
                  </button>
                  {editingShortcutId && (
                    <>
                      <button type="button" onClick={resetShortcutEditor} className="btn-secondary" aria-label="Cancel shortcut edit" title="Cancel Shortcut Edit">
                        <X size={16} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const shortcut = shortcuts.find((item) => item.id === (editingShortcutId || selectedShortcutId));
                      if (shortcut) {
                        void deleteShortcut(shortcut);
                      }
                    }}
                    className="btn-danger"
                    disabled={!editingShortcutId && !selectedShortcutId}
                    aria-label="Delete selected shortcut"
                    title="Delete Selected Shortcut"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid min-h-[34rem] grid-cols-1 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 md:col-span-2 lg:grid-cols-[15.75rem_minmax(0,1fr)]">
                <aside className="border-b border-gray-200 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-900 lg:border-b-0 lg:border-r">
                  <div className="mb-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Trooper Daily</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{getReadableDate(selectedDate)}</p>
                  </div>
                  <nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1" aria-label="Trooper Daily input sections">
                    {dailyPanelOptions.map((panel) => {
                      const panelSection = trooperDailySections.find((section) => section.title === panel);
                      const isHidden = Boolean(panelSection && hiddenDailySections.includes(panelSection.title));
                      const isComplete = panel === 'Administrative'
                        ? Boolean(entryForm.date && entryForm.dutyHours && entryForm.districtWorked && entryForm.specialStatus)
                        : panel === 'Narrative'
                          ? Boolean(entryForm.details?.narrative?.trim())
                          : Boolean(panelSection && isSectionComplete(entryForm.details, panelSection));
                      const isActive = activeDailyPanel === panel;

                      return (
                        <div
                          key={panel}
                          className={`group flex items-center gap-1 rounded-md border transition-all duration-500 ${
                            isActive
                              ? 'trooper-daily-active-pulse border-accent bg-white text-accent shadow-sm dark:bg-gray-950'
                              : `border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-primary-500 dark:text-gray-300 dark:hover:border-gray-800 dark:hover:bg-gray-950 dark:hover:text-blue-100 ${isHidden ? 'opacity-50' : ''}`
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (isHidden && panelSection) {
                                showDailySection(panelSection.title);
                                return;
                              }
                              setActiveDailyPanel(panel);
                            }}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs font-bold leading-tight"
                            aria-current={isActive ? 'step' : undefined}
                          >
                            <span className="min-w-0 truncate">{panel}</span>
                            {isComplete ? (
                              <CheckCircle2 className="trooper-daily-check shrink-0 text-green-600 dark:text-green-300" size={16} />
                            ) : (
                              <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-700'}`} />
                            )}
                          </button>
                          {panelSection && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isHidden) {
                                  showDailySection(panelSection.title);
                                  return;
                                }
                                hideDailySection(panelSection.title);
                              }}
                              className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-accent dark:hover:bg-gray-800"
                              aria-label={`${isHidden ? 'Show' : 'Hide'} ${panelSection.title}`}
                              title={`${isHidden ? 'Show' : 'Hide'} ${panelSection.title}`}
                            >
                              {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          )}
                          {!panelSection && <span className="mr-1 h-6 w-6 shrink-0" aria-hidden="true" />}
                        </div>
                      );
                    })}
                  </nav>
                </aside>

                <section className="min-w-0 p-4">
                  {activeDailyPanel === 'Administrative' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Administrative</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set the report date, hours, district, status, and color coding.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Date</span>
                          <input
                            type="date"
                            value={entryForm.date}
                            onChange={(event) =>
                              setEntryForm((currentForm) => ({ ...currentForm, date: event.target.value }))
                            }
                            data-daily-field="entryDate"
                            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                            required
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Duty Hours</span>
                          <div className="relative">
                            <input
                              type="text"
                              min="0"
                              inputMode="decimal"
                              maxLength={dailyInputCharacterLimit}
                              value={entryForm.dutyHours}
                              onChange={(event) => updateDutyHours(event.target.value)}
                              data-daily-field="dutyHours"
                              className={`w-full rounded border bg-white px-3 py-2 pr-9 transition dark:bg-gray-950 ${
                                entryForm.dutyHours
                                  ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
                                  : 'border-gray-300 dark:border-gray-700'
                              }`}
                              required
                            />
                            {entryForm.dutyHours && (
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-600 dark:text-green-300">
                                <CheckCircle2 className="trooper-daily-check" size={17} />
                              </span>
                            )}
                          </div>
                          {calculatedShiftHours > 0 && (
                            <span className="mt-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                              Shift times calculate to {formatHours(calculatedShiftHours)} hrs.
                            </span>
                          )}
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District Worked</span>
                          <select
                            value={entryForm.districtWorked}
                            onChange={(event) =>
                              setEntryForm((currentForm) => ({ ...currentForm, districtWorked: event.target.value }))
                            }
                            data-daily-field="districtWorked"
                            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                          >
                            {districtOptions.map((district) => (
                              <option key={district}>{district}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Special Status</span>
                          <select
                            value={entryForm.specialStatus}
                            onChange={(event) =>
                              setEntryForm((currentForm) => ({ ...currentForm, specialStatus: event.target.value }))
                            }
                            data-daily-field="specialStatus"
                            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                          >
                            {specialStatusOptions.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Color Code</span>
                          <select
                            value={entryForm.color}
                            onChange={(event) => setEntryForm((currentForm) => ({ ...currentForm, color: event.target.value }))}
                            data-daily-field="color"
                            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                          >
                            {entryColors.map((color) => (
                              <option key={color.value} value={color.value}>{color.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className={`grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-4 ${
                        hasHourMismatch ? 'border-danger/40 bg-red-50 dark:bg-red-950/30' : 'border-accent/30 bg-accent/5'
                      }`}>
                        <HourSummaryCard label="Reported" value={`${formatHours(reportedDutyHours || 0)} hrs`} tone="primary" />
                        <HourSummaryCard label="Shift Time" value={`${formatHours(calculatedShiftHours)} hrs`} tone="accent" helper={getDifferenceLabel(reportedDutyHours, calculatedShiftHours)} isMatch={shiftHoursMatch} />
                        <HourSummaryCard label="Attendance" value={`${formatHours(attendanceHours)} hrs`} tone="primary" helper={getDifferenceLabel(reportedDutyHours, attendanceHours)} isMatch={attendanceHoursMatch} />
                        <HourSummaryCard label="Duty Activity" value={`${formatHours(dutyActivityHours)} hrs`} tone="primary" helper={getDifferenceLabel(reportedDutyHours, dutyActivityHours)} isMatch={dutyActivityHoursMatch} />
                        {hasHourMismatch && (
                          <p className="text-sm font-semibold text-danger md:col-span-4">
                            Hours do not match the reported duty hours. Review shift times, attendance hours, and duty activity hours before submitting.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {activeDailySection && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                            {activeDailySection.title}
                            {isSectionComplete(entryForm.details, activeDailySection) && <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={18} />}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {activeDailySection.fields.filter(([key]) => isDetailComplete(entryForm.details, key)).length} of {activeDailySection.fields.length} fields complete.
                          </p>
                          {activeHourGuidance && (
                            <p
                              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition-all duration-500 ${
                                activeHourGuidance.isMatch
                                  ? 'bg-green-50 text-green-700 ring-green-100 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-900'
                                  : 'bg-red-50 text-danger ring-red-100 dark:bg-red-950/40 dark:ring-red-900'
                              }`}
                            >
                              {activeHourGuidance.isMatch ? (
                                <CheckCircle2 size={14} className="text-green-600 dark:text-green-300" />
                              ) : (
                                <X size={14} className="text-danger" />
                              )}
                              {activeHourGuidance.isMatch
                                ? `${activeHourGuidance.label} matches reported duty hours.`
                                : `${activeHourGuidance.label} is ${formatHours(activeHourGuidance.difference)} hr ${activeHourGuidance.direction} reported duty hours.`}
                            </p>
                          )}
                        </div>
                        {activeDailySection.title === 'Regular Duty' && (
                          <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900" aria-label="Time input format">
                            <button
                              type="button"
                              onClick={() => setDailyUseMilitaryTime(false)}
                              className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
                                !dailyUseMilitaryTime
                                  ? 'bg-primary-500 text-white'
                                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              Standard
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyUseMilitaryTime(true)}
                              className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
                                dailyUseMilitaryTime
                                  ? 'bg-primary-500 text-white'
                                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              Military
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {activeDailySection.fields.map(([key, label]) => {
                          const isTimeField = timeDetailFields.has(key);
                          const isComplete = isDetailComplete(entryForm.details, key);
                          return (
                            <label key={key} className="block">
                              <span className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</span>
                              {isTimeField ? (
                                <TimeDetailInput
                                  value={entryForm.details?.[key] || ''}
                                  onChange={(value) => updateDailyDetail(key, value)}
                                  isComplete={isComplete}
                                  useMilitaryTime={dailyUseMilitaryTime}
                                  fieldId={key}
                                />
                              ) : (
                                <div className="relative">
                                  <input
                                    type="text"
                                    inputMode={wholeNumberDetailFields.has(key) ? 'numeric' : 'decimal'}
                                    maxLength={dailyInputCharacterLimit}
                                    value={entryForm.details?.[key] || ''}
                                    onChange={(event) => updateDailyDetail(key, event.target.value)}
                                    data-daily-field={key}
                                    className={`w-full rounded border bg-white px-3 py-2 pr-8 text-sm transition dark:bg-gray-900 ${
                                      isComplete
                                        ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
                                        : 'border-gray-300 dark:border-gray-700'
                                    }`}
                                  />
                                  {isComplete && (
                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-600 dark:text-green-300">
                                      <CheckCircle2 className="trooper-daily-check" size={16} />
                                    </span>
                                  )}
                                </div>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeDailyPanel === 'Narrative' && (
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Narrative</h3>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add context for the daily report.</p>
                        </div>
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                          {(entryForm.details?.narrative || '').length}/{narrativeCharacterLimit}
                        </span>
                      </div>
                      <textarea
                        value={entryForm.details?.narrative || ''}
                        onChange={(event) => updateDailyDetail('narrative', event.target.value)}
                        placeholder="Type a narrative here"
                        maxLength={narrativeCharacterLimit}
                        data-daily-field="narrative"
                        className="min-h-72 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                      />
                    </div>
                  )}
                </section>
              </div>

              <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-gray-200 bg-gray-50/95 p-3 shadow-[0_-14px_32px_rgba(15,23,42,0.08)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-[0_-14px_32px_rgba(0,0,0,0.24)] md:col-span-2">
                <span className="mr-auto text-sm font-semibold text-gray-500 dark:text-gray-400">
                  Save keeps this as a draft. Submit sends the final report.
                  <span className="ml-2 hidden text-xs font-bold text-gray-400 dark:text-gray-500 lg:inline">
                    Ctrl+S save - Ctrl+Enter submit - Ctrl+Z undo - Ctrl+Y redo
                  </span>
                  {backendDraftStatus === 'saving' && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                      Saving to server
                    </span>
                  )}
                  {backendDraftStatus === 'saved' && backendDraftSavedAt && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-700 ring-1 ring-green-100 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-900">
                      <CheckCircle2 size={13} />
                      Saved to server {new Date(backendDraftSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                  {backendDraftStatus === 'error' && dailyDraftSavedAt && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
                      <CheckCircle2 size={13} />
                      Local draft saved {new Date(dailyDraftSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                  {backendDraftStatus === 'idle' && dailyDraftSavedAt && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
                      <CheckCircle2 size={13} />
                      Local draft saved {new Date(dailyDraftSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </span>
                {editingEntry && (
                  <button type="button" onClick={() => setEntryPendingDelete(editingEntry)} className="btn-danger" aria-label="Delete daily report" title="Delete Report">
                    <Trash2 size={16} />
                  </button>
                )}
                <button type="submit" className="btn-secondary" aria-label="Save daily report as draft" title="Save Draft">
                  <Save size={16} />
                  <span>Save Draft</span>
                </button>
                <button type="button" onClick={(event) => saveEntry(event, 'Submitted')} className="btn-success" data-daily-submit aria-label="Submit daily report" title="Submit Report">
                  <CheckCircle2 size={16} />
                  <span>Submit</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {entryPendingDelete && (
        <div className="modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-black/45 sm:items-center">
          <div className="modal-window w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Delete Entry</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Delete {entryPendingDelete.dutyHours} hours for {entryPendingDelete.districtWorked} on {getReadableDate(entryPendingDelete.date)}?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEntryPendingDelete(null)} className="btn-secondary" aria-label="Cancel delete" title="Cancel">
                Cancel
              </button>
              <button type="button" onClick={() => deleteEntry(entryPendingDelete)} className="btn-danger" aria-label="Delete entry" title="Delete">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
