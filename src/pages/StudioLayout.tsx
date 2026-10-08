import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router';
import { StudioContext } from '../studio.tsx';
import { useStudioQuery } from '../data/hooks.ts';
import { NotFound } from './NotFound.tsx';
import { useBrandColors } from '../lib/useBrandColors.ts';

export function StudioLayout() {
  const { slug = '' } = useParams();
  const { data: studio, isPending, isError, refetch } = useStudioQuery(slug);
  useBrandColors(studio?.settings.branding.colors);

  useEffect(() => {
    if (studio) document.title = `${studio.settings.name} — запись онлайн`;
  }, [studio]);

  if (isPending) {
    return (
      <div aria-busy="true" aria-label="Загружаем автосервис" style={{ minHeight: '100svh' }}>
        <div className="skeleton" style={{ height: 'min(70svh, 600px)', borderRadius: 0 }} />
        <div className="page stack">
          <div className="skeleton" style={{ height: 44, width: '70%' }} />
          <div className="skeleton" style={{ height: 22, width: '90%' }} />
          <div className="skeleton" style={{ height: 62, borderRadius: 22 }} />
        </div>
      </div>
    );
  }
  if (isError && !studio) {
    return <NotFound title="Не удалось загрузить страницу автосервиса" text="Проверьте подключение к интернету и попробуйте ещё раз." onRetry={() => refetch()} />;
  }
  if (!studio) return <NotFound />;
  return (
    <StudioContext.Provider value={studio}>
      <Outlet />
    </StudioContext.Provider>
  );
}
