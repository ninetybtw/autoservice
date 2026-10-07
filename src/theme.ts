import { defineTheme } from '@astryxdesign/core/theme';

/** Тёмная тема: чёрный фон, белый текст, яркий красный акцент. */
export const studioTheme = defineTheme({
  name: 'autoservice-noir',
  color: { accent: '#e5121b', neutralStyle: 'neutral', contrast: 'high' },
  typography: {
    scale: { base: 16, ratio: 1.22 },
    body: { family: 'Manrope Variable', fallbacks: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    heading: { family: 'Manrope Variable', fallbacks: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  },
  radius: { base: 10, multiplier: 1.3 },
  tokens: {
    '--color-accent': '#e5121b',
    '--color-on-accent': '#ffffff',
    '--color-text-accent': '#ff5c5c',
    '--color-icon-accent': '#ff4747',
    '--color-background-body': '#000000',
    '--color-background-surface': '#0c0c0e',
    '--color-background-card': '#111114',
    '--color-background-popover': '#17171b',
    '--color-background-muted': '#1b1b20',
    '--color-text-primary': '#ffffff',
    '--color-text-secondary': '#b9b9c2',
    '--color-border': '#2a2a31',
    '--color-border-emphasized': '#3a3a43',
  },
});
