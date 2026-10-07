import { NavLink } from 'react-router';
import { CalendarCheck, House, ListBullets } from '@phosphor-icons/react';
import { LiquidGlass } from './LiquidGlass.tsx';
import { useMyBookings } from '../data/hooks.ts';
import { useStudio } from '../studio.tsx';

/** Нижняя навигация со стеклом. Содержимое страницы не перекрывается: у .client-shell есть отступ снизу. */
export function BottomNav() {
  const studio = useStudio();
  const mine = useMyBookings(studio.slug);
  const hasUpcoming = mine.some((r) => r.booking.status !== 'cancelled' && new Date(r.booking.endAt) > new Date());
  const base = `/${studio.slug}`;
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      <LiquidGlass snapshot="body" resolution={1} tint="rgba(8, 8, 12, 0.55)" />
      <ul>
        <li>
          <NavLink to={base} end>
            <House size={24} weight="bold" aria-hidden />
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
            <CalendarCheck size={24} weight="bold" aria-hidden />
            Моя запись
            {hasUpcoming && <span className="nav-dot" aria-label="есть активная запись" />}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
