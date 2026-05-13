import React, { useState, useEffect } from 'react';
import { userService, reportService, ReportRow, SystemStatistics, User } from '../services/api';
import { StatisticsCard } from '../components/StatisticsCard';

type CalendarEntry = {
  id: string;
  category: 'General Information';
  date: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
};

type CalendarEntryForm = Omit<CalendarEntry, 'id'>;

const calendarStorageKey = 'shield_calendar_entries';

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

const createDefaultEntryForm = (date: string): CalendarEntryForm => ({
  category: 'General Information',
  date,
  dutyHours: '',
  districtWorked: districtOptions[0],
  specialStatus: specialStatusOptions[0],
  color: entryColors[0].value,
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

function DashboardCalendar() {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<CalendarEntryForm>(() =>
    createDefaultEntryForm(formatDateKey(new Date())),
  );

  useEffect(() => {
    const savedEntries = window.localStorage.getItem(calendarStorageKey);

    if (!savedEntries) {
      setEntriesLoaded(true);
      return;
    }

    try {
      const parsedEntries = JSON.parse(savedEntries) as CalendarEntry[];
      setEntries(Array.isArray(parsedEntries) ? parsedEntries : []);
    } catch (err) {
      console.error('Failed to load calendar entries:', err);
    } finally {
      setEntriesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!entriesLoaded) {
      return;
    }

    window.localStorage.setItem(calendarStorageKey, JSON.stringify(entries));
  }, [entries, entriesLoaded]);

  const openDay = (dateKey: string) => {
    setSelectedDate(dateKey);
    setEntryForm(createDefaultEntryForm(dateKey));
  };

  const closeModal = () => {
    setSelectedDate(null);
  };

  const changeMonth = (offset: number) => {
    setCalendarMonth((currentMonth) => {
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(currentMonth.getMonth() + offset);
      return nextMonth;
    });
  };

  const saveEntry = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hours = Number(entryForm.dutyHours);

    if (!entryForm.date || Number.isNaN(hours) || hours < 0) {
      return;
    }

    const newEntry: CalendarEntry = {
      ...entryForm,
      dutyHours: hours.toFixed(2).replace(/\.?0+$/, ''),
      id: `${entryForm.date}-${Date.now()}`,
    };

    setEntries((currentEntries) => [...currentEntries, newEntry]);
    setEntryForm(createDefaultEntryForm(entryForm.date));
  };

  const deleteEntry = (entryId: string) => {
    setEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));
  };

  const selectedEntries = selectedDate
    ? entries.filter((entry) => entry.date === selectedDate)
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

  return (
    <section className="mb-8 rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Interactive Calendar</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Click a day to add color-coded duty information.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary">
            Previous
          </button>
          <div className="min-w-40 text-center font-bold text-gray-700 dark:text-gray-200">
            {getMonthLabel(calendarMonth)}
          </div>
          <button type="button" onClick={() => changeMonth(1)} className="btn-secondary">
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase text-gray-500 dark:text-gray-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {calendarCells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="min-h-28 rounded border border-transparent" />;
          }

          const dateKey = formatDateKey(date);
          const dayEntries = entries.filter((entry) => entry.date === dateKey);
          const isToday = dateKey === todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => openDay(dateKey)}
              className={`min-h-28 rounded border bg-gray-50 p-2 text-left transition hover:border-accent hover:bg-accent/5 dark:bg-gray-950 ${
                isToday
                  ? 'border-accent ring-2 ring-accent/20'
                  : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold text-gray-800 dark:text-gray-100">{date.getDate()}</span>
                {dayEntries.length > 0 && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                    {dayEntries.length}
                  </span>
                )}
              </div>
              <div className="space-y-1">
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
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2>{getReadableDate(selectedDate)}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Add duty details for this calendar day.
                </p>
              </div>
              <button type="button" onClick={closeModal} className="btn-secondary">
                Close
              </button>
            </div>

            <form onSubmit={saveEntry} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Section</span>
                <select
                  value={entryForm.category}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({
                      ...currentForm,
                      category: event.target.value as CalendarEntry['category'],
                    }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  <option>General Information</option>
                </select>
              </label>

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

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Color Code</span>
                <select
                  value={entryForm.color}
                  onChange={(event) =>
                    setEntryForm((currentForm) => ({ ...currentForm, color: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                >
                  {entryColors.map((color) => (
                    <option key={color.value} value={color.value}>
                      {color.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <button type="submit" className="btn-primary">
                  Add Calendar Entry
                </button>
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
                            {entry.dutyHours} duty hours
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {entry.districtWorked} - {entry.specialStatus}
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => deleteEntry(entry.id)} className="btn-danger">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ReportBarChart({
  title,
  labelKey,
  data,
}: {
  title: string;
  labelKey: keyof Pick<ReportRow, 'rank' | 'district' | 'employmentType'>;
  data: ReportRow[];
}) {
  const maxCount = Math.max(...data.map((item) => Number(item.count) || 0), 1);
  const topItems = data.slice(0, 6);

  return (
    <div className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl">{title}</h2>
        <span className="rounded bg-accent/10 px-3 py-1 text-xs font-bold uppercase text-accent">
          Live
        </span>
      </div>
      <div className="space-y-4">
        {topItems.length === 0 ? (
          <div className="empty-state">No report data</div>
        ) : (
          topItems.map((item, index) => {
            const label = item[labelKey] || 'Unassigned';
            const count = Number(item.count) || 0;
            const percentage = Math.max((count / maxCount) * 100, 3);

            return (
              <div key={`${label}-${index}`}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{label}</span>
                  <span className="text-gray-500 dark:text-gray-400">{count}</span>
                </div>
                <div className="h-3 rounded bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-3 rounded bg-primary-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<SystemStatistics | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [rankReport, setRankReport] = useState<ReportRow[]>([]);
  const [districtReport, setDistrictReport] = useState<ReportRow[]>([]);
  const [employmentReport, setEmploymentReport] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();

    const refreshInterval = window.setInterval(() => {
      loadDashboard(false);
    }, 30000);

    return () => window.clearInterval(refreshInterval);
  }, []);

  const loadDashboard = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const [statsRes, usersRes, rankRes, districtRes, employmentRes] = await Promise.all([
        reportService.getStatistics(),
        userService.getAll(1, 10),
        reportService.getByRank(),
        reportService.getByDistrict(),
        reportService.getByEmploymentType(),
      ]);

      setStats(statsRes.data);
      setRecentUsers(usersRes.data.data);
      setRankReport(rankRes.data);
      setDistrictReport(districtRes.data);
      setEmploymentReport(employmentRes.data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError('Failed to load dashboard data. Check that the backend is running and MySQL is available.');
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const statItems = stats
    ? [
        { label: 'Total Users', value: stats.totalUsers || 0, icon: 'Users' },
        { label: 'Active Users', value: stats.activeUsers || 0, icon: 'On' },
        { label: 'Inactive Users', value: stats.inactiveUsers || 0, icon: 'Off' },
        { label: 'Districts', value: stats.totalDistricts || 0, icon: 'Map' },
      ]
    : [];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Dashboard</h1>
          {lastUpdated && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Live data refreshed at {lastUpdated}</p>
          )}
        </div>
        <button type="button" onClick={() => loadDashboard()} className="btn-secondary">
          Refresh Data
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {stats && (
        <StatisticsCard
          stats={statItems}
          title="System Overview"
        />
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ReportBarChart title="Users by Rank" labelKey="rank" data={rankReport} />
        <ReportBarChart title="Users by District" labelKey="district" data={districtReport} />
        <ReportBarChart title="Employment Type" labelKey="employmentType" data={employmentReport} />
      </div>

      <DashboardCalendar />

      <div className="bg-white rounded-lg p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
        <h2 className="mb-6">Recent Users</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recentUsers.map((user) => (
            <div
              key={user.id}
              className="bg-gradient-to-br from-gray-50 to-white border border-gray-300 rounded-lg p-5 transition hover:shadow-lg hover:-translate-y-1 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-primary-500 m-0 mb-2 text-base font-bold">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="m-0 mb-1 text-sm text-gray-600 font-semibold dark:text-gray-300">
                    Badge: {user.badgeNumber}
                  </p>
                  <p className="m-0 mb-1 text-sm text-secondary-500">
                    Rank: {user.rank}
                  </p>
                  <p className="m-0 text-sm text-accent">
                    District: {user.district}
                  </p>
                </div>
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    user.isActive
                      ? 'bg-green-100 text-success'
                      : 'bg-red-100 text-danger'
                  }`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
