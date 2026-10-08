import { defineTheme } from '@astryxdesign/core/theme';

/** Тёмная тема: чёрный фон, белый текст, мягкий кирпично-красный акцент (белый текст на нём — контраст 4,76:1). */
export const studioTheme = defineTheme({
  name: 'autoservice-noir',
  color: { accent: '#c44a46', neutralStyle: 'neutral', contrast: 'high' },
  typography: {
    scale: { base: 16, ratio: 1.22 },
    body: { family: 'Manrope Variable', fallbacks: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    heading: { family: 'Manrope Variable', fallbacks: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  },
  radius: { base: 10, multiplier: 1.3 },
  tokens: {
    '--color-accent': '#c44a46',
    '--color-on-accent': '#ffffff',
    '--color-text-accent': '#ef8a80',
    '--color-icon-accent': '#ec7d75',
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
