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

export function ConnectionLostOverlay({
  lastConnectedAt,
  appName,
  brandLogoSrc,
}: {
  lastConnectedAt: number | null;
  appName: string;
  brandLogoSrc?: string;
}) {
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-gray-950/68 px-4 backdrop-blur-md">
      <div className="reconnect-panel w-full max-w-sm rounded-2xl border border-white/15 bg-white/96 p-6 text-center shadow-[0_32px_90px_rgba(2,6,23,0.48)] dark:bg-gray-950/95">
        <div className="reconnect-logo-pulse mx-auto mb-5" aria-hidden="true">
          <span className="reconnect-logo-ring reconnect-logo-ring-one" />
          <span className="reconnect-logo-ring reconnect-logo-ring-two" />
          <img src={brandLogoSrc || '/shield-splash-logo.png'} alt="" />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-accent">Reconnecting</p>
        <h2 className="mt-2 text-2xl font-black text-gray-950 dark:text-white">We lost connection</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm font-medium leading-6 text-gray-500 dark:text-gray-300">
          {appName} has lost connection to the API server. Please wait while we establish connection again.
        </p>
        <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(156,134,92,0.14)]" />
          <span>Last connected {formatConnectionTime(lastConnectedAt)}</span>
        </div>
      </div>
    </div>
  );
}
