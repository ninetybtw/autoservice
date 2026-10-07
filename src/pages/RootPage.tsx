import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { CaretRight } from '@phosphor-icons/react';
import { backend } from '../data/index.ts';
import { DEFAULT_STUDIO, IS_DEMO } from '../config.ts';

/** Корневая страница. Клиенты приходят по ссылке студии, поэтому список виден только в демо-режиме. */
export function RootPage() {
  const { data } = useQuery({ queryKey: ['studios'], queryFn: () => backend.listStudios(), enabled: IS_DEMO });
  if (DEFAULT_STUDIO) return <Navigate to={`/${DEFAULT_STUDIO}`} replace />;
  return (
    <main className="page page-narrow">
      <p className="eyebrow">Онлайн-запись</p>
      <h1 className="section-title" style={{ marginTop: 8 }}>
        Запись в автостудию
      </h1>
      {IS_DEMO ? (
        <div className="stack">
          <p className="lead">Демо-режим: данные хранятся в этом браузере. Выберите студию:</p>
          {data?.map((s) => (
            <a key={s.slug} href={`/${s.slug}`} className="card row" style={{ textDecoration: 'none' }}>
              <span className="grow" style={{ fontWeight: 800, fontSize: 18 }}>
                {s.name}
              </span>
              <span className="muted">/{s.slug}</span>
              <CaretRight size={20} aria-hidden />
            </a>
          ))}
        </div>
      ) : (
        <p className="lead">Откройте ссылку, которую прислала студия.</p>
      )}
    </main>
  );
}
