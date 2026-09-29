import thumbnail from "./assets/thumbnail.webp?url";
import type { GameDefinition } from "../../lib/games";

export default {
  title: "Skyline Flight",
  description:
    "Fly a jet through a city at golden hour: race the rings through street canyons, under river bridges and round the towers, or switch to free flight and go anywhere.",
  thumbnail,
  model: "Claude Opus 5.5",
  creationMinutes: 62,
} satisfies GameDefinition;
