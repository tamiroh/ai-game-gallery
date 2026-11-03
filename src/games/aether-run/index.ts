import thumbnail from "./assets/thumbnail.webp?url";
import type { GameDefinition } from "../../lib/games";
export default {
  title: "Aether Run",
  description:
    "Pilot a hovercraft through hanging gardens, a broken aqueduct, and a sunward observatory. Jump the gaps, chain crystals, and chase your perfect flight.",
  thumbnail,
  model: "GPT 6.1 Sol",
  creationMinutes: 30.7,
} satisfies GameDefinition;
