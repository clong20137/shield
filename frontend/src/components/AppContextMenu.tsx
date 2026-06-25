import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LucideIcon } from 'lucide-react';

export type AppContextMenuPosition = {
  x: number;
  y: number;
};

export type AppContextMenuAction = {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  render?: (context: {
    onClose: () => void;
  }) => ReactNode;
};

function getMenuPosition(position: AppContextMenuPosition, width = 248, height = 260) {
  const gutter = 8;
  return {
    x: Math.min(Math.max(gutter, position.x), Math.max(gutter, window.innerWidth - width - gutter)),
    y: Math.min(Math.max(gutter, position.y), Math.max(gutter, window.innerHeight - height - gutter)),
  };
}

export function shouldUseNativeContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-native-context-menu="true"]'));
}

export function AppContextMenu({
  position,
  actions,
  onClose,
  width = 248,
  closeOnScroll = true,
}: {
  position: AppContextMenuPosition;
  actions: AppContextMenuAction[];
  onClose: () => void;
  width?: number;
  closeOnScroll?: boolean;
}) {
  useEffect(() => {
    const close = () => onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('click', close);
    if (closeOnScroll) {
      window.addEventListener('scroll', close, true);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', close);
      if (closeOnScroll) {
        window.removeEventListener('scroll', close, true);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, closeOnScroll]);

  const estimatedHeight = Math.max(56, actions.length * 42 + 12);
  const menuPosition = getMenuPosition(position, width, estimatedHeight);

  return createPortal(
    <div
      className="quick-launch-context-menu fixed z-[120] overflow-hidden rounded border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      style={{ left: menuPosition.x, top: menuPosition.y, width }}
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map((action, index) => {
        const Icon = action.icon;
        if (action.render) {
          return (
            <div key={`${action.label}-${index}`} onClick={(event) => event.stopPropagation()}>
              {action.render({ onClose })}
            </div>
          );
        }

        if (!action.onSelect) {
          return null;
        }
        const onSelect = action.onSelect;

        return (
          <button
            key={`${action.label}-${index}`}
            type="button"
            onClick={() => {
              if (action.disabled) {
                return;
              }
              onSelect();
              onClose();
            }}
            disabled={action.disabled}
            className={`quick-launch-context-menu-item w-full disabled:cursor-not-allowed disabled:opacity-45 ${
              action.danger ? 'quick-launch-context-menu-danger text-danger' : 'text-gray-700 dark:text-gray-200'
            }`}
          >
            {Icon && <Icon size={15} />}
            <span>{action.label}</span>
            {action.shortcut && <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">{action.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
