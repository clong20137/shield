import type { CSSProperties } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'dotlottie-player': {
        src?: string;
        autoplay?: boolean;
        loop?: boolean;
        background?: string;
        class?: string;
        className?: string;
        style?: CSSProperties;
      };
    }
  }
}

export {};
