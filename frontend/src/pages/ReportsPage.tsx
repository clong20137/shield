import React, { useState, useEffect } from 'react';
import { reportService } from '../services/api';

interface Report {
  label: string;
  value: number;
  count?: number;
  activeCount?: number;
}

const ReportsPage: React.FC = () => {
  const [rankReport, setRankReport] = useState<any[]>([]);
  const [districtReport, setDistrictReport] = useState<any[]>([]);
  const [employmentReport, setEmploymentReport] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
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
      setError('Failed to load reports. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading reports...</div>;
  }

  return (
    <div>
      <h1 className="mb-8">Reports & Analytics</h1>

      {error && <div className="error">{error}</div>}

      {statistics && (
        <div className="mb-12">
          <h2 className="mb-6">System Statistics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            <div className="bg-white rounded-lg p-5 text-center shadow border-l-4 border-primary-500">
              <h3 className="text-3xl font-bold text-primary-500 m-0 mb-2">{statistics.totalUsers}</h3>
              <p className="m-0 text-gray-500 text-sm">Total Users</p>
            </div>
            <div className="bg-white rounded-lg p-5 text-center shadow border-l-4 border-success">
              <h3 className="text-3xl font-bold text-success m-0 mb-2">{statistics.activeUsers}</h3>
              <p className="m-0 text-gray-500 text-sm">Active Users</p>
            </div>
            <div className="bg-white rounded-lg p-5 text-center shadow border-l-4 border-danger">
              <h3 className="text-3xl font-bold text-danger m-0 mb-2">{statistics.inactiveUsers}</h3>
              <p className="m-0 text-gray-500 text-sm">Inactive Users</p>
            </div>
            <div className="bg-white rounded-lg p-5 text-center shadow border-l-4 border-secondary-500">
              <h3 className="text-3xl font-bold text-secondary-500 m-0 mb-2">{statistics.totalDistricts}</h3>
              <p className="m-0 text-gray-500 text-sm">Total Districts</p>
            </div>
            <div className="bg-white rounded-lg p-5 text-center shadow border-l-4 border-accent">
              <h3 className="text-3xl font-bold text-accent m-0 mb-2">{statistics.totalRanks}</h3>
              <p className="m-0 text-gray-500 text-sm">Total Ranks</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="bg-white rounded-lg p-5 shadow">
          <h2 className="mb-4">Users by Rank</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2 font-semibold">Rank</th>
                  <th className="text-left py-2 font-semibold">Total</th>
                  <th className="text-left py-2 font-semibold">Active</th>
                </tr>
              </thead>
              <tbody>
                {rankReport.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.rank}</td>
                    <td className="py-2">{item.count}</td>
                    <td className="py-2">{item.activeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow">
          <h2 className="mb-4">Users by District</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2 font-semibold">District</th>
                  <th className="text-left py-2 font-semibold">Total</th>
                  <th className="text-left py-2 font-semibold">Active</th>
                </tr>
              </thead>
              <tbody>
                {districtReport.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.district}</td>
                    <td className="py-2">{item.count}</td>
                    <td className="py-2">{item.activeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow">
          <h2 className="mb-4">Users by Employment Type</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2 font-semibold">Employment Type</th>
                  <th className="text-left py-2 font-semibold">Total</th>
                  <th className="text-left py-2 font-semibold">Active</th>
                </tr>
              </thead>
              <tbody>
                {employmentReport.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.employmentType}</td>
                    <td className="py-2">{item.count}</td>
                    <td className="py-2">{item.activeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <button onClick={loadReports} className="btn-primary">
        Refresh Reports
      </button>
    </div>
  );
};

export default ReportsPage;
