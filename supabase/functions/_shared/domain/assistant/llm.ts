// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.
/**
 * Помощник на OpenAI SDK с вызовом инструментов. Выполняется только на сервере
 * (Supabase Edge Function), модель задаётся переменной OPENAI_MODEL.
 * Если модель недоступна — возвращаем ответ запасного помощника.
 */
import type OpenAI from 'openai';
import { fallbackReply } from './fallback.ts';
import { CLIENT_TOOLS, OWNER_TOOLS, runTool, systemPrompt, type AssistantContext, type AssistantReply, type ChatMessage } from './tools.ts';

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface LlmOptions {
  client: OpenAI;
  model: string;
  maxToolRounds?: number;
}

export async function llmReply(messages: ChatMessage[], ctx: AssistantContext, opts: LlmOptions): Promise<AssistantReply> {
  const history: Msg[] = [
    { role: 'system', content: systemPrompt(ctx) },
    ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }) as Msg),
  ];
  const tools = ctx.mode === 'owner' ? OWNER_TOOLS : CLIENT_TOOLS;
  try {
    for (let round = 0; round < (opts.maxToolRounds ?? 5); round++) {
      const res = await opts.client.chat.completions.create({
        model: opts.model,
        messages: history,
        tools: tools as unknown as OpenAI.Chat.Completions.ChatCompletionTool[],
      });
      const msg = res.choices[0]?.message;
      if (!msg) break;
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        const text = (msg.content ?? '').trim();
        if (text) return { text };
        break;
      }
      history.push(msg as Msg);
      for (const call of calls) {
        if (call.type !== 'function') continue;
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }
        const result = runTool(ctx, call.function.name, args);
        history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
  } catch (err) {
    console.error('assistant: OpenAI request failed, using fallback', err);
  }
  return fallbackReply(messages, ctx);
}
