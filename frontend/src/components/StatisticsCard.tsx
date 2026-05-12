import React from 'react';

interface Stat {
  label: string;
  value: number | string;
  icon?: string;
}

interface StatisticsCardProps {
  stats: Stat[];
  title?: string;
}

export const StatisticsCard: React.FC<StatisticsCardProps> = ({
  stats,
  title = 'Statistics',
}) => {
  return (
    <div className="bg-white rounded-lg p-5 shadow mb-8">
      {title && <h3 className="mb-5">{title}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="flex items-center gap-4 p-4 bg-gray-50 rounded border-l-4 border-primary-500"
          >
            {stat.icon && <span className="text-3xl">{stat.icon}</span>}
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-500 uppercase">{stat.label}</span>
              <span className="text-2xl font-bold text-primary-500">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
