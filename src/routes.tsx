import type { RouteObject } from 'react-router';
import { StudioLayout } from './pages/StudioLayout.tsx';
import { ClientShell } from './pages/ClientShell.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ServicesPage } from './pages/ServicesPage.tsx';
import { BookPage } from './pages/BookPage.tsx';
import { MyBookingsPage } from './pages/MyBookingsPage.tsx';
import { BookingPage } from './pages/BookingPage.tsx';
import { RootPage } from './pages/RootPage.tsx';
import { NotFound } from './pages/NotFound.tsx';

// Кабинет владельца загружается отдельно — клиентам он не нужен
const admin = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const routes: RouteObject[] = [
  { path: '/', element: <RootPage /> },
  {
    path: '/:slug',
    element: <StudioLayout />,
    children: [
      {
        element: <ClientShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'services', element: <ServicesPage /> },
          { path: 'book', element: <BookPage /> },
          { path: 'my', element: <MyBookingsPage /> },
          { path: 'my/:id', element: <BookingPage /> },
        ],
      },
      {
        path: 'admin',
        lazy: admin(() => import('./pages/admin/AdminLayout.tsx')),
        children: [
          { index: true, lazy: admin(() => import('./pages/admin/DashboardPage.tsx')) },
          { path: 'studio', lazy: admin(() => import('./pages/admin/StudioSettingsPage.tsx')) },
          { path: 'services', lazy: admin(() => import('./pages/admin/ServicesSettingsPage.tsx')) },
          { path: 'photos', lazy: admin(() => import('./pages/admin/PhotosPage.tsx')) },
          { path: 'assistant', lazy: admin(() => import('./pages/admin/OwnerAssistantPage.tsx')) },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
];
