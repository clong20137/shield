import React, { useEffect, useRef, useState } from 'react';
import { Calculator, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { AuthAccount, CalendarEntry, CalendarShortcut, calendarService } from '../services/api';
import { districtOptions } from '../constants/districts';

type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>;
type TimePeriod = 'AM' | 'PM';

const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty'];
const narrativeCharacterLimit = 1000;
const dailyInputCharacterLimit = 5;

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
  details: {},
});

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

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

function getDifferenceLabel(firstValue: number, secondValue: number): string {
  const difference = Math.abs(firstValue - secondValue);
  return difference <= 0.01 ? 'Matches' : `${formatHours(difference)} hr off`;
}

function isHourMatch(reportedHours: number, comparisonHours: number): boolean {
  return reportedHours > 0 && comparisonHours > 0 && Math.abs(reportedHours - comparisonHours) <= 0.01;
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
}: {
  value: string;
  onChange: (value: string) => void;
  isComplete?: boolean;
}) {
  const parsedTime = parseTimeInput(value);
  const [displayTime, setDisplayTime] = useState(parsedTime.time);
  const [displayPeriod, setDisplayPeriod] = useState<TimePeriod>(parsedTime.period);

  useEffect(() => {
    setDisplayTime(parsedTime.time);
    setDisplayPeriod(parsedTime.period);
  }, [parsedTime.period, parsedTime.time]);

  const commitTime = (time: string, period = displayPeriod) => {
    if (!time) {
      onChange('');
      return;
    }

    const nextValue = buildTimeValue(time, period);
    if (nextValue) {
      onChange(nextValue);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
          placeholder="HH:MM"
          inputMode="numeric"
          maxLength={5}
          className={`w-full rounded border bg-white px-3 py-2 pr-8 text-sm transition dark:bg-gray-900 ${
            isComplete
              ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
              : 'border-gray-300 dark:border-gray-700'
          }`}
          aria-label="Time"
        />
        {isComplete && <CheckCircle2 className="trooper-daily-check pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-300" size={16} />}
      </div>
      <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900" aria-label="AM or PM">
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
      </div>
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

function CalendarPage({ currentUser, onOpenCalculator }: { currentUser: AuthAccount; onOpenCalculator?: () => void }) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<CalendarEntryForm>(() =>
    createDefaultEntryForm(formatDateKey(new Date()), currentUser),
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [entryPendingDelete, setEntryPendingDelete] = useState<CalendarEntry | null>(null);
  const [shortcuts, setShortcuts] = useState<CalendarShortcut[]>([]);
  const [shortcutName, setShortcutName] = useState('');
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isDutyHoursManual, setIsDutyHoursManual] = useState(false);
  const lastAutoDutyHoursRef = useRef('');

  const actor = {
    actorId: currentUser.id,
    actorName: currentUser.displayName || currentUser.email,
  };

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
    setSelectedDate(dateKey);
    setEntryForm(createDefaultEntryForm(dateKey, currentUser));
    setIsDutyHoursManual(false);
    lastAutoDutyHoursRef.current = '';
    setEditingEntryId(null);
  };

  const startNewEntryForSelectedDay = () => {
    if (!selectedDate) {
      return;
    }

    setEntryForm(createDefaultEntryForm(selectedDate, currentUser));
    setIsDutyHoursManual(false);
    lastAutoDutyHoursRef.current = '';
    setEditingEntryId(null);
  };

  const changeMonth = (offset: number) => {
    setCalendarMonth((currentMonth) => {
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(currentMonth.getMonth() + offset);
      return nextMonth;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const saveEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hours = Number(entryForm.dutyHours);

    if (!entryForm.date || Number.isNaN(hours) || hours < 0) {
      return;
    }

    setCalendarError(null);
    try {
      const payload = {
        ...entryForm,
        dutyHours: hours.toFixed(2).replace(/\.?0+$/u, ''),
        accountId: currentUser.id,
        ...actor,
      };

      if (editingEntryId) {
        const response = await calendarService.update(editingEntryId, payload);
        setEntries((currentEntries) =>
          currentEntries.map((entry) => (entry.id === editingEntryId ? response.data : entry)),
        );
        setEditingEntryId(null);
        setSelectedDate(response.data.date);
      } else {
        const response = await calendarService.create(payload);
        setEntries((currentEntries) => [response.data, ...currentEntries]);
        setSelectedDate(response.data.date);
      }
      setEntryForm(createDefaultEntryForm(entryForm.date, currentUser));
      setIsDutyHoursManual(false);
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
      setEntryPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete calendar entry:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to delete calendar entry.'));
    }
  };

  const editEntry = (entry: CalendarEntry) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      category: 'Trooper Daily',
      date: entry.date,
      dutyHours: entry.dutyHours,
      districtWorked: entry.districtWorked,
      specialStatus: entry.specialStatus,
      color: entry.color,
      details: entry.details || {},
    });
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
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
      if (editingShortcutId === shortcut.id) {
        resetShortcutEditor();
      }
    } catch (err) {
      console.error('Failed to delete shortcut:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to delete shortcut.'));
    }
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
      details: { ...(previousEntry.details || {}) },
    });
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const visibleEntries = entries.filter((entry) => {
    const matchesDistrict = !districtFilter || entry.districtWorked === districtFilter;
    const matchesStatus = !statusFilter || entry.specialStatus === statusFilter;
    return matchesDistrict && matchesStatus;
  });

  const selectedEntries = selectedDate
    ? visibleEntries.filter((entry) => entry.date === selectedDate)
    : [];

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
  const monthDutyHours = monthEntries.reduce((total, entry) => total + (Number(entry.dutyHours) || 0), 0);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary" aria-label="Previous month" title="Previous">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-40 text-center text-xl font-bold text-primary-500 dark:text-blue-100 sm:text-2xl">
            {getMonthLabel(calendarMonth)}
          </div>
          <button type="button" onClick={() => changeMonth(1)} className="btn-secondary" aria-label="Next month" title="Next">
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
          <p className="text-xs font-bold uppercase text-gray-400">This Month</p>
          <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{monthEntries.length}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400">Duty Hours</p>
          <p className="mt-1 text-2xl font-bold text-accent">{monthDutyHours.toFixed(2).replace(/\.?0+$/u, '')}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400">Visible Entries</p>
          <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{visibleEntries.length}</p>
        </div>
      </div>

      {calendarError && <div className="error">{calendarError}</div>}
      {isCalendarLoading && <div className="loading">Loading calendar entries...</div>}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {calendarCells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="min-h-16 rounded border border-transparent sm:min-h-24" />;
            }

            const dateKey = formatDateKey(date);
            const dayEntries = visibleEntries.filter((entry) => entry.date === dateKey);
            const isToday = dateKey === todayKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => openDay(dateKey)}
                className={`min-h-16 rounded border bg-gray-50 p-1 text-left transition hover:border-accent hover:bg-accent/5 dark:bg-gray-950 sm:min-h-24 sm:p-2 ${
                  isToday
                    ? 'border-accent ring-2 ring-accent/20'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="mb-1 flex items-center justify-between sm:mb-2">
                  <span className="font-bold text-gray-800 dark:text-gray-100">{date.getDate()}</span>
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
                      {entry.dutyHours}h {entry.districtWorked}
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
      </div>

      {selectedDate && (
        <div className="modal-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center">
          <div className="modal-window max-h-[96dvh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:max-h-[92vh] sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Trooper Daily</p>
                <h2>{getReadableDate(selectedDate)}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {editingEntryId ? 'Edit this daily activity report.' : `Add one or more daily activity reports for this date. ${selectedEntries.length} saved.`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={startNewEntryForSelectedDay}
                  className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                  aria-label="Start new entry for this day"
                  title="New Entry"
                  disabled={!editingEntryId && !entryForm.dutyHours && Object.keys(entryForm.details || {}).length === 0}
                >
                  <Plus size={18} />
                </button>
                {onOpenCalculator && (
                  <button
                    type="button"
                    onClick={onOpenCalculator}
                    className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                    aria-label="Open calculator"
                    title="Calculator"
                  >
                    <Calculator size={18} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="icon-close-button"
                  aria-label="Close calendar day"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <form onSubmit={saveEntry} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 md:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Daily Shortcuts</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Apply your saved autofill shortcuts, copy your last entry, or zero out blank count fields.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={copyPreviousDaily} className="btn-secondary" aria-label="Copy previous daily" title="Copy Previous Daily">
                      <ClipboardCopy size={16} />
                    </button>
                    <button type="button" onClick={fillBlankNumericDetailsWithZero} className="btn-secondary" aria-label="Fill blank numeric fields with zero" title="Fill Blanks With Zero">
                      <Sparkles size={16} />
                    </button>
                  </div>
                </div>
                {shortcuts.length > 0 && (
                  <div className="border-t border-accent/20 pt-3">
                    <p className="mb-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">My Shortcuts</p>
                    <div className="flex flex-wrap gap-2">
                      {shortcuts.map((shortcut) => (
                        <span key={shortcut.id} className="inline-flex overflow-hidden rounded border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
                          <button
                            type="button"
                            onClick={() => applyShortcut(shortcut)}
                            className="px-3 py-2 text-sm font-bold text-primary-500 hover:text-accent dark:text-blue-100"
                          >
                            {shortcut.name}
                          </button>
                          <button type="button" onClick={() => startEditingShortcut(shortcut)} className="border-l border-gray-200 px-2 text-primary-500 hover:bg-gray-50 dark:border-gray-800 dark:text-blue-100 dark:hover:bg-gray-900" aria-label={`Edit ${shortcut.name}`} title="Edit Shortcut">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => deleteShortcut(shortcut)} className="border-l border-gray-200 px-2 text-danger hover:bg-red-50 dark:border-gray-800 dark:hover:bg-red-950" aria-label={`Delete ${shortcut.name}`} title="Delete Shortcut">
                            <Trash2 size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-accent/20 pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <input
                    value={shortcutName}
                    onChange={(event) => setShortcutName(event.target.value)}
                    placeholder="Shortcut name"
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button type="button" onClick={saveShortcut} className="btn-primary" disabled={isSavingShortcut} aria-label={editingShortcutId ? 'Update shortcut from current daily form' : 'Save current daily form as shortcut'} title={editingShortcutId ? 'Update Shortcut' : 'Save Shortcut'}>
                    <Save size={16} />
                  </button>
                  {editingShortcutId && (
                    <button type="button" onClick={resetShortcutEditor} className="btn-secondary" aria-label="Cancel shortcut edit" title="Cancel Shortcut Edit">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Date</span>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, date: event.target.value }))
                  }
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
                    className={`w-full rounded border bg-white px-3 py-2 pr-9 transition dark:bg-gray-950 ${
                      entryForm.dutyHours
                        ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                    required
                  />
                  {entryForm.dutyHours && <CheckCircle2 className="trooper-daily-check pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-300" size={17} />}
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
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  {entryColors.map((color) => (
                    <option key={color.value} value={color.value}>{color.label}</option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <div className={`mb-4 grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-4 ${
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

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {trooperDailySections.map((section) => (
                    <section key={section.title} className={`rounded-lg border bg-white p-4 transition-all duration-300 dark:bg-gray-950 ${
                      isSectionComplete(entryForm.details, section)
                        ? 'trooper-daily-match border-green-300 dark:border-green-800'
                        : 'border-gray-200 dark:border-gray-800'
                    }`}>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
                          {section.title}
                          {isSectionComplete(entryForm.details, section) && <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={18} />}
                        </h3>
                        <span className={`h-1.5 w-10 rounded-full ${isSectionComplete(entryForm.details, section) ? 'bg-green-500' : 'bg-accent'}`} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {section.fields.map(([key, label]) => {
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
                                />
                              ) : (
                                <div className="relative">
                                  <input
                                    type="text"
                                    inputMode={wholeNumberDetailFields.has(key) ? 'numeric' : 'decimal'}
                                    maxLength={dailyInputCharacterLimit}
                                    value={entryForm.details?.[key] || ''}
                                    onChange={(event) => updateDailyDetail(key, event.target.value)}
                                    className={`w-full rounded border bg-white px-3 py-2 pr-8 text-sm transition dark:bg-gray-900 ${
                                      isComplete
                                        ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
                                        : 'border-gray-300 dark:border-gray-700'
                                    }`}
                                  />
                                  {isComplete && <CheckCircle2 className="trooper-daily-check pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-300" size={16} />}
                                </div>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950 xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Narrative</h3>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        {(entryForm.details?.narrative || '').length}/{narrativeCharacterLimit}
                      </span>
                    </div>
                    <textarea
                      value={entryForm.details?.narrative || ''}
                      onChange={(event) => updateDailyDetail('narrative', event.target.value)}
                      placeholder="Type a narrative here"
                      maxLength={narrativeCharacterLimit}
                      className="min-h-40 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </section>
                </div>
              </div>

              <div className="md:col-span-2">
                <button type="submit" className="btn-primary" aria-label={editingEntryId ? 'Save calendar entry' : 'Add calendar entry'} title={editingEntryId ? 'Save Entry' : 'Add Entry'}>
                  {editingEntryId ? <Save size={16} /> : <CalendarClock size={16} />}
                </button>
                {editingEntryId && (
                  <button type="button" onClick={() => {
                    setEditingEntryId(null);
                    setEntryForm(createDefaultEntryForm(selectedDate, currentUser));
                    setIsDutyHoursManual(false);
                    lastAutoDutyHoursRef.current = '';
                  }} className="btn-secondary ml-2" aria-label="Cancel edit" title="Cancel Edit">
                    <X size={16} />
                  </button>
                )}
              </div>
            </form>

            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3>Entries for this day</h3>
                <button type="button" onClick={startNewEntryForSelectedDay} className="btn-secondary" aria-label="Add another entry for this day" title="Add Another Entry">
                  <Plus size={16} />
                </button>
              </div>
              {selectedEntries.length === 0 ? (
                <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">
                  No entries for this day.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <div>
                          <p className="font-bold text-gray-800 dark:text-gray-100">
                            {entry.dutyHours} hours - {entry.districtWorked}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {entry.category} - {entry.specialStatus} - Saved {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => editEntry(entry)} className="btn-secondary" aria-label="Edit entry" title="Edit">
                          <Pencil size={16} />
                        </button>
                        <button type="button" onClick={() => setEntryPendingDelete(entry)} className="btn-danger" aria-label="Delete entry" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                <X size={16} />
              </button>
              <button type="button" onClick={() => deleteEntry(entryPendingDelete)} className="btn-danger" aria-label="Delete entry" title="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
