/** Генерирует studios/studio.schema.json из Zod-схемы — для подсказок и проверки в редакторе. */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { studioFileSchema } from '../shared/schema.ts';

const schema = z.toJSONSchema(studioFileSchema, { io: 'input', unrepresentable: 'any' });
writeFileSync('studios/studio.schema.json', JSON.stringify({ title: 'Настройки автостудии', ...schema }, null, 2) + '\n');
console.log('✓ studios/studio.schema.json');
