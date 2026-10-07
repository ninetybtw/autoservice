import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StudioContext } from '../studio.tsx';
import { useStudioQuery } from '../data/hooks.ts';
import { NotFound } from './NotFound.tsx';

export function StudioLayout() {
  const { slug = '' } = useParams();
  const { data: studio, isPending, isError, refetch } = useStudioQuery(slug);

  useEffect(() => {
    if (studio) document.title = `${studio.settings.name} — запись онлайн`;
  }, [studio]);

  if (isPending) {
    return (
      <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
        <Spinner size="lg" label="Загружаем студию" />
      </div>
    );
  }
  if (isError && !studio) {
    return <NotFound title="Не удалось загрузить студию" text="Проверьте подключение к интернету и попробуйте ещё раз." onRetry={() => refetch()} />;
  }
  if (!studio) return <NotFound />;
  return (
    <StudioContext.Provider value={studio}>
      <Outlet />
    </StudioContext.Provider>
  );
}
