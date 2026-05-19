import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Search, X } from 'lucide-react';
import { AuthAccount, reportService, ReportRow, SystemStatistics, TrooperDailyReportEntry } from '../services/api';
import { districtOptions } from '../constants/districts';

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

const ReportsPage: React.FC<{ currentUser: AuthAccount | null }> = ({ currentUser }) => {
  const [selectedReportType, setSelectedReportType] = useState<'trooper-daily' | 'cpar'>('trooper-daily');
  const [rankReport, setRankReport] = useState<ReportRow[]>([]);
  const [districtReport, setDistrictReport] = useState<ReportRow[]>([]);
  const [employmentReport, setEmploymentReport] = useState<ReportRow[]>([]);
  const [statistics, setStatistics] = useState<SystemStatistics | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [selectedDaily, setSelectedDaily] = useState<TrooperDailyReportEntry | null>(null);

  const loadUserReports = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const [rankRes, districtRes, employmentRes, statsRes] = await Promise.all([
        reportService.getByRank(),
        reportService.getByDistrict(),
        reportService.getByEmploymentType(),
        reportService.getStatistics(),
      ]);

      setRankReport(rankRes.data);
      setDistrictReport(districtRes.data);
      setEmploymentReport(employmentRes.data);
      setStatistics(statsRes.data);
    } catch (err) {
      setError(getErrorMessage(err, 'User analytics require user report permission.'));
      console.error(err);
    } finally {
      setLoading(false);
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
      if (response.data.scope === 'all') {
        void loadUserReports(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setDailyError(getErrorMessage(err, 'Trooper Daily reports require permission.'));
      console.error(err);
      setLoading(false);
    } finally {
      setDailyLoading(false);
    }
  };

  useEffect(() => {
    if (selectedReportType === 'trooper-daily') {
      void loadTrooperDailies();
    }
    const handleReportsUpdate = () => {
      if (selectedReportType === 'trooper-daily') {
        void loadTrooperDailies(false);
      }
    };

    window.addEventListener('shield:user-updated', handleReportsUpdate);
    window.addEventListener('shield:dashboard-updated', handleReportsUpdate);
    window.addEventListener('shield:calendar-updated', handleReportsUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleReportsUpdate);
      window.removeEventListener('shield:dashboard-updated', handleReportsUpdate);
      window.removeEventListener('shield:calendar-updated', handleReportsUpdate);
    };
  }, [selectedReportType]);

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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedDaily(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const openDailyReport = (entry: TrooperDailyReportEntry) => {
    setSelectedDaily(entry);
  };

  const selectedDailyUserName = selectedDaily
    ? `${selectedDaily.user.firstName || ''} ${selectedDaily.user.lastName || ''}`.trim() || selectedDaily.user.email || 'Unknown'
    : '';

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

        <form onSubmit={searchTrooperDailies} className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto_auto]">
          <input
            value={dailySearch}
            onChange={(event) => setDailySearch(event.target.value)}
            placeholder="Name, email, PE, badge, rank..."
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
          <input type="date" value={dailyFrom} onChange={(event) => setDailyFrom(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
          <input type="date" value={dailyTo} onChange={(event) => setDailyTo(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
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
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 text-left font-semibold">Narrative</th>
                </tr>
              </thead>
              <tbody>
                {trooperDailies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">No submitted Trooper Dailies found.</td>
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
                        <td className="max-w-sm px-3 py-3 text-gray-600 dark:text-gray-400">
                          <p className="line-clamp-2">{entry.details?.narrative || 'No narrative'}</p>
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
      </section>
      ) : (
        <section className="mb-8 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded bg-accent/10 text-accent">
            <FileText size={22} />
          </div>
          <h2 className="mt-4">CPAR</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            CPAR reporting is ready as a report type. The CPAR dataset and filters can be wired in when those records are added.
          </p>
        </section>
      )}

      {selectedReportType === 'trooper-daily' && dailyScope === 'all' && (loading ? (
        <div className="loading">Loading user analytics...</div>
      ) : (
        <>
          {error && <div className="error">{error}</div>}

          {statistics && (
            <div className="mb-12">
              <h2 className="mb-6">System Statistics</h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border-l-4 border-primary-500 bg-white p-5 text-center shadow dark:bg-gray-900 dark:shadow-none">
                  <h3 className="m-0 mb-2 text-3xl font-bold text-primary-500">{statistics.totalUsers}</h3>
                  <p className="m-0 text-sm text-gray-500 dark:text-gray-400">Total Users</p>
                </div>
                <div className="rounded-lg border-l-4 border-success bg-white p-5 text-center shadow dark:bg-gray-900 dark:shadow-none">
                  <h3 className="m-0 mb-2 text-3xl font-bold text-success">{statistics.activeUsers}</h3>
                  <p className="m-0 text-sm text-gray-500 dark:text-gray-400">Active Users</p>
                </div>
                <div className="rounded-lg border-l-4 border-danger bg-white p-5 text-center shadow dark:bg-gray-900 dark:shadow-none">
                  <h3 className="m-0 mb-2 text-3xl font-bold text-danger">{statistics.inactiveUsers}</h3>
                  <p className="m-0 text-sm text-gray-500 dark:text-gray-400">Inactive Users</p>
                </div>
                <div className="rounded-lg border-l-4 border-secondary-500 bg-white p-5 text-center shadow dark:bg-gray-900 dark:shadow-none">
                  <h3 className="m-0 mb-2 text-3xl font-bold text-secondary-500">{statistics.totalDistricts}</h3>
                  <p className="m-0 text-sm text-gray-500 dark:text-gray-400">Total Districts</p>
                </div>
                <div className="rounded-lg border-l-4 border-accent bg-white p-5 text-center shadow dark:bg-gray-900 dark:shadow-none">
                  <h3 className="m-0 mb-2 text-3xl font-bold text-accent">{statistics.totalRanks}</h3>
                  <p className="m-0 text-sm text-gray-500 dark:text-gray-400">Total Ranks</p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {[
              { title: 'Users by Rank', rows: rankReport, keyName: 'rank', label: 'Rank' },
              { title: 'Users by District', rows: districtReport, keyName: 'district', label: 'District' },
              { title: 'Users by Employment Type', rows: employmentReport, keyName: 'employmentType', label: 'Employment Type' },
            ].map((report) => (
              <div key={report.title} className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
                <h2 className="mb-4">{report.title}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300 dark:border-gray-700">
                        <th className="py-2 text-left font-semibold">{report.label}</th>
                        <th className="py-2 text-left font-semibold">Total</th>
                        <th className="py-2 text-left font-semibold">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((item, index) => (
                        <tr key={index} className="border-b border-gray-200 dark:border-gray-800">
                          <td className="py-2">{String(item[report.keyName as keyof ReportRow] || 'Unassigned')}</td>
                          <td className="py-2">{item.count}</td>
                          <td className="py-2">{item.activeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      ))}

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
              <button
                type="button"
                onClick={() => setSelectedDaily(null)}
                className="icon-close-button border-white/20 bg-white/10 text-white hover:bg-white/20 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                aria-label="Close Trooper Daily report"
                title="Close"
              >
                <X size={20} />
              </button>
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
                  ['Submitted', new Date(selectedDaily.createdAt).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{value || 'Not entered'}</p>
                  </div>
                ))}
              </div>

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
