import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, Clock3, DollarSign, Eye, EyeOff, FileText, Gavel, ListChecks, LucideIcon, MapPin, Palette, Pencil, Pill, Plus, Save, ShieldAlert, Sparkles, Timer, Trash2, Truck, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AuthAccount, CalendarEntry, CalendarShortcut, authService, calendarService } from '../services/api';
import { districtOptions } from '../constants/districts';

type DailyStripStyle = React.CSSProperties & {
  '--trooper-daily-strip-rgb'?: string;
};
type OverlayPosition = { x: number; y: number; strategy: 'fixed' | 'absolute' };
type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;
type TimePeriod = 'AM' | 'PM';
type CalendarView = 'day' | 'week' | 'month';
type DailySaveStatus = 'idle' | 'local' | 'saving' | 'saved' | 'error';
type StoredTrooperDailyDraft = {
  form: CalendarEntryForm;
  editingEntryId: string | null;
  savedAt: number;
};

const dayOffStatus = 'Day Off';
const dayOffColor = '#64748B';
const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', dayOffStatus];
const narrativeCharacterLimit = 1000;
const dailyInputCharacterLimit = 5;
const trooperDailyDraftStoragePrefix = 'shield_trooper_daily_draft';
const tCodeDetailsKey = 'tCodes';
const noTCodeDetailsKey = 'noTCodes';
type TrooperDailyTCode = {
  id: string;
  code: string;
  timeWorked: string;
};

const entryColors = [
  { label: 'Accent', value: '#9C865C' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Green', value: '#16A34A' },
  { label: 'Orange', value: '#EA580C' },
  { label: 'Red', value: '#DC2626' },
  { label: 'Purple', value: '#7C3AED' },
];

function getHexColorRgb(value?: string): string {
  const cleanValue = (value || entryColors[0].value).trim().replace(/^#/u, '');
  const hex = cleanValue.length === 3
    ? cleanValue.split('').map((character) => `${character}${character}`).join('')
    : cleanValue;
  const numericColor = /^[0-9a-f]{6}$/iu.test(hex) ? Number.parseInt(hex, 16) : Number.parseInt(entryColors[0].value.slice(1), 16);
  const red = (numericColor >> 16) & 255;
  const green = (numericColor >> 8) & 255;
  const blue = numericColor & 255;

  return `${red}, ${green}, ${blue}`;
}

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

const drugArrestGramFields: Record<string, string> = {
  heroinGramsFound: 'heroinArrests',
  cocaineGramsFound: 'cocaineArrests',
  marijuanaGramsFound: 'marijuanaArrests',
  methamphetamineGramsFound: 'methamphetamineArrests',
};

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
    .flatMap((section) => section.fields.map(([key]) => key))
    .filter((key) => !key.toLowerCase().includes('grams')),
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

const createOptimisticEntryFromForm = (form: CalendarEntryForm, currentUser: AuthAccount, existingEntry?: CalendarEntry): CalendarEntry => {
  const timestamp = new Date().toISOString();
  return {
    id: existingEntry?.id || `local-draft-${currentUser.id}-${form.date}`,
    ownerAccountId: existingEntry?.ownerAccountId || currentUser.id,
    category: 'Trooper Daily',
    date: form.date,
    dutyHours: form.dutyHours || '0',
    districtWorked: form.districtWorked,
    specialStatus: form.specialStatus,
    color: form.color,
    details: { ...(form.details || {}) },
    submissionStatus: form.submissionStatus || 'Draft',
    reviewStatus: existingEntry?.reviewStatus || 'Pending',
    reviewNotes: existingEntry?.reviewNotes || '',
    reviewedBy: existingEntry?.reviewedBy || null,
    reviewedByName: existingEntry?.reviewedByName || null,
    reviewedAt: existingEntry?.reviewedAt || null,
    createdAt: existingEntry?.createdAt || timestamp,
    updatedAt: timestamp,
  };
};

const hasMeaningfulTrooperDailyContent = (form: CalendarEntryForm, currentUser?: AuthAccount) => {
  const hasDetails = Object.values(form.details || {}).some((value) => String(value ?? '').trim() !== '');

  return Boolean(
    form.dutyHours.trim() ||
      hasDetails ||
      form.districtWorked !== getDefaultDistrict(currentUser) ||
      form.specialStatus !== specialStatusOptions[0] ||
      form.color !== entryColors[0].value,
  );
};

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

const isValidDateKey = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return formatDateKey(date) === value;
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

function getViewportMenuPosition(clientX: number, clientY: number, width: number, height: number, gutter = 8) {
  return {
    x: Math.min(Math.max(gutter, clientX), Math.max(gutter, window.innerWidth - width - gutter)),
    y: Math.min(Math.max(gutter, clientY), Math.max(gutter, window.innerHeight - height - gutter)),
  };
}

function getTransformedOverlayContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none' || style.contain.includes('paint')) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}

function getOverlayPositionForTarget(target: HTMLElement, width: number, height: number, align: 'center' | 'left' = 'left'): OverlayPosition {
  const rect = target.getBoundingClientRect();
  const baseX = align === 'center' ? rect.left + rect.width / 2 - width / 2 : rect.left;
  const baseY = rect.bottom + 8;
  const viewportPosition = getViewportMenuPosition(baseX, baseY, width, height);
  const transformedContainer = getTransformedOverlayContainer(target);

  if (!transformedContainer) {
    return { ...viewportPosition, strategy: 'fixed' };
  }

  const containerRect = transformedContainer.getBoundingClientRect();
  return {
    x: viewportPosition.x - containerRect.left + transformedContainer.scrollLeft,
    y: viewportPosition.y - containerRect.top + transformedContainer.scrollTop,
    strategy: 'absolute',
  };
}

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

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
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

function createTCodeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseTCodeDetails(details: Record<string, string> | undefined): TrooperDailyTCode[] {
  const rawValue = details?.[tCodeDetailsKey];
  if (!rawValue) {
    return [];
  }

  try {
    const rows = JSON.parse(rawValue) as Array<Partial<TrooperDailyTCode>>;
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row) => ({
        id: row.id || createTCodeId(),
        code: String(row.code || '').slice(0, 80),
        timeWorked: sanitizeDecimalInput(String(row.timeWorked || ''), 5),
      }))
      .filter((row) => row.code || row.timeWorked)
      .slice(0, 25);
  } catch {
    return [];
  }
}

function serializeTCodeDetails(rows: TrooperDailyTCode[]): string {
  return JSON.stringify(rows
    .map((row) => ({
      id: row.id,
      code: row.code.trim(),
      timeWorked: sanitizeDecimalInput(row.timeWorked, 5),
    }))
    .filter((row) => row.code || row.timeWorked)
    .slice(0, 25));
}

function hasNoTCodeSelection(details: Record<string, string> | undefined): boolean {
  return details?.[noTCodeDetailsKey] === 'true';
}

function isTCodeSectionComplete(details: Record<string, string> | undefined): boolean {
  const rows = parseTCodeDetails(details);
  return hasNoTCodeSelection(details) || (rows.length > 0 && rows.every((row) => row.code.trim() && row.timeWorked.trim()));
}

function isDetailComplete(details: Record<string, string> | undefined, key: string): boolean {
  return Boolean(details?.[key]?.trim());
}

function shouldShowDailyDetailField(details: Record<string, string> | undefined, key: string): boolean {
  const controllingArrestField = drugArrestGramFields[key];
  if (!controllingArrestField) {
    return true;
  }

  return Number(details?.[controllingArrestField] || 0) > 0;
}

function getDailyFieldIcon(key: string): LucideIcon {
  if (key.includes('Time') || key.includes('Start') || key.includes('End')) return Clock3;
  if (key.includes('Hours') || key.includes('Hrs') || key.includes('Leave') || key.includes('Duty')) return Timer;
  if (key.includes('Miles')) return Truck;
  if (key.includes('Court') || key.includes('Citations') || key.includes('Defendants') || key.includes('Arrests')) return Gavel;
  if (key.includes('Grams') || key.includes('Weight') || key.includes('Plants') || key.includes('Seized')) return ShieldAlert;
  if (key.includes('Drug') || key.includes('heroin') || key.includes('cocaine') || key.includes('marijuana') || key.includes('methamphetamine') || key.includes('prescription')) return Pill;
  if (key.includes('Criminal') || key.includes('Felony') || key.includes('HTI')) return BadgeCheck;
  if (key.includes('Truck') || key.includes('trucks') || key.includes('mcsap') || key.includes('port')) return Truck;
  if (key.includes('amount') || key.includes('Usc')) return DollarSign;
  if (key.includes('Services') || key.includes('Warnings') || key.includes('Interactions')) return FileText;
  return Sparkles;
}

function isSectionComplete(details: Record<string, string> | undefined, section: typeof trooperDailySections[number]): boolean {
  const visibleFields = section.fields.filter(([key]) => shouldShowDailyDetailField(details, key));
  return visibleFields.every(([key]) => isDetailComplete(details, key));
}

function HourMetricPill({
  label,
  value,
  helper,
  isMatch = false,
}: {
  label: string;
  value: string;
  helper?: string;
  isMatch?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-2 rounded border px-2.5 py-1.5 transition-all duration-300 ${
        isMatch
          ? 'trooper-daily-match border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100'
          : 'border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
      }`}
    >
      <div className="min-w-0">
        <p className={`truncate text-[10px] font-bold uppercase tracking-wide ${isMatch ? 'text-green-700 dark:text-green-200' : 'text-gray-500 dark:text-gray-400'}`}>{label}</p>
        {helper && (
          <p className={`truncate text-[10px] font-semibold ${isMatch ? 'text-green-700 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>{helper}</p>
        )}
      </div>
      <p className={`shrink-0 text-sm font-black ${isMatch ? 'text-green-700 dark:text-green-200' : 'text-primary-500 dark:text-blue-100'}`}>
        {value}
      </p>
    </div>
  );
}

function TimeDetailInput({
  value,
  onChange,
  isComplete = false,
  useMilitaryTime = false,
  fieldId,
  icon: Icon = Clock3,
}: {
  value: string;
  onChange: (value: string) => void;
  isComplete?: boolean;
  useMilitaryTime?: boolean;
  fieldId?: string;
  icon?: LucideIcon;
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
        <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
          <Icon size={15} />
        </span>
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
          className={`trooper-daily-field-with-icon w-full rounded border bg-white py-2 pl-9 pr-8 text-sm transition dark:bg-gray-900 ${
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
  useMilitaryTime = false,
  isFloatingApp = false,
}: {
  currentUser: AuthAccount;
  onAccountUpdate?: (account: AuthAccount) => void;
  useMilitaryTime?: boolean;
  isFloatingApp?: boolean;
}) {
  const location = useLocation();
  const requestedDailyDate = useMemo(() => {
    const date = new URLSearchParams(location.search).get('date');
    return isValidDateKey(date) ? date : null;
  }, [location.search]);
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
  const [tCodeOptions, setTCodeOptions] = useState<string[]>([]);
  const [selectedShortcutId, setSelectedShortcutId] = useState('');
  const [shortcutName, setShortcutName] = useState('');
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isDutyHoursManual, setIsDutyHoursManual] = useState(false);
  const [dailySaveStatus, setDailySaveStatus] = useState<DailySaveStatus>('idle');
  const [dailySaveStatusAt, setDailySaveStatusAt] = useState<number | null>(null);
  const [invalidDailyField, setInvalidDailyField] = useState<string | null>(null);
  const [dailyStripTooltip, setDailyStripTooltip] = useState<(OverlayPosition & { dateKey: string; entry: CalendarEntry | null }) | null>(null);
  const [dailyStripContextMenu, setDailyStripContextMenu] = useState<(OverlayPosition & { dateKey: string; entry: CalendarEntry | null }) | null>(null);
  const [copiedDailyForm, setCopiedDailyForm] = useState<CalendarEntryForm | null>(null);
  const lastAutoDutyHoursRef = useRef('');
  const dailyFormRef = useRef<HTMLFormElement | null>(null);
  const skipNextDailyDraftWriteRef = useRef(false);
  const backendAutosaveRequestRef = useRef(0);
  const dailyUndoStackRef = useRef<CalendarEntryForm[]>([]);
  const dailyRedoStackRef = useRef<CalendarEntryForm[]>([]);
  const previousEntryFormRef = useRef<CalendarEntryForm | null>(entryForm);
  const isRestoringDailyHistoryRef = useRef(false);
  const pendingDailyFocusRef = useRef<'field' | 'submit' | null>(null);
  const openedQueryDateRef = useRef<string | null>(null);

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

  const loadTCodeOptions = async () => {
    try {
      const response = await calendarService.getTCodeOptions();
      setTCodeOptions(response.data.options);
    } catch (err) {
      console.error('Failed to load T-Code options:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to load T-Code options.'));
    }
  };

  useEffect(() => {
    loadCalendarEntries();
    void loadShortcuts();
    void loadTCodeOptions();
    const handleCalendarUpdate = () => loadCalendarEntries(false);

    window.addEventListener('shield:calendar-updated', handleCalendarUpdate);
    return () => window.removeEventListener('shield:calendar-updated', handleCalendarUpdate);
  }, [currentUser.id]);

  useEffect(() => {
    setHiddenDailySections(currentUser.trooperDailyHiddenSections || []);
  }, [currentUser.trooperDailyHiddenSections]);

  useEffect(() => {
    const defaultDistrict = getDefaultDistrict(currentUser);
    if (!defaultDistrict || entryForm.districtWorked === defaultDistrict || editingEntryId) {
      return;
    }

    const onlyDefaultDistrictChanged = !hasMeaningfulTrooperDailyContent(
      { ...entryForm, districtWorked: getDefaultDistrict(undefined) },
      currentUser,
    );
    if (entryForm.districtWorked === getDefaultDistrict(undefined) && onlyDefaultDistrictChanged) {
      setEntryForm((currentForm) => ({ ...currentForm, districtWorked: defaultDistrict }));
    }
  }, [currentUser, editingEntryId, entryForm]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (dailyStripContextMenu) {
        event.stopPropagation();
        setDailyStripContextMenu(null);
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
  }, [dailyStripContextMenu, entryPendingDelete, selectedDate]);

  useEffect(() => {
    if (!dailyStripContextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setDailyStripContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [dailyStripContextMenu]);

  const openDay = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const existingEntry = entries.find((entry) => entry.date === dateKey);
    let localDraft = readTrooperDailyDraft(currentUser.id, dateKey);
    if (localDraft && !existingEntry && !hasMeaningfulTrooperDailyContent(localDraft.form, currentUser)) {
      removeTrooperDailyDraft(currentUser.id, dateKey);
      localDraft = null;
    }
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
    setDailySaveStatus(shouldRestoreLocalDraft && localDraft ? 'local' : existingEntry?.submissionStatus === 'Draft' ? 'saved' : 'idle');
    setDailySaveStatusAt(shouldRestoreLocalDraft && localDraft ? localDraft.savedAt : existingEntry?.updatedAt ? new Date(existingEntry.updatedAt).getTime() : null);
    setInvalidDailyField(null);
  };

  useEffect(() => {
    if (isCalendarLoading || !requestedDailyDate || openedQueryDateRef.current === requestedDailyDate) {
      return;
    }

    openedQueryDateRef.current = requestedDailyDate;
    openDay(requestedDailyDate);
  }, [entries, isCalendarLoading, requestedDailyDate]);

  const jumpDailyShortcutMonth = (direction: -1 | 1) => {
    const sourceDateKey = selectedDate || formatDateKey(calendarFocusDate);
    const [sourceYear, sourceMonth, sourceDay] = sourceDateKey.split('-').map(Number);
    const targetMonthIndex = sourceMonth - 1 + direction;
    const targetYear = new Date(sourceYear, targetMonthIndex, 1).getFullYear();
    const targetMonth = new Date(sourceYear, targetMonthIndex, 1).getMonth() + 1;
    const targetDaysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(sourceDay, targetDaysInMonth);
    openDay(`${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`);
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

    if (!editingEntryId && !hasMeaningfulTrooperDailyContent(entryForm, currentUser)) {
      setDailySaveStatus('idle');
      setDailySaveStatusAt(null);
      return undefined;
    }

    if (skipNextDailyDraftWriteRef.current) {
      skipNextDailyDraftWriteRef.current = false;
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const savedAt = writeTrooperDailyDraft(currentUser.id, entryForm, editingEntryId);
      if (savedAt) {
        setDailySaveStatus('local');
        setDailySaveStatusAt(savedAt);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentUser.id, editingEntryId, entryForm, selectedDate]);

  useEffect(() => {
    if (!selectedDate || entryForm.date !== selectedDate) {
      return;
    }

    setEntries((currentEntries) => {
      const existingEntry = currentEntries.find((entry) => entry.date === entryForm.date);
      const hasMeaningfulContent = hasMeaningfulTrooperDailyContent(entryForm, currentUser);

      if (!hasMeaningfulContent) {
        if (existingEntry?.id.startsWith('local-draft-')) {
          return currentEntries.filter((entry) => entry.id !== existingEntry.id);
        }

        return currentEntries;
      }

      const optimisticEntry = createOptimisticEntryFromForm(entryForm, currentUser, existingEntry);
      const nextEntries = [
        optimisticEntry,
        ...currentEntries.filter((entry) => entry.date !== entryForm.date),
      ];

      if (
        existingEntry &&
        existingEntry.id === optimisticEntry.id &&
        existingEntry.dutyHours === optimisticEntry.dutyHours &&
        existingEntry.districtWorked === optimisticEntry.districtWorked &&
        existingEntry.specialStatus === optimisticEntry.specialStatus &&
        existingEntry.color === optimisticEntry.color &&
        existingEntry.submissionStatus === optimisticEntry.submissionStatus &&
        JSON.stringify(existingEntry.details || {}) === JSON.stringify(optimisticEntry.details || {})
      ) {
        return currentEntries;
      }

      return nextEntries;
    });
  }, [currentUser, entryForm, selectedDate]);

  useEffect(() => {
    if (!selectedDate || entryForm.date !== selectedDate) {
      return undefined;
    }

    if (!editingEntryId && !hasMeaningfulTrooperDailyContent(entryForm, currentUser)) {
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
      setDailySaveStatus('saving');

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

            return [response.data, ...currentEntries.filter((entry) => entry.date !== response.data.date)];
          });
          setEditingEntryId(response.data.id);
          setDailySaveStatus('saved');
          setDailySaveStatusAt(Date.now());
        })
        .catch((err) => {
          if (backendAutosaveRequestRef.current !== requestId) {
            return;
          }

          console.error('Failed to autosave calendar draft:', err);
          setDailySaveStatus('error');
          setDailySaveStatusAt(Date.now());
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

  const focusDailyField = (fieldName: string) => {
    window.setTimeout(() => {
      dailyFormRef.current?.querySelector<HTMLElement>(`[data-daily-field="${fieldName}"]`)?.focus();
    }, 0);
  };

  const getVisibleDailyPanelOptions = () => dailyPanelOptions.filter((panel) => !hiddenDailySections.includes(panel));

  const selectDailyPanel = (panel: string, focusFirstField = false) => {
    setActiveDailyPanel(panel);
    if (focusFirstField) {
      pendingDailyFocusRef.current = 'field';
    }
  };

  const moveDailyPanel = (offset: number) => {
    const visibleDailyPanelOptions = getVisibleDailyPanelOptions();
    const currentIndex = visibleDailyPanelOptions.indexOf(activeDailyPanel);
    const nextIndex = Math.min(Math.max(currentIndex + offset, 0), visibleDailyPanelOptions.length - 1);
    const nextPanel = visibleDailyPanelOptions[nextIndex];
    if (nextPanel) {
      selectDailyPanel(nextPanel, true);
    }
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

    if (event.altKey && (key === 'arrowdown' || key === 'arrowright')) {
      event.preventDefault();
      moveDailyPanel(1);
      return;
    }

    if (event.altKey && (key === 'arrowup' || key === 'arrowleft')) {
      event.preventDefault();
      moveDailyPanel(-1);
      return;
    }

    if (event.altKey && /^[1-9]$/u.test(key)) {
      event.preventDefault();
      const visibleDailyPanelOptions = getVisibleDailyPanelOptions();
      const panel = visibleDailyPanelOptions[Number(key) - 1];
      if (panel) {
        selectDailyPanel(panel, true);
      }
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

    if (!entryForm.date) {
      setActiveDailyPanel('Administrative');
      setInvalidDailyField('entryDate');
      setCalendarError('Date is required.');
      focusDailyField('entryDate');
      return;
    }

    if (!entryForm.dutyHours.trim() || Number.isNaN(hours) || hours < 0) {
      setActiveDailyPanel('Administrative');
      setInvalidDailyField('dutyHours');
      setCalendarError('Duty hours are required before saving or submitting.');
      focusDailyField('dutyHours');
      return;
    }

    setInvalidDailyField(null);
    setCalendarError(null);
    try {
      const payload = {
        ...entryForm,
        submissionStatus,
        dutyHours: hours.toFixed(2).replace(/\.?0+$/u, ''),
        accountId: currentUser.id,
        ...actor,
      };

      const existingEntryForDate = entries.find((entry) => entry.date === entryForm.date && !entry.id.startsWith('local-draft-'));
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
        setEntries((currentEntries) => [response.data, ...currentEntries.filter((entry) => entry.date !== response.data.date)]);
        removeTrooperDailyDraft(currentUser.id, response.data.date);
        skipNextDailyDraftWriteRef.current = true;
        setSelectedDate(response.data.date);
        setEditingEntryId(response.data.id);
        setEntryForm(createEntryFormFromEntry(response.data));
      }
      setDailySaveStatus('saved');
      setDailySaveStatusAt(Date.now());
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

  const updateTCodeRows = (rows: TrooperDailyTCode[]) => {
    setEntryForm((currentForm) => {
      const nextDetails = { ...(currentForm.details || {}) };
      const serializedRows = serializeTCodeDetails(rows);
      if (serializedRows === '[]') {
        delete nextDetails[tCodeDetailsKey];
      } else {
        nextDetails[tCodeDetailsKey] = serializedRows;
        delete nextDetails[noTCodeDetailsKey];
      }

      return {
        ...currentForm,
        details: nextDetails,
      };
    });
  };

  const addTCodeRow = () => {
    updateTCodeRows([
      ...parseTCodeDetails(entryForm.details),
      {
        id: createTCodeId(),
        code: tCodeOptions[0] || '',
        timeWorked: '',
      },
    ]);
  };

  const updateTCodeRow = (rowId: string, updates: Partial<Omit<TrooperDailyTCode, 'id'>>) => {
    updateTCodeRows(parseTCodeDetails(entryForm.details).map((row) => row.id === rowId ? { ...row, ...updates } : row));
  };

  const deleteTCodeRow = (rowId: string) => {
    updateTCodeRows(parseTCodeDetails(entryForm.details).filter((row) => row.id !== rowId));
  };

  const setNoTCodes = (enabled: boolean) => {
    setEntryForm((currentForm) => {
      const nextDetails = { ...(currentForm.details || {}) };
      if (enabled) {
        delete nextDetails[tCodeDetailsKey];
        nextDetails[noTCodeDetailsKey] = 'true';
      } else {
        delete nextDetails[noTCodeDetailsKey];
      }

      return {
        ...currentForm,
        details: nextDetails,
      };
    });
  };

  const updateDutyHours = (value: string) => {
    const nextValue = sanitizeDecimalInput(value);
    setInvalidDailyField((field) => (field === 'dutyHours' ? null : field));
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

  const copyPreviousDailyToDate = (dateKey: string) => {
    const previousEntry = entries
      .filter((entry) => entry.date < dateKey)
      .sort((firstEntry, secondEntry) => secondEntry.date.localeCompare(firstEntry.date))[0];

    if (!previousEntry) {
      setCalendarError('No previous Trooper Daily entry found to copy.');
      return;
    }

    setCalendarError(null);
    setSelectedDate(dateKey);
    setCalendarFocusDate(new Date(`${dateKey}T00:00:00`));
    setEntryForm({
      category: 'Trooper Daily',
      date: dateKey,
      dutyHours: previousEntry.dutyHours,
      districtWorked: previousEntry.districtWorked || getDefaultDistrict(currentUser),
      specialStatus: previousEntry.specialStatus,
      color: previousEntry.color,
      submissionStatus: 'Draft',
      details: { ...(previousEntry.details || {}) },
    });
    setEditingEntryId(null);
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const copyDailyToClipboard = (dateKey: string, entry?: CalendarEntry | null) => {
    const sourceForm = selectedDate === dateKey && (!entry || editingEntryId === entry.id)
      ? entryForm
      : entry
        ? createEntryFormFromEntry(entry)
        : null;

    if (!sourceForm || !hasMeaningfulTrooperDailyContent(sourceForm, currentUser)) {
      setCalendarError('There is no Trooper Daily content to copy for that date.');
      return;
    }

    setCopiedDailyForm({
      ...sourceForm,
      details: { ...(sourceForm.details || {}) },
      submissionStatus: 'Draft',
    });
    setCalendarError(null);
  };

  const pasteCopiedDailyToDate = (dateKey: string) => {
    if (!copiedDailyForm) {
      setCalendarError('Copy a Trooper Daily report before pasting.');
      return;
    }

    const existingEntry = entries.find((entry) => entry.date === dateKey);
    setCalendarError(null);
    setSelectedDate(dateKey);
    setCalendarFocusDate(new Date(`${dateKey}T00:00:00`));
    setEntryForm({
      ...copiedDailyForm,
      date: dateKey,
      submissionStatus: 'Draft',
      details: { ...(copiedDailyForm.details || {}) },
    });
    setEditingEntryId(existingEntry?.id || null);
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const markDailyAsDayOff = async (dateKey: string) => {
    const existingEntry = entries.find((entry) => entry.date === dateKey && !entry.id.startsWith('local-draft-'));
    const localEntry = selectedDate === dateKey
      ? entryForm
      : existingEntry
        ? createEntryFormFromEntry(existingEntry)
        : createDefaultEntryForm(dateKey, currentUser);
    const dayOffForm: CalendarEntryForm = {
      ...localEntry,
      category: 'Trooper Daily',
      date: dateKey,
      dutyHours: '0',
      districtWorked: localEntry.districtWorked || getDefaultDistrict(currentUser),
      specialStatus: dayOffStatus,
      color: dayOffColor,
      submissionStatus: 'Draft',
      details: {
        ...(localEntry.details || {}),
        regularDaysOff: '1',
      },
    };
    const payload = {
      ...dayOffForm,
      accountId: currentUser.id,
      ...actor,
    };

    setCalendarError(null);
    try {
      const response = existingEntry
        ? await calendarService.update(existingEntry.id, payload)
        : await calendarService.create(payload);

      setEntries((currentEntries) => [
        response.data,
        ...currentEntries.filter((entry) => entry.date !== response.data.date),
      ]);
      removeTrooperDailyDraft(currentUser.id, dateKey);
      skipNextDailyDraftWriteRef.current = true;
      setCalendarFocusDate(new Date(`${dateKey}T00:00:00`));
      setSelectedDate(dateKey);
      setEditingEntryId(response.data.id);
      setEntryForm(createEntryFormFromEntry(response.data));
      setIsDutyHoursManual(true);
      setDailySaveStatus('saved');
      setDailySaveStatusAt(Date.now());
      lastAutoDutyHoursRef.current = '';
    } catch (err) {
      console.error('Failed to mark daily as day off:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to mark day off.'));
    }
  };

  useEffect(() => {
    if (!dailyStripContextMenu) {
      return undefined;
    }

    const handleContextMenuKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
        setDailyStripContextMenu(null);
      };

      if (key === 'enter' || key === 'o') {
        consume();
        openDay(dailyStripContextMenu.dateKey);
        return;
      }

      if (key === 'c' && (dailyStripContextMenu.entry || selectedDate === dailyStripContextMenu.dateKey)) {
        consume();
        copyDailyToClipboard(dailyStripContextMenu.dateKey, dailyStripContextMenu.entry);
        return;
      }

      if (key === 'v' && copiedDailyForm) {
        consume();
        pasteCopiedDailyToDate(dailyStripContextMenu.dateKey);
        return;
      }

      if (key === 'p') {
        consume();
        copyPreviousDailyToDate(dailyStripContextMenu.dateKey);
        return;
      }

      if (key === 'd') {
        consume();
        void markDailyAsDayOff(dailyStripContextMenu.dateKey);
        return;
      }

      if ((key === 'delete' || key === 'backspace') && dailyStripContextMenu.entry) {
        consume();
        setEntryPendingDelete(dailyStripContextMenu.entry);
      }
    };

    window.addEventListener('keydown', handleContextMenuKeyDown);

    return () => window.removeEventListener('keydown', handleContextMenuKeyDown);
  }, [copiedDailyForm, currentUser, dailyStripContextMenu, editingEntryId, entries, entryForm, selectedDate]);

  useEffect(() => {
    const handleDailyClipboardShortcut = (event: KeyboardEvent) => {
      if (!selectedDate || isEditableShortcutTarget(event.target) || (!event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }

      const shortcutKey = event.key.toLowerCase();
      if (shortcutKey === 'c') {
        event.preventDefault();
        copyDailyToClipboard(selectedDate, entries.find((entry) => entry.date === selectedDate) || null);
        return;
      }

      if (shortcutKey === 'v') {
        event.preventDefault();
        pasteCopiedDailyToDate(selectedDate);
      }
    };

    document.addEventListener('keydown', handleDailyClipboardShortcut);
    return () => document.removeEventListener('keydown', handleDailyClipboardShortcut);
  }, [copiedDailyForm, currentUser, editingEntryId, entries, entryForm, selectedDate]);

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
  const tCodeRows = parseTCodeDetails(entryDetails);
  const hasNoTCodes = hasNoTCodeSelection(entryDetails);
  const isTCodeComplete = isTCodeSectionComplete(entryDetails);
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
    () => [
      'Administrative',
      ...trooperDailySections.flatMap((section) => section.title === 'Drug Activity' ? [section.title, 'T-Codes'] : [section.title]),
      'Narrative',
    ],
    [],
  );
  const activeDailySection = visibleDailySections.find((section) => section.title === activeDailyPanel);
  const selectedDateParts = selectedDate?.split('-').map(Number);
  const dailyShortcutYear = selectedDateParts?.[0] || calendarMonth.getFullYear();
  const dailyShortcutMonth = selectedDateParts?.[1] || calendarMonth.getMonth() + 1;
  const dailyShortcutMonthLabel = getMonthLabel(new Date(dailyShortcutYear, dailyShortcutMonth - 1, 1));
  const dailyShortcutDaysInMonth = new Date(dailyShortcutYear, dailyShortcutMonth, 0).getDate();
  const dailyShortcutDays = Array.from({ length: dailyShortcutDaysInMonth }, (_, index) => {
    const day = index + 1;
    const dateKey = `${dailyShortcutYear}-${String(dailyShortcutMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = entries.find((item) => item.date === dateKey);

    return {
      day,
      dateKey,
      entry,
    };
  });
  const hourMetrics = [
    { label: 'Reported', value: reportedDutyHours, helper: '', isMatch: false },
    { label: 'Shift', value: calculatedShiftHours, helper: getDifferenceLabel(reportedDutyHours, calculatedShiftHours), isMatch: shiftHoursMatch },
    { label: 'Attendance', value: attendanceHours, helper: getDifferenceLabel(reportedDutyHours, attendanceHours), isMatch: attendanceHoursMatch },
    { label: 'Duty Activity', value: dutyActivityHours, helper: getDifferenceLabel(reportedDutyHours, dutyActivityHours), isMatch: dutyActivityHoursMatch },
  ];
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
  const dailySaveStatusLabel = (() => {
    if (dailySaveStatus === 'idle') {
      return '';
    }

    const timeLabel = dailySaveStatusAt
      ? new Date(dailySaveStatusAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '';

    if (dailySaveStatus === 'saving') {
      return 'Saving';
    }

    if (dailySaveStatus === 'saved') {
      return `Saved${timeLabel ? ` ${timeLabel}` : ''}`;
    }

    if (dailySaveStatus === 'local') {
      return `Local draft${timeLabel ? ` ${timeLabel}` : ''}`;
    }

    return 'Autosave issue';
  })();
  const showDailyStripTooltip = (target: HTMLElement, dateKey: string, entry?: CalendarEntry) => {
    const tooltipPosition = getOverlayPositionForTarget(target, 208, 96, 'center');
    setDailyStripTooltip({
      ...tooltipPosition,
      dateKey,
      entry: entry || null,
    });
  };

  const openDailyStripContextMenu = (event: React.MouseEvent<HTMLElement>, dateKey: string, entry?: CalendarEntry) => {
    event.preventDefault();
    setDailyStripTooltip(null);
    const menuPosition = getOverlayPositionForTarget(event.currentTarget, 260, entry ? 236 : 196, 'left');
    setDailyStripContextMenu({
      ...menuPosition,
      dateKey,
      entry: entry || null,
    });
  };

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
                onContextMenu={(event) => openDailyStripContextMenu(event, dateKey, dayEntries[0])}
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
                  onContextMenu={(event) => openDailyStripContextMenu(event, dateKey, dayEntries[0])}
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
                onContextMenu={(event) => openDailyStripContextMenu(event, focusDateKey)}
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
                    onContextMenu={(event) => openDailyStripContextMenu(event, entry.date, entry)}
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
            <div className="mb-3 flex justify-start">
              {isFloatingApp ? (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="icon-close-button shrink-0"
                  aria-label="Close calendar day"
                  title="Close"
                >
                  <X size={20} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="btn-secondary"
                  aria-label="Back to calendar"
                  title="Back to Calendar"
                >
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
              )}
            </div>

            <form ref={dailyFormRef} onSubmit={(event) => saveEntry(event, 'Draft')} onKeyDown={handleDailyKeyDown} className="space-y-3">
              <div className="grid min-h-[34rem] grid-cols-1 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 xl:grid-cols-[18.5rem_minmax(0,1fr)] 2xl:grid-cols-[20.5rem_minmax(0,1fr)]">
                <aside className="border-b border-gray-200 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-900 xl:border-b-0 xl:border-r">
                  <div className="mb-2 flex min-h-[7.25rem] flex-col justify-center rounded-md border border-accent/30 bg-accent/10 px-3 py-3">
                    <p className="text-sm font-black uppercase tracking-[0.14em] text-accent">Trooper Daily</p>
                    <p className="mt-1 truncate text-base font-black text-gray-800 dark:text-gray-100">{getReadableDate(selectedDate)}</p>
                  </div>
                  <select
                    value={activeDailyPanel}
                    onChange={(event) => {
                      const panel = event.target.value;
                      if (hiddenDailySections.includes(panel)) {
                        showDailySection(panel);
                        pendingDailyFocusRef.current = 'field';
                        return;
                      }
                      selectDailyPanel(panel, true);
                    }}
                    className="mb-2 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-bold dark:border-gray-700 dark:bg-gray-950 xl:hidden"
                    aria-label="Trooper Daily section"
                  >
                    {dailyPanelOptions.map((panel) => (
                      <option key={panel} value={panel}>
                        {hiddenDailySections.includes(panel) ? `${panel} (hidden)` : panel}
                      </option>
                    ))}
                  </select>
                  <nav className="hidden gap-1 xl:grid" aria-label="Trooper Daily input sections">
                    {dailyPanelOptions.map((panel) => {
                      const panelSection = trooperDailySections.find((section) => section.title === panel);
                      const isHideablePanel = Boolean(panelSection || panel === 'T-Codes');
                      const isHidden = Boolean(isHideablePanel && hiddenDailySections.includes(panel));
                      const isComplete = panel === 'Administrative'
                        ? Boolean(entryForm.date && entryForm.dutyHours && entryForm.districtWorked && entryForm.specialStatus)
                        : panel === 'T-Codes'
                          ? isTCodeComplete
                        : panel === 'Narrative'
                          ? Boolean(entryForm.details?.narrative?.trim())
                          : Boolean(panelSection && isSectionComplete(entryForm.details, panelSection));
                      const isActive = activeDailyPanel === panel;

                      return (
                        <div
                          key={panel}
                          className={`group grid grid-cols-[minmax(0,1fr)_1.75rem] items-center rounded-md border transition-all duration-500 ${
                            isActive
                              ? 'trooper-daily-active-pulse border-accent bg-white text-accent shadow-sm dark:bg-gray-950'
                              : `border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-primary-500 dark:text-gray-300 dark:hover:border-gray-800 dark:hover:bg-gray-950 dark:hover:text-blue-100 ${isHidden ? 'opacity-50' : ''}`
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (isHidden && isHideablePanel) {
                                showDailySection(panel);
                                return;
                              }
                              setActiveDailyPanel(panel);
                            }}
                            className="grid min-w-0 grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-2 rounded px-2.5 py-2 text-left text-[0.95rem] font-bold leading-tight"
                            aria-current={isActive ? 'step' : undefined}
                            title={panel}
                          >
                            <span className="min-w-0 truncate">{panel}</span>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                              {isComplete ? (
                                <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={16} />
                              ) : (
                                <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-700'}`} />
                              )}
                            </span>
                          </button>
                          {isHideablePanel && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isHidden) {
                                  showDailySection(panel);
                                  return;
                                }
                                hideDailySection(panel);
                              }}
                              className="mx-auto flex h-6 w-6 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-accent dark:hover:bg-gray-800"
                              aria-label={`${isHidden ? 'Show' : 'Hide'} ${panel}`}
                              title={`${isHidden ? 'Show' : 'Hide'} ${panel}`}
                            >
                              {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          )}
                          {!isHideablePanel && <span className="mx-auto h-6 w-6" aria-hidden="true" />}
                        </div>
                      );
                    })}
                  </nav>
                </aside>

                <div className="min-w-0 bg-white dark:bg-gray-950">
                  <div className="border-b border-gray-200 bg-gray-50 px-2 pb-2 pt-1 dark:border-gray-800 dark:bg-gray-900">
                    <div className="mb-[-1px] ml-2 inline-flex items-center overflow-hidden rounded-t-md border border-b-0 border-accent/50 bg-white text-accent shadow-sm dark:bg-gray-950">
                      <button
                        type="button"
                        onClick={() => jumpDailyShortcutMonth(-1)}
                        className="flex h-8 w-8 items-center justify-center border-r border-accent/20 transition duration-300 hover:bg-accent/10"
                        aria-label="Previous daily report month"
                        title="Previous Month"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span key={dailyShortcutMonthLabel} className="trooper-daily-month-tab-label min-w-36 px-3 text-center text-xs font-black uppercase tracking-wide">
                        {dailyShortcutMonthLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => jumpDailyShortcutMonth(1)}
                        className="flex h-8 w-8 items-center justify-center border-l border-accent/20 transition duration-300 hover:bg-accent/10"
                        aria-label="Next daily report month"
                        title="Next Month"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white/70 px-1 py-1 dark:border-gray-800 dark:bg-gray-950/50">
                      <div className="overflow-x-auto overflow-y-hidden px-1 py-1.5">
                        <div className="grid min-w-[58rem] grid-cols-[repeat(31,minmax(0,1fr))] gap-1.5">
                          {dailyShortcutDays.map(({ day, dateKey, entry }) => {
                            const isSelectedShortcutDay = selectedDate === dateKey;
                            const isTodayShortcutDay = dateKey === todayKey;
                            const isDayOffShortcutDay = entry?.specialStatus === dayOffStatus;
                            const dailyStripStyle: DailyStripStyle | undefined = entry || isSelectedShortcutDay
                              ? {
                                  ...(entry ? { backgroundColor: isDayOffShortcutDay ? dayOffColor : entry.color } : {}),
                                  '--trooper-daily-strip-rgb': getHexColorRgb(isDayOffShortcutDay ? dayOffColor : entry?.color || entryForm.color),
                                }
                              : undefined;
                            return (
                              <button
                                key={dateKey}
                                type="button"
                                onClick={() => {
                                  setDailyStripTooltip(null);
                                  openDay(dateKey);
                                }}
                                onMouseEnter={(event) => showDailyStripTooltip(event.currentTarget, dateKey, entry)}
                                onMouseLeave={() => setDailyStripTooltip(null)}
                                onFocus={(event) => showDailyStripTooltip(event.currentTarget, dateKey, entry)}
                                onBlur={() => setDailyStripTooltip(null)}
                                onContextMenu={(event) => openDailyStripContextMenu(event, dateKey, entry)}
                                className={`relative flex h-8 min-w-0 items-center justify-center rounded-md border text-xs font-black transition duration-300 hover:-translate-y-0.5 hover:shadow-sm ${
                                  entry
                                    ? `trooper-daily-strip-filled border-transparent text-white ${isDayOffShortcutDay ? 'trooper-daily-strip-day-off' : ''}`
                                    : 'border-gray-300 bg-white text-gray-700 hover:border-accent hover:text-accent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200'
                                } ${isSelectedShortcutDay ? 'trooper-daily-strip-selected border-accent' : ''}`}
                                style={dailyStripStyle}
                                aria-label={`${isDayOffShortcutDay ? 'Open day off' : entry ? 'Open' : 'Create'} daily report for ${dateKey}`}
                              title={`${isDayOffShortcutDay ? 'Day Off' : entry ? 'Open' : 'Create'} ${dateKey}`}
                            >
                              {day}
                              {isTodayShortcutDay && (
                                <span
                                  className={`trooper-daily-strip-today-marker ${
                                    isSelectedShortcutDay || entry ? 'trooper-daily-strip-today-marker-on-fill' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                              )}
                              {entry && (
                                <span
                                  className={`trooper-daily-strip-filled-icon ${
                                    entry.submissionStatus === 'Submitted'
                                      ? 'trooper-daily-strip-filled-icon-submitted'
                                      : 'trooper-daily-strip-filled-icon-draft'
                                  }`}
                                  aria-hidden="true"
                                >
                                  <CheckCircle2 size={8} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid items-center gap-2 border-b border-gray-200 bg-accent/5 p-2 dark:border-gray-800 2xl:grid-cols-[minmax(12rem,18rem)_auto_minmax(10rem,1fr)_auto]">
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
                        <button type="button" onClick={resetShortcutEditor} className="btn-secondary" aria-label="Cancel shortcut edit" title="Cancel Shortcut Edit">
                          <X size={16} />
                        </button>
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

                  <div className={`sticky top-0 z-20 grid grid-cols-2 gap-2 border-b p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:grid-cols-4 ${
                    hasHourMismatch
                      ? 'border-danger/30 bg-red-50/95 dark:bg-red-950/80'
                      : 'border-accent/30 bg-white/95 dark:bg-gray-950/95'
                  }`}>
                    {hourMetrics.map((metric) => (
                      <HourMetricPill
                        key={metric.label}
                        label={metric.label}
                        value={`${formatHours(metric.value || 0)}h`}
                        helper={metric.helper}
                        isMatch={metric.isMatch}
                      />
                    ))}
                  </div>

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
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                              <CalendarDays size={16} />
                            </span>
                            <input
                              type="date"
                              value={entryForm.date}
                              onChange={(event) => {
                                setInvalidDailyField((field) => (field === 'entryDate' ? null : field));
                                setEntryForm((currentForm) => ({ ...currentForm, date: event.target.value }));
                              }}
                              data-daily-field="entryDate"
                              className={`trooper-daily-field-with-icon w-full rounded border bg-white py-2 pl-10 pr-3 dark:bg-gray-950 ${
                                invalidDailyField === 'entryDate'
                                  ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                  : 'border-gray-300 dark:border-gray-700'
                              }`}
                              required
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Duty Hours</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                              <Timer size={16} />
                            </span>
                            <input
                              type="text"
                              min="0"
                              inputMode="decimal"
                              maxLength={dailyInputCharacterLimit}
                              value={entryForm.dutyHours}
                              onChange={(event) => updateDutyHours(event.target.value)}
                              data-daily-field="dutyHours"
                              className={`trooper-daily-field-with-icon w-full rounded border bg-white py-2 pl-10 pr-9 transition dark:bg-gray-950 ${
                                invalidDailyField === 'dutyHours'
                                  ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                  : entryForm.dutyHours
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
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                              <MapPin size={16} />
                            </span>
                            <select
                              value={entryForm.districtWorked}
                              onChange={(event) =>
                                setEntryForm((currentForm) => ({ ...currentForm, districtWorked: event.target.value }))
                              }
                              data-daily-field="districtWorked"
                              className="trooper-daily-field-with-icon w-full appearance-none rounded border border-gray-300 bg-white py-2 pl-10 pr-10 dark:border-gray-700 dark:bg-gray-950"
                            >
                              {districtOptions.map((district) => (
                                <option key={district}>{district}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-300 dark:text-gray-200">
                              <ChevronRight className="rotate-90" size={17} />
                            </span>
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Special Status</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                              <BadgeCheck size={16} />
                            </span>
                            <select
                              value={entryForm.specialStatus}
                              onChange={(event) =>
                                setEntryForm((currentForm) => ({ ...currentForm, specialStatus: event.target.value }))
                              }
                              data-daily-field="specialStatus"
                              className="trooper-daily-field-with-icon w-full appearance-none rounded border border-gray-300 bg-white py-2 pl-10 pr-10 dark:border-gray-700 dark:bg-gray-950"
                            >
                              {specialStatusOptions.map((status) => (
                                <option key={status}>{status}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-300 dark:text-gray-200">
                              <ChevronRight className="rotate-90" size={17} />
                            </span>
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Color Code</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                              <Palette size={16} />
                            </span>
                            <select
                              value={entryForm.color}
                              onChange={(event) => setEntryForm((currentForm) => ({ ...currentForm, color: event.target.value }))}
                              data-daily-field="color"
                              className="trooper-daily-field-with-icon w-full appearance-none rounded border border-gray-300 bg-white py-2 pl-10 pr-10 dark:border-gray-700 dark:bg-gray-950"
                            >
                              {entryColors.map((color) => (
                                <option key={color.value} value={color.value}>{color.label}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-300 dark:text-gray-200">
                              <ChevronRight className="rotate-90" size={17} />
                            </span>
                          </div>
                        </label>
                      </div>

                      {hasHourMismatch && (
                        <p className="rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm font-semibold text-danger dark:bg-red-950/30">
                          Hours do not match the reported duty hours. Review shift times, attendance hours, and duty activity hours before submitting.
                        </p>
                      )}
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
                            {activeDailySection.fields.filter(([key]) => shouldShowDailyDetailField(entryForm.details, key) && isDetailComplete(entryForm.details, key)).length} of {activeDailySection.fields.filter(([key]) => shouldShowDailyDetailField(entryForm.details, key)).length} fields complete.
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
                        {activeDailySection.fields.filter(([key]) => shouldShowDailyDetailField(entryForm.details, key)).map(([key, label]) => {
                          const isTimeField = timeDetailFields.has(key);
                          const isComplete = isDetailComplete(entryForm.details, key);
                          const FieldIcon = getDailyFieldIcon(key);
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
                                  icon={FieldIcon}
                                />
                              ) : (
                                <div className="relative">
                                  <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                                    <FieldIcon size={15} />
                                  </span>
                                  <input
                                    type="text"
                                    inputMode={wholeNumberDetailFields.has(key) ? 'numeric' : 'decimal'}
                                    maxLength={dailyInputCharacterLimit}
                                    value={entryForm.details?.[key] || ''}
                                    onChange={(event) => updateDailyDetail(key, event.target.value)}
                                    data-daily-field={key}
                                    className={`trooper-daily-field-with-icon w-full rounded border bg-white py-2 pl-9 pr-8 text-sm transition dark:bg-gray-900 ${
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

                  {activeDailyPanel === 'T-Codes' && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                            <ListChecks size={18} className="text-accent" />
                            T-Codes
                            {isTCodeComplete && (
                              <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={18} />
                            )}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Add each T-Code worked and the time spent on it.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addTCodeRow}
                          className="btn-secondary"
                          disabled={tCodeOptions.length === 0}
                          aria-label="Add T-Code"
                          title="Add T-Code"
                        >
                          <Plus size={16} />
                          <span>Add T-Code</span>
                        </button>
                      </div>

                      <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold text-gray-700 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={hasNoTCodes}
                          onChange={(event) => setNoTCodes(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                        />
                        <span>No T-Codes</span>
                      </label>

                      {hasNoTCodes ? (
                        <div className="rounded border border-green-200 bg-green-50 px-3 py-4 text-sm font-semibold text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
                          Marked complete with no T-Codes.
                        </div>
                      ) : tCodeOptions.length === 0 ? (
                        <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          No T-Code options are configured.
                        </div>
                      ) : tCodeRows.length === 0 ? (
                        <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          No T-Codes added.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {tCodeRows.map((row) => (
                            <div key={row.id} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">T-Code</span>
                                <div className="relative">
                                  <select
                                    value={row.code}
                                    onChange={(event) => updateTCodeRow(row.id, { code: event.target.value })}
                                    className="w-full appearance-none rounded border border-gray-300 bg-white px-3 py-2 pr-9 text-sm dark:border-gray-700 dark:bg-gray-950"
                                    aria-label="T-Code option"
                                  >
                                    {tCodeOptions.map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-300 dark:text-gray-200">
                                    <ChevronRight className="rotate-90" size={17} />
                                  </span>
                                </div>
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Time Worked</span>
                                <div className="relative">
                                  <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
                                    <Timer size={15} />
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={row.timeWorked}
                                    onChange={(event) => updateTCodeRow(row.id, { timeWorked: sanitizeDecimalInput(event.target.value, 5) })}
                                    className="trooper-daily-field-with-icon w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-950"
                                    aria-label="T-Code time worked"
                                  />
                                </div>
                              </label>
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={() => deleteTCodeRow(row.id)}
                                  className="btn-danger w-full justify-center sm:w-auto"
                                  aria-label="Delete T-Code"
                                  title="Delete T-Code"
                                >
                                  <Trash2 size={16} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-3 z-10 text-gray-400 dark:text-gray-500">
                          <FileText size={16} />
                        </span>
                        <textarea
                          value={entryForm.details?.narrative || ''}
                          onChange={(event) => updateDailyDetail('narrative', event.target.value)}
                          placeholder="Type a narrative here"
                          maxLength={narrativeCharacterLimit}
                          data-daily-field="narrative"
                          className="trooper-daily-field-with-icon min-h-72 w-full rounded border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                        />
                      </div>
                    </div>
                  )}
                </section>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="flex w-fit max-w-full flex-wrap items-center justify-end gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                  {dailySaveStatusLabel && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ring-1 ${
                      dailySaveStatus === 'error'
                        ? 'bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900'
                        : dailySaveStatus === 'saving'
                          ? 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900'
                          : 'bg-green-50 text-green-700 ring-green-100 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-900'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${dailySaveStatus === 'saving' ? 'animate-pulse bg-blue-500' : dailySaveStatus === 'error' ? 'bg-amber-500' : 'bg-green-500'}`} />
                      {dailySaveStatusLabel}
                    </span>
                  )}
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
              </div>
            </form>

          </div>
        </div>
      )}

      {dailyStripTooltip && (
        <div
          className="pointer-events-none z-[100] w-52 rounded-md bg-black px-3 py-2 text-left text-xs font-bold text-white shadow-2xl ring-1 ring-white/10"
          style={{ position: dailyStripTooltip.strategy, left: dailyStripTooltip.x, top: dailyStripTooltip.y }}
        >
          <span className="block text-accent">{dailyStripTooltip.dateKey}</span>
          {dailyStripTooltip.entry ? (
            <>
              <span className="mt-1 block">{dailyStripTooltip.entry.submissionStatus} - {dailyStripTooltip.entry.dutyHours || 0}h</span>
              <span className="mt-0.5 block text-gray-300">{dailyStripTooltip.entry.districtWorked || 'No district'}</span>
            </>
          ) : (
            <span className="mt-1 block text-gray-300">No daily report yet</span>
          )}
        </div>
      )}

      {dailyStripContextMenu && (
        <div
          className="quick-launch-context-menu z-[100] min-w-64 overflow-hidden rounded border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{
            position: dailyStripContextMenu.strategy,
            left: dailyStripContextMenu.x,
            top: dailyStripContextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              openDay(dailyStripContextMenu.dateKey);
              setDailyStripContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <span>{dailyStripContextMenu.entry ? 'Open Daily' : 'Create Daily'}</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Enter</span>
          </button>
          <button
            type="button"
            onClick={() => {
              copyDailyToClipboard(dailyStripContextMenu.dateKey, dailyStripContextMenu.entry);
              setDailyStripContextMenu(null);
            }}
            disabled={!dailyStripContextMenu.entry && selectedDate !== dailyStripContextMenu.dateKey}
            className="quick-launch-context-menu-item text-gray-700 disabled:cursor-not-allowed disabled:opacity-45 dark:text-gray-200"
          >
            <span>Copy Daily</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Ctrl+C</span>
          </button>
          <button
            type="button"
            onClick={() => {
              pasteCopiedDailyToDate(dailyStripContextMenu.dateKey);
              setDailyStripContextMenu(null);
            }}
            disabled={!copiedDailyForm}
            className="quick-launch-context-menu-item text-gray-700 disabled:cursor-not-allowed disabled:opacity-45 dark:text-gray-200"
          >
            <span>Paste Daily</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Ctrl+V</span>
          </button>
          <button
            type="button"
            onClick={() => {
              copyPreviousDailyToDate(dailyStripContextMenu.dateKey);
              setDailyStripContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <span>Copy Previous Daily</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">P</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void markDailyAsDayOff(dailyStripContextMenu.dateKey);
              setDailyStripContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <span>Mark Day Off</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">D</span>
          </button>
          {dailyStripContextMenu.entry && (
            <button
              type="button"
              onClick={() => {
                setEntryPendingDelete(dailyStripContextMenu.entry);
                setDailyStripContextMenu(null);
              }}
              className="quick-launch-context-menu-item quick-launch-context-menu-danger text-danger"
            >
              <span>Delete Daily</span>
              <span className="ml-auto text-xs font-black text-red-300">Del</span>
            </button>
          )}
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
