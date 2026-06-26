export type SeasonalThemePreference =
  | 'auto'
  | 'default'
  | 'christmas'
  | 'summer'
  | 'thanksgiving'
  | 'fall'
  | 'spring'
  | 'winter'
  | 'patriotic';

export type EffectiveSeasonalTheme = Exclude<SeasonalThemePreference, 'auto'>;

export interface SeasonalThemeOption {
  id: SeasonalThemePreference;
  label: string;
  description: string;
  primary?: string;
  secondary?: string;
}

export const SEASONAL_THEME_OPTIONS: SeasonalThemeOption[] = [
  { id: 'auto', label: 'Auto', description: 'Switches with holidays and seasons.' },
  { id: 'default', label: 'Default', description: 'Uses the standard agency colors.' },
  { id: 'christmas', label: 'Christmas', description: 'Evergreen, cranberry, and soft winter highlights.', primary: '#14532d', secondary: '#b91c1c' },
  { id: 'summer', label: 'Summer', description: 'Clear blue with bright warm accents.', primary: '#0369a1', secondary: '#f59e0b' },
  { id: 'thanksgiving', label: 'Thanksgiving', description: 'Warm harvest tones for November.', primary: '#78350f', secondary: '#c2410c' },
  { id: 'fall', label: 'Fall', description: 'Deep forest and copper seasonal colors.', primary: '#365314', secondary: '#b45309' },
  { id: 'spring', label: 'Spring', description: 'Fresh green with soft floral accents.', primary: '#047857', secondary: '#db2777' },
  { id: 'winter', label: 'Winter', description: 'Cool navy with icy blue highlights.', primary: '#0f3460', secondary: '#38bdf8' },
  { id: 'patriotic', label: 'Patriotic', description: 'Navy and red for summer holiday weeks.', primary: '#1e3a8a', secondary: '#dc2626' },
];

export const SEASONAL_THEME_CLASSES = SEASONAL_THEME_OPTIONS
  .filter((theme) => theme.id !== 'auto' && theme.id !== 'default')
  .map((theme) => `seasonal-theme-${theme.id}`);

export function normalizeSeasonalTheme(value?: string | null): SeasonalThemePreference {
  return SEASONAL_THEME_OPTIONS.some((theme) => theme.id === value) ? value as SeasonalThemePreference : 'auto';
}

export function getSeasonalThemeOption(themeId: SeasonalThemePreference | EffectiveSeasonalTheme): SeasonalThemeOption {
  return SEASONAL_THEME_OPTIONS.find((theme) => theme.id === themeId) || SEASONAL_THEME_OPTIONS[0];
}

export function getEffectiveSeasonalTheme(preference: SeasonalThemePreference, date = new Date()): EffectiveSeasonalTheme {
  if (preference !== 'auto') {
    return preference;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month === 12) return 'christmas';
  if (month === 11) return 'thanksgiving';
  if ((month === 7 && day <= 7) || (month === 5 && day >= 24)) return 'patriotic';
  if (month >= 9 && month <= 10) return 'fall';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 3 && month <= 5) return 'spring';
  if (month === 1 || month === 2) return 'winter';

  return 'default';
}
