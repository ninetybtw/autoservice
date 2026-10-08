/**
 * Фирменный цвет: применяется сразу ко всему приложению.
 * Если белый текст на цвете читается плохо, палитра сама подбирает оттенок или чёрный текст.
 */
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { brandPalette, DEFAULT_ACCENT } from '@shared/brand.ts';
import { useUpdateSettings } from '../../data/hooks.ts';
import { useStudio } from '../../studio.tsx';

const PRESETS: { hex: string; name: string }[] = [
  { hex: DEFAULT_ACCENT, name: 'Красный' },
  { hex: '#e2711d', name: 'Оранжевый' },
  { hex: '#f2b705', name: 'Жёлтый' },
  { hex: '#2e9d57', name: 'Зелёный' },
  { hex: '#1f6fd1', name: 'Синий' },
  { hex: '#7a4fd6', name: 'Фиолетовый' },
];

export function BrandColorPicker() {
  const studio = useStudio();
  const update = useUpdateSettings(studio);
  const toast = useToast();
  const saved = studio.settings.branding.colors?.accent ?? DEFAULT_ACCENT;
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const palette = brandPalette(value);

  const save = async (accent: string | null) => {
    await update.mutateAsync((c) => ({
      ...c,
      branding: { ...c.branding, colors: accent && accent.toLowerCase() !== DEFAULT_ACCENT ? { accent: accent.toLowerCase() } : undefined },
    }));
    toast({ body: 'Цвет обновлён' });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="brand-swatches" role="radiogroup" aria-label="Фирменный цвет">
        {PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === p.hex}
            aria-label={p.name}
            className="brand-swatch"
            style={{ background: p.hex }}
            onClick={() => setValue(p.hex)}
          />
        ))}
        <label className="brand-swatch brand-swatch-custom" title="Свой цвет">
          <span className="visually-hidden">Свой цвет</span>
          <input type="color" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <span className="brand-sample" style={{ background: palette.accent, color: palette.onAccent }}>
          Записаться
        </span>
        <span style={{ color: palette.accentText, fontWeight: 700 }}>{value.toUpperCase()}</span>
      </div>
      <div className="row">
        <Button label="Сохранить цвет" size="sm" variant={value.toLowerCase() !== saved.toLowerCase() ? 'primary' : 'secondary'} isDisabled={value.toLowerCase() === saved.toLowerCase()} onClick={() => save(value)} />
        {studio.settings.branding.colors && <Button label="Вернуть стандартный" size="sm" variant="ghost" onClick={() => save(null)} />}
      </div>
    </div>
  );
}
