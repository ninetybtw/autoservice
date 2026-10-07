import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { createBrowserRouter, Link as RouterLink, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import ruMessages from '@astryxdesign/core/locales/ru-RU.generated.js';
import { studioTheme } from './theme.ts';
import { routes } from './routes.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, gcTime: 7 * 24 * 3600_000, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'always' },
  },
});

// Студия и записи клиента сохраняются на устройстве — приложение открывается без сети.
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'autoservice-cache:v1',
});

const router = createBrowserRouter(routes);

const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function Link({ href = '', ...rest }, ref) {
  if (/^(https?:|tel:|mailto:|blob:|data:)/.test(href) || rest.target === '_blank' || rest.download !== undefined) {
    return <a ref={ref} href={href} {...rest} />;
  }
  return <RouterLink ref={ref} to={href} {...rest} />;
});

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 3600_000,
        buster: 'v1',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && ['studio', 'booking'].includes(String(q.queryKey[0])) },
      }}
    >
      <Theme theme={studioTheme} mode="dark">
        <InternationalizationProvider locale="ru-RU" messages={{ 'ru-RU': ruMessages }}>
        <LayerProvider toast={{ position: 'topEnd', inset: { top: 12 } }}>
          <LinkProvider component={Link}>
            <RouterProvider router={router} />
          </LinkProvider>
        </LayerProvider>
        </InternationalizationProvider>
      </Theme>
    </PersistQueryClientProvider>
  );
}
