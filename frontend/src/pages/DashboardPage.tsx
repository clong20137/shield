import React, { useState, useEffect } from 'react';
import { userService, reportService, SystemStatistics, User } from '../services/api';
import { StatisticsCard } from '../components/StatisticsCard';

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<SystemStatistics | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        reportService.getStatistics(),
        userService.getAll(1, 10),
      ]);

      setStats(statsRes.data);
      setRecentUsers(usersRes.data.data);
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
      <h1 className="mb-8">Dashboard</h1>

      {error && <div className="error">{error}</div>}

      {stats && (
        <StatisticsCard
          stats={statItems}
          title="System Overview"
        />
      )}

      <div className="bg-white rounded-lg p-5 shadow">
        <h2 className="mb-6">Recent Users</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recentUsers.map((user) => (
            <div
              key={user.id}
              className="bg-gradient-to-br from-gray-50 to-white border border-gray-300 rounded-lg p-5 transition hover:shadow-lg hover:-translate-y-1"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-primary-500 m-0 mb-2 text-base font-bold">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="m-0 mb-1 text-sm text-gray-600 font-semibold">
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
