import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Phone } from '@phosphor-icons/react';
import { LiquidGlass } from './LiquidGlass.tsx';
import { useMedia, useStudio } from '../studio.tsx';

export function Hero() {
  const { slug, settings } = useStudio();
  const media = useMedia();
  const hero = media(settings.branding.hero);
  const logo = media(settings.branding.logo);
  const [loaded, setLoaded] = useState(!hero);
  const tel = settings.contacts.phone.replace(/[^\d+]/g, '');

  return (
    <header className="hero">
      {/* Сквозь стеклянную кнопку видно только это фото — без текста соседних разделов */}
      <div className="hero-media">
        {hero && (
          <img
            src={hero}
            alt=""
            crossOrigin="anonymous"
            fetchPriority="high"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
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
