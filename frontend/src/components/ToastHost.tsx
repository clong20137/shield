import { AlertCircle, CheckCircle2, Info, LucideIcon } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

const toastStyles: Record<ToastType, string> = {
  success: 'border-green-500 bg-white text-green-700 ring-green-100 dark:bg-gray-950 dark:text-green-200 dark:ring-green-900/50',
  error: 'border-danger bg-white text-danger ring-red-100 dark:bg-gray-950 dark:text-red-200 dark:ring-red-900/50',
  info: 'border-accent bg-white text-primary-500 ring-blue-100 dark:bg-gray-950 dark:text-blue-200 dark:ring-blue-900/50',
};

const toastIcons: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastHost({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-host pointer-events-none fixed right-3 top-3 z-[2147483647] flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 sm:right-5 sm:top-5 sm:w-full">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type];
        const lines = toast.message.split('\n');

        return (
          <div
            key={toast.id}
            className={`toast-notification overflow-hidden rounded-lg border border-l-4 px-4 py-3 text-sm shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ${toastStyles[toast.type]}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-current/10 text-current ring-1 ring-current/15">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                {lines.map((line, index) => (
                  <p
                    key={index}
                    className={index === 0 ? 'leading-5 font-semibold' : 'mt-1 text-xs leading-5 font-medium text-slate-600 dark:text-slate-300'}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
