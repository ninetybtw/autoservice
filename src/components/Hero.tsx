import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Phone } from '@phosphor-icons/react';
import { LiquidGlass, refreshGlass } from './LiquidGlass.tsx';
import { useMatchMedia } from '../lib/useMatchMedia.ts';
import { Photo } from './Photo.tsx';
import { useMedia, useStudio } from '../studio.tsx';

export function Hero() {
  const { slug, settings } = useStudio();
  const media = useMedia();
  // На вертикальном экране (телефон) — вертикальное фото, если оно есть
  const portrait = useMatchMedia('(max-aspect-ratio: 1/1)');
  const mobileHero = media(settings.branding.heroMobile);
  const hero = portrait && mobileHero ? mobileHero : media(settings.branding.hero);
  const logo = media(settings.branding.logo);
  const [loaded, setLoaded] = useState(!hero);
  const tel = settings.contacts.phone.replace(/[^\d+]/g, '');

  return (
    <header className="hero">
      {/* Сквозь стеклянную кнопку видно только это фото — без текста соседних разделов */}
      <div className="hero-media">
        {hero && (
          <Photo
            src={hero}
            fallback={media(settings.branding.heroFallback) || undefined}
            alt=""
            fetchPriority="high"
            decoding="async"
            className={hero === mobileHero ? 'is-portrait' : undefined}
            onReady={() => {
              setLoaded(true);
              refreshGlass(200);
            }}
          />
        )}
        <div className="hero-shade" />
      </div>

      <div className="hero-top">
        <div className="hero-logo">
          {logo && <img src={logo} alt="" crossOrigin="anonymous" />}
          <span>{settings.name}</span>
        </div>
        <a className="hero-phone" href={`tel:${tel}`}>
          <Phone size={18} weight="fill" aria-hidden />
          Позвонить
        </a>
      </div>

      <div className="hero-content">
        {settings.tagline && <span className="eyebrow">{settings.tagline}</span>}
        <h1 className="hero-title">{settings.name}</h1>
        {settings.description && <p className="hero-tagline">{firstSentence(settings.description)}</p>}
        <div className="hero-actions">
          <Link to={`/${slug}/book`} className="glass-button cta" data-testid="hero-book">
            <LiquidGlass snapshot=".hero-media" ready={loaded} tint="rgba(255, 255, 255, 0.04)" />
            <span className="glass-label">
              Записаться
              <ArrowRight size={22} weight="bold" aria-hidden />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
