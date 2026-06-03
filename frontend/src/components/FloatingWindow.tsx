import React, { CSSProperties, ReactNode, RefObject, useEffect, useRef, useState } from 'react';

interface FloatingWindowPosition {
  x: number;
  y: number;
}

interface FloatingWindowRenderProps {
  dragHandleProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  };
  isDragging: boolean;
  isMobileLayout: boolean;
}

interface FloatingWindowProps {
  children: (props: FloatingWindowRenderProps) => ReactNode;
  className: string;
  fallbackSize: { width: number; height: number };
  initialPosition: () => FloatingWindowPosition;
  zIndex: number;
  dragIgnoreSelector?: string;
  isClosing?: boolean;
  mobileBreakpoint?: number;
  onFocus?: () => void;
  windowAttributes?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>;
  windowRef?: RefObject<HTMLDivElement>;
}

const defaultDragIgnoreSelector = 'button,a,input,select,textarea,label,[data-floating-drag-ignore="true"]';

function isMobileViewport(breakpoint: number) {
  return window.innerWidth < breakpoint;
}

function clampPosition(position: FloatingWindowPosition, width: number, height: number) {
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - height - 8);

  return {
    x: Math.min(Math.max(8, position.x), maxX),
    y: Math.min(Math.max(8, position.y), maxY),
  };
}

function getAnimationClass(isClosing = false) {
  return isClosing ? 'animate-modal-out' : 'animate-modal-in';
}

export function FloatingWindow({
  children,
  className,
  fallbackSize,
  initialPosition,
  zIndex,
  dragIgnoreSelector = defaultDragIgnoreSelector,
  isClosing = false,
  mobileBreakpoint = 768,
  onFocus,
  windowAttributes,
  windowRef,
}: FloatingWindowProps) {
  const internalWindowRef = useRef<HTMLDivElement | null>(null);
  const activeWindowRef = windowRef || internalWindowRef;
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => isMobileViewport(mobileBreakpoint));

  useEffect(() => {
    const syncLayout = () => {
      const nextIsMobile = isMobileViewport(mobileBreakpoint);
      setIsMobileLayout(nextIsMobile);
      if (nextIsMobile) {
        setIsDragging(false);
      }
    };

    syncLayout();
    window.addEventListener('resize', syncLayout);

    return () => window.removeEventListener('resize', syncLayout);
  }, [mobileBreakpoint]);

  useEffect(() => {
    if (!isDragging || isMobileLayout) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = activeWindowRef.current?.offsetWidth || fallbackSize.width;
      const height = activeWindowRef.current?.offsetHeight || fallbackSize.height;
      setPosition(clampPosition({
        x: event.clientX - dragOffsetRef.current.x,
        y: event.clientY - dragOffsetRef.current.y,
      }, width, height));
    };

    const stopDragging = () => setIsDragging(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [activeWindowRef, fallbackSize.height, fallbackSize.width, isDragging, isMobileLayout]);

  useEffect(() => {
    const keepInView = () => {
      if (isMobileViewport(mobileBreakpoint)) {
        return;
      }

      const width = activeWindowRef.current?.offsetWidth || fallbackSize.width;
      const height = activeWindowRef.current?.offsetHeight || fallbackSize.height;
      setPosition((current) => clampPosition(current, width, height));
    };

    window.addEventListener('resize', keepInView);

    return () => window.removeEventListener('resize', keepInView);
  }, [activeWindowRef, fallbackSize.height, fallbackSize.width, mobileBreakpoint]);

  const startDragging = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isMobileLayout) {
      return;
    }

    if ((event.target as HTMLElement).closest(dragIgnoreSelector)) {
      return;
    }

    onFocus?.();

    const rect = activeWindowRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
  };

  const style: CSSProperties | undefined = isMobileLayout ? undefined : { left: position.x, top: position.y };

  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex }}>
      <div
        {...windowAttributes}
        ref={activeWindowRef}
        className={`${getAnimationClass(isClosing)} ${className} ${isDragging ? 'md:cursor-grabbing' : ''}`}
        style={style}
        onMouseDownCapture={onFocus}
      >
        {children({
          dragHandleProps: { onPointerDown: startDragging },
          isDragging,
          isMobileLayout,
        })}
      </div>
    </div>
  );
}
