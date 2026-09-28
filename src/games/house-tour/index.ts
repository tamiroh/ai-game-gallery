import thumbnail from './assets/thumbnail.webp?url';
import type { GameDefinition } from '../../lib/games';

export default {
  title: 'House Tour',
  description: 'Walk through a detailed two-storey Japanese family home: genkan, tatami room with tokonoma, open-plan LDK, bath, bedrooms and a balcony.',
  thumbnail,
  model: 'Claude Opus 5.5',
  creationMinutes: 75,
} satisfies GameDefinition;
