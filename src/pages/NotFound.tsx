import { Button } from '@astryxdesign/core/Button';
import { MagnifyingGlass } from '@phosphor-icons/react';

export function NotFound({
  title = 'Страница не найдена',
  text = 'Проверьте ссылку — возможно, в ней опечатка.',
  onRetry,
}: {
  title?: string;
  text?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="page page-narrow">
      <div className="empty">
        <MagnifyingGlass size={48} aria-hidden />
        <h1 style={{ color: '#fff', fontSize: 26, margin: '12px 0 6px' }}>{title}</h1>
        <p>{text}</p>
        {onRetry && <Button label="Повторить" variant="primary" onClick={onRetry} />}
      </div>
    </main>
  );
}
