import thumbnail from "./assets/thumbnail.webp?url";
import type { GameDefinition } from "../../lib/games";

export default {
  title: "Skyline Flight",
  description:
    "Race a jet through a city at golden hour: skim the street canyons, dive under the river bridges, thread the Sky Gate and slalom the towers without leaving the line.",
  thumbnail,
  model: "Claude Opus 5.5",
  creationMinutes: 47,
} satisfies GameDefinition;
