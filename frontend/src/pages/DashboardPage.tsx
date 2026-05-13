import React, { useState, useEffect } from 'react';
import { userService, reportService, ReportRow, SystemStatistics, User } from '../services/api';
import { StatisticsCard } from '../components/StatisticsCard';

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
