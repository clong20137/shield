import { DeviceRecord } from '../services/api';

function formatUsageValue(value: number, suffix: string, maximumFractionDigits = 1): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)} ${suffix}`;
}

function getDeviceLabel(device: DeviceRecord): string {
  return device.makeModel || device.assetTag || device.type;
}

export function DeviceUsageSummary({ devices }: { devices: DeviceRecord[] }) {
  const usageDevices = devices.filter((device) => (
    Number(device.dataUsageGb) > 0 ||
    Number(device.mobileMinutes) > 0 ||
    Boolean(device.possibleInactive)
  ));
  const totalDataUsage = usageDevices.reduce((sum, device) => sum + (Number(device.dataUsageGb) || 0), 0);
  const totalMinutes = usageDevices.reduce((sum, device) => sum + (Number(device.mobileMinutes) || 0), 0);
  const inactiveCount = usageDevices.filter((device) => device.possibleInactive).length;
  const maxDataUsage = Math.max(1, ...usageDevices.map((device) => Number(device.dataUsageGb) || 0));
  const maxMinutes = Math.max(1, ...usageDevices.map((device) => Number(device.mobileMinutes) || 0));

  if (usageDevices.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No usage data has been imported for these devices yet.
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-gray-900 dark:text-gray-100">Usage</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Latest imported Verizon/AT&T usage snapshot</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
            {formatUsageValue(totalDataUsage, 'GB')}
          </span>
          <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            {formatUsageValue(totalMinutes, 'min', 0)}
          </span>
          {inactiveCount > 0 && (
            <span className="rounded bg-orange-100 px-2 py-1 text-orange-700 dark:bg-orange-950 dark:text-orange-200">
              {inactiveCount} possible inactive
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {usageDevices.map((device) => {
          const dataUsage = Number(device.dataUsageGb) || 0;
          const minutes = Number(device.mobileMinutes) || 0;
          const dataWidth = `${Math.max(dataUsage > 0 ? 8 : 0, Math.min(100, (dataUsage / maxDataUsage) * 100))}%`;
          const minuteWidth = `${Math.max(minutes > 0 ? 8 : 0, Math.min(100, (minutes / maxMinutes) * 100))}%`;

          return (
            <div key={device.id} className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{getDeviceLabel(device)}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{device.phoneNumber || device.assetTag || device.type}</p>
                </div>
                {device.possibleInactive && (
                  <span className="shrink-0 rounded bg-orange-100 px-2 py-1 text-[11px] font-black uppercase text-orange-700 dark:bg-orange-950 dark:text-orange-200">
                    Possible inactive
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex justify-between gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <span>Data</span>
                    <span>{formatUsageValue(dataUsage, 'GB')}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-[#00A8E0]" style={{ width: dataWidth }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <span>Calling</span>
                    <span>{formatUsageValue(minutes, 'min', 0)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: minuteWidth }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
