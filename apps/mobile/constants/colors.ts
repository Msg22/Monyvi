// 1. The Raw Palette (The "Ingredients")
export const palette = {
  // Brand Colors
  nileGreen: {
    900: "#022C22",
    800: "#064E3B",
    700: "#065F46", // main
    600: "#059669",
    500: "#10B981", // action
    400: "#34D399",
    100: "#D1FAE5",
    50: "#ECFDF5",
  },

  // Wealth/Gold
  gold: {
    800: "#92400E",
    600: "#D97706", // main / warnings
    500: "#F59E0B",
    400: "#FBBF24",
    100: "#FEF3C7",
    50: "#F5E6C8", // warm tan bg
  },

  // Silver
  silver: {
    bg: "#D2D2D4", // pill background
    500: "#A0A0A0", // icon color
  },

  // Functional
  red: {
    600: "#DC2626",
    500: "#EF4444",
    400: "#F87171",
    100: "#FEE2E2",
  },

  // Orange (Coffee/Food)
  orange: {
    600: "#EA580C",
    500: "#F97316",
    100: "#FFEDD5",
  },

  // Blue (Bank)
  blue: {
    900: "#172554",
    800: "#1E3A8A",
    600: "#2563EB",
    500: "#3B82F6",
    100: "#DBEAFE",
    50: "#EFF6FF",
  },

  // Violet
  violet: {
    800: "#5B21B6",
    700: "#7C3AED",
    500: "#8B5CF6",
    100: "#EDE9FE",
  },

  // Neutrals (Slate)
  slate: {
    950: "#020617", // Extra dark for gradients
    900: "#0F172A", // Dark Mode BG
    800: "#1E293B",
    700: "#334155",
    600: "#475569",
    500: "#64748B",
    400: "#94A3B8",
    300: "#CBD5E1",
    200: "#E2E8F0",
    100: "#F1F5F9",
    50: "#F8FAFC", // Light Mode BG
    25: "#FFFFFF",
  },

  // Third-Party Brand Colors
  brand: {
    facebook: "#1877F2",
    google: "#4285F4",
    googleBlue: "#4285F4",
    googleGreen: "#34A853",
    googleYellow: "#FBBC05",
    googleRed: "#EA4335",
  },
} as const;

// 2. The Semantic Theme
export const colors = {
  primary: palette.nileGreen[700],
  secondary: palette.nileGreen[500],
  accent: palette.gold[600],
  expense: palette.red[500],
  success: palette.nileGreen[500],
  white: palette.slate[25],
  black: palette.slate[900],
} as const;

// 3. Theme Interfaces
export interface ThemeColors {
  background: string;
  backgroundGradient: readonly [string, string, ...string[]]; // Tuple of at least 2 colors
  surface: string;
  surfaceHighlight: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  border: string;
  tint: string;
  statusBarStyle: "light-content" | "dark-content";
}

// 4. The Themes (Derived)
export const lightTheme: ThemeColors = {
  background: palette.slate[50],
  // A subtle top-down fade from Paper White to slightly darker Grey
  backgroundGradient: [palette.slate[50], palette.slate[100]],

  surface: palette.slate[25],
  surfaceHighlight: palette.slate[100],

  text: {
    primary: palette.slate[800],
    secondary: palette.slate[600],
    muted: palette.slate[400],
    inverse: palette.slate[25],
  },

  border: palette.slate[200],
  tint: `${palette.nileGreen[500]}1A`,
  statusBarStyle: "dark-content",
};

export const darkTheme: ThemeColors = {
  background: palette.slate[900],
  // Solid background as requested
  backgroundGradient: [palette.slate[900], palette.slate[900]],

  surface: palette.slate[800],
  surfaceHighlight: palette.slate[700],

  text: {
    primary: palette.slate[25],
    secondary: palette.slate[400],
    muted: palette.slate[600],
    inverse: palette.slate[900],
  },

  border: palette.slate[700],
  tint: `${palette.nileGreen[500]}33`,
  statusBarStyle: "light-content",
};
