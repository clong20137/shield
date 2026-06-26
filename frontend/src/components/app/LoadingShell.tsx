import { Shield } from 'lucide-react';

function formatConnectionTime(value: number | null): string {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Unknown';
}

export function ShieldLoading({
  title = 'Loading Blueline',
  detail,
  steps = [],
  lastConnectedAt,
  brandLogoSrc,
  appName = 'Blueline',
}: {
  title?: string;
  detail?: string;
  steps?: Array<{ label: string; status: 'active' | 'complete' | 'warning' | 'waiting'; detail?: string }>;
  lastConnectedAt?: number | null;
  brandLogoSrc?: string;
  appName?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="shield-app-icon-loader mx-auto mb-4">
          <img src={brandLogoSrc || '/shield-splash-logo.png'} alt={appName} />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">{title}</p>
        <div className="shield-loading-bar mx-auto mt-4" aria-hidden="true">
          <span />
        </div>
        {detail && <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">{detail}</p>}
        {steps.length > 0 && (
          <div className="mx-auto mt-5 w-80 max-w-[82vw] rounded-lg border border-gray-200 bg-white/80 p-3 text-left shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
            {steps.map((step) => (
              <div key={step.label} className="flex items-start gap-3 py-1.5">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    step.status === 'complete'
                      ? 'bg-green-500'
                      : step.status === 'warning'
                        ? 'bg-amber-500'
                        : step.status === 'active'
                          ? 'animate-pulse bg-accent'
                          : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-[0.12em] text-gray-600 dark:text-gray-300">{step.label}</span>
                  {step.detail && <span className="mt-0.5 block wrap-anywhere text-xs text-gray-500 dark:text-gray-400">{step.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {lastConnectedAt && (
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            Last connected {formatConnectionTime(lastConnectedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

export function ConnectionLostOverlay({ lastConnectedAt, appName }: { lastConnectedAt: number | null; appName: string }) {
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-gray-950/72 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white p-6 text-center shadow-[0_28px_80px_rgba(15,23,42,0.45)] dark:bg-gray-950">
        <div className="shield-loader mx-auto mb-4">
          <Shield size={70} />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-danger">Connection Lost</p>
        <h2 className="mt-2 text-2xl font-bold text-primary-500 dark:text-blue-100">Reconnecting...</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {appName} cannot reach the API right now. Your session is being kept open while we try again.
        </p>
        <p className="mt-4 rounded bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          Last connected {formatConnectionTime(lastConnectedAt)}
        </p>
      </div>
    </div>
  );
}
