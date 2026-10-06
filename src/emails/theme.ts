// Email colours and fonts. Email clients don't support CSS variables, so the design system's
// values (architecture §18.2) are repeated here as plain values; keep them in step.

export const emailTheme = {
  background: '#FAF6F0',
  surface: '#FFFFFF',
  border: '#E8DFD3',
  text: '#1F1A1C',
  textMuted: '#6B6166',
  primary: '#4A2545',
  primaryForeground: '#FAF6F0',
  primaryTint: '#EFE6EC',
  gold: '#C9A46A',
  headingFont: "Fraunces, Georgia, 'Times New Roman', serif",
  bodyFont: "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;
