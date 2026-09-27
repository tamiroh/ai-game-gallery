export interface GameDefinition {
  title: string;
  description: string;
  thumbnail: string;
  model: string | null;
  creationMinutes: number | null;
  creationTimeApproximate?: boolean;
}

export const games = Object.entries(
  import.meta.glob<GameDefinition>('../games/*/index.ts', { eager: true, import: 'default' }),
).map(([path, definition]) => {
  const slug = path.split('/')[2];
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid game directory: ${path}`);
  }
  for (const field of ['title', 'description', 'thumbnail'] as const) {
    if (!definition[field]?.trim()) throw new Error(`${slug}: ${field} is required`);
  }
  if (definition.model !== null && (typeof definition.model !== 'string' || !definition.model.trim())) {
    throw new Error(`${slug}: model must be a nonempty string or null`);
  }
  if (definition.creationMinutes !== null && (typeof definition.creationMinutes !== 'number' || !Number.isFinite(definition.creationMinutes) || definition.creationMinutes < 0)) {
    throw new Error(`${slug}: creationMinutes must be a nonnegative number or null`);
  }
  return { ...definition, slug };
}).sort((a, b) => a.slug.localeCompare(b.slug));

