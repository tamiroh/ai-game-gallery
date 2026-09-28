import thumbnail from "./assets/thumbnail.svg?url";
import type { GameDefinition } from "../../lib/games";

export default {
  title: "Star Catcher",
  description: "Catch falling stars. How many can you collect in 30 seconds?",
  thumbnail,
  model: "GPT 6 Astra (low)",
  creationMinutes: 5,
  creationTimeApproximate: true,
} satisfies GameDefinition;
