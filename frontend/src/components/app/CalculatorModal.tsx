import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, Delete, X } from 'lucide-react';
import { FloatingWindow } from '../FloatingWindow';

function getInitialCalculatorPosition() {
  return { x: Math.max(12, window.innerWidth - 400), y: 112 };
}

export function CalculatorModal({ isClosing, onClose, onFocus, zIndex }: { isClosing: boolean; onClose: () => void; onFocus: () => void; zIndex: number }) {
  const [display, setDisplay] = useState('0');
  const calculatorRef = useRef<HTMLDivElement | null>(null);
  const buttons = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL', '='];
  const visibleDisplay = display.replace(/\*/gu, 'x');
  const expressionPreview = display === 'Error' ? 'Check expression' : visibleDisplay;

  const appendValue = useCallback((value: string) => {
    if (value === 'C') {
      setDisplay('0');
      return;
    }

    if (value === 'DEL') {
      setDisplay((current) => current.slice(0, -1) || '0');
      return;
    }

    if (value === '=') {
      return;
    }

    setDisplay((current) => (current === '0' ? value : `${current}${value}`));
  }, []);

  const deleteLast = useCallback(() => {
    setDisplay((current) => current.slice(0, -1) || '0');
  }, []);

  const calculate = useCallback(() => {
    if (!/^[\d+\-*/. ()]+$/u.test(display)) {
      setDisplay('Error');
      return;
    }

    try {
      const result = Function(`"use strict"; return (${display})`)();
      setDisplay(Number.isFinite(result) ? String(Number(result.toFixed(8))) : 'Error');
    } catch {
      setDisplay('Error');
    }
  }, [display]);

  useEffect(() => {
    calculatorRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();

    if (/^\d$/u.test(key) || ['+', '-', '/', '.', '(', ')'].includes(key)) {
      event.preventDefault();
      appendValue(key);
      return;
    }

    if (key === '*' || key === 'x') {
      event.preventDefault();
      appendValue('*');
      return;
    }

    if (key === 'enter' || key === '=') {
      event.preventDefault();
      calculate();
      return;
    }

    if (key === 'backspace') {
      event.preventDefault();
      deleteLast();
      return;
    }

    if (key === 'c') {
      event.preventDefault();
      appendValue('C');
    }
  };

  return (
    <FloatingWindow
      animationVariant="mac"
      className="pointer-events-auto fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white p-3 shadow-2xl outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-accent dark:bg-gray-900 dark:ring-gray-800 md:inset-auto md:block md:h-auto md:w-[calc(100vw-1.5rem)] md:max-w-[23rem] md:rounded-lg md:p-4"
      fallbackSize={{ width: 368, height: 500 }}
      initialPosition={getInitialCalculatorPosition}
      isClosing={isClosing}
      onFocus={() => {
        onFocus();
        calculatorRef.current?.focus();
      }}
      windowAttributes={{ tabIndex: 0, onKeyDown: handleKeyDown }}
      windowRef={calculatorRef}
      zIndex={zIndex}
    >
      {({ dragHandleProps, isDragging }) => (
      <>
        <div
          {...dragHandleProps}
          className={`mb-3 flex select-none items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800 md:touch-none md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-accent/25 bg-accent/10 text-accent shadow-sm">
              <Calculator size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Calculator</h2>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">Keyboard input supported</p>
            </div>
          </div>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="icon-close-button" aria-label="Close calculator" title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-950 px-4 py-4 text-right shadow-inner dark:border-gray-800">
          <div className="min-h-5 truncate text-xs font-bold uppercase text-gray-400">
            {expressionPreview}
          </div>
          <div className="mt-2 min-h-12 overflow-hidden text-ellipsis whitespace-nowrap text-4xl font-black tabular-nums text-white">
            {visibleDisplay}
          </div>
        </div>

        <div className="grid flex-1 content-end grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-950 md:flex-none md:content-normal">
          {buttons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === '=') {
                  calculate();
                  return;
                }
                appendValue(button);
              }}
              className={`flex h-14 items-center justify-center rounded-lg border text-lg font-black shadow-sm transition active:translate-y-px ${
                ['/', '*', '-', '+', '='].includes(button)
                  ? 'border-primary-500 bg-primary-500 text-white hover:bg-primary-600'
                  : button === 'C'
                    ? 'border-red-200 bg-red-50 text-danger hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                    : ['(', ')', 'DEL'].includes(button)
                      ? 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                      : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
              }`}
              aria-label={button === 'DEL' ? 'Delete last digit' : button === '=' ? 'Calculate result' : `Calculator ${button}`}
              title={button === 'DEL' ? 'Delete' : button === '=' ? 'Calculate' : button}
            >
              {button === '*' ? 'x' : button === 'DEL' ? <Delete size={20} /> : button}
            </button>
          ))}
        </div>
      </>
      )}
    </FloatingWindow>
  );
}
