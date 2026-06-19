import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Colors ──────────────────────────────────────────────────────────────────

export const Colors = {
  // Brand greens
  green50:  '#E1F5EE',
  green100: '#9FE1CB',
  green400: '#1D9E75',
  green600: '#0F6E56',
  green800: '#085041',
  green900: '#04342C',

  // Macro colors
  protein:  '#D85A30',   // coral
  proteinL: '#FAECE7',
  carbs:    '#378ADD',   // blue
  carbsL:   '#E6F1FB',
  fat:      '#BA7517',   // amber
  fatL:     '#FAEEDA',
  fiber:    '#1D9E75',   // green
  fiberL:   '#E1F5EE',

  // Purple (voice)
  purple:   '#7F77DD',
  purpleL:  '#EEEDFE',
  purpleD:  '#3C3489',

  // Neutrals
  gray50:   '#F1EFE8',
  gray200:  '#B4B2A9',
  gray400:  '#888780',
  gray600:  '#5F5E5A',
  gray800:  '#444441',

  // UI
  white:    '#FFFFFF',
  bg:       '#F8F9FA',
  card:     '#FFFFFF',
  text:     '#444441',
  border:   'rgba(0,0,0,0.08)',
  borderMd: 'rgba(0,0,0,0.14)',

  // Rank medals
  gold:     '#FFD700',
  silver:   '#C0C0C0',
  bronze:   '#CD7F32',

  // Semantic
  success:  '#1D9E75',
  warning:  '#BA7517',
  danger:   '#D85A30',
  info:     '#378ADD',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const Typography = {
  // Sizes
  xs:   11,
  sm:   12,
  md:   14,
  base: 16,
  lg:   18,
  xl:   20,
  xxl:  24,
  xxxl: 28,
  hero: 36,

  // Weights
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,

  // Line heights
  tight:   1.2,
  normal:  1.5,
  relaxed: 1.7,
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  xxl:  32,
  xxxl: 48,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  full: 999,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// ─── Layout ──────────────────────────────────────────────────────────────────

export const Layout = {
  screenWidth:  SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  tabBarHeight: 70,
  headerHeight: 100,
} as const;

// ─── Macro Colors Map ─────────────────────────────────────────────────────────

export const MacroColors = {
  protein: { primary: Colors.protein,  light: Colors.proteinL },
  carbs:   { primary: Colors.carbs,    light: Colors.carbsL   },
  fat:     { primary: Colors.fat,      light: Colors.fatL     },
  fiber:   { primary: Colors.fiber,    light: Colors.fiberL   },
  kcal:    { primary: Colors.green400, light: Colors.green50  },
} as const;

// ─── Avatar Colors ────────────────────────────────────────────────────────────

export const AvatarColors = [
  { bg: '#E1F5EE', text: '#085041' },
  { bg: '#E6F1FB', text: '#0C447C' },
  { bg: '#FAEEDA', text: '#633806' },
  { bg: '#FAECE7', text: '#712B13' },
  { bg: '#EEEDFE', text: '#3C3489' },
  { bg: '#EAF3DE', text: '#27500A' },
  { bg: '#FBEAF0', text: '#72243E' },
] as const;
