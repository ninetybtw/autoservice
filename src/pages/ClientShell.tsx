import { Outlet, ScrollRestoration } from 'react-router';
import { BottomNav } from '../components/BottomNav.tsx';
import { useOnline } from '../lib/useOnline.ts';
import { useRouteFocus } from '../lib/useRouteFocus.ts';

export function ClientShell() {
  const online = useOnline();
  const content = useRouteFocus();
  return (
    <div className="client-shell">
      <a className="skip-link" href="#content">
        Перейти к содержимому
      </a>
      {!online && (
        <div className="offline-bar" role="status">
          Нет сети — показываем сохранённые данные. Записаться можно, когда связь появится.
        </div>
      )}
      <div id="content" ref={content} tabIndex={-1}>
        <Outlet />
      </div>
      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}
