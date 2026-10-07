import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowSquareOut, CalendarDots, ChatCircleDots, Images, ListChecks, SignOut, Storefront } from '@phosphor-icons/react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { backend, UserError } from '../../data/index.ts';
import { qk, useOwner } from '../../data/hooks.ts';
import { useMedia, useStudio } from '../../studio.tsx';
import { IS_DEMO } from '../../config.ts';
import { DEMO_PASSWORD } from '../../data/demo.ts';
import { bundledStudios } from '../../data/bundled.ts';

function LoginPage() {
  const studio = useStudio();
  const qc = useQueryClient();
  const demoEmail = IS_DEMO ? bundledStudios().find((s) => s.slug === studio.slug)?.owner.email : undefined;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await backend.signIn(studio, email, password);
      await qc.invalidateQueries({ queryKey: qk.owner(studio.id) });
    } catch (err) {
      setError(err instanceof UserError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page-narrow" style={{ maxWidth: 440, paddingTop: 48 }}>
      <span className="eyebrow">Кабинет владельца</span>
      <h1 className="section-title" style={{ marginTop: 8 }}>
        {studio.settings.name}
      </h1>
      <form className="card form-grid" onSubmit={submit}>
        <TextInput label="Почта" type="email" value={email} onChange={setEmail} autoComplete="username" isRequired />
        <TextInput label="Пароль" type="password" value={password} onChange={setPassword} autoComplete="current-password" isRequired />
        {error && <Banner status="error" title={error} />}
        <Button label="Войти" variant="primary" size="lg" width="100%" type="submit" isLoading={busy} />
      </form>
      {IS_DEMO && demoEmail && (
        <div className="notice" style={{ marginTop: 14 }}>
          <span aria-hidden>ℹ️</span>
          <span>
            Демо-режим: почта <strong>{demoEmail}</strong>, пароль <strong>{DEMO_PASSWORD}</strong>.
          </span>
        </div>
      )}
      <p className="muted" style={{ fontSize: 14 }}>
        Забыли пароль? Напишите тому, кто подключал сервис, — он выдаст новый.
      </p>
    </main>
  );
}

const TABS = [
  { to: '', label: 'Записи', icon: CalendarDots, end: true },
  { to: 'studio', label: 'Сервис', icon: Storefront },
  { to: 'services', label: 'Услуги', icon: ListChecks },
  { to: 'photos', label: 'Фото работ', icon: Images },
  { to: 'assistant', label: 'Помощник', icon: ChatCircleDots },
];

export default function AdminLayout() {
  const studio = useStudio();
  const media = useMedia();
  const qc = useQueryClient();
  const owner = useOwner(studio);

  if (owner.isPending) {
    return (
      <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
        <Spinner size="lg" label="Проверяем вход" />
      </div>
    );
  }
  if (!owner.data) return <LoginPage />;

  const logo = media(studio.settings.branding.logo);
  return (
    <div className="admin">
      <header className="admin-top">
        <div className="admin-top-inner">
          {logo && <img src={logo} alt="" width={36} height={36} style={{ borderRadius: 10 }} />}
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{studio.settings.name}</div>
            <div className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {owner.data.email}
            </div>
          </div>
          <Button label="Сайт" size="sm" variant="ghost" icon={<ArrowSquareOut size={16} />} href={`/${studio.slug}`} />
          <IconButton
            label="Выйти"
            size="sm"
            variant="ghost"
            icon={<SignOut size={18} />}
            onClick={async () => {
              await backend.signOut();
              qc.removeQueries({ queryKey: qk.owner(studio.id) });
            }}
          />
        </div>
        <nav className="admin-tabs" aria-label="Разделы кабинета">
          {TABS.map((t) => (
            <NavLink key={t.label} to={`/${studio.slug}/admin${t.to ? `/${t.to}` : ''}`} end={t.end}>
              <t.icon size={18} weight="bold" aria-hidden />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
