import { AlertCircle, CheckCircle2, Info, LucideIcon } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

const toastStyles: Record<ToastType, string> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
};

const toastIcons: Record<ToastType, LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastHost({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-host pointer-events-none fixed right-3 top-3 z-[2147483647] flex w-[calc(100vw-1.5rem)] max-w-[26rem] flex-col gap-2 sm:right-5 sm:top-5 sm:w-full">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type];
        const lines = toast.message.split('\n');
        const title = lines[0] || 'Notification';
        const body = lines.slice(1).filter(Boolean).join(' ');

        return (
          <div
            key={toast.id}
            className={`toast-notification ${toastStyles[toast.type]}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
          >
            <div className="toast-status-rail" />
            <div className="relative flex items-start gap-3 px-4 py-3.5">
              <span className="toast-icon">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold leading-5 text-gray-900 dark:text-gray-100">{title}</p>
                {body && (
                  <p className="mt-0.5 break-words text-xs font-medium leading-5 text-gray-600 dark:text-gray-300">
                    {body}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
