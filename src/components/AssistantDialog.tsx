import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { AssistantChat } from './AssistantChat.tsx';
import { useStudio } from '../studio.tsx';
import { clientExamples } from '@shared/assistant/fallback.ts';


export function AssistantDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: string | null }) {
  const { settings } = useStudio();
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={560} variant={narrow ? 'fullscreen' : 'standard'}>
      <DialogHeader title="Помощник" subtitle={settings.name} onOpenChange={(o) => !o && onClose()} />
      <div style={{ padding: '4px 16px 16px' }}>
        {open && (
          <AssistantChat
            mode="client"
            examples={clientExamples(settings)}
            initial={initial}
            intro="Здравствуйте! Подскажу цены, свободное время и как нас найти. Спросите своими словами."
          />
        )}
      </div>
    </Dialog>
  );
}
