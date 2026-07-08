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
    <div className="app-surface mb-8 p-5">
      {title && <h3 className="mb-5">{title}</h3>}
      <div className="app-summary-strip lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="app-summary-item flex items-center gap-4 border-l-4 border-primary-500"
          >
            {stat.icon && <span className="text-3xl">{stat.icon}</span>}
            <div className="flex flex-col">
              <span className="app-summary-label">{stat.label}</span>
              <span className="app-summary-value text-2xl text-primary-500 dark:text-blue-100">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
