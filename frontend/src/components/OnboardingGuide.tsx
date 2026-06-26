import { useEffect, useState } from 'react';
import { Bell, CalendarDays, Search, Shield } from 'lucide-react';
import { AuthAccount } from '../services/api';

type AppScale = AuthAccount['appScale'];

interface OnboardingStep {
  target: string;
  group: 'Workspace' | 'Tools' | 'Account';
  eyebrow: string;
  title: string;
  body: string;
  placement?: 'right' | 'below';
  showAppScalePicker?: boolean;
  showDutyHoursPicker?: boolean;
}

const appScaleOptions: Array<{ value: AppScale; label: string; description: string }> = [
  { value: 'compact', label: 'Compact', description: 'Fits more information on smaller screens.' },
  { value: 'comfortable', label: 'Comfortable', description: 'Balanced spacing for everyday use.' },
  { value: 'large', label: 'Large', description: 'Larger targets and text for easy scanning.' },
];

const onboardingSteps: OnboardingStep[] = [
  {
    target: 'workspace',
    group: 'Workspace',
    eyebrow: 'Start Here',
    title: 'Your daily workspace',
    body: 'The dashboard is the first stop for pinned people, your day, quick notes, updates, news, and the main work happening across the app.',
  },
  {
    target: 'workspace',
    group: 'Workspace',
    eyebrow: 'Display Scale',
    title: 'Choose your workspace size',
    body: 'Pick the scale that feels best for your screen. You can change it later from Account Settings.',
    showAppScalePicker: true,
  },
  {
    target: 'my-day',
    group: 'Workspace',
    eyebrow: 'Daily Hours',
    title: 'Set your usual shift length',
    body: 'Choose the duty hours you usually work. Trooper Daily shortcuts like Vacation Day and Sick Day will use this as their default.',
    showDutyHoursPicker: true,
  },
  {
    target: 'pinned-profiles',
    group: 'Workspace',
    eyebrow: 'Pinned Profiles',
    title: 'Keep key people close',
    body: 'Pin frequently used profiles to the top of the dashboard. Use the arrows to move through more pinned users, and open a profile without leaving the dashboard.',
  },
  {
    target: 'my-day',
    group: 'Workspace',
    eyebrow: 'My Day',
    title: 'See today at a glance',
    body: 'My Day combines today\'s calendar items, drafts, submitted entries, and due reminders so your daily workload is visible without opening another app.',
  },
  {
    target: 'quick-notes',
    group: 'Workspace',
    eyebrow: 'Quick Notes',
    title: 'Capture working notes',
    body: 'Quick Notes is your private sticky-note board. Add notes, move them around, and the app saves the layout automatically.',
  },
  {
    target: 'dashboard-news',
    group: 'Workspace',
    eyebrow: 'Updates & News',
    title: 'Read the latest posts',
    body: 'Updates and news rotate through the latest posts. Use Read More to open the full post, reactions, comments, and attachments.',
  },
  {
    target: 'global-search',
    group: 'Tools',
    eyebrow: 'Search',
    title: 'Find users quickly',
    body: 'Search by name, email, PE number, badge, district, or other user details. Results appear live while you type.',
  },
  {
    target: 'profile-card',
    group: 'Account',
    eyebrow: 'Profile',
    title: 'Open your profile',
    body: 'Click your profile picture to update your photo, review your account, change your password, or set up authenticator app MFA.',
  },
  {
    target: 'navigation',
    group: 'Tools',
    eyebrow: 'Navigation',
    title: 'Move through the system',
    body: 'Use the left navigation for dashboard, devices, and reports based on your permissions. Calendar and reminders live in the sidebar widgets below.',
  },
  {
    target: 'sidebar-calendar',
    group: 'Tools',
    eyebrow: 'Calendar',
    title: 'Open your calendar widget',
    body: 'Use the sidebar calendar widget to see today and upcoming calendar activity, then open the floating calendar app when you need the full view.',
  },
  {
    target: 'notifications',
    group: 'Tools',
    eyebrow: 'Alerts',
    title: 'Check notifications',
    body: 'Open notifications for system alerts, bug updates, flagged comments, and other activity that needs attention.',
    placement: 'below',
  },
  {
    target: 'messages',
    group: 'Tools',
    eyebrow: 'Messages',
    title: 'Open conversations',
    body: 'Use messages for real-time chats, unread message badges, group conversations, emojis, and attachments.',
    placement: 'below',
  },
  {
    target: 'theme',
    group: 'Account',
    eyebrow: 'Theme',
    title: 'Switch light or dark mode',
    body: 'Toggle the application theme whenever you want a lighter or darker workspace.',
    placement: 'below',
  },
  {
    target: 'settings',
    group: 'Account',
    eyebrow: 'Settings',
    title: 'Account and preferences',
    body: 'Open account settings, preferences, admin tools, and sign out from the account menu.',
    placement: 'below',
  },
  {
    target: 'quick-launch',
    group: 'Tools',
    eyebrow: 'Quick Launch',
    title: 'Customize your dock',
    body: 'Use the dock on larger screens or the bottom navigation on mobile to jump between core tools. Badges show items like unread messages.',
    placement: 'right',
  },
  {
    target: 'quick-launch',
    group: 'Tools',
    eyebrow: 'Hot Keys',
    title: 'Move faster from the keyboard',
    body: 'Use Ctrl+K to open the command palette, / to jump to user search, M for messages, C for calendar, D for dashboard, R for reports, A for Admin Console when permitted, U for Create User when permitted, = for calculator, and Esc to close the front window.',
    placement: 'right',
  },
];

function normalizeAppScale(value?: string | null): AppScale {
  return value === 'compact' || value === 'large' ? value : 'comfortable';
}

function normalizeDefaultDutyHours(value: unknown): string {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '8'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return '8';
  }

  return String(Math.min(24, Math.round(parsed * 4) / 4).toFixed(2)).replace(/\.00$/u, '').replace(/(\.\d)0$/u, '$1');
}

const findOnboardingElement = (target: string) => {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-onboarding-target="${target}"], [data-onboarding-control="${target}"]`),
  );

  return candidates.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || candidates[0] || null;
};

export function FirstLoginGuide({
  account,
  onAppScaleChange,
  onDefaultDutyHoursChange,
  onFinish,
  onLater,
}: {
  account: AuthAccount;
  onAppScaleChange: (appScale: AppScale) => void;
  onDefaultDutyHoursChange: (defaultDutyHours: string) => void;
  onFinish: () => void;
  onLater: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [dutyHoursInput, setDutyHoursInput] = useState(normalizeDefaultDutyHours(account.defaultDutyHours));
  const step = onboardingSteps[stepIndex];

  const goToStep = (nextIndex: number) => {
    setAnimationKey((key) => key + 1);
    setStepIndex(nextIndex);
  };

  useEffect(() => {
    setDutyHoursInput(normalizeDefaultDutyHours(account.defaultDutyHours));
  }, [account.defaultDutyHours]);

  useEffect(() => {
    let frame = 0;
    const timeouts: number[] = [];

    const measureTarget = () => {
      const target = findOnboardingElement(step.target);
      if (!target) {
        setTargetRect(null);
        return;
      }

      setTargetRect(target.getBoundingClientRect());
    };

    const scrollToTarget = () => {
      const target = findOnboardingElement(step.target);
      if (!target) {
        measureTarget();
        return;
      }

      const rect = target.getBoundingClientRect();
      const isFullyVisible = rect.top >= 24 && rect.left >= 8 && rect.bottom <= window.innerHeight - 24 && rect.right <= window.innerWidth - 8;
      if (!isFullyVisible) {
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }

      [80, 220, 420, 700].forEach((delay) => {
        timeouts.push(window.setTimeout(measureTarget, delay));
      });
    };

    frame = window.requestAnimationFrame(scrollToTarget);
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);

    return () => {
      window.cancelAnimationFrame(frame);
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [step.target]);

  const padding = 10;
  const safeRect = targetRect
    ? {
        top: Math.max(8, targetRect.top - padding),
        left: Math.max(8, targetRect.left - padding),
        width: Math.min(window.innerWidth - Math.max(8, targetRect.left - padding) - 8, targetRect.width + padding * 2),
        height: Math.min(window.innerHeight - Math.max(8, targetRect.top - padding) - 8, targetRect.height + padding * 2),
      }
    : null;
  const tooltipWidth = Math.min(360, window.innerWidth - 32);
  const tooltipHeightEstimate = 280;
  const shouldPlaceTooltipBelow = step.placement === 'below';
  const shouldPlaceQuickLaunchTooltipAbove = step.target === 'quick-launch';
  const tooltipLeft = safeRect
    ? shouldPlaceTooltipBelow || shouldPlaceQuickLaunchTooltipAbove
      ? Math.min(Math.max(16, safeRect.left + safeRect.width / 2 - tooltipWidth / 2), window.innerWidth - tooltipWidth - 16)
      : Math.min(Math.max(16, safeRect.left + safeRect.width + 18), window.innerWidth - tooltipWidth - 16)
    : Math.max(16, (window.innerWidth - tooltipWidth) / 2);
  const tooltipTop = safeRect
    ? shouldPlaceQuickLaunchTooltipAbove
      ? Math.max(16, safeRect.top - tooltipHeightEstimate - 64)
      : shouldPlaceTooltipBelow
        ? Math.min(Math.max(16, safeRect.top + safeRect.height + 18), window.innerHeight - tooltipHeightEstimate - 16)
        : Math.min(Math.max(16, safeRect.top), window.innerHeight - tooltipHeightEstimate - 16)
    : Math.max(16, (window.innerHeight - tooltipHeightEstimate) / 2);

  const isLastStep = stepIndex === onboardingSteps.length - 1;
  const completionPercent = ((stepIndex + 1) / onboardingSteps.length) * 100;
  const stepGroups = Array.from(new Set(onboardingSteps.map((onboardingStep) => onboardingStep.group)));

  return (
    <div className="fixed inset-0 z-[90] pointer-events-auto">
      {safeRect ? (
        <>
          <div className="absolute left-0 right-0 top-0 bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ height: safeRect.top }} />
          <div className="absolute left-0 bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ top: safeRect.top, width: safeRect.left, height: safeRect.height }} />
          <div className="absolute bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ left: safeRect.left + safeRect.width, right: 0, top: safeRect.top, height: safeRect.height }} />
          <div className="absolute bottom-0 left-0 right-0 bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ top: safeRect.top + safeRect.height }} />
          <div
            className="onboarding-spotlight absolute rounded-xl border-2 border-accent transition-all duration-300 ease-out"
            style={{ top: safeRect.top, left: safeRect.left, width: safeRect.width, height: safeRect.height }}
          />
          {step.target === 'quick-launch' && (
            <>
              <div
                className="onboarding-control-label pointer-events-none fixed rounded-full border border-accent/40 bg-white px-3 py-1.5 text-xs font-bold text-accent shadow-lg dark:bg-gray-900"
                style={{
                  left: Math.max(16, safeRect.left + 12),
                  top: Math.max(16, safeRect.top - 44),
                }}
              >
                Click a blank spot to add an app
              </div>
              <div
                className="onboarding-control-label pointer-events-none fixed rounded-full border border-accent/40 bg-white px-3 py-1.5 text-xs font-bold text-accent shadow-lg dark:bg-gray-900"
                style={{
                  left: Math.min(Math.max(16, safeRect.left + safeRect.width - 190), window.innerWidth - 206),
                  top: Math.max(16, safeRect.top - 44),
                }}
              >
                Drag icons to reorder
              </div>
            </>
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      )}

      <div
        key={`tip-${animationKey}`}
        className="pointer-events-auto fixed w-[calc(100vw-2rem)] max-w-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        style={{ left: tooltipLeft, top: tooltipTop, maxWidth: tooltipWidth }}
      >
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
          <div className="h-full bg-accent transition-all duration-300 ease-out" style={{ width: `${completionPercent}%` }} />
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{step.eyebrow}</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                  {step.group}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{step.title}</h2>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary-500 text-white">
              <Shield size={20} />
            </div>
          </div>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">{step.body}</p>
          {step.showAppScalePicker && (
            <div className="mt-4 grid gap-2">
              {appScaleOptions.map((option) => {
                const isSelected = normalizeAppScale(account.appScale) === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onAppScaleChange(option.value)}
                    className={`rounded border px-3 py-2 text-left transition ${
                      isSelected
                        ? 'onboarding-scale-choice-selected border-accent bg-accent/10 text-accent shadow-sm'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-accent hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900'
                    }`}
                  >
                    <span className="block text-sm font-black">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{option.description}</span>
                  </button>
                );
              })}
            </div>
          )}
          {step.showDutyHoursPicker && (
            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Usual duty hours
              </label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {['8', '8.5', '9.5', '10.5'].map((hours) => {
                  const isSelected = normalizeDefaultDutyHours(account.defaultDutyHours) === hours;

                  return (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => {
                        setDutyHoursInput(hours);
                        onDefaultDutyHoursChange(hours);
                      }}
                      className={`rounded border px-3 py-2 text-sm font-black transition ${
                        isSelected
                          ? 'onboarding-scale-choice-selected border-accent bg-accent/10 text-accent shadow-sm'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-accent hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900'
                      }`}
                    >
                      {hours}h
                    </button>
                  );
                })}
              </div>
              <input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={dutyHoursInput}
                onChange={(event) => setDutyHoursInput(event.target.value)}
                onBlur={() => onDefaultDutyHoursChange(dutyHoursInput)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onDefaultDutyHoursChange(dutyHoursInput);
                  }
                }}
                className="mt-3 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                aria-label="Usual duty hours"
              />
            </div>
          )}
          <div className="mt-4 flex items-center gap-1.5" aria-label={`Onboarding step ${stepIndex + 1} of ${onboardingSteps.length}`}>
            {onboardingSteps.map((onboardingStep, index) => (
              <button
                key={`${onboardingStep.target}-${index}`}
                type="button"
                onClick={() => goToStep(index)}
                className={`h-1.5 flex-1 rounded-full transition ${
                  index <= stepIndex
                    ? 'bg-accent'
                    : onboardingStep.group === step.group
                      ? 'bg-accent/25'
                      : 'bg-gray-200 dark:bg-gray-800'
                }`}
                aria-label={`Go to ${onboardingStep.title}`}
                title={onboardingStep.title}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {stepGroups.map((group) => (
              <span
                key={group}
                className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                  group === step.group
                    ? 'bg-accent/10 text-accent'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                }`}
              >
                {group}
              </span>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
              {stepIndex + 1} / {onboardingSteps.length}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={onLater} className="rounded px-3 py-2 text-sm font-bold text-gray-500 hover:text-primary-500 dark:text-gray-400">
                Save for later
              </button>
              {stepIndex > 0 && (
                <button type="button" onClick={() => goToStep(stepIndex - 1)} className="btn-secondary px-3 py-2">
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLastStep ? onFinish() : goToStep(stepIndex + 1))}
                className="btn-primary px-4 py-2"
              >
                {isLastStep ? 'Finish setup' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WelcomeSplash({
  account,
  onStart,
  onLater,
}: {
  account: AuthAccount;
  onStart: () => void;
  onLater: () => void;
}) {
  const welcomeName = account.displayName || account.email;
  const tourHighlights = [
    { label: 'Find people', detail: 'Search profiles, districts, and contact details.', Icon: Search },
    { label: 'Set your workspace', detail: 'Choose display scale, duty hours, and daily tools.', Icon: CalendarDays },
    { label: 'Stay connected', detail: 'Review alerts, messages, and quick launch shortcuts.', Icon: Bell },
  ];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-primary-500 px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0 welcome-grid opacity-55" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(156,134,92,0.34),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.15),transparent_24%),linear-gradient(135deg,rgba(16,38,70,0.96),rgba(10,19,32,0.98))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 welcome-scanline" />

      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-16 top-16 h-72 w-72 rounded-full bg-accent/25 blur-3xl animate-welcome-glow" />
        <div className="absolute right-[-4rem] top-24 h-60 w-60 rounded-full bg-blue-300/15 blur-3xl animate-welcome-glow" />
        <div className="absolute bottom-[-6rem] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-white/[0.97] text-gray-900 shadow-[0_35px_120px_rgba(0,0,0,0.38)] ring-1 ring-white/20 backdrop-blur-xl dark:bg-gray-950/[0.96] dark:text-gray-100 animate-welcome-pop">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-white to-accent" />
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="relative overflow-hidden bg-primary-500 p-7 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(156,134,92,0.36),transparent_34%),linear-gradient(160deg,rgba(255,255,255,0.08),transparent_44%)]" />
            <div className="relative flex min-h-full flex-col justify-between gap-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-100">First Login</p>
                <div className="mt-8 flex justify-center">
                  <div className="relative flex h-32 w-32 items-center justify-center rounded-3xl bg-white text-primary-500 shadow-[0_28px_90px_rgba(0,0,0,0.26)] welcome-shield-float">
                    <div className="absolute -inset-4 rounded-[2rem] border border-accent/45 animate-welcome-ring" />
                    <div className="absolute -inset-8 rounded-[2.5rem] border border-white/15" />
                    <Shield size={58} className="relative z-10" />
                  </div>
                </div>
              </div>
              <div className="relative rounded-lg border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-sm font-bold">Onboarding takes about two minutes</p>
                <p className="mt-2 text-sm leading-6 text-blue-100">
                  We will highlight the important areas first, then save your preferences when you finish.
                </p>
              </div>
            </div>
          </div>

          <div className="p-7 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Welcome</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-normal text-gray-950 dark:text-white sm:text-5xl">
              Welcome, {welcomeName}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
              Let us tune the workspace around how you work, then walk through the dashboard, messages, alerts, settings, and quick launch dock.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              You can pause at any time and replay the guide later from Account Settings.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {tourHighlights.map(({ label, detail, Icon }, index) => (
                <div
                  key={label}
                  className="welcome-feature-card rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
                  style={{ animationDelay: `${130 + index * 90}ms` }}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-accent/15 text-accent">
                    <Icon size={18} />
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onLater}
                className="btn-secondary w-full sm:w-auto"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={onStart}
                className="btn-primary w-full shadow-lg shadow-primary-500/20 sm:w-auto"
              >
                Start the guide
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
