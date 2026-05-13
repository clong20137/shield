export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

const toastStyles: Record<ToastType, string> = {
  success: 'border-success bg-green-50 text-success',
  error: 'border-danger bg-red-50 text-danger',
  info: 'border-primary-500 bg-blue-50 text-primary-500',
};

export function ToastHost({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded border-l-4 px-4 py-3 text-sm font-semibold shadow-lg ${toastStyles[toast.type]}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
