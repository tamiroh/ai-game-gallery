import { COURSE_LENGTH, GAPS, createCourse, movingX, onRoad, type Feature } from "./course.ts";
export type Mode = "expedition" | "trial";
export type Phase = "ready" | "countdown" | "running" | "paused" | "won" | "lost";
export interface Input {
  steer: number;
  boost: boolean;
  brake: boolean;
  targetX: number | null;
}
export interface FlightEvent {
  kind: "crystal" | "ring" | "hit" | "jump" | "finish" | "repair" | "pad" | "near" | "sector";
  feature?: Feature;
  text?: string;
}
export class Flight {
  phase: Phase = "ready";
  mode: Mode = "expedition";
  s = 0;
  x = 0;
  vx = 0;
  height = 0;
  vy = 0;
  speed = 0;
  energy = 100;
  hull = 5;
  elapsed = 0;
  countdown = 3;
  invincible = 0;
  padTime = 0;
  combo = 0;
  comboTime = 0;
  maxCombo = 0;
  score = 0;
  crystals = 0;
  rings = 0;
  hits = 0;
  nearMisses = 0;
  sector = 0;
  boosting = false;
  boostLocked = false;
  readonly features = createCourse();
  readonly consumed = new Set<number>();
  events: FlightEvent[] = [];
  get maxHull() {
    return this.mode === "expedition" ? 5 : 3;
  }
  get multiplier() {
    return Math.min(5, 1 + Math.floor(this.combo / 6));
  }
  reset(mode: Mode = this.mode) {
    this.mode = mode;
    this.phase = "countdown";
    this.s = 0;
    this.x = 0;
    this.vx = 0;
    this.height = 0;
    this.vy = 0;
    this.speed = 0;
    this.energy = 100;
    this.hull = this.maxHull;
    this.elapsed = 0;
    this.countdown = 3;
    this.invincible = 0;
    this.padTime = 0;
    this.combo = 0;
    this.comboTime = 0;
    this.maxCombo = 0;
    this.score = 0;
    this.crystals = 0;
    this.rings = 0;
    this.hits = 0;
    this.nearMisses = 0;
    this.sector = 0;
    this.boosting = false;
    this.boostLocked = false;
    this.consumed.clear();
    this.events = [];
  }
  jump() {
    if (this.phase !== "running" || this.height > 0.05) return;
    this.vy = 11.8;
    this.height = 0.02;
    this.events.push({ kind: "jump" });
  }
  private chain(points: number) {
    this.combo++;
    this.comboTime = 3.8;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += points * this.multiplier;
  }
  private damage(text: string) {
    if (this.invincible > 0) return;
    this.hull--;
    this.hits++;
    this.invincible = 1.8;
    this.combo = 0;
    this.comboTime = 0;
    this.speed = Math.max(14, this.speed * 0.65);
    this.energy = Math.max(0, this.energy - 18);
    this.events.push({ kind: "hit", text });
    if (this.hull <= 0) {
      this.phase = "lost";
      this.boosting = false;
    }
  }
  step(dt: number, input: Input) {
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = "running";
        this.speed = 22;
      }
      return;
    }
    if (this.phase !== "running") return;
    this.elapsed += dt;
    this.invincible = Math.max(0, this.invincible - dt);
    this.padTime = Math.max(0, this.padTime - dt);
    this.comboTime = Math.max(0, this.comboTime - dt);
    if (this.comboTime === 0) this.combo = 0;
    if (this.energy <= 1) this.boostLocked = true;
    if (this.energy >= 20) this.boostLocked = false;
    this.boosting = (input.boost && !this.boostLocked && !input.brake) || this.padTime > 0;
    const targetSpeed = input.brake ? 15 : this.boosting ? 43 : 26;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * (this.boosting ? 2.5 : 1.8)));
    this.energy = Math.max(0, Math.min(100, this.energy + dt * (this.boosting && this.padTime <= 0 ? -25 : 8)));
    const steer = input.targetX === null ? input.steer : Math.max(-1, Math.min(1, (input.targetX - this.x) * 1.8));
    this.vx += (steer * (input.brake ? 10 : 13) - this.vx) * (1 - Math.exp(-dt * 9));
    this.x += this.vx * dt;
    if (Math.abs(this.x) > 5.4) {
      this.x = Math.sign(this.x) * 5.4;
      this.vx = 0;
    }
    const previous = this.s;
    this.s += this.speed * dt;
    const assistedGap =
      this.mode === "expedition"
        ? GAPS.find(
            (g) => previous < g.start - (this.speed < 22 ? 4 : 8) && this.s >= g.start - (this.speed < 22 ? 4 : 8),
          )
        : undefined;
    if (assistedGap) {
      const airborneTime = (this.vy + Math.sqrt(this.vy * this.vy + 40 * Math.max(0, this.height))) / 20;
      const crossingTime = (assistedGap.end - this.s + 2) / Math.max(15, this.speed * 0.8);
      // Rescue an early manual jump too, rather than letting assistance miss the edge.
      if (airborneTime < crossingTime) {
        this.height = Math.max(0.02, this.height);
        this.vy = this.speed < 22 ? 14.8 : 11.8;
        this.events.push({ kind: "jump" });
      }
    }
    if (this.height > 0 || this.vy !== 0 || !onRoad(this.s)) {
      this.vy -= 20 * dt;
      this.height += this.vy * dt;
    }
    if (this.height < 0 && onRoad(this.s)) {
      this.height = 0;
      this.vy = 0;
    }
    if (!onRoad(this.s) && this.height < -0.65) {
      const gap = GAPS.find((g) => this.s > g.start && this.s < g.end)!;
      this.damage("Recovery drone deployed");
      this.s = gap.end + 3;
      this.height = 1.2;
      this.vy = 1;
    }
    for (const f of this.features) {
      if (f.s < previous - 3 || f.s > this.s + 2 || this.consumed.has(f.id)) continue;
      const dx = Math.abs(movingX(f, this.elapsed) - this.x);
      if (f.kind === "block" || f.kind === "sweeper") {
        if (dx < f.width / 2 + 0.58 && this.height < 2.05 && this.s > f.s - 1.5) {
          this.consumed.add(f.id);
          this.damage("Hull impact · chain broken");
        } else if (this.s > f.s + 1.5) {
          this.consumed.add(f.id);
          if (dx < f.width / 2 + 1.5 && this.height < 2.6) {
            this.nearMisses++;
            this.score += 75 * this.multiplier;
            this.energy = Math.min(100, this.energy + 5);
            this.events.push({ kind: "near", feature: f });
          }
        }
      } else if (f.kind === "pad") {
        if (this.s >= f.s && dx < 5.8 && this.height < 0.5) {
          this.consumed.add(f.id);
          this.padTime = 1.15;
          this.events.push({ kind: "pad", feature: f });
        }
      } else if (f.kind === "ring") {
        if (this.s >= f.s) {
          this.consumed.add(f.id);
          if (Math.hypot(dx, this.height + 0.85 - f.y) < 1.9) {
            this.rings++;
            this.chain(200);
            this.energy = Math.min(100, this.energy + 30);
            this.events.push({ kind: "ring", feature: f });
          }
        }
      } else if (dx < (f.kind === "repair" ? 1.3 : 1.05) && Math.abs(this.height + 0.85 - f.y) < 1.3) {
        this.consumed.add(f.id);
        if (f.kind === "crystal") {
          this.crystals++;
          this.chain(30);
          this.energy = Math.min(100, this.energy + 4);
          this.events.push({ kind: "crystal", feature: f });
        } else {
          this.hull = Math.min(this.maxHull, this.hull + 1);
          this.energy = Math.min(100, this.energy + 25);
          this.score += 100;
          this.events.push({ kind: "repair", feature: f });
        }
      }
      if (this.hull <= 0) break;
    }
    const sector = Math.min(2, Math.floor(this.s / 900));
    if (sector !== this.sector) {
      this.sector = sector;
      this.events.push({ kind: "sector" });
    }
    if (this.s >= COURSE_LENGTH && this.phase === "running") {
      this.s = COURSE_LENGTH;
      this.phase = "won";
      this.boosting = false;
      this.score += this.hull * 500 + Math.max(0, Math.round((130 - this.elapsed) * 60));
      this.events.push({ kind: "finish" });
    }
  }
}
export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
export function rank(score: number) {
  return score >= 14500 ? "S" : score >= 10500 ? "A" : score >= 6500 ? "B" : "C";
}
