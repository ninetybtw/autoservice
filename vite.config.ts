import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** В режиме разработки отдаёт /api/* теми же обработчиками, что и Vercel. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/manifest')) return next();
        const mod = await server.ssrLoadModule('/api/manifest.ts');
        const response: Response = await mod.GET(new Request(`http://${req.headers.host}${req.url}`));
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
      // локальные иконки студий
      server.middlewares.use('/studio-icons', (req, res, next) => {
        const file = join('studios', decodeURIComponent(req.url ?? '').replace(/\.\./g, ''));
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', 'image/png');
        res.end(readFileSync(file));
      });
    },
  };
}

/** Копирует иконки студий из studios/<slug>/ в dist/studio-icons/<slug>/ для манифеста. */
function studioIcons(): Plugin {
  return {
    name: 'studio-icons',
    apply: 'build',
    closeBundle() {
      for (const slug of readdirSync('studios', { withFileTypes: true })) {
        if (!slug.isDirectory() || slug.name.startsWith('_')) continue;
        for (const f of ['icon-192.png', 'icon-512.png']) {
          const src = join('studios', slug.name, f);
          if (existsSync(src)) cpSync(src, join('dist', 'studio-icons', slug.name, f));
        }
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    devApi(),
    studioIcons(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // манифест у каждой студии свой — его отдаёт /api/manifest
      manifest: false,
      injectRegister: false,
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2}', 'icons/*.png'],
        globIgnores: ['studio-icons/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
});
