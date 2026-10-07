import { NavLink, useLocation } from 'react-router';
import { CalendarCheck, House, ListBullets } from '@phosphor-icons/react';
import { LiquidGlass } from './LiquidGlass.tsx';
import { useMyBookings } from '../data/hooks.ts';
import { useStudio } from '../studio.tsx';

/**
 * Нижняя навигация: матовое тёмное стекло и плавно скользящая подсветка активного раздела.
 * Содержимое страницы не перекрывается: у .client-shell есть отступ снизу.
 */
export function BottomNav() {
  const studio = useStudio();
  const { pathname } = useLocation();
  const mine = useMyBookings(studio.slug);
  const hasUpcoming = mine.some((r) => r.booking.status !== 'cancelled' && new Date(r.booking.endAt) > new Date());
  const base = `/${studio.slug}`;
  const rest = pathname.slice(base.length).replace(/\/$/, '');
  const active = rest === '' ? 0 : rest.startsWith('/services') ? 1 : rest.startsWith('/my') ? 2 : -1;

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {/* Матовое стекло: сильное размытие и тёмный тон — без бликов и «вкраплений» текста под панелью */}
      <LiquidGlass snapshot="body" resolution={0.5} frost={14} refraction={0.002} bevelDepth={0.025} tint="rgba(14, 14, 18, 0.7)" />
      <ul style={{ ['--active' as string]: Math.max(active, 0) }}>
        <span className={`nav-indicator ${active < 0 ? 'hidden' : ''}`} aria-hidden />
        <li>
          <NavLink to={base} end>
            <House size={24} weight={active === 0 ? 'fill' : 'bold'} aria-hidden />
            Главная
          </NavLink>
        </li>
        <li>
          <NavLink to={`${base}/services`}>
            <ListBullets size={24} weight="bold" aria-hidden />
            Услуги
          </NavLink>
        </li>
        <li>
          <NavLink to={`${base}/my`}>
            <CalendarCheck size={24} weight={active === 2 ? 'fill' : 'bold'} aria-hidden />
            Моя запись
            {hasUpcoming && <span className="nav-dot" aria-label="есть активная запись" />}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
