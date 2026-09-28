import thumbnail from './assets/thumbnail.webp?url';
import type { GameDefinition } from '../../lib/games';

export default {
  title: 'River Swim',
  description: 'Swim up a fully procedural alpine river in first person, fighting the current and dodging rocks and drifting logs.',
  thumbnail,
  model: 'Claude Opus 5.5',
  creationMinutes: 56,
  creationTimeApproximate: true,
} satisfies GameDefinition;
