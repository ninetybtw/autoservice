import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildManifest } from './api/manifest.ts';

/** Манифест автосервиса из studios/<slug>/studio.json (иконки — /studio-icons/<slug>/). */
function studioManifest(slug: string | null) {
  const file = slug ? join('studios', slug, 'studio.json') : '';
  if (!slug || !existsSync(file)) return buildManifest(null, null);
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const icon = (v?: string) => (v && !/^(https?:|\/)/.test(v) ? `/studio-icons/${slug}/${v}` : v);
  return buildManifest(slug, { ...s, branding: { icon192: icon(s.branding?.icon192), icon512: icon(s.branding?.icon512) } });
}

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
      // статические манифесты, как после сборки
      server.middlewares.use('/m', (req, res, next) => {
        const m = (req.url ?? '').match(/^\/([a-z0-9-]{2,40})\.webmanifest$/);
        if (!m) return next();
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.end(JSON.stringify(studioManifest(m[1] === 'default' ? null : m[1])));
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

/**
 * После сборки: иконки и манифесты автосервисов обычными файлами (dist/studio-icons, dist/m/<slug>.webmanifest)
 * и 404.html для одностраничного приложения — сайт можно разместить на любом статическом хостинге.
 */
function studioIcons(): Plugin {
  return {
    name: 'studio-icons',
    apply: 'build',
    closeBundle() {
      mkdirSync(join('dist', 'm'), { recursive: true });
      writeFileSync(join('dist', 'm', 'default.webmanifest'), JSON.stringify(studioManifest(null)));
      for (const slug of readdirSync('studios', { withFileTypes: true })) {
        if (!slug.isDirectory() || slug.name.startsWith('_')) continue;
        for (const f of ['icon-192.png', 'icon-512.png']) {
          const src = join('studios', slug.name, f);
          if (existsSync(src)) cpSync(src, join('dist', 'studio-icons', slug.name, f));
        }
        writeFileSync(join('dist', 'm', `${slug.name}.webmanifest`), JSON.stringify(studioManifest(slug.name)));
      }
      // хостинги без настройки «все адреса → index.html» отдают 404.html — это то же приложение
      copyFileSync(join('dist', 'index.html'), join('dist', '404.html'));
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
