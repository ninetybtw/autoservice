import { useEffect, useState } from 'react';
import { Hero } from '../components/Hero.tsx';
import { AboutSection, AssistantSection, BookingSection, ContactsSection, ServicesSection, WorksSection } from '../components/HomeSections.tsx';
import { AssistantDialog } from '../components/AssistantDialog.tsx';
import { refreshGlass } from '../components/LiquidGlass.tsx';

export function HomePage() {
  const [assistant, setAssistant] = useState<{ open: boolean; initial: string | null }>({ open: false, initial: null });

  useEffect(() => {
    // фон для стекла нижней панели — после отрисовки страницы и загрузки картинок
    refreshGlass(1200);
    const onLoad = () => refreshGlass(300);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return (
    <main>
      <Hero />
      <BookingSection />
      <AboutSection />
      <ServicesSection />
      <WorksSection />
      <AssistantSection onAsk={(q) => setAssistant({ open: true, initial: q })} />
      <ContactsSection />
      <AssistantDialog open={assistant.open} initial={assistant.initial} onClose={() => setAssistant({ open: false, initial: null })} />
    </main>
  );
}
