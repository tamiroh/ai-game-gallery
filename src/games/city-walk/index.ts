import thumbnail from './assets/thumbnail.webp?url';
import type { GameDefinition } from '../../lib/games';

export default {
  title: 'City Walk',
  description: 'Take the long way home. Wander a sunlit city in first person, with detailed streets, warm afternoon light, and no destination.',
  thumbnail,
  model: 'GPT 6 Astra',
  creationMinutes: 21.6,
} satisfies GameDefinition;
