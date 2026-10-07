import { Outlet, ScrollRestoration } from 'react-router';
import { BottomNav } from '../components/BottomNav.tsx';
import { useOnline } from '../lib/useOnline.ts';

export function ClientShell() {
  const online = useOnline();
  return (
    <div className="client-shell">
      {!online && <div className="offline-bar" role="status">Нет сети — показываем сохранённые данные. Записаться можно, когда связь появится.</div>}
      <Outlet />
      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}
