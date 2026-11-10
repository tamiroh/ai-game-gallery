import thumbnail from "./assets/thumbnail.webp?url";
import type { GameDefinition } from "../../lib/games";

export default {
  title: "Bumper Brawl",
  description: "Roll, dash, and ram rival balls off a shrinking floating arena. How many waves can you survive?",
  thumbnail,
  model: "Claude Fable 5.2",
  creationMinutes: 13,
} satisfies GameDefinition;
