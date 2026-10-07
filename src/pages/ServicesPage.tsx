import { useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.tsx';
import { ServiceRow } from '../components/ServiceRow.tsx';
import { Reveal } from '../components/Reveal.tsx';
import { refreshGlass } from '../components/LiquidGlass.tsx';
import { useStudio } from '../studio.tsx';

export function ServicesPage() {
  const { settings, slug } = useStudio();
  useEffect(() => refreshGlass(600), []);
  return (
    <main>
      <PageHeader title="Услуги и цены" back={`/${slug}`} />
      <div className="page">
        <p className="lead" style={{ marginBottom: 16 }}>
          Цены указаны за легковой автомобиль. Точную стоимость мастер подтвердит после осмотра.
        </p>
        <Reveal className="service-list two">
          {settings.services
            .filter((s) => s.active)
            .map((s) => (
              <ServiceRow key={s.id} service={s} />
            ))}
        </Reveal>
      </div>
    </main>
  );
}
