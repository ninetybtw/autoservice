import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './styles/global.css';
import { App } from './App.tsx';
import { registerServiceWorker } from './lib/pwa.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
