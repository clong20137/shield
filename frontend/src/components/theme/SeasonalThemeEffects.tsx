import { useEffect } from 'react';
import type { EffectiveSeasonalTheme } from '../../theme/seasonalThemes';

const APP_BASE_PATH = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/u, '');
const THANKSGIVING_TURKEY_ANIMATION = '/theme-assets/cool-turkey.json';

function withAppBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}` || '/';
}

export function SeasonalThemeEffects({ activeTheme }: { activeTheme: EffectiveSeasonalTheme }) {
  const showSnow = activeTheme === 'christmas' || activeTheme === 'winter';
  const showFallEffects = activeTheme === 'fall';

  if (!showSnow && !showFallEffects) {
    return null;
  }

  return (
    <>
      {showSnow && (
        <div className="pointer-events-none fixed inset-0 z-[39] overflow-hidden" aria-hidden="true">
          <div className="seasonal-snow-layer seasonal-snow-layer-near" />
          <div className="seasonal-snow-layer seasonal-snow-layer-far" />
        </div>
      )}
      {showFallEffects && (
        <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden="true">
          <div className="seasonal-leaf-layer seasonal-leaf-layer-near" />
          <div className="seasonal-leaf-layer seasonal-leaf-layer-far" />
        </div>
      )}
    </>
  );
}

export function ThanksgivingSidebarAnimation() {
  useEffect(() => {
    void import('@dotlottie/player-component');
  }, []);

  return (
    <div className="thanksgiving-sidebar-animation" aria-hidden="true">
      <dotlottie-player
        src={withAppBase(THANKSGIVING_TURKEY_ANIMATION)}
        autoplay
        loop
        background="transparent"
        class="thanksgiving-sidebar-lottie"
      />
    </div>
  );
}
