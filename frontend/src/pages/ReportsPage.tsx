import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { reportService, ReportRow, SystemStatistics, TrooperDailyReportEntry } from '../services/api';
import { districtOptions } from '../constants/districts';

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

const ReportsPage: React.FC = () => {
  const [rankReport, setRankReport] = useState<ReportRow[]>([]);
  const [districtReport, setDistrictReport] = useState<ReportRow[]>([]);
  const [employmentReport, setEmploymentReport] = useState<ReportRow[]>([]);
  const [statistics, setStatistics] = useState<SystemStatistics | null>(null);
  const [trooperDailies, setTrooperDailies] = useState<TrooperDailyReportEntry[]>([]);
  const [dailySearch, setDailySearch] = useState('');
  const [dailyFrom, setDailyFrom] = useState('');
  const [dailyTo, setDailyTo] = useState('');
  const [dailyDistrict, setDailyDistrict] = useState('');
  const [loading, setLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);

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
      });
      setTrooperDailies(response.data.data);
    } catch (err) {
      setDailyError(getErrorMessage(err, 'Trooper Daily reports require permission.'));
      console.error(err);
    } finally {
      setDailyLoading(false);
    }
  };

  useEffect(() => {
    void loadUserReports();
    void loadTrooperDailies();
    const handleReportsUpdate = () => {
      void loadUserReports(false);
      void loadTrooperDailies(false);
    };

    window.addEventListener('shield:user-updated', handleReportsUpdate);
    window.addEventListener('shield:dashboard-updated', handleReportsUpdate);
    window.addEventListener('shield:calendar-updated', handleReportsUpdate);
    return () => {
      window.removeEventListener('shield:user-updated', handleReportsUpdate);
      window.removeEventListener('shield:dashboard-updated', handleReportsUpdate);
      window.removeEventListener('shield:calendar-updated', handleReportsUpdate);
    };
  }, []);

  const searchTrooperDailies = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadTrooperDailies();
  };

  const clearTrooperDailyFilters = () => {
    setDailySearch('');
    setDailyFrom('');
    setDailyTo('');
    setDailyDistrict('');
    void loadTrooperDailies(true, { q: '', from: '', to: '', district: '' });
  };

  return (
    <div>
      <h1 className="mb-8">Reports & Analytics</h1>

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>Trooper Daily Reports</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Search submitted Trooper Dailies by user, email, PE number, badge, rank, or district.
            </p>
          </div>
          <span className="rounded bg-accent/10 px-3 py-1 text-sm font-bold text-accent">{trooperDailies.length} results</span>
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
                      <tr key={entry.id} className="border-b border-gray-200 dark:border-gray-800">
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
        )}
      </section>

      {loading ? (
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
      )}
    </div>
  );
};

export default ReportsPage;
