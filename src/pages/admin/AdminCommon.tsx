import { useRef, useState, type ReactNode } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card form-grid">
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
        {description && (
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 15 }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Кнопка выбора файла: открывает системный выбор фото (на телефоне — камера или галерея). */
export function FileButton({
  label,
  onFile,
  variant = 'secondary',
  testId,
}: {
  label: string;
  onFile: (file: File) => Promise<void>;
  variant?: 'primary' | 'secondary';
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid={testId}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            await onFile(file);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label={label} variant={variant} icon={<UploadSimple size={18} weight="bold" />} isLoading={busy} onClick={() => input.current?.click()} />
      {error && <Banner status="error" title={error} />}
    </div>
  );
}

export function SaveBar({ dirty, saving, onSave, error, saved }: { dirty: boolean; saving: boolean; onSave: () => void; error: string | null; saved: boolean }) {
  if (!dirty && !error && !saved && !saving) return null;
  return (
    <div className="sticky-actions" style={{ margin: '0 -16px' }}>
      {error && (
        <div style={{ marginBottom: 8 }}>
          <Banner status="error" title={error} />
        </div>
      )}
      <Button
        label={saving ? 'Сохраняем…' : dirty ? 'Сохранить изменения' : saved ? 'Сохранено' : 'Изменений нет'}
        variant="primary"
        size="lg"
        width="100%"
        isDisabled={!dirty}
        isLoading={saving}
        onClick={onSave}
      />
    </div>
  );
}

/** Первая ошибка проверки Zod в понятном виде. */
export function zodMessage(issues: { path: PropertyKey[]; message: string }[], labels: Record<string, string> = {}): string {
  const i = issues[0];
  if (!i) return 'Проверьте данные';
  const where = i.path.map(String).find((p) => labels[p]);
  return where ? `${labels[where]}: ${i.message}` : i.message;
}
