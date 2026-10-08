/**
 * Фото работ. Три отдельных действия, каждое меняет только одну карточку:
 * добавить новую работу, заменить фото конкретной работы, изменить подпись конкретной работы.
 * Изменение применяется к свежей версии с сервера — остальные работы остаются на месте.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Trash } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import type { Work } from '@shared/schema.ts';
import { backend } from '../../data/index.ts';
import { useUpdateSettings } from '../../data/hooks.ts';
import { useMedia, useStudio } from '../../studio.tsx';
import { prepareImage, uniqueName } from '../../lib/images.ts';
import { FileButton, SettingsSection } from './AdminCommon.tsx';
import { Photo } from '../../components/Photo.tsx';

function WorkCard({ work, index, total }: { work: Work; index: number; total: number }) {
  const studio = useStudio();
  const media = useMedia();
  const update = useUpdateSettings(studio);
  const toast = useToast();
  const [caption, setCaption] = useState(work.caption);
  const changed = caption.trim() !== work.caption;

  const replacePhoto = async (file: File) => {
    const url = await backend.uploadMedia(studio, await prepareImage(file), uniqueName(`work-${work.id}`));
    await update.mutateAsync((c) => ({ ...c, works: c.works.map((w) => (w.id === work.id ? { ...w, image: url, fallback: undefined } : w)) }));
    toast({ body: 'Фото заменено' });
  };
  const saveCaption = async () => {
    await update.mutateAsync((c) => ({ ...c, works: c.works.map((w) => (w.id === work.id ? { ...w, caption: caption.trim() } : w)) }));
    toast({ body: 'Подпись сохранена' });
  };
  const move = (d: -1 | 1) =>
    update.mutate((c) => {
      const works = c.works.slice();
      const i = works.findIndex((w) => w.id === work.id);
      if (i < 0 || !works[i + d]) return c;
      [works[i], works[i + d]] = [works[i + d], works[i]];
      return { ...c, works };
    });
  const remove = () => {
    if (confirm('Удалить эту работу?')) update.mutate((c) => ({ ...c, works: c.works.filter((w) => w.id !== work.id) }));
  };

  return (
    <article className="card photo-card stack" data-testid={`work-${work.id}`}>
      <Photo src={media(work.image)} fallback={media(work.fallback) || undefined} alt={work.caption || 'Фото работы'} />
      <TextInput label="Подпись под фото" value={caption} onChange={setCaption} />
      <div className="row">
        <Button label="Сохранить подпись" size="sm" variant={changed ? 'primary' : 'secondary'} icon={<Check size={16} weight="bold" />} isDisabled={!changed} onClick={saveCaption} />
      </div>
      <FileButton label="Заменить это фото" onFile={replacePhoto} testId={`replace-${work.id}`} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
        <IconButton label="Левее" size="sm" variant="ghost" icon={<ArrowUp size={16} />} isDisabled={index === 0} onClick={() => move(-1)} />
        <IconButton label="Правее" size="sm" variant="ghost" icon={<ArrowDown size={16} />} isDisabled={index === total - 1} onClick={() => move(1)} />
        <IconButton label="Удалить работу" size="sm" variant="ghost" icon={<Trash size={16} />} onClick={remove} />
      </div>
    </article>
  );
}

export default function PhotosPage() {
  const studio = useStudio();
  const update = useUpdateSettings(studio);
  const toast = useToast();
  const [caption, setCaption] = useState('');
  const works = studio.settings.works;

  const addWork = async (file: File) => {
    const id = `w${Date.now().toString(36)}`;
    const url = await backend.uploadMedia(studio, await prepareImage(file), uniqueName(`work-${id}`));
    await update.mutateAsync((c) => ({ ...c, works: [...c.works, { id, image: url, caption: caption.trim() }] }));
    setCaption('');
    toast({ body: 'Работа добавлена' });
  };

  return (
    <main className="page stack">
      <SettingsSection title="Добавить работу" description="Новая карточка появится в конце галереи. Остальные работы не изменятся.">
        <TextInput label="Подпись" isOptional value={caption} onChange={setCaption} placeholder="Например: керамика на Porsche Macan" />
        <FileButton label="Выбрать фото и добавить" variant="primary" onFile={addWork} testId="add-work-file" />
      </SettingsSection>
      <h2 className="section-title" style={{ margin: '8px 0 0', fontSize: 24 }}>
        Работы в галерее · {works.length}
      </h2>
      <div className="photo-grid">
        {works.map((w, i) => (
          <WorkCard key={`${w.id}:${w.image}:${w.caption}`} work={w} index={i} total={works.length} />
        ))}
      </div>
    </main>
  );
}
