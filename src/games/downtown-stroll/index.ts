import thumbnail from "./assets/thumbnail.webp?url";
import type { GameDefinition } from "../../lib/games";

export default {
  title: "Downtown Stroll",
  description:
    "A first-person walk through a realistic, living downtown: traffic that stops at lights and for you, lit shop windows, parks, and no destination.",
  thumbnail,
  model: "Claude Opus 5.5",
  creationMinutes: 44,
} satisfies GameDefinition;
