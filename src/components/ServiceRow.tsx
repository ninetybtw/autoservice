import { Clock } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { formatDuration, formatServicePrice, type Service } from '@shared/schema.ts';
import { useStudio } from '../studio.tsx';

export function durationText(minutes: number): string {
  return minutes > 10 * 60 ? `${formatDuration(minutes)} работы · несколько дней` : formatDuration(minutes);
}

export function ServiceRow({ service, compact = false }: { service: Service; compact?: boolean }) {
  const { slug } = useStudio();
  return (
    <article className="card service-item">
      <div>
        <h3>{service.name}</h3>
        {!compact && service.description && <p>{service.description}</p>}
      </div>
      <div className="price">{formatServicePrice(service.price, service.priceFrom)}</div>
      <div className="meta-row" style={{ gridColumn: '1 / -1', justifyContent: 'space-between' }}>
        <span>
          <Clock size={18} aria-hidden />
          {durationText(service.durationMinutes)}
        </span>
        <Button label="Записаться" size="sm" variant="secondary" href={`/${slug}/book?service=${service.id}`} />
      </div>
    </article>
  );
}
