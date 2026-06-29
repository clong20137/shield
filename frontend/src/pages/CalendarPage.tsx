import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, DollarSign, Eye, EyeOff, FileText, Gavel, ListChecks, LucideIcon, MapPin, Palette, Pill, Plus, RefreshCw, Save, ShieldAlert, Sparkles, Timer, Trash2, Truck, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AuthAccount, CalendarEntry, CalendarShortcut, authService, calendarService } from '../services/api';
import { districtOptions } from '../constants/districts';
import { AppContextMenu, AppContextMenuPosition, shouldUseNativeContextMenu } from '../components/AppContextMenu';
import { TimeDetailInput } from '../components/calendar/TimeDetailInput';

type DailyStripStyle = React.CSSProperties & {
  '--trooper-daily-strip-rgb'?: string;
};
type OverlayPosition = { x: number; y: number; strategy: 'fixed' | 'absolute' };
type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;
type CalendarView = 'day' | 'week' | 'month';
type DailySaveStatus = 'idle' | 'local' | 'saving' | 'saved' | 'error';
type DailyValidationTarget = {
  panel: string;
  field: string;
  message: string;
};
type DailyPanelCompletionState = 'complete' | 'attention' | 'warning' | 'progress' | 'empty';
type SmartDailyCheck = {
  id: string;
  title: string;
  detail: string;
  panel: string;
  field: string;
  severity: 'warning' | 'attention';
};
type StoredTrooperDailyDraft = {
  form: CalendarEntryForm;
  editingEntryId: string | null;
  savedAt: number;
};
type DeletedDailyUndo = {
  entry: CalendarEntry;
  wasSelected: boolean;
};

const vacationStatus = 'Vacation Day';
const sickStatus = 'Sick Day';
const vacationColor = '#2563EB';
const sickColor = '#DC2626';
const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', vacationStatus, sickStatus];
const narrativeCharacterLimit = 1000;
const dailyInputCharacterLimit = 5;
const tCodeHourInputCharacterLimit = 6;
const trooperDailyDraftStoragePrefix = 'shield_trooper_daily_draft';
const tCodeDetailsKey = 'tCodes';
const noTCodeDetailsKey = 'noTCodes';
type TrooperDailyField = readonly [string, string];
type TrooperDailySection = {
  title: string;
  fields: readonly TrooperDailyField[];
};
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

const trooperDailySections: readonly TrooperDailySection[] = [
  {
    title: 'Regular Duty',
    fields: [
      ['regularDutyStartTime', 'Start Time'],
      ['regularDutyEndTime', 'End Time'],
      ['splitStartTime', 'Split Start Time'],
      ['splitEndTime', 'Split End Time'],
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

const trooperDailyFieldLabels = new Map(
  trooperDailySections.flatMap((section) => section.fields.map(([key, label]) => [key, label] as const)),
);

const regularDutySplitTimeFields: readonly TrooperDailyField[] = [
  ['splitStartTime', 'Split Start Time'],
  ['splitEndTime', 'Split End Time'],
  ['secondSplitStartTime', '2nd Split Start Time'],
  ['secondSplitEndTime', '2nd Split End Time'],
  ['thirdSplitStartTime', '3rd Split Start Time'],
  ['thirdSplitEndTime', '3rd Split End Time'],
] as const;

const regularDutySplitPairs: readonly (readonly [string, string])[] = [
  ['splitStartTime', 'splitEndTime'],
  ['secondSplitStartTime', 'secondSplitEndTime'],
  ['thirdSplitStartTime', 'thirdSplitEndTime'],
] as const;

const getRegularDutySplitPairIndex = (key: string): number =>
  regularDutySplitPairs.findIndex((pair) => pair.includes(key));

const getRegularDutySplitPairKeysFrom = (pairIndex: number): string[] =>
  regularDutySplitPairs.slice(pairIndex).flat();

const getRegularDutySplitPairCountFromDetails = (details?: Record<string, string>): number => {
  if (details?.thirdSplitStartTime?.trim() || details?.thirdSplitEndTime?.trim()) {
    return 3;
  }

  if (details?.secondSplitStartTime?.trim() || details?.secondSplitEndTime?.trim()) {
    return 2;
  }

  return 1;
};

const getRegularDutySectionFields = (splitPairCount = 1): readonly TrooperDailyField[] => {
  const safeSplitPairCount = Math.min(3, Math.max(1, splitPairCount));
  return [
    ['regularDutyStartTime', 'Start Time'],
    ['regularDutyEndTime', 'End Time'],
    ...regularDutySplitTimeFields.slice(0, safeSplitPairCount * 2),
    ['regularDutyMiles', 'Regular Duty Miles'],
  ];
};

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

const fullLeaveWaivedDailySections = new Set<string>([
  'Regular Duty',
  'Duty Hours',
  'Traffic Activity',
  'OWI Offense Activity',
  '10K Truck Activity',
  'Level 1-3 Regular Duty Inspections',
  'Criminal Activity',
  'Drug Activity',
  'T-Codes',
]);

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
    .filter((key) => !key.toLowerCase().includes('grams') && key !== 'pbt'),
);

const narrativeActivityKeys = [
  'citations',
  'warnings',
  'crashesInvestigated',
  'callsForService',
  'motoristAssists',
  'totalCriminalArrests',
  'criminalDefendants',
  'owiDefendants',
  'vehicleInspections',
  'commercialVehicleInspections',
  'totalDrugArrests',
  'totalDrugDefendants',
] as const;

type NarrativeLearningProfile = {
  exampleCount: number;
  firstPerson: boolean;
  terse: boolean;
  sentenceJoiner: string;
  hourWord: 'hours' | 'hrs';
};

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

function mergeSavedCalendarEntry(currentEntries: CalendarEntry[], savedEntry: CalendarEntry, previousEntryId?: string | null) {
  const hasSavedEntry = currentEntries.some((entry) => entry.id === savedEntry.id);
  const nextEntries = currentEntries
    .filter((entry) => !previousEntryId || previousEntryId === savedEntry.id || entry.id !== previousEntryId)
    .filter((entry) => !(entry.id.startsWith('local-draft-') && entry.date === savedEntry.date))
    .map((entry) => (entry.id === savedEntry.id ? savedEntry : entry));

  return hasSavedEntry ? nextEntries : [savedEntry, ...nextEntries];
}

function getCalendarEntryForDate(entries: CalendarEntry[], dateKey: string, preferredEntryId?: string | null) {
  return entries
    .filter((entry) => entry.date === dateKey)
    .sort((firstEntry, secondEntry) => {
      if (preferredEntryId) {
        if (firstEntry.id === preferredEntryId) return -1;
        if (secondEntry.id === preferredEntryId) return 1;
      }

      const firstIsLocal = firstEntry.id.startsWith('local-draft-');
      const secondIsLocal = secondEntry.id.startsWith('local-draft-');
      if (firstIsLocal !== secondIsLocal) {
        return firstIsLocal ? 1 : -1;
      }

      return new Date(secondEntry.updatedAt || 0).getTime() - new Date(firstEntry.updatedAt || 0).getTime();
    })[0] || null;
}

function isExpectedAutosaveDraftError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }

  const response = (error as { response?: { status?: number; data?: { error?: string } } }).response;
  const message = response?.data?.error || '';
  return response?.status === 404 || response?.status === 409 || message.includes('Submitted reports cannot be autosaved');
}

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

const getDailyReviewStatus = (entry?: CalendarEntry | null): CalendarEntry['reviewStatus'] =>
  entry?.reviewStatus || 'Pending';

const getDailyReviewLabel = (entry?: CalendarEntry | null): string | null => {
  if (!entry || entry.submissionStatus !== 'Submitted') {
    return null;
  }

  if (getDailyReviewStatus(entry) === 'Approved') {
    return 'Approved by supervisor';
  }

  if (getDailyReviewStatus(entry) === 'Returned') {
    return 'Returned by supervisor';
  }

  return 'Pending supervisor review';
};

const getDailyReviewBadgeClass = (entry?: CalendarEntry | null): string => {
  const status = getDailyReviewStatus(entry);

  if (status === 'Approved') {
    return 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200';
  }

  if (status === 'Returned') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
};

const getDailyReviewIcon = (entry?: CalendarEntry | null) => {
  const status = getDailyReviewStatus(entry);

  if (status === 'Approved') {
    return BadgeCheck;
  }

  if (status === 'Returned') {
    return X;
  }

  return ShieldAlert;
};

const formatDailyReviewedAt = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

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

function formatNarrativeHours(value: string | number, profile: NarrativeLearningProfile): string {
  return `${typeof value === 'number' ? formatHours(value) : value} ${profile.hourWord}`;
}

function getNarrativeActivitySummary(details: Record<string, string>): string[] {
  return narrativeActivityKeys
    .map((key) => {
      const value = parseNumericDetail(details, key);
      const label = trooperDailyFieldLabels.get(key);
      return value > 0 && label ? `${formatHours(value)} ${label.toLowerCase()}` : '';
    })
    .filter(Boolean);
}

function getNarrativeTokens(entry: Pick<CalendarEntryForm, 'dutyHours' | 'districtWorked' | 'specialStatus' | 'details'>): Set<string> {
  const details = entry.details || {};
  const tokens = new Set<string>();
  if (entry.dutyHours) tokens.add('duty-hours');
  if (entry.districtWorked) tokens.add(`district:${entry.districtWorked.toLowerCase()}`);
  if (entry.specialStatus && entry.specialStatus !== 'None') tokens.add(`status:${entry.specialStatus.toLowerCase()}`);
  if (calculateShiftHours(details) > 0) tokens.add('shift-time');
  if (parseNumericDetail(details, 'regularDutyMiles') > 0) tokens.add('miles');
  getNarrativeActivitySummary(details).forEach((summary) => tokens.add(`activity:${summary.replace(/^\d+(\.\d+)?\s+/u, '')}`));
  parseTCodeDetails(details)
    .filter((row) => row.code.trim() || row.timeWorked.trim())
    .forEach((row) => tokens.add(`tcode:${row.code.trim().toLowerCase() || 'unspecified'}`));
  return tokens;
}

function scoreNarrativeExample(entry: CalendarEntry, currentForm: CalendarEntryForm): number {
  if (entry.category !== 'Trooper Daily' || !entry.details?.narrative?.trim()) {
    return 0;
  }

  const currentTokens = getNarrativeTokens(currentForm);
  const entryTokens = getNarrativeTokens(entry);
  let score = 0;
  currentTokens.forEach((token) => {
    if (entryTokens.has(token)) {
      score += token.startsWith('activity:') || token.startsWith('tcode:') ? 2 : 1;
    }
  });

  if (entry.specialStatus === currentForm.specialStatus) score += 2;
  if (entry.districtWorked === currentForm.districtWorked) score += 1;
  return score;
}

function getNarrativeLearningProfile(entries: CalendarEntry[], currentForm: CalendarEntryForm, editingEntryId: string | null): NarrativeLearningProfile {
  const scoredExamples = entries
    .filter((entry) => entry.id !== editingEntryId && entry.category === 'Trooper Daily' && entry.details?.narrative?.trim())
    .map((entry) => ({
      entry,
      score: scoreNarrativeExample(entry, currentForm),
    }))
    .sort((left, right) => right.score - left.score || new Date(right.entry.date).getTime() - new Date(left.entry.date).getTime());
  const examples = (scoredExamples.some((example) => example.score > 0)
    ? scoredExamples.filter((example) => example.score > 0)
    : scoredExamples)
    .slice(0, 8)
    .map((example) => example.entry.details.narrative.trim());

  if (examples.length === 0) {
    return {
      exampleCount: 0,
      firstPerson: false,
      terse: false,
      sentenceJoiner: ' ',
      hourWord: 'hours',
    };
  }

  const firstPersonCount = examples.filter((narrative) => /\bI\s+(worked|patrolled|responded|completed|conducted|handled|reported|recorded)\b/iu.test(narrative)).length;
  const hrsCount = examples.filter((narrative) => /\bhrs?\b/iu.test(narrative)).length;
  const hoursCount = examples.filter((narrative) => /\bhours?\b/iu.test(narrative)).length;
  const semicolonCount = examples.filter((narrative) => narrative.split(';').length > narrative.split('.').length).length;
  const newlineCount = examples.filter((narrative) => narrative.includes('\n')).length;
  const averageWords = examples.reduce((total, narrative) => total + narrative.split(/\s+/u).filter(Boolean).length, 0) / examples.length;

  return {
    exampleCount: examples.length,
    firstPerson: firstPersonCount > examples.length / 2,
    terse: semicolonCount > examples.length / 2 || averageWords < 34,
    sentenceJoiner: newlineCount > examples.length / 2 ? '\n' : semicolonCount > examples.length / 2 ? '; ' : ' ',
    hourWord: hrsCount > hoursCount ? 'hrs' : 'hours',
  };
}

function getDefaultDutyHours(currentUser?: AuthAccount): string {
  const hours = Number(currentUser?.defaultDutyHours);
  return Number.isFinite(hours) && hours >= 0 ? formatHours(hours) : '8';
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

function getDifferenceLabel(firstValue: number, secondValue: number): string {
  const difference = Math.abs(firstValue - secondValue);
  return difference <= 0.01 ? 'Matches' : `${formatHours(difference)} hr off`;
}

function getHourTargetLabel(targetHours: number, actualHours: number, label = 'Matches'): string {
  const difference = Math.abs(targetHours - actualHours);
  return difference <= 0.01 ? label : `${formatHours(difference)} hr off`;
}

function isHourMatch(reportedHours: number, comparisonHours: number): boolean {
  return reportedHours > 0 && comparisonHours > 0 && Math.abs(reportedHours - comparisonHours) <= 0.01;
}

function isHourTargetMatch(targetHours: number, comparisonHours: number): boolean {
  return targetHours > 0 && comparisonHours > 0 && Math.abs(targetHours - comparisonHours) <= 0.01;
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
        timeWorked: sanitizeDecimalInput(String(row.timeWorked || ''), 3, tCodeHourInputCharacterLimit),
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
      timeWorked: sanitizeDecimalInput(row.timeWorked, 3, tCodeHourInputCharacterLimit),
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

function calculateTCodeHours(details: Record<string, string> | undefined): number {
  return parseTCodeDetails(details).reduce((total, row) => {
    const value = Number(row.timeWorked);
    return Number.isFinite(value) && value > 0 ? total + value : total;
  }, 0);
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

function isSectionComplete(details: Record<string, string> | undefined, section: TrooperDailySection): boolean {
  const visibleFields = section.fields.filter(([key]) => shouldShowDailyDetailField(details, key));
  return visibleFields.every(([key]) => isDetailComplete(details, key));
}

function isSectionTouched(details: Record<string, string> | undefined, section: TrooperDailySection): boolean {
  return section.fields
    .filter(([key]) => shouldShowDailyDetailField(details, key))
    .some(([key]) => isDetailComplete(details, key));
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
  requestedDate = null,
}: {
  currentUser: AuthAccount;
  onAccountUpdate?: (account: AuthAccount) => void;
  useMilitaryTime?: boolean;
  isFloatingApp?: boolean;
  requestedDate?: string | null;
}) {
  const location = useLocation();
  const requestedDailyDate = useMemo(() => {
    const date = requestedDate || new URLSearchParams(location.search).get('date');
    return isValidDateKey(date) ? date : null;
  }, [location.search, requestedDate]);
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
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [isRestoringDeletedDaily, setIsRestoringDeletedDaily] = useState(false);
  const [activeDailyPanel, setActiveDailyPanel] = useState<string>('Administrative');
  const [dailyUseMilitaryTime, setDailyUseMilitaryTime] = useState(useMilitaryTime);
  const [hiddenDailySections, setHiddenDailySections] = useState<string[]>(currentUser.trooperDailyHiddenSections || []);
  const [shortcuts, setShortcuts] = useState<CalendarShortcut[]>([]);
  const [tCodeOptions, setTCodeOptions] = useState<string[]>([]);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isDutyHoursManual, setIsDutyHoursManual] = useState(false);
  const [isSavingDaily, setIsSavingDaily] = useState(false);
  const [isSubmitReviewOpen, setIsSubmitReviewOpen] = useState(false);
  const [dailySaveStatus, setDailySaveStatus] = useState<DailySaveStatus>('idle');
  const [dailySaveStatusAt, setDailySaveStatusAt] = useState<number | null>(null);
  const [invalidDailyField, setInvalidDailyField] = useState<string | null>(null);
  const [invalidDailyPanel, setInvalidDailyPanel] = useState<string | null>(null);
  const [dailyStripTooltip, setDailyStripTooltip] = useState<(OverlayPosition & { dateKey: string; entry: CalendarEntry | null }) | null>(null);
  const [dailyStripContextMenu, setDailyStripContextMenu] = useState<(OverlayPosition & { dateKey: string; entry: CalendarEntry | null }) | null>(null);
  const [pageContextMenu, setPageContextMenu] = useState<AppContextMenuPosition | null>(null);
  const [dailyStatusHours, setDailyStatusHours] = useState(() => {
    const defaultHours = getDefaultDutyHours(currentUser);
    return { vacation: defaultHours, sick: defaultHours };
  });
  const [copiedDailyForm, setCopiedDailyForm] = useState<CalendarEntryForm | null>(null);
  const [regularDutySplitPairCount, setRegularDutySplitPairCount] = useState(1);
  const lastAutoDutyHoursRef = useRef('');
  const dailyFormRef = useRef<HTMLFormElement | null>(null);
  const skipNextDailyDraftWriteRef = useRef(false);
  const backendAutosaveRequestRef = useRef(0);
  const entriesRef = useRef<CalendarEntry[]>([]);
  const calendarLoadInFlightRef = useRef(false);
  const calendarRefreshTimerRef = useRef<number | null>(null);
  const deletedDailyUndoRef = useRef<DeletedDailyUndo | null>(null);
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
    const defaultHours = getDefaultDutyHours(currentUser);
    setDailyStatusHours({ vacation: defaultHours, sick: defaultHours });
  }, [currentUser.defaultDutyHours]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    setDailyUseMilitaryTime(useMilitaryTime);
  }, [useMilitaryTime]);

  const loadCalendarEntries = async (showLoading = true) => {
    if (calendarLoadInFlightRef.current) {
      return;
    }

    calendarLoadInFlightRef.current = true;
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
      calendarLoadInFlightRef.current = false;
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
    const handleCalendarUpdate = () => {
      if (calendarRefreshTimerRef.current) {
        window.clearTimeout(calendarRefreshTimerRef.current);
      }

      calendarRefreshTimerRef.current = window.setTimeout(() => {
        calendarRefreshTimerRef.current = null;
        void loadCalendarEntries(false);
      }, 350);
    };

    window.addEventListener('shield:calendar-updated', handleCalendarUpdate);
    return () => {
      window.removeEventListener('shield:calendar-updated', handleCalendarUpdate);
      if (calendarRefreshTimerRef.current) {
        window.clearTimeout(calendarRefreshTimerRef.current);
        calendarRefreshTimerRef.current = null;
      }
    };
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
    const existingEntry = getCalendarEntryForDate(entries, dateKey, editingEntryId);
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
    setEntryFormAndSyncSplitPairs(nextForm);
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

    const currentEditingEntryId = editingEntryId && !editingEntryId.startsWith('local-draft-') ? editingEntryId : null;
    const editingEntry = currentEditingEntryId
      ? entriesRef.current.find((entry) => entry.id === currentEditingEntryId)
      : null;
    if (editingEntry?.submissionStatus === 'Submitted') {
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
        entryId: currentEditingEntryId,
      };

      void calendarService.autosaveDraft(payload)
        .then((response) => {
          if (backendAutosaveRequestRef.current !== requestId) {
            return;
          }

          setEntries((currentEntries) => mergeSavedCalendarEntry(currentEntries, response.data, currentEditingEntryId));
          setEditingEntryId(response.data.id);
          setDailySaveStatus('saved');
          setDailySaveStatusAt(Date.now());
        })
        .catch((err) => {
          if (backendAutosaveRequestRef.current !== requestId) {
            return;
          }

          if (isExpectedAutosaveDraftError(err)) {
            setDailySaveStatus('idle');
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
    setEntryFormAndSyncSplitPairs(previousForm);
  };

  const redoDailyChange = () => {
    const nextForm = dailyRedoStackRef.current.pop();
    if (!nextForm) {
      return;
    }

    dailyUndoStackRef.current.push(entryForm);
    isRestoringDailyHistoryRef.current = true;
    setEntryFormAndSyncSplitPairs(nextForm);
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
      const target = dailyFormRef.current?.querySelector<HTMLElement>(`[data-daily-field="${fieldName}"]`);
      if (!target) {
        return;
      }

      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      target.focus({ preventScroll: true });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.select();
      }
    }, 0);
  };

  const showDailyValidationTarget = (target: DailyValidationTarget) => {
    setIsSubmitReviewOpen(false);
    setActiveDailyPanel(target.panel);
    setInvalidDailyPanel(target.panel);
    setInvalidDailyField(target.field);
    setCalendarError(target.message);
    window.setTimeout(() => focusDailyField(target.field), activeDailyPanel === target.panel ? 0 : 90);
  };

  const openSmartDailyCheck = (check: SmartDailyCheck) => {
    showDailyValidationTarget({
      panel: check.panel,
      field: check.field,
      message: check.detail,
    });
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
        void restoreDeletedDaily().then((didRestore) => {
          if (!didRestore) {
            undoDailyChange();
          }
        });
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

  const saveEntry = async (
    event?: Pick<React.SyntheticEvent, 'preventDefault'>,
    submissionStatus: CalendarEntry['submissionStatus'] = 'Draft',
    skipSubmitReview = false,
  ) => {
    event?.preventDefault();

    if (isSavingDaily) {
      return;
    }

    const hours = Number(entryForm.dutyHours);

    if (!entryForm.date) {
      showDailyValidationTarget({
        panel: 'Administrative',
        field: 'entryDate',
        message: 'Date is required.',
      });
      return;
    }

    if (!entryForm.dutyHours.trim() || Number.isNaN(hours) || hours < 0) {
      showDailyValidationTarget({
        panel: 'Administrative',
        field: 'dutyHours',
        message: 'Duty hours are required before saving or submitting.',
      });
      return;
    }

    if (!entryForm.districtWorked.trim()) {
      showDailyValidationTarget({
        panel: 'Administrative',
        field: 'districtWorked',
        message: 'District worked is required before saving or submitting.',
      });
      return;
    }

    if (!entryForm.specialStatus.trim()) {
      showDailyValidationTarget({
        panel: 'Administrative',
        field: 'specialStatus',
        message: 'Special status is required before saving or submitting.',
      });
      return;
    }

    if (!hasNoTCodeSelection(entryForm.details)) {
      const incompleteTCode = parseTCodeDetails(entryForm.details).find((row) => !row.code.trim() || !row.timeWorked.trim());
      if (incompleteTCode) {
        showDailyValidationTarget({
          panel: 'T-Codes',
          field: !incompleteTCode.code.trim() ? `tCode-${incompleteTCode.id}-code` : `tCode-${incompleteTCode.id}-time`,
          message: 'Complete the T-Code row or delete it before saving or submitting.',
        });
        return;
      }
    }

    if (submissionStatus === 'Submitted' && hasHourMismatch) {
      const mismatchPanel = attendanceHours > 0 && Math.abs(attendanceHours - hours) > 0.01
        ? 'Attendance Hours'
        : dutyActivityHours > 0 && Math.abs(dutyActivityHours - shiftDutyTargetHours) > 0.01
          ? 'Duty Hours'
          : 'Regular Duty';
      showDailyValidationTarget({
        panel: mismatchPanel,
        field: mismatchPanel === 'Attendance Hours'
          ? 'regularDutyHours'
          : mismatchPanel === 'Duty Hours'
            ? 'patrolHours'
            : 'regularDutyStartTime',
        message: 'Hours do not match. Update the highlighted section before submitting.',
      });
      return;
    }

    if (submissionStatus === 'Submitted' && !skipSubmitReview) {
      setIsSubmitReviewOpen(true);
      return;
    }

    setInvalidDailyField(null);
    setInvalidDailyPanel(null);
    setCalendarError(null);
    setIsSubmitReviewOpen(false);
    setIsSavingDaily(true);
    setDailySaveStatus('saving');
    backendAutosaveRequestRef.current += 1;
    try {
      const payload = {
        ...entryForm,
        submissionStatus,
        dutyHours: hours.toFixed(2).replace(/\.?0+$/u, ''),
        accountId: currentUser.id,
        ...actor,
      };

      const existingEntryForDate = entries.find((entry) => entry.date === entryForm.date && !entry.id.startsWith('local-draft-'));
      const targetEntryId = editingEntryId && !editingEntryId.startsWith('local-draft-')
        ? editingEntryId
        : existingEntryForDate?.id || null;

      if (targetEntryId) {
        const response = await calendarService.update(targetEntryId, payload);
        setEntries((currentEntries) =>
          currentEntries.map((entry) => (entry.id === targetEntryId ? response.data : entry)),
        );
        removeTrooperDailyDraft(currentUser.id, response.data.date);
        skipNextDailyDraftWriteRef.current = true;
        setSelectedDate(response.data.date);
        setEditingEntryId(response.data.id);
        setEntryFormAndSyncSplitPairs(createEntryFormFromEntry(response.data));
      } else {
        const response = await calendarService.create(payload);
        setEntries((currentEntries) => mergeSavedCalendarEntry(currentEntries, response.data));
        removeTrooperDailyDraft(currentUser.id, response.data.date);
        skipNextDailyDraftWriteRef.current = true;
        setSelectedDate(response.data.date);
        setEditingEntryId(response.data.id);
        setEntryFormAndSyncSplitPairs(createEntryFormFromEntry(response.data));
      }
      setDailySaveStatus('saved');
      setDailySaveStatusAt(Date.now());
      setIsDutyHoursManual(true);
      lastAutoDutyHoursRef.current = '';
    } catch (err) {
      console.error('Failed to save calendar entry:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to save calendar entry.'));
      setDailySaveStatus('error');
      setDailySaveStatusAt(Date.now());
    } finally {
      setIsSavingDaily(false);
    }
  };

  const deleteEntry = async (entry: CalendarEntry) => {
    setCalendarError(null);
    if (deletingEntryId) {
      return;
    }

    setDeletingEntryId(entry.id);
    try {
      if (!entry.id.startsWith('local-draft-')) {
        await calendarService.delete(entry.id, { ...actor, accountId: currentUser.id });
      }

      deletedDailyUndoRef.current = {
        entry,
        wasSelected: selectedDate === entry.date,
      };
      setEntries((currentEntries) => currentEntries.filter((currentEntry) => currentEntry.id !== entry.id));
      removeTrooperDailyDraft(currentUser.id, entry.date);
      if (editingEntryId === entry.id) {
        setEditingEntryId(null);
        skipNextDailyDraftWriteRef.current = true;
        setEntryFormAndSyncSplitPairs(createDefaultEntryForm(selectedDate || entry.date, currentUser));
        setIsDutyHoursManual(false);
        lastAutoDutyHoursRef.current = '';
      }
      setEntryPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete calendar entry:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to delete calendar entry.'));
    } finally {
      setDeletingEntryId(null);
    }
  };

  const restoreDeletedDaily = async () => {
    const undo = deletedDailyUndoRef.current;
    if (!undo || isRestoringDeletedDaily) {
      return false;
    }

    setCalendarError(null);
    setIsRestoringDeletedDaily(true);
    backendAutosaveRequestRef.current += 1;
    try {
      const form = createEntryFormFromEntry(undo.entry);
      let restoredEntry = undo.entry;

      if (undo.entry.id.startsWith('local-draft-')) {
        const savedAt = writeTrooperDailyDraft(currentUser.id, form, undo.entry.id);
        restoredEntry = {
          ...undo.entry,
          updatedAt: new Date(savedAt || Date.now()).toISOString(),
        };
        setEntries((currentEntries) => mergeSavedCalendarEntry(currentEntries, restoredEntry));
      } else {
        const response = await calendarService.create({
          ...form,
          accountId: currentUser.id,
          ...actor,
        });
        restoredEntry = response.data;
        setEntries((currentEntries) => mergeSavedCalendarEntry(currentEntries, restoredEntry));
        removeTrooperDailyDraft(currentUser.id, restoredEntry.date);
      }

      deletedDailyUndoRef.current = null;
      skipNextDailyDraftWriteRef.current = true;
      if (undo.wasSelected || selectedDate === restoredEntry.date) {
        setSelectedDate(restoredEntry.date);
        setCalendarFocusDate(new Date(`${restoredEntry.date}T00:00:00`));
        setEditingEntryId(restoredEntry.id);
        setEntryFormAndSyncSplitPairs(createEntryFormFromEntry(restoredEntry));
        setIsDutyHoursManual(true);
        setDailySaveStatus('saved');
        setDailySaveStatusAt(Date.now());
        lastAutoDutyHoursRef.current = '';
      }
      return true;
    } catch (err) {
      console.error('Failed to undo daily delete:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to undo deleted daily.'));
      return false;
    } finally {
      setIsRestoringDeletedDaily(false);
    }
  };

  const updateDailyDetail = (key: string, value: string) => {
    setInvalidDailyField((field) => (field === key ? null : field));
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

  const setRegularDutyPairCountFromDetails = (details: CalendarEntryForm['details']) => {
    setRegularDutySplitPairCount(getRegularDutySplitPairCountFromDetails(details || {}));
  };

  const setEntryFormAndSyncSplitPairs = (nextForm: CalendarEntryForm) => {
    setEntryForm(nextForm);
    setRegularDutyPairCountFromDetails(nextForm.details);
  };

  const addRegularDutySplitPair = () => {
    setRegularDutySplitPairCount((currentPairCount) => Math.min(3, currentPairCount + 1));
  };

  const removeRegularDutySplitPair = (pairIndex: number) => {
    if (pairIndex <= 0 || pairIndex >= regularDutySplitPairCount) {
      return;
    }

    const nextPairCount = Math.max(1, regularDutySplitPairCount - 1);
    const keysToClearValidation = getRegularDutySplitPairKeysFrom(pairIndex);
    if (keysToClearValidation.length === 0) {
      setRegularDutySplitPairCount(nextPairCount);
      return;
    }

    setEntryForm((currentForm) => {
      const nextDetails = { ...(currentForm.details || {}) };

      for (let index = pairIndex; index < regularDutySplitPairCount - 1; index += 1) {
        const currentPair = regularDutySplitPairs[index];
        const nextPair = regularDutySplitPairs[index + 1];
        currentPair.forEach((key, keyIndex) => {
          const nextKey = nextPair[keyIndex];
          if (nextDetails[nextKey]) {
            nextDetails[key] = nextDetails[nextKey];
          } else {
            delete nextDetails[key];
          }
        });
      }

      regularDutySplitPairs[regularDutySplitPairCount - 1].forEach((key) => {
        delete nextDetails[key];
      });

      const nextForm = {
        ...currentForm,
        details: nextDetails,
      };

      if (!isDutyHoursManual) {
        const shiftHours = calculateShiftHours(nextDetails);
        if (shiftHours > 0) {
          const formattedHours = formatHours(shiftHours);
          nextForm.dutyHours = formattedHours;
          lastAutoDutyHoursRef.current = formattedHours;
        } else if (currentForm.dutyHours === lastAutoDutyHoursRef.current) {
          nextForm.dutyHours = '';
          lastAutoDutyHoursRef.current = '';
        }
      }

      return nextForm;
    });
    setRegularDutySplitPairCount(nextPairCount);
    setInvalidDailyField((field) => (field && keysToClearValidation.includes(field) ? null : field));
  };

  const clearDailySectionFields = (section: TrooperDailySection) => {
    if (section.title === 'Regular Duty') {
      setRegularDutySplitPairCount(1);
    }

    setEntryForm((currentForm) => {
      const nextDetails = { ...(currentForm.details || {}) };
      const sectionKeys = section.fields.map(([key]) => key);

      sectionKeys.forEach((key) => {
        if (timeDetailFields.has(key) || key === 'narrative') {
          delete nextDetails[key];
          return;
        }

        nextDetails[key] = '0';
      });

      const nextForm = {
        ...currentForm,
        details: nextDetails,
      };

      if (section.title === 'Regular Duty') {
        regularDutySplitPairs.slice(1).flat().forEach((key) => {
          delete nextDetails[key];
        });
      }

      if (!isDutyHoursManual && section.fields.some(([key]) => timeDetailFields.has(key))) {
        const shiftHours = calculateShiftHours(nextDetails);
        if (shiftHours > 0) {
          const formattedHours = formatHours(shiftHours);
          nextForm.dutyHours = formattedHours;
          lastAutoDutyHoursRef.current = formattedHours;
        } else if (currentForm.dutyHours === lastAutoDutyHoursRef.current) {
          nextForm.dutyHours = '';
          lastAutoDutyHoursRef.current = '';
        }
      }

      return nextForm;
    });
    setInvalidDailyField((field) => (field && section.fields.some(([key]) => key === field) ? null : field));
  };

  const clearTCodesSection = () => {
    setEntryForm((currentForm) => {
      const nextDetails = { ...(currentForm.details || {}) };
      delete nextDetails[tCodeDetailsKey];
      delete nextDetails[noTCodeDetailsKey];
      const nextForm = {
        ...currentForm,
        details: nextDetails,
      };

      if (!isDutyHoursManual && currentForm.dutyHours === lastAutoDutyHoursRef.current) {
        const shiftHours = calculateShiftHours(nextDetails);
        if (shiftHours > 0) {
          const formattedHours = formatHours(shiftHours);
          nextForm.dutyHours = formattedHours;
          lastAutoDutyHoursRef.current = formattedHours;
        } else {
          nextForm.dutyHours = '';
          lastAutoDutyHoursRef.current = '';
        }
      }

      return nextForm;
    });
    setInvalidDailyField((field) => (field?.startsWith('tCode-') ? null : field));
  };

  const clearNarrativeSection = () => {
    updateDailyDetail('narrative', '');
  };

  const buildAutoNarrative = () => {
    const details = entryForm.details || {};
    const profile = getNarrativeLearningProfile(entries, entryForm, editingEntryId);
    const parts: string[] = [];
    const shiftHours = calculateShiftHours(details);
    const tCodeRowsForNarrative = parseTCodeDetails(details).filter((row) => row.code.trim() || row.timeWorked.trim());
    const regularDutyMiles = parseNumericDetail(details, 'regularDutyMiles');
    const activitySummary = getNarrativeActivitySummary(details);
    const statusLabel = entryForm.specialStatus && entryForm.specialStatus !== 'None' ? entryForm.specialStatus : 'regular duty';
    const districtLabel = entryForm.districtWorked || currentUser.district || 'the assigned district';

    if (profile.terse) {
      parts.push(`${profile.firstPerson ? 'I worked' : 'Worked'} ${statusLabel} in ${districtLabel}`);

      if (entryForm.dutyHours) {
        parts.push(`${entryForm.dutyHours} ${profile.hourWord} duty`);
      }

      if (shiftHours > 0) {
        parts.push(`${formatNarrativeHours(shiftHours, profile)} shift time`);
      }

      if (regularDutyMiles > 0) {
        parts.push(`${formatHours(regularDutyMiles)} regular duty mile${regularDutyMiles === 1 ? '' : 's'}`);
      }

      if (activitySummary.length > 0) {
        parts.push(`activity: ${activitySummary.join(', ')}`);
      }

      if (tCodeRowsForNarrative.length > 0) {
        parts.push(`T-Code: ${tCodeRowsForNarrative.map((row) => `${row.code || 'unspecified'}${row.timeWorked ? ` (${formatNarrativeHours(row.timeWorked, profile)})` : ''}`).join(', ')}`);
      }

      const narrative = parts.join(profile.sentenceJoiner).replace(/\s+$/u, '');
      updateDailyDetail('narrative', narrative.endsWith('.') ? narrative : `${narrative}.`);
      return;
    }

    parts.push(`${profile.firstPerson ? 'I worked' : 'Worked'} ${statusLabel} in ${districtLabel}.`);

    if (entryForm.dutyHours) {
      parts.push(`${profile.firstPerson ? 'I reported' : 'Reported'} ${formatNarrativeHours(entryForm.dutyHours, profile)} of duty.`);
    }

    if (shiftHours > 0) {
      parts.push(`Shift time totaled ${formatNarrativeHours(shiftHours, profile)}.`);
    }

    if (regularDutyMiles > 0) {
      parts.push(`${profile.firstPerson ? 'I recorded' : 'Recorded'} ${formatHours(regularDutyMiles)} regular duty mile${regularDutyMiles === 1 ? '' : 's'}.`);
    }

    if (activitySummary.length > 0) {
      parts.push(`Activity included ${activitySummary.join(', ')}.`);
    }

    if (tCodeRowsForNarrative.length > 0) {
      parts.push(`T-Code activity included ${tCodeRowsForNarrative.map((row) => `${row.code || 'unspecified'}${row.timeWorked ? ` (${formatNarrativeHours(row.timeWorked, profile)})` : ''}`).join(', ')}.`);
    }

    updateDailyDetail('narrative', parts.join(profile.sentenceJoiner));
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

      const nextForm = {
        ...currentForm,
        details: nextDetails,
      };

      const tCodeHours = calculateTCodeHours(nextDetails);
      if (tCodeHours > 0 && !isDutyHoursManual && calculateShiftHours(nextDetails) <= 0) {
        const formattedHours = formatHours(tCodeHours);
        nextForm.dutyHours = formattedHours;
        lastAutoDutyHoursRef.current = formattedHours;
      }

      return nextForm;
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
    setInvalidDailyField((field) => (
      field === `tCode-${rowId}-code` || field === `tCode-${rowId}-time` ? null : field
    ));
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

  const getDailyFormForDate = (dateKey: string): CalendarEntryForm => {
    if (selectedDate === dateKey) {
      return entryForm;
    }

    const existingEntry = getCalendarEntryForDate(entries, dateKey, editingEntryId);
    return existingEntry ? createEntryFormFromEntry(existingEntry) : createDefaultEntryForm(dateKey, currentUser);
  };

  const applyShortcutToDate = (shortcut: CalendarShortcut, dateKey: string) => {
    const baseForm = getDailyFormForDate(dateKey);
    const nextForm: CalendarEntryForm = {
      ...baseForm,
      date: dateKey,
      dutyHours: shortcut.dutyHours,
      districtWorked: shortcut.districtWorked || baseForm.districtWorked,
      specialStatus: shortcut.specialStatus,
      color: shortcut.color,
      details: {
        ...(baseForm.details || {}),
        ...(shortcut.details || {}),
      },
    };

    openDay(dateKey);
    setEntryFormAndSyncSplitPairs(nextForm);
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const createShortcutFromDate = async (dateKey: string) => {
    const name = window.prompt('Shortcut name');
    if (!name?.trim()) {
      return;
    }

    const sourceForm = getDailyFormForDate(dateKey);
    setIsSavingShortcut(true);
    setCalendarError(null);

    try {
      const payload = {
        ownerAccountId: currentUser.id,
        name: name.trim(),
        dutyHours: sourceForm.dutyHours,
        districtWorked: sourceForm.districtWorked,
        specialStatus: sourceForm.specialStatus,
        color: sourceForm.color,
        details: sourceForm.details || {},
      };
      const response = await calendarService.createShortcut(payload);
      setShortcuts((items) => [...items, response.data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error('Failed to create shortcut:', err);
      setCalendarError(getApiErrorMessage(err, 'Failed to create shortcut.'));
    } finally {
      setIsSavingShortcut(false);
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
    const nextForm: CalendarEntryForm = {
      category: 'Trooper Daily',
      date: dateKey,
      dutyHours: previousEntry.dutyHours,
      districtWorked: previousEntry.districtWorked || getDefaultDistrict(currentUser),
      specialStatus: previousEntry.specialStatus,
      color: previousEntry.color,
      submissionStatus: 'Draft',
      details: { ...(previousEntry.details || {}) },
    };
    setEntryFormAndSyncSplitPairs(nextForm);
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
    } as CalendarEntryForm);
    setCalendarError(null);
  };

  const pasteCopiedDailyToDate = (dateKey: string) => {
    if (!copiedDailyForm) {
      setCalendarError('Copy a Trooper Daily report before pasting.');
      return;
    }

    const existingEntry = getCalendarEntryForDate(entries, dateKey);
    setCalendarError(null);
    setSelectedDate(dateKey);
    setCalendarFocusDate(new Date(`${dateKey}T00:00:00`));
    const nextForm: CalendarEntryForm = {
      ...copiedDailyForm,
      date: dateKey,
      submissionStatus: 'Draft',
      details: { ...(copiedDailyForm.details || {}) },
    };
    setEntryFormAndSyncSplitPairs(nextForm);
    setEditingEntryId(existingEntry?.id || null);
    setIsDutyHoursManual(true);
    lastAutoDutyHoursRef.current = '';
  };

  const markDailyLeaveStatus = async (dateKey: string, status: typeof vacationStatus | typeof sickStatus, rawHours: string) => {
    const sanitizedHours = sanitizeDecimalInput(rawHours);
    const numericHours = Number(sanitizedHours);
    if (!sanitizedHours || !Number.isFinite(numericHours) || numericHours < 0 || numericHours > 24) {
      setCalendarError(`Enter valid ${status.toLowerCase()} hours between 0 and 24.`);
      return;
    }

    const defaultWorkdayHours = Number(getDefaultDutyHours(currentUser)) || numericHours;
    const isFullWorkdayLeave = Math.abs(numericHours - defaultWorkdayHours) <= 0.01;
    const reportedHours = numericHours < defaultWorkdayHours ? defaultWorkdayHours : numericHours;
    const existingEntry = getCalendarEntryForDate(entries, dateKey);
    const savedExistingEntry = existingEntry && !existingEntry.id.startsWith('local-draft-') ? existingEntry : null;
    const localEntry = selectedDate === dateKey
      ? entryForm
      : existingEntry
        ? createEntryFormFromEntry(existingEntry)
        : createDefaultEntryForm(dateKey, currentUser);
    const leaveHoursKey = status === vacationStatus ? 'vacationHours' : 'injuryIllnessHours';
    const otherLeaveHoursKey = status === vacationStatus ? 'injuryIllnessHours' : 'vacationHours';
    const leaveForm: CalendarEntryForm = {
      ...localEntry,
      category: 'Trooper Daily',
      date: dateKey,
      dutyHours: formatHours(reportedHours),
      districtWorked: localEntry.districtWorked || getDefaultDistrict(currentUser),
      specialStatus: status,
      color: status === vacationStatus ? vacationColor : sickColor,
      submissionStatus: 'Draft',
      details: {
        ...(localEntry.details || {}),
        regularDaysOff: isFullWorkdayLeave ? '1' : '0',
        [otherLeaveHoursKey]: '0',
        [leaveHoursKey]: formatHours(numericHours),
      },
    };
    const payload = {
      ...leaveForm,
      accountId: currentUser.id,
      ...actor,
    };
    const optimisticEntry = createOptimisticEntryFromForm(leaveForm, currentUser, existingEntry || undefined);

    setCalendarError(null);
    setEntries((currentEntries) => [
      optimisticEntry,
      ...currentEntries
        .filter((entry) => entry.date !== dateKey)
        .filter((entry) => entry.id !== optimisticEntry.id),
    ]);
    skipNextDailyDraftWriteRef.current = true;
    setCalendarFocusDate(new Date(`${dateKey}T00:00:00`));
    setSelectedDate(dateKey);
    setEditingEntryId(savedExistingEntry?.id || optimisticEntry.id);
    setEntryFormAndSyncSplitPairs(leaveForm);
    setIsDutyHoursManual(true);
    setDailySaveStatus('saving');
    lastAutoDutyHoursRef.current = '';

    try {
      const response = savedExistingEntry
        ? await calendarService.update(savedExistingEntry.id, payload)
        : await calendarService.create(payload);

      setEntries((currentEntries) => mergeSavedCalendarEntry(currentEntries, response.data, savedExistingEntry?.id));
      removeTrooperDailyDraft(currentUser.id, dateKey);
      skipNextDailyDraftWriteRef.current = true;
      setCalendarFocusDate(new Date(`${dateKey}T00:00:00`));
      setSelectedDate(dateKey);
      setEditingEntryId(response.data.id);
      setEntryFormAndSyncSplitPairs(createEntryFormFromEntry(response.data));
      setIsDutyHoursManual(true);
      setDailySaveStatus('saved');
      setDailySaveStatusAt(Date.now());
      lastAutoDutyHoursRef.current = '';
    } catch (err) {
      console.error('Failed to mark daily leave status:', err);
      setCalendarError(getApiErrorMessage(err, `Failed to mark ${status.toLowerCase()}.`));
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

      if (isEditableShortcutTarget(event.target)) {
        if (key === 'escape') {
          consume();
        }
        return;
      }

      if (key === 'enter' || key === 'o') {
        consume();
        openDay(dailyStripContextMenu.dateKey);
        return;
      }

      const isCommandKey = event.ctrlKey || event.metaKey;

      if (isCommandKey && key === 'c' && (dailyStripContextMenu.entry || selectedDate === dailyStripContextMenu.dateKey)) {
        consume();
        copyDailyToClipboard(dailyStripContextMenu.dateKey, dailyStripContextMenu.entry);
        return;
      }

      if (isCommandKey && key === 'v' && copiedDailyForm) {
        consume();
        pasteCopiedDailyToDate(dailyStripContextMenu.dateKey);
        return;
      }

      if (key === 'p') {
        consume();
        copyPreviousDailyToDate(dailyStripContextMenu.dateKey);
        return;
      }

      if (key === 'v') {
        consume();
        void markDailyLeaveStatus(dailyStripContextMenu.dateKey, vacationStatus, dailyStatusHours.vacation);
        return;
      }

      if (key === 's') {
        consume();
        void markDailyLeaveStatus(dailyStripContextMenu.dateKey, sickStatus, dailyStatusHours.sick);
        return;
      }

      if ((key === 'delete' || key === 'backspace') && dailyStripContextMenu.entry) {
        consume();
        setEntryPendingDelete(dailyStripContextMenu.entry);
      }
    };

    window.addEventListener('keydown', handleContextMenuKeyDown);

    return () => window.removeEventListener('keydown', handleContextMenuKeyDown);
  }, [copiedDailyForm, currentUser, dailyStatusHours, dailyStripContextMenu, editingEntryId, entries, entryForm, selectedDate]);

  useEffect(() => {
    const handleDailyClipboardShortcut = (event: KeyboardEvent) => {
      if (!selectedDate || isEditableShortcutTarget(event.target) || (!event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }

      const shortcutKey = event.key.toLowerCase();
      if (shortcutKey === 'c') {
        event.preventDefault();
        copyDailyToClipboard(selectedDate, getCalendarEntryForDate(entries, selectedDate, editingEntryId));
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

  useEffect(() => {
    const handleDeletedDailyUndoShortcut = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target) || (!event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') {
        return;
      }

      if (!deletedDailyUndoRef.current) {
        return;
      }

      event.preventDefault();
      void restoreDeletedDaily();
    };

    document.addEventListener('keydown', handleDeletedDailyUndoShortcut);
    return () => document.removeEventListener('keydown', handleDeletedDailyUndoShortcut);
  }, [currentUser.id, isRestoringDeletedDaily, selectedDate]);

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
  const tCodeHours = calculateTCodeHours(entryDetails);
  const calculatedShiftHours = calculateShiftHours(entryDetails);
  const attendanceHours = attendanceHourFields.reduce((total, key) => total + parseNumericDetail(entryDetails, key), 0);
  const leaveStatusHours = entryForm.specialStatus === vacationStatus
    ? parseNumericDetail(entryDetails, 'vacationHours')
    : entryForm.specialStatus === sickStatus
      ? parseNumericDetail(entryDetails, 'injuryIllnessHours')
      : 0;
  const defaultWorkdayHours = Number(getDefaultDutyHours(currentUser)) || reportedDutyHours;
  const isFullLeaveDay = leaveStatusHours > 0 && defaultWorkdayHours > 0 && Math.abs(leaveStatusHours - defaultWorkdayHours) <= 0.01;
  const workedDutyHoursTarget = Math.max(reportedDutyHours - leaveStatusHours, 0);
  const shiftDutyTargetHours = leaveStatusHours > 0 ? workedDutyHoursTarget : reportedDutyHours;
  const standardDutyActivityHours = dutyActivityHourFields.reduce((total, key) => total + parseNumericDetail(entryDetails, key), 0);
  const dutyActivityHours = standardDutyActivityHours + tCodeHours;
  const remainingDutyActivityHours = Math.max(shiftDutyTargetHours - dutyActivityHours, 0);
  const hasShiftTime = calculatedShiftHours > 0;
  const hasShiftDutyTarget = shiftDutyTargetHours > 0;
  const hasReportedHours = reportedDutyHours > 0;
  const shiftHoursMatch = isHourTargetMatch(shiftDutyTargetHours, calculatedShiftHours);
  const attendanceHoursMatch = isHourMatch(reportedDutyHours, attendanceHours);
  const dutyActivityHoursMatch = isHourTargetMatch(shiftDutyTargetHours, dutyActivityHours);
  const hasHourMismatch =
    hasReportedHours &&
    ((hasShiftTime && Math.abs(calculatedShiftHours - shiftDutyTargetHours) > 0.01) ||
      (attendanceHours > 0 && Math.abs(attendanceHours - reportedDutyHours) > 0.01) ||
      (dutyActivityHours > 0 && Math.abs(dutyActivityHours - shiftDutyTargetHours) > 0.01));
  const visibleDailySections = useMemo(
    () => trooperDailySections
      .filter((section) => !hiddenDailySections.includes(section.title))
      .map((section) => (
        section.title === 'Regular Duty'
          ? ({ ...section, fields: getRegularDutySectionFields(regularDutySplitPairCount) })
          : section
      )),
    [hiddenDailySections, regularDutySplitPairCount],
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
    const entry = getCalendarEntryForDate(entries, dateKey, selectedDate === dateKey ? editingEntryId : null);

    return {
      day,
      dateKey,
      entry,
    };
  });
  const hourMetrics = [
    { label: 'Reported', value: reportedDutyHours, helper: '', isMatch: false },
    { label: 'Shift', value: calculatedShiftHours, helper: getHourTargetLabel(shiftDutyTargetHours, calculatedShiftHours, hasShiftDutyTarget ? 'Matches worked hours' : 'No worked hours'), isMatch: shiftHoursMatch || (!hasShiftDutyTarget && calculatedShiftHours <= 0.01) },
    { label: 'Attendance', value: attendanceHours, helper: getDifferenceLabel(reportedDutyHours, attendanceHours), isMatch: attendanceHoursMatch },
    { label: 'Duty Activity', value: dutyActivityHours, helper: tCodeHours > 0 ? `Includes ${formatHours(tCodeHours)}h T-Code` : getHourTargetLabel(shiftDutyTargetHours, dutyActivityHours, hasShiftDutyTarget ? 'Matches worked hours' : 'No worked hours'), isMatch: dutyActivityHoursMatch || (!hasShiftDutyTarget && dutyActivityHours <= 0.01) },
  ];
  const activeHourGuidance = (() => {
    if (!hasReportedHours) {
      return null;
    }

    if (!activeDailySection) {
      return null;
    }

    const sectionComparisons: Record<string, { label: string; value: number; isMatch: boolean }> = {
      'Regular Duty': { label: 'Shift time', value: calculatedShiftHours, isMatch: shiftHoursMatch },
      'Attendance Hours': { label: 'Attendance hours', value: attendanceHours, isMatch: attendanceHoursMatch },
      'Duty Hours': { label: 'Duty activity + T-Code hours', value: dutyActivityHours, isMatch: dutyActivityHoursMatch },
    };
    const comparison = sectionComparisons[activeDailySection.title];
    if (!comparison || comparison.value <= 0) {
      return null;
    }

    const targetHours = activeDailySection.title === 'Attendance Hours' ? reportedDutyHours : shiftDutyTargetHours;
    const difference = Math.abs(comparison.value - targetHours);
    return {
      ...comparison,
      difference,
      direction: comparison.value > targetHours ? 'over' : 'under',
    };
  })();
  const activeHourGuidanceTargetLabel = activeDailySection?.title === 'Attendance Hours'
    ? 'reported duty hours'
    : leaveStatusHours > 0
      ? 'worked hours'
      : 'reported duty hours';
  const getDetailNumber = (key: string) => parseNumericDetail(entryDetails, key);
  const smartDailyChecks: SmartDailyCheck[] = [
    getDetailNumber('pbt') > 0 && getDetailNumber('owiDefendants') > 0 && getDetailNumber('pbt') > getDetailNumber('owiDefendants')
      ? {
          id: 'pbt-owi-defendants',
          title: 'PBT count is higher than OWI defendants',
          detail: `${formatHours(getDetailNumber('pbt'))} PBT recorded for ${formatHours(getDetailNumber('owiDefendants'))} OWI defendant${getDetailNumber('owiDefendants') === 1 ? '' : 's'}.`,
          panel: 'OWI Offense Activity',
          field: 'pbt',
          severity: 'attention',
        }
      : null,
    getDetailNumber('owiFelonies') + getDetailNumber('owiMisdemeanors') > 0 &&
      getDetailNumber('owiDefendants') > 0 &&
      getDetailNumber('owiFelonies') + getDetailNumber('owiMisdemeanors') > getDetailNumber('owiDefendants')
      ? {
          id: 'owi-charges-defendants',
          title: 'OWI charge totals exceed defendants',
          detail: `${formatHours(getDetailNumber('owiFelonies') + getDetailNumber('owiMisdemeanors'))} OWI misdemeanor/felony entries for ${formatHours(getDetailNumber('owiDefendants'))} defendant${getDetailNumber('owiDefendants') === 1 ? '' : 's'}.`,
          panel: 'OWI Offense Activity',
          field: 'owiDefendants',
          severity: 'warning',
        }
      : null,
    getDetailNumber('totalFelonyArrests') > 0 &&
      getDetailNumber('totalCriminalArrests') > 0 &&
      getDetailNumber('totalFelonyArrests') > getDetailNumber('totalCriminalArrests')
      ? {
          id: 'felony-total-arrests',
          title: 'Felony arrests exceed total criminal arrests',
          detail: `${formatHours(getDetailNumber('totalFelonyArrests'))} felony arrests recorded against ${formatHours(getDetailNumber('totalCriminalArrests'))} total criminal arrests.`,
          panel: 'Criminal Activity',
          field: 'totalFelonyArrests',
          severity: 'attention',
        }
      : null,
    getDetailNumber('criminalDefendants') > 0 &&
      getDetailNumber('totalCriminalArrests') > 0 &&
      getDetailNumber('criminalDefendants') < getDetailNumber('totalCriminalArrests')
      ? {
          id: 'criminal-defendants-arrests',
          title: 'Criminal defendants are lower than arrests',
          detail: `${formatHours(getDetailNumber('criminalDefendants'))} defendant${getDetailNumber('criminalDefendants') === 1 ? '' : 's'} for ${formatHours(getDetailNumber('totalCriminalArrests'))} total criminal arrests.`,
          panel: 'Criminal Activity',
          field: 'criminalDefendants',
          severity: 'warning',
        }
      : null,
    getDetailNumber('regularDutyMiles') > 0 && dutyActivityHours <= 0.01 && calculatedShiftHours <= 0.01
      ? {
          id: 'miles-no-hours',
          title: 'Mileage entered without worked hours',
          detail: `${formatHours(getDetailNumber('regularDutyMiles'))} regular duty miles are recorded, but shift time and duty activity are both zero.`,
          panel: 'Regular Duty',
          field: 'regularDutyMiles',
          severity: 'warning',
        }
      : null,
    standardDutyActivityHours > 0 && shiftDutyTargetHours <= 0.01
      ? {
          id: 'activity-on-full-leave',
          title: 'Activity entered on a full leave day',
          detail: `${formatHours(standardDutyActivityHours)} duty activity hour${standardDutyActivityHours === 1 ? '' : 's'} recorded while no worked hours are expected.`,
          panel: 'Duty Hours',
          field: 'patrolHours',
          severity: 'warning',
        }
      : null,
    getDetailNumber('heroinGramsFound') > 0 && getDetailNumber('heroinArrests') <= 0
      ? {
          id: 'heroin-grams-no-arrests',
          title: 'Heroin grams entered without arrests',
          detail: `${formatHours(getDetailNumber('heroinGramsFound'))} grams found with zero heroin arrests.`,
          panel: 'Drug Activity',
          field: 'heroinArrests',
          severity: 'warning',
        }
      : null,
    getDetailNumber('cocaineGramsFound') > 0 && getDetailNumber('cocaineArrests') <= 0
      ? {
          id: 'cocaine-grams-no-arrests',
          title: 'Cocaine grams entered without arrests',
          detail: `${formatHours(getDetailNumber('cocaineGramsFound'))} grams found with zero cocaine arrests.`,
          panel: 'Drug Activity',
          field: 'cocaineArrests',
          severity: 'warning',
        }
      : null,
    getDetailNumber('marijuanaGramsFound') > 0 && getDetailNumber('marijuanaArrests') <= 0
      ? {
          id: 'marijuana-grams-no-arrests',
          title: 'Marijuana grams entered without arrests',
          detail: `${formatHours(getDetailNumber('marijuanaGramsFound'))} grams found with zero marijuana arrests.`,
          panel: 'Drug Activity',
          field: 'marijuanaArrests',
          severity: 'warning',
        }
      : null,
    getDetailNumber('methamphetamineGramsFound') > 0 && getDetailNumber('methamphetamineArrests') <= 0
      ? {
          id: 'meth-grams-no-arrests',
          title: 'Methamphetamine grams entered without arrests',
          detail: `${formatHours(getDetailNumber('methamphetamineGramsFound'))} grams found with zero methamphetamine arrests.`,
          panel: 'Drug Activity',
          field: 'methamphetamineArrests',
          severity: 'warning',
        }
      : null,
  ].filter((check): check is SmartDailyCheck => Boolean(check));
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
  const getPanelCompletionState = (panel: string): { state: DailyPanelCompletionState; label: string } => {
    const panelSection = visibleDailySections.find((section) => section.title === panel);
    const invalidField = invalidDailyField || '';
    const invalidBelongsToPanel = invalidDailyField && (invalidDailyPanel === panel || (panel === 'Administrative'
      ? ['entryDate', 'dutyHours', 'districtWorked', 'specialStatus', 'color'].includes(invalidField)
      : panel === 'T-Codes'
        ? invalidField.startsWith('tCode-')
        : panel === 'Narrative'
          ? invalidField === 'narrative'
          : Boolean(panelSection?.fields.some(([key]) => key === invalidField))));

    if (invalidBelongsToPanel) {
      return { state: 'attention', label: 'Needs attention' };
    }

    if (isFullLeaveDay && fullLeaveWaivedDailySections.has(panel)) {
      return { state: 'complete', label: 'Leave day' };
    }

    if (panel === 'Administrative') {
      const isComplete = Boolean(entryForm.date && entryForm.dutyHours && entryForm.districtWorked && entryForm.specialStatus);
      return isComplete
        ? { state: 'complete', label: 'Complete' }
        : { state: 'attention', label: 'Needs setup' };
    }

    if (panel === 'T-Codes') {
      const hasIncompleteRow = !hasNoTCodes && tCodeRows.some((row) => !row.code.trim() || !row.timeWorked.trim());
      if (hasIncompleteRow) {
        return { state: 'attention', label: 'Needs attention' };
      }
      if (isTCodeComplete) {
        return { state: 'complete', label: 'Complete' };
      }
      return { state: 'empty', label: 'Not started' };
    }

    if (panel === 'Narrative') {
      return entryForm.details?.narrative?.trim()
        ? { state: 'complete', label: 'Complete' }
        : { state: 'empty', label: 'Optional' };
    }

    if (!panelSection) {
      return { state: 'empty', label: 'Not started' };
    }

    if (hasHourMismatch && panel === 'Regular Duty' && calculatedShiftHours > 0) {
      return { state: 'warning', label: 'Hours mismatch' };
    }

    if (hasHourMismatch && panel === 'Attendance Hours' && attendanceHours > 0) {
      return { state: 'warning', label: 'Hours mismatch' };
    }

    if (hasHourMismatch && panel === 'Duty Hours' && dutyActivityHours > 0) {
      return { state: 'warning', label: 'Hours mismatch' };
    }

    if (isSectionComplete(entryForm.details, panelSection)) {
      return { state: 'complete', label: 'Complete' };
    }

    if (isSectionTouched(entryForm.details, panelSection)) {
      return { state: 'progress', label: 'In progress' };
    }

    return { state: 'empty', label: 'Not started' };
  };
  const activeDailyCompletion = getPanelCompletionState(activeDailyPanel);
  const submitReviewSections = dailyPanelOptions.map((panel) => ({
    panel,
    ...getPanelCompletionState(panel),
  }));
  const submitReviewAttentionSections = submitReviewSections.filter((section) => section.state === 'attention' || section.state === 'warning');
  const submitReviewCompletedSections = submitReviewSections.filter((section) => section.state === 'complete').length;
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
    const menuPosition = getOverlayPositionForTarget(event.currentTarget, 300, entry ? 316 : 276, 'left');
    setDailyStripContextMenu({
      ...menuPosition,
      dateKey,
      entry: entry || null,
    });
  };

  const clearCalendarFilters = () => {
    setDistrictFilter('');
    setStatusFilter('');
  };

  const openPageContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || shouldUseNativeContextMenu(event.target)) {
      return;
    }

    event.preventDefault();
    setDailyStripTooltip(null);
    setDailyStripContextMenu(null);
    setPageContextMenu({ x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    if (!dailyPanelOptions.includes(activeDailyPanel)) {
      setActiveDailyPanel('Administrative');
    }
  }, [activeDailyPanel, dailyPanelOptions]);

  return (
    <div className="theme-polished-surface relative flex h-full min-h-0 flex-col" onContextMenu={openPageContextMenu}>
      {(!selectedDate || isFloatingApp) && (
      <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => changeCalendarPeriod(-1)} className="btn-secondary" aria-label="Previous calendar period" title="Previous">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-32 text-center text-lg font-bold text-primary-500 dark:text-gray-100 sm:min-w-40 sm:text-2xl">
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
          <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500">This {calendarView}</p>
          <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-gray-100">{activeViewEntries.length}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500">Duty Hours</p>
          <p className="mt-1 text-2xl font-bold text-accent dark:text-gray-100">{activeViewDutyHours.toFixed(2).replace(/\.?0+$/u, '')}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500">Visible Entries</p>
          <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-gray-100">{visibleEntries.length}</p>
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
                  {dayEntries.slice(0, 3).map((entry) => {
                    const reviewLabel = getDailyReviewLabel(entry);
                    return (
                      <div
                        key={entry.id}
                        className="truncate rounded px-2 py-1 text-xs font-semibold text-white"
                        style={{ backgroundColor: entry.color }}
                        title={`${entry.dutyHours} hours - ${entry.districtWorked}${reviewLabel ? ` - ${reviewLabel}` : ''}`}
                      >
                        {entry.submissionStatus === 'Draft' ? 'Draft - ' : ''}{entry.dutyHours}h {entry.districtWorked}
                        {entry.submissionStatus === 'Submitted' && getDailyReviewStatus(entry) === 'Approved' && (
                          <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1 py-0.5 text-[9px] uppercase">
                            <BadgeCheck size={10} />
                            Approved
                          </span>
                        )}
                      </div>
                    );
                  })}
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
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          {entry.submissionStatus === 'Draft' && <span className="inline-block rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase">Draft</span>}
                          {entry.submissionStatus === 'Submitted' && getDailyReviewStatus(entry) === 'Approved' && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] uppercase">
                              <BadgeCheck size={11} />
                              Approved
                            </span>
                          )}
                        </div>
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
                        {entry.submissionStatus === 'Submitted' && (
                          <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${getDailyReviewBadgeClass(entry)}`}>
                            {React.createElement(getDailyReviewIcon(entry), { size: 13 })}
                            {getDailyReviewLabel(entry)}
                          </span>
                        )}
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
                    {dailyPanelOptions.map((panel) => {
                      const completion = getPanelCompletionState(panel);
                      return (
                        <option key={panel} value={panel}>
                          {hiddenDailySections.includes(panel) ? `${panel} (hidden)` : `${panel} - ${completion.label}`}
                        </option>
                      );
                    })}
                  </select>
                  <nav className="hidden gap-1 xl:grid" aria-label="Trooper Daily input sections">
                    {dailyPanelOptions.map((panel) => {
                      const panelSection = trooperDailySections.find((section) => section.title === panel);
                      const isHideablePanel = Boolean(panelSection || panel === 'T-Codes');
                      const isHidden = Boolean(isHideablePanel && hiddenDailySections.includes(panel));
                      const isActive = activeDailyPanel === panel;
                      const completion = getPanelCompletionState(panel);
                      const completionStyle = {
                        complete: {
                          item: 'border-green-200 bg-green-50/80 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100',
                          rail: 'bg-green-500',
                          icon: <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={16} />,
                        },
                        attention: {
                          item: 'border-danger/30 bg-red-50/90 text-danger dark:border-red-900 dark:bg-red-950/40',
                          rail: 'bg-danger',
                          icon: <X className="text-danger" size={15} />,
                        },
                        warning: {
                          item: 'border-amber-300 bg-amber-50/90 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
                          rail: 'bg-amber-500',
                          icon: <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" />,
                        },
                        progress: {
                          item: 'border-blue-200 bg-blue-50/80 text-blue-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
                          rail: 'bg-blue-500',
                          icon: <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />,
                        },
                        empty: {
                          item: '',
                          rail: 'bg-gray-300 dark:bg-gray-700',
                          icon: <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-700'}`} />,
                        },
                      }[completion.state];

                      return (
                        <div
                          key={panel}
                          className={`group relative grid grid-cols-[minmax(0,1fr)_1.75rem] items-center overflow-hidden rounded-md border transition-all duration-500 ${
                            isActive
                              ? 'trooper-daily-active-pulse border-accent bg-white text-accent shadow-sm dark:bg-gray-950'
                              : `${completion.state === 'empty' ? 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-primary-500 dark:text-gray-300 dark:hover:border-gray-800 dark:hover:bg-gray-950 dark:hover:text-blue-100' : completionStyle.item} ${isHidden ? 'opacity-50' : ''}`
                          }`}
                        >
                          <span className={`absolute bottom-0 left-0 top-0 w-1 ${isActive ? 'bg-accent' : completionStyle.rail}`} aria-hidden="true" />
                          <button
                            type="button"
                            onClick={() => {
                              if (isHidden && isHideablePanel) {
                                showDailySection(panel);
                                return;
                              }
                              setActiveDailyPanel(panel);
                            }}
                            className="grid min-w-0 grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-2 rounded px-3 py-2 text-left text-[0.95rem] font-bold leading-tight"
                            aria-current={isActive ? 'step' : undefined}
                            title={`${panel} - ${completion.label}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{panel}</span>
                              <span className={`mt-0.5 block truncate text-[10px] font-black uppercase tracking-wide ${
                                completion.state === 'empty' && !isActive ? 'text-gray-400 dark:text-gray-500' : 'opacity-75'
                              }`}>
                                {completion.label}
                              </span>
                            </span>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                              {completionStyle.icon}
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
                            const isLeaveShortcutDay = entry?.specialStatus === vacationStatus || entry?.specialStatus === sickStatus;
                            const isApprovedShortcutDay = entry?.submissionStatus === 'Submitted' && getDailyReviewStatus(entry) === 'Approved';
                            const leaveShortcutColor = entry?.specialStatus === sickStatus ? sickColor : vacationColor;
                            const dailyStripStyle: DailyStripStyle | undefined = entry || isSelectedShortcutDay
                              ? {
                                  ...(entry ? { backgroundColor: isLeaveShortcutDay ? leaveShortcutColor : entry.color } : {}),
                                  '--trooper-daily-strip-rgb': getHexColorRgb(isLeaveShortcutDay ? leaveShortcutColor : entry?.color || entryForm.color),
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
                                    ? `trooper-daily-strip-filled border-transparent text-white ${isLeaveShortcutDay ? 'trooper-daily-strip-day-off' : ''}`
                                    : 'border-gray-300 bg-white text-gray-700 hover:border-accent hover:text-accent dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200'
                                } ${isSelectedShortcutDay ? 'trooper-daily-strip-selected border-accent' : ''}`}
                                style={dailyStripStyle}
                                aria-label={`${isLeaveShortcutDay ? `Open ${entry?.specialStatus.toLowerCase()}` : entry ? 'Open' : 'Create'} daily report for ${dateKey}${isApprovedShortcutDay ? ', approved by supervisor' : ''}`}
                              title={`${isLeaveShortcutDay ? entry?.specialStatus : entry ? 'Open' : 'Create'} ${dateKey}${isApprovedShortcutDay ? ' - Approved by supervisor' : ''}`}
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
                                    isApprovedShortcutDay
                                      ? 'trooper-daily-strip-filled-icon-approved'
                                      : entry.submissionStatus === 'Submitted'
                                      ? 'trooper-daily-strip-filled-icon-submitted'
                                      : 'trooper-daily-strip-filled-icon-draft'
                                  }`}
                                  aria-hidden="true"
                                >
                                  {isApprovedShortcutDay ? <BadgeCheck size={9} /> : <CheckCircle2 size={8} />}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  </div>

                <section className="min-w-0 p-4">
                  {activeDailyPanel === 'Administrative' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Administrative</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set the report date, hours, district, status, and color coding.</p>
                      </div>
                      {editingEntry?.submissionStatus === 'Submitted' && (
                        <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${getDailyReviewBadgeClass(editingEntry)}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            {React.createElement(getDailyReviewIcon(editingEntry), { size: 16 })}
                            <span>{getDailyReviewLabel(editingEntry)}</span>
                          </div>
                          {(editingEntry.reviewedByName || editingEntry.reviewedAt) && (
                            <p className="mt-1 text-xs font-bold opacity-85">
                              {editingEntry.reviewedByName ? `Reviewed by ${editingEntry.reviewedByName}` : 'Reviewed'}
                              {formatDailyReviewedAt(editingEntry.reviewedAt) ? ` on ${formatDailyReviewedAt(editingEntry.reviewedAt)}` : ''}
                            </p>
                          )}
                          {getDailyReviewStatus(editingEntry) === 'Returned' && editingEntry.reviewNotes && (
                            <p className="mt-2 rounded border border-current/20 bg-white/35 px-2 py-1 text-xs font-bold dark:bg-black/20">
                              {editingEntry.reviewNotes}
                            </p>
                          )}
                        </div>
                      )}
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
                              onChange={(event) => {
                                setInvalidDailyField((field) => (field === 'districtWorked' ? null : field));
                                setEntryForm((currentForm) => ({ ...currentForm, districtWorked: event.target.value }));
                              }}
                              data-daily-field="districtWorked"
                              className={`trooper-daily-field-with-icon w-full appearance-none rounded border bg-white py-2 pl-10 pr-10 dark:bg-gray-950 ${
                                invalidDailyField === 'districtWorked'
                                  ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                  : 'border-gray-300 dark:border-gray-700'
                              }`}
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
                              onChange={(event) => {
                                setInvalidDailyField((field) => (field === 'specialStatus' ? null : field));
                                setEntryForm((currentForm) => ({ ...currentForm, specialStatus: event.target.value }));
                              }}
                              data-daily-field="specialStatus"
                              className={`trooper-daily-field-with-icon w-full appearance-none rounded border bg-white py-2 pl-10 pr-10 dark:bg-gray-950 ${
                                invalidDailyField === 'specialStatus'
                                  ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                  : 'border-gray-300 dark:border-gray-700'
                              }`}
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
                          Hours do not match. Attendance should match reported duty hours; shift times should match worked hours; Duty Hours activity plus T-Codes should add up to worked hours after Vacation/Sick hours.
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
                            {activeDailyCompletion.state === 'attention' && <X className="text-danger" size={18} />}
                            {activeDailyCompletion.state === 'complete' && <CheckCircle2 className="trooper-daily-check text-green-600 dark:text-green-300" size={18} />}
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
                                ? `${activeHourGuidance.label} matches ${activeHourGuidanceTargetLabel}.`
                                : `${activeHourGuidance.label} is ${formatHours(activeHourGuidance.difference)} hr ${activeHourGuidance.direction} ${activeHourGuidanceTargetLabel}.`}
                            </p>
                          )}
                        </div>
                        {activeDailySection.title === 'Regular Duty' && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => clearDailySectionFields(activeDailySection)}
                              className="btn-secondary"
                              title="Zero out Regular Duty fields"
                              aria-label="Zero out Regular Duty fields"
                            >
                              <Trash2 size={16} />
                            </button>
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
                          </div>
                        )}
                        {activeDailySection.title !== 'Regular Duty' && (
                          <button
                            type="button"
                            onClick={() => clearDailySectionFields(activeDailySection)}
                            className="btn-secondary"
                            title={`Zero out ${activeDailySection.title} fields`}
                            aria-label={`Zero out ${activeDailySection.title} fields`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {activeDailySection.fields.filter(([key]) => shouldShowDailyDetailField(entryForm.details, key)).map(([key, label]) => {
                          const isTimeField = timeDetailFields.has(key);
                          const isComplete = isDetailComplete(entryForm.details, key);
                          const isInvalid = invalidDailyField === key;
                          const FieldIcon = getDailyFieldIcon(key);
                          const splitPairIndex = activeDailySection.title === 'Regular Duty' ? getRegularDutySplitPairIndex(key) : -1;
                          const isSplitEndField = splitPairIndex >= 0 && regularDutySplitPairs[splitPairIndex][1] === key;
                          const canAddSplitFromField = isSplitEndField && splitPairIndex === regularDutySplitPairCount - 1 && regularDutySplitPairCount < regularDutySplitPairs.length;
                          const canRemoveSplitFromField = splitPairIndex > 0;
                          return (
                            <label key={key} className="block">
                              <span className="mb-1 flex min-h-8 items-center justify-between gap-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
                                <span className="truncate">{label}</span>
                                {(canAddSplitFromField || canRemoveSplitFromField) && (
                                  <span className="flex shrink-0 items-center gap-1">
                                    {canRemoveSplitFromField && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          removeRegularDutySplitPair(splitPairIndex);
                                        }}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-sm transition hover:bg-red-700"
                                        aria-label={`Remove ${label}`}
                                        title={`Remove ${label}`}
                                      >
                                        <X size={15} />
                                      </button>
                                    )}
                                    {canAddSplitFromField && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          addRegularDutySplitPair();
                                        }}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label="Add split interval"
                                        title="Add Split"
                                      >
                                        <Plus size={15} />
                                      </button>
                                    )}
                                  </span>
                                )}
                              </span>
                              {isTimeField ? (
                                <TimeDetailInput
                                  value={entryForm.details?.[key] || ''}
                                  onChange={(value) => updateDailyDetail(key, value)}
                                  isComplete={isComplete}
                                  isInvalid={isInvalid}
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
                                      isInvalid
                                        ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                        : isComplete
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
                          {tCodeHours > 0 && (
                            <p className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-accent/30 dark:bg-accent/10 dark:text-gray-200">
                              {formatHours(tCodeHours)}h T-Code counts toward Duty Hours. {remainingDutyActivityHours > 0.01
                                ? `Report ${formatHours(remainingDutyActivityHours)}h more in Duty Hours to reach ${formatHours(shiftDutyTargetHours)}h.`
                                : `Duty Hours target of ${formatHours(shiftDutyTargetHours)}h is covered.`}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={clearTCodesSection}
                            className="btn-secondary"
                            aria-label="Zero out T-Codes"
                            title="Zero out T-Codes"
                          >
                            <Trash2 size={16} />
                          </button>
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
                                    data-daily-field={`tCode-${row.id}-code`}
                                    className={`w-full appearance-none rounded border bg-white px-3 py-2 pr-9 text-sm dark:bg-gray-950 ${
                                      invalidDailyField === `tCode-${row.id}-code`
                                        ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                        : 'border-gray-300 dark:border-gray-700'
                                    }`}
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
                                    maxLength={tCodeHourInputCharacterLimit}
                                    onChange={(event) => updateTCodeRow(row.id, { timeWorked: sanitizeDecimalInput(event.target.value, 3, tCodeHourInputCharacterLimit) })}
                                    data-daily-field={`tCode-${row.id}-time`}
                                    className={`trooper-daily-field-with-icon w-full rounded border bg-white py-2 pl-9 pr-3 text-sm dark:bg-gray-950 ${
                                      invalidDailyField === `tCode-${row.id}-time`
                                        ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
                                        : 'border-gray-300 dark:border-gray-700'
                                    }`}
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                            {(entryForm.details?.narrative || '').length}/{narrativeCharacterLimit}
                          </span>
                          <button
                            type="button"
                            onClick={buildAutoNarrative}
                            className="btn-primary"
                            aria-label="Build narrative from daily fields"
                            title="Build Narrative"
                          >
                            <Sparkles size={16} />
                            <span>Build Narrative</span>
                          </button>
                          <button
                            type="button"
                            onClick={clearNarrativeSection}
                            className="btn-secondary"
                            aria-label="Clear narrative"
                            title="Clear narrative"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
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
                  <button type="submit" className="btn-secondary" disabled={isSavingDaily} aria-label="Save daily report as draft" title={isSavingDaily ? 'Saving Draft' : 'Save Draft'}>
                    <Save size={16} />
                    <span>{isSavingDaily ? 'Saving' : 'Save Draft'}</span>
                  </button>
                  <button type="button" onClick={(event) => saveEntry(event, 'Submitted')} className="btn-success" disabled={isSavingDaily} data-daily-submit aria-label="Submit daily report" title={isSavingDaily ? 'Submitting Report' : 'Submit Report'}>
                    <CheckCircle2 size={16} />
                    <span>{isSavingDaily ? 'Submitting' : 'Submit'}</span>
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
              {dailyStripTooltip.entry.submissionStatus === 'Submitted' && (
                <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  getDailyReviewStatus(dailyStripTooltip.entry) === 'Approved'
                    ? 'bg-green-500/20 text-green-100'
                    : getDailyReviewStatus(dailyStripTooltip.entry) === 'Returned'
                      ? 'bg-red-500/20 text-red-100'
                      : 'bg-amber-500/20 text-amber-100'
                }`}>
                  {React.createElement(getDailyReviewIcon(dailyStripTooltip.entry), { size: 12 })}
                  {getDailyReviewLabel(dailyStripTooltip.entry)}
                </span>
              )}
            </>
          ) : (
            <span className="mt-1 block text-gray-300">No daily report yet</span>
          )}
        </div>
      )}

      {pageContextMenu && (
        <AppContextMenu
          position={pageContextMenu}
          onClose={() => setPageContextMenu(null)}
          actions={[
            { label: 'Refresh Calendar', icon: RefreshCw, onSelect: () => void loadCalendarEntries(false) },
            { label: 'Go To Today', icon: CalendarClock, onSelect: goToToday },
            { label: 'Create Today Daily', icon: Plus, onSelect: () => openDay(todayKey) },
            { label: 'Previous Period', icon: ChevronLeft, onSelect: () => changeCalendarPeriod(-1), shortcut: 'Left' },
            { label: 'Next Period', icon: ChevronRight, onSelect: () => changeCalendarPeriod(1), shortcut: 'Right' },
            { label: 'Day View', icon: CalendarDays, onSelect: () => setCalendarView('day'), disabled: calendarView === 'day' },
            { label: 'Week View', icon: CalendarDays, onSelect: () => setCalendarView('week'), disabled: calendarView === 'week' },
            { label: 'Month View', icon: CalendarDays, onSelect: () => setCalendarView('month'), disabled: calendarView === 'month' },
            { label: 'Clear Filters', icon: X, onSelect: clearCalendarFilters, disabled: !districtFilter && !statusFilter },
          ]}
        />
      )}

      {dailyStripContextMenu && (
        <div
          className="quick-launch-context-menu z-[100] min-w-56 overflow-hidden rounded border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
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
          <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
          <div className="px-2 py-1">
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Apply Shortcut
            </label>
            <select
              defaultValue=""
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const shortcut = shortcuts.find((item) => item.id === event.target.value);
                if (shortcut) {
                  applyShortcutToDate(shortcut, dailyStripContextMenu.dateKey);
                  setDailyStripContextMenu(null);
                }
              }}
              disabled={shortcuts.length === 0}
              className="h-9 w-full rounded border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
              aria-label="Apply shortcut to daily"
            >
              <option value="">{shortcuts.length > 0 ? 'Choose shortcut' : 'No shortcuts saved'}</option>
              {shortcuts.map((shortcut) => (
                <option key={shortcut.id} value={shortcut.id}>{shortcut.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              void createShortcutFromDate(dailyStripContextMenu.dateKey);
              setDailyStripContextMenu(null);
            }}
            disabled={isSavingShortcut}
            className="quick-launch-context-menu-item text-gray-700 disabled:cursor-not-allowed disabled:opacity-45 dark:text-gray-200"
          >
            <span>Create Shortcut</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Save</span>
          </button>
          <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
          <div className="daily-strip-leave-menu-item text-gray-700 dark:text-gray-200">
            <button
              type="button"
              onClick={() => {
                void markDailyLeaveStatus(dailyStripContextMenu.dateKey, vacationStatus, dailyStatusHours.vacation);
                setDailyStripContextMenu(null);
              }}
              className="flex min-w-0 flex-1 items-center text-left font-semibold"
            >
              <span className="truncate">Vacation Day</span>
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={dailyStatusHours.vacation}
              onChange={(event) => setDailyStatusHours((current) => ({ ...current, vacation: sanitizeDecimalInput(event.target.value) }))}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void markDailyLeaveStatus(dailyStripContextMenu.dateKey, vacationStatus, dailyStatusHours.vacation);
                  setDailyStripContextMenu(null);
                }
              }}
              className="daily-strip-leave-hours-input"
              aria-label="Vacation day hours"
              title="Vacation Hours"
            />
          </div>
          <div className="daily-strip-leave-menu-item text-gray-700 dark:text-gray-200">
            <button
              type="button"
              onClick={() => {
                void markDailyLeaveStatus(dailyStripContextMenu.dateKey, sickStatus, dailyStatusHours.sick);
                setDailyStripContextMenu(null);
              }}
              className="flex min-w-0 flex-1 items-center text-left font-semibold"
            >
              <span className="truncate">Sick Day</span>
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={dailyStatusHours.sick}
              onChange={(event) => setDailyStatusHours((current) => ({ ...current, sick: sanitizeDecimalInput(event.target.value) }))}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void markDailyLeaveStatus(dailyStripContextMenu.dateKey, sickStatus, dailyStatusHours.sick);
                  setDailyStripContextMenu(null);
                }
              }}
              className="daily-strip-leave-hours-input"
              aria-label="Sick day hours"
              title="Sick Hours"
            />
          </div>
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
        <div className="modal-backdrop fixed inset-0 z-[140] flex items-end justify-center bg-black/45 sm:items-center">
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
              <button type="button" onClick={() => deleteEntry(entryPendingDelete)} className="btn-danger" disabled={deletingEntryId === entryPendingDelete.id} aria-label="Delete entry" title={deletingEntryId === entryPendingDelete.id ? 'Deleting' : 'Delete'}>
                {deletingEntryId === entryPendingDelete.id ? 'Deleting' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSubmitReviewOpen && (
        <div className="modal-backdrop fixed inset-0 z-[140] flex items-end justify-center bg-black/45 backdrop-blur-sm !p-0 sm:items-center">
          <div className="modal-window max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-accent">Trooper Daily Review</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">Confirm Submission</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Review the daily details before sending this report for submission.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSubmitReviewOpen(false)}
                className="rounded p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Close submit review"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                <span className="text-xs font-black uppercase text-gray-500 dark:text-gray-400">Date</span>
                <p className="mt-1 font-bold text-gray-900 dark:text-gray-100">{getReadableDate(entryForm.date)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                <span className="text-xs font-black uppercase text-gray-500 dark:text-gray-400">Status</span>
                <p className="mt-1 font-bold text-gray-900 dark:text-gray-100">{entryForm.specialStatus || 'None'}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                <span className="text-xs font-black uppercase text-gray-500 dark:text-gray-400">District</span>
                <p className="mt-1 font-bold text-gray-900 dark:text-gray-100">{entryForm.districtWorked}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                <span className="text-xs font-black uppercase text-gray-500 dark:text-gray-400">Sections</span>
                <p className="mt-1 font-bold text-gray-900 dark:text-gray-100">{submitReviewCompletedSections} of {submitReviewSections.length} complete</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {hourMetrics.map((metric) => (
                <div key={metric.label} className={`rounded-lg border p-3 ${
                  metric.isMatch
                    ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100'
                    : 'border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100'
                }`}>
                  <span className="text-[10px] font-black uppercase opacity-70">{metric.label}</span>
                  <p className="mt-1 text-lg font-black">{formatHours(metric.value || 0)}h</p>
                  {metric.helper && <p className="mt-1 text-[11px] font-bold opacity-75">{metric.helper}</p>}
                </div>
              ))}
            </div>

            {leaveStatusHours > 0 && (
              <div className="mt-4 rounded-lg border border-accent/25 bg-accent/5 p-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                {formatHours(leaveStatusHours)}h {entryForm.specialStatus.toLowerCase()} recorded. Worked-hour sections are checked against {formatHours(shiftDutyTargetHours)}h.
              </div>
            )}

            {submitReviewAttentionSections.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm font-black text-amber-800 dark:text-amber-100">Needs attention</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {submitReviewAttentionSections.map((section) => (
                    <span key={section.panel} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200 dark:bg-gray-950 dark:text-amber-100 dark:ring-amber-900">
                      {section.panel}: {section.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100">
                No blocking issues found.
              </div>
            )}

            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-gray-900 dark:text-gray-100">Smart daily checks</p>
                  <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Quick consistency checks before submission.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                  smartDailyChecks.length > 0
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100'
                    : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-100'
                }`}>
                  {smartDailyChecks.length > 0 ? `${smartDailyChecks.length} flag${smartDailyChecks.length === 1 ? '' : 's'}` : 'Clear'}
                </span>
              </div>
              {smartDailyChecks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {smartDailyChecks.map((check) => (
                    <button
                      key={check.id}
                      type="button"
                      onClick={() => openSmartDailyCheck(check)}
                      className={`w-full rounded border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                        check.severity === 'attention'
                          ? 'border-danger/30 bg-red-50 text-danger dark:border-red-900 dark:bg-red-950/30'
                          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                      }`}
                    >
                      <span className="block text-sm font-black">{check.title}</span>
                      <span className="mt-1 block text-xs font-semibold opacity-80">{check.detail}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100">
                  No unusual activity patterns found.
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setIsSubmitReviewOpen(false)} className="btn-secondary" aria-label="Cancel submission" title="Cancel">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEntry(undefined, 'Submitted', true)}
                className="btn-success"
                disabled={isSavingDaily}
                aria-label="Confirm daily submission"
                title={isSavingDaily ? 'Submitting Report' : 'Submit Report'}
              >
                <CheckCircle2 size={16} />
                <span>{isSavingDaily ? 'Submitting' : 'Submit Daily'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
