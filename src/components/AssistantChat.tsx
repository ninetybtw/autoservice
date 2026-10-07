import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { Markdown } from '@astryxdesign/core/Markdown';
import { IconButton } from '@astryxdesign/core/IconButton';
import type { AssistantMode, ChatMessage } from '@shared/assistant/tools.ts';
import { useAssistant } from '../data/hooks.ts';
import { useNavigate } from 'react-router';
import { useStudio } from '../studio.tsx';

interface Props {
  mode: AssistantMode;
  examples: string[];
  intro: string;
  /** Сообщение, которое нужно отправить сразу (нажатие на пример) */
  initial?: string | null;
}

export function AssistantChat({ mode, examples, intro, initial }: Props) {
  const studio = useStudio();
  const navigate = useNavigate();
  const ask = useAssistant(studio.slug, mode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(examples);
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef<string | null>(null);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    // «Записаться на «Услуга»» — сразу открываем запись
    const bookMatch = content.match(/^Записаться на «(.+)»$/);
    if (bookMatch && mode === 'client') {
      const service = studio.settings.services.find((s) => s.name === bookMatch[1]);
      if (service) {
        navigate(`/${studio.slug}/book?service=${service.id}`);
        return;
      }
    }
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setSuggestions([]);
    setFailed(false);
    ask.mutate(next, {
      onSuccess: (reply) => {
        setMessages((m) => [...m, { role: 'assistant', content: reply.text }]);
        setSuggestions(reply.suggestions ?? []);
      },
      onError: () => setFailed(true),
    });
  };

  useEffect(() => {
    if (initial && sentInitial.current !== initial) {
      sentInitial.current = initial;
      send(initial);
    }
  }, [initial]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ask.isPending]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef} aria-live="polite">
        <div className="bubble assistant">{intro}</div>
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="bubble user">
              {m.content}
            </div>
          ) : (
            <div key={i} className="bubble assistant" data-testid="assistant-reply">
              <Markdown density="compact">{m.content}</Markdown>
            </div>
          ),
        )}
        {ask.isPending && (
          <div className="bubble assistant" aria-label="Помощник печатает">
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {failed && (
          <div className="bubble assistant">
            Не получилось ответить — проверьте интернет.{' '}
            <button className="chip" type="button" onClick={() => send(messages.filter((m) => m.role === 'user').pop()?.content ?? '')}>
              Повторить
            </button>
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="chips" aria-label="Быстрые вопросы">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form className="chat-form" onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor={`chat-${mode}`}>
          Сообщение помощнику
        </label>
        <input
          id={`chat-${mode}`}
          className="native-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Напишите вопрос…"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={500}
        />
        <IconButton label="Отправить" icon={<PaperPlaneRight size={20} weight="fill" />} variant="primary" type="submit" isDisabled={!draft.trim() || ask.isPending} />
      </form>
    </div>
  );
}
