import {
  Camera,
  Car,
  Clock,
  Coffee,
  Drop,
  Medal,
  ShieldCheck,
  Sparkle,
  Star,
  Wrench,
  type Icon,
} from '@phosphor-icons/react';
import type { InfoCard } from '@shared/schema.ts';

export const INFO_ICON: Record<InfoCard['icon'], Icon> = {
  shield: ShieldCheck,
  clock: Clock,
  sparkle: Sparkle,
  drop: Drop,
  car: Car,
  medal: Medal,
  wrench: Wrench,
  coffee: Coffee,
  camera: Camera,
  star: Star,
};

export const INFO_ICON_LABELS: Record<InfoCard['icon'], string> = {
  shield: 'Щит (гарантия)',
  clock: 'Часы (сроки)',
  sparkle: 'Блеск',
  drop: 'Капля',
  car: 'Машина',
  medal: 'Медаль',
  wrench: 'Ключ',
  coffee: 'Кофе',
  camera: 'Камера',
  star: 'Звезда',
};
