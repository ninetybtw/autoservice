import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { useToast } from '@astryxdesign/core/Toast';
import { serviceSchema, formatDuration, type Service } from '@shared/schema.ts';
import { UserError } from '../../data/index.ts';
import { useUpdateSettings } from '../../data/hooks.ts';
import { useStudio } from '../../studio.tsx';
import { SaveBar, zodMessage } from './AdminCommon.tsx';

function newId(name: string, taken: string[]): string {
  const map: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  const base =
    name
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'service';
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

export default function ServicesSettingsPage() {
  const studio = useStudio();
  const update = useUpdateSettings(studio);
  const toast = useToast();
  const [list, setList] = useState<Service[]>(() => studio.settings.services.map((s) => ({ ...s })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(list) !== JSON.stringify(studio.settings.services);

  useEffect(() => {
    if (!dirty) setList(studio.settings.services.map((s) => ({ ...s })));
  }, [studio.settings.services]);

  const edit = (i: number, p: Partial<Service>) => {
    setList((l) => l.map((s, j) => (j === i ? { ...s, ...p } : s)));
    setSaved(false);
  };
  const move = (i: number, d: -1 | 1) => {
    setList((l) => {
      const next = l.slice();
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  };

  const save = async () => {
    setError(null);
    const withIds = list.map((s) => (s.id ? s : { ...s, id: newId(s.name, list.map((x) => x.id)) }));
    for (const [i, s] of withIds.entries()) {
      const r = serviceSchema.safeParse(s);
      if (!r.success) return setError(`Услуга ${i + 1} («${s.name || 'без названия'}»): ${zodMessage(r.error.issues)}`);
    }
    if (!withIds.some((s) => s.active)) return setError('Оставьте хотя бы одну услугу видимой для клиентов');
    try {
      await update.mutateAsync((current) => ({ ...current, services: withIds }));
      setSaved(true);
      toast({ body: 'Услуги и цены сохранены' });
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'Не удалось сохранить');
    }
  };

  return (
    <main className="page page-narrow stack">
      <p className="muted" style={{ margin: 0 }}>
        Длительность — чистое время работы. Если она больше рабочего дня, работа продолжится на следующий день, и бокс будет занят все эти дни.
      </p>
      {list.map((s, i) => {
        const hours = Math.floor(s.durationMinutes / 60);
        const minutes = s.durationMinutes % 60;
        return (
          <section key={s.id || `new-${i}`} className="card form-grid" aria-label={s.name || 'Новая услуга'} style={{ opacity: s.active ? 1 : 0.6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 18 }}>{s.name || 'Новая услуга'}</strong>
              <div className="row" style={{ gap: 4 }}>
                <IconButton label="Выше" size="sm" variant="ghost" icon={<ArrowUp size={16} />} isDisabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton label="Ниже" size="sm" variant="ghost" icon={<ArrowDown size={16} />} isDisabled={i === list.length - 1} onClick={() => move(i, 1)} />
                <IconButton
                  label="Удалить услугу"
                  size="sm"
                  variant="ghost"
                  icon={<Trash size={16} />}
                  onClick={() => {
                    if (confirm(`Удалить «${s.name}»? Существующие записи сохранятся.`)) setList((l) => l.filter((_, j) => j !== i));
                  }}
                />
              </div>
            </div>
            <TextInput label="Название" value={s.name} onChange={(v) => edit(i, { name: v })} />
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow">
                <NumberInput label="Цена, ₽" value={s.price} onChange={(v) => edit(i, { price: Math.round(v || 0) })} min={0} step={500} isIntegerOnly />
              </div>
              <Switch label="«от»" value={s.priceFrom} onChange={(v) => edit(i, { priceFrom: v })} />
            </div>
            <div className="row">
              <div className="grow">
                <NumberInput label="Часов" value={hours} onChange={(v) => edit(i, { durationMinutes: Math.max(15, Math.round(v || 0) * 60 + minutes) })} min={0} max={168} isIntegerOnly />
              </div>
              <div className="grow">
                <NumberInput label="Минут" value={minutes} onChange={(v) => edit(i, { durationMinutes: Math.max(15, hours * 60 + Math.min(59, Math.round(v || 0))) })} min={0} max={59} step={15} isIntegerOnly />
              </div>
            </div>
            <span className="muted" style={{ fontSize: 14 }}>
              Длительность: {formatDuration(s.durationMinutes)}
            </span>
            <TextArea label="Описание" value={s.description} onChange={(v) => edit(i, { description: v })} rows={2} />
            <TextInput
              label="Другие названия для помощника"
              isOptional
              value={s.keywords.join(', ')}
              onChange={(v) => edit(i, { keywords: v.split(',').map((x) => x.trim()).filter(Boolean) })}
              placeholder="керамика, защита кузова"
            />
            <Switch label="Показывать клиентам" value={s.active} onChange={(v) => edit(i, { active: v })} />
          </section>
        );
      })}
      <Button
        label="Добавить услугу"
        icon={<Plus size={18} weight="bold" />}
        onClick={() =>
          setList((l) => [...l, { id: '', name: '', description: '', price: 0, priceFrom: false, durationMinutes: 60, keywords: [], active: true }])
        }
      />
      <SaveBar dirty={dirty} saving={update.isPending} onSave={save} error={error} saved={saved} />
    </main>
  );
}
