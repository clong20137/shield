import React, { useEffect, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Save, Trash2, X } from 'lucide-react';
import { AuthAccount, CalendarEntry, calendarService } from '../services/api';

type CalendarEntryForm = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>;

const districtOptions = [
  'Area 1',
  'Toll Road',
  'Lowell',
  'Lafayette',
  'Peru',
  'Area 2',
  'Fort Wayne',
  'Bremen',
  'Area 3',
  'Bloomington',
  'Jasper',
  'Evansville',
  'Area 4',
  'Versailles',
  'Sellersburg',
  'Area 5',
  'Pendleton',
  'Indianapolis',
  'Putnamville',
  'Headquarters',
  'North Zone',
  'South Zone',
  'Central Zone',
  'Laboratory',
  'Polygraph',
  'CSI Section',
  'Digital Forensics Unit',
];

const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty'];

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

const timeDetailFields = new Set([
  'regularDutyStartTime',
  'regularDutyEndTime',
  'splitStartTime',
  'splitEndTime',
  'secondSplitStartTime',
  'secondSplitEndTime',
  'thirdSplitStartTime',
  'thirdSplitEndTime',
]);

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

const createDefaultEntryForm = (date: string): CalendarEntryForm => ({
  category: 'Trooper Daily',
  date,
  dutyHours: '',
  districtWorked: districtOptions[0],
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

function getDifferenceLabel(firstValue: number, secondValue: number): string {
  const difference = Math.abs(firstValue - secondValue);
  return difference <= 0.01 ? 'Matches' : `${formatHours(difference)} hr off`;
}

function CalendarPage({ currentUser }: { currentUser: AuthAccount }) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<CalendarEntryForm>(() =>
    createDefaultEntryForm(formatDateKey(new Date())),
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [entryPendingDelete, setEntryPendingDelete] = useState<CalendarEntry | null>(null);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

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

  useEffect(() => {
    loadCalendarEntries();
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
    setEntryForm(createDefaultEntryForm(dateKey));
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
      } else {
        const response = await calendarService.create(payload);
        setEntries((currentEntries) => [response.data, ...currentEntries]);
      }
      setEntryForm(createDefaultEntryForm(entryForm.date));
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
  };

  const updateDailyDetail = (key: string, value: string) => {
    setEntryForm((currentForm) => ({
      ...currentForm,
      details: {
        ...(currentForm.details || {}),
        [key]: value,
      },
    }));
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
  const calculatedShiftHours =
    calculateTimeRangeHours(entryDetails, 'regularDutyStartTime', 'regularDutyEndTime') +
    calculateTimeRangeHours(entryDetails, 'splitStartTime', 'splitEndTime') +
    calculateTimeRangeHours(entryDetails, 'secondSplitStartTime', 'secondSplitEndTime') +
    calculateTimeRangeHours(entryDetails, 'thirdSplitStartTime', 'thirdSplitEndTime');
  const attendanceHours = attendanceHourFields.reduce((total, key) => total + parseNumericDetail(entryDetails, key), 0);
  const dutyActivityHours = dutyActivityHourFields.reduce((total, key) => total + parseNumericDetail(entryDetails, key), 0);
  const hasShiftTime = calculatedShiftHours > 0;
  const hasReportedHours = reportedDutyHours > 0;
  const hasHourMismatch =
    hasReportedHours &&
    ((hasShiftTime && Math.abs(calculatedShiftHours - reportedDutyHours) > 0.01) ||
      (attendanceHours > 0 && Math.abs(attendanceHours - reportedDutyHours) > 0.01) ||
      (dutyActivityHours > 0 && Math.abs(dutyActivityHours - reportedDutyHours) > 0.01));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Interactive Calendar</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Personal duty information for {currentUser.displayName || currentUser.email}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary" aria-label="Previous month" title="Previous">
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-40 text-center font-bold text-gray-700 dark:text-gray-200">
            {getMonthLabel(calendarMonth)}
          </div>
          <button type="button" onClick={() => changeMonth(1)} className="btn-secondary" aria-label="Next month" title="Next">
            <ChevronRight size={16} />
          </button>
          <button type="button" onClick={goToToday} className="btn-secondary" aria-label="Go to today" title="Today">
            <CalendarClock size={16} />
          </button>
        </div>
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
                  {editingEntryId ? 'Edit this daily activity report.' : 'Complete the daily activity report for this date.'}
                </p>
              </div>
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

            <form onSubmit={saveEntry} className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={entryForm.dutyHours}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, dutyHours: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  required
                />
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

              <div className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Color Code</span>
                <div className="flex flex-wrap gap-2">
                  {entryColors.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setEntryForm((currentForm) => ({ ...currentForm, color: color.value }))}
                      className={`flex h-9 min-w-24 items-center gap-2 rounded border px-3 text-sm font-semibold ${
                        entryForm.color === color.value
                          ? 'border-primary-500 bg-gray-50 dark:bg-gray-950'
                          : 'border-gray-200 dark:border-gray-800'
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: color.value }} />
                      {color.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className={`mb-4 grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-4 ${
                  hasHourMismatch ? 'border-danger/40 bg-red-50 dark:bg-red-950/30' : 'border-accent/30 bg-accent/5'
                }`}>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Reported</p>
                    <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{formatHours(reportedDutyHours || 0)} hrs</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Shift Time</p>
                    <p className="mt-1 text-2xl font-bold text-accent">{formatHours(calculatedShiftHours)} hrs</p>
                    <p className="text-xs font-semibold text-gray-500">{getDifferenceLabel(reportedDutyHours, calculatedShiftHours)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Attendance</p>
                    <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{formatHours(attendanceHours)} hrs</p>
                    <p className="text-xs font-semibold text-gray-500">{getDifferenceLabel(reportedDutyHours, attendanceHours)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Duty Activity</p>
                    <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{formatHours(dutyActivityHours)} hrs</p>
                    <p className="text-xs font-semibold text-gray-500">{getDifferenceLabel(reportedDutyHours, dutyActivityHours)}</p>
                  </div>
                  {hasHourMismatch && (
                    <p className="text-sm font-semibold text-danger md:col-span-4">
                      Hours do not match the reported duty hours. Review shift times, attendance hours, and duty activity hours before submitting.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {trooperDailySections.map((section) => (
                    <section key={section.title} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{section.title}</h3>
                        <span className="h-1.5 w-10 rounded-full bg-accent" />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {section.fields.map(([key, label]) => {
                          const isTimeField = timeDetailFields.has(key);
                          return (
                            <label key={key} className="block">
                              <span className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</span>
                              <input
                                type={isTimeField ? 'time' : 'number'}
                                min={isTimeField ? undefined : '0'}
                                step={isTimeField ? undefined : '0.01'}
                                inputMode={isTimeField ? undefined : 'decimal'}
                                value={entryForm.details?.[key] || ''}
                                onChange={(event) => updateDailyDetail(key, event.target.value)}
                                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950 xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Narrative</h3>
                      <span className="h-1.5 w-10 rounded-full bg-accent" />
                    </div>
                    <textarea
                      value={entryForm.details?.narrative || ''}
                      onChange={(event) => updateDailyDetail('narrative', event.target.value)}
                      placeholder="Type a narrative here"
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
                    setEntryForm(createDefaultEntryForm(selectedDate));
                  }} className="btn-secondary ml-2" aria-label="Cancel edit" title="Cancel Edit">
                    <X size={16} />
                  </button>
                )}
              </div>
            </form>

            <div className="mt-6">
              <h3 className="mb-3">Entries</h3>
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
                            {entry.category} - {entry.specialStatus}
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
