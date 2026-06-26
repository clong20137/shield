import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, LucideIcon } from 'lucide-react';

type TimePeriod = 'AM' | 'PM';

function parseTimeToMinutes(value?: string): number | null {
  if (!value || !/^\d{2}:\d{2}$/u.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTimePart(value: number): string {
  return String(value).padStart(2, '0');
}

function parseTimeInput(value?: string): { time: string; period: TimePeriod } {
  const parsedMinutes = parseTimeToMinutes(value);
  if (parsedMinutes === null) {
    return {
      time: '',
      period: 'AM',
    };
  }

  const hours24 = Math.floor(parsedMinutes / 60);
  const minutes = parsedMinutes % 60;
  const period: TimePeriod = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return {
    time: `${formatTimePart(hours12)}:${formatTimePart(minutes)}`,
    period,
  };
}

function sanitizeTimeInput(value: string): string {
  const digits = value.replace(/\D/gu, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function buildTimeValue(time: string, period: TimePeriod): string {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time);
  if (!match) {
    return '';
  }

  const numericHour = Number(match[1]);
  const numericMinute = Number(match[2]);

  if (!Number.isFinite(numericHour) || !Number.isFinite(numericMinute) || numericHour < 1 || numericHour > 12 || numericMinute < 0 || numericMinute > 59) {
    return '';
  }

  const hours24 = period === 'PM'
    ? numericHour === 12 ? 12 : numericHour + 12
    : numericHour === 12 ? 0 : numericHour;

  return `${formatTimePart(hours24)}:${formatTimePart(numericMinute)}`;
}

function buildMilitaryTimeValue(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time);
  if (!match) return '';

  const numericHour = Number(match[1]);
  const numericMinute = Number(match[2]);
  if (!Number.isFinite(numericHour) || !Number.isFinite(numericMinute) || numericHour < 0 || numericHour > 23 || numericMinute < 0 || numericMinute > 59) {
    return '';
  }

  return `${formatTimePart(numericHour)}:${formatTimePart(numericMinute)}`;
}

export function TimeDetailInput({
  value,
  onChange,
  isComplete = false,
  isInvalid = false,
  useMilitaryTime = false,
  fieldId,
  icon: Icon = Clock3,
}: {
  value: string;
  onChange: (value: string) => void;
  isComplete?: boolean;
  isInvalid?: boolean;
  useMilitaryTime?: boolean;
  fieldId?: string;
  icon?: LucideIcon;
}) {
  const parsedTime = parseTimeInput(value);
  const [displayTime, setDisplayTime] = useState(useMilitaryTime ? value : parsedTime.time);
  const [displayPeriod, setDisplayPeriod] = useState<TimePeriod>(parsedTime.period);

  useEffect(() => {
    setDisplayTime(useMilitaryTime ? value : parsedTime.time);
    setDisplayPeriod(parsedTime.period);
  }, [parsedTime.period, parsedTime.time, useMilitaryTime, value]);

  const commitTime = (time: string, period = displayPeriod) => {
    if (!time) {
      onChange('');
      return;
    }

    const nextValue = useMilitaryTime ? buildMilitaryTimeValue(time) : buildTimeValue(time, period);
    if (nextValue) {
      onChange(nextValue);
    }
  };

  return (
    <div className={`grid gap-2 ${useMilitaryTime ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
      <div className="relative min-w-0">
        <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400 dark:text-gray-500">
          <Icon size={15} />
        </span>
        <input
          type="text"
          value={displayTime}
          onChange={(event) => {
            const nextTime = sanitizeTimeInput(event.target.value);
            setDisplayTime(nextTime);
            commitTime(nextTime, displayPeriod);
          }}
          onBlur={(event) => {
            const sanitizedValue = sanitizeTimeInput(event.target.value);
            const [hour = '', minute = ''] = sanitizedValue.split(':');
            if (!hour || !minute) return;
            const normalizedTime = `${formatTimePart(Number(hour))}:${formatTimePart(Number(minute))}`;
            setDisplayTime(normalizedTime);
            commitTime(normalizedTime, displayPeriod);
          }}
          placeholder={useMilitaryTime ? '00:00' : 'HH:MM'}
          inputMode="numeric"
          maxLength={5}
          data-daily-field={fieldId}
          className={`trooper-daily-field-with-icon w-full rounded border bg-white py-2 pl-9 pr-8 text-sm transition dark:bg-gray-900 ${
            isInvalid
              ? 'trooper-daily-field-guard border-danger ring-2 ring-danger/30'
              : isComplete
              ? 'trooper-daily-match border-green-300 text-green-800 dark:border-green-800 dark:text-green-100'
              : 'border-gray-300 dark:border-gray-700'
          }`}
          aria-label="Time"
        />
        {isComplete && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-600 dark:text-green-300">
            <CheckCircle2 className="trooper-daily-check" size={16} />
          </span>
        )}
      </div>
      {!useMilitaryTime && <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900" aria-label="AM or PM">
        {(['AM', 'PM'] as const).map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => {
              setDisplayPeriod(period);
              commitTime(displayTime, period);
            }}
            className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
              displayPeriod === period
                ? 'bg-primary-500 text-white'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {period}
          </button>
        ))}
      </div>}
    </div>
  );
}
