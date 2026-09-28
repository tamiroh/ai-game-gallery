type Star = { x: number; y: number; speed: number };

class StarCatcher extends HTMLElement {
  connectedCallback() {
    const canvas = this.querySelector("canvas")!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scoreLabel = this.querySelector("[data-score]")!;
    const timeLabel = this.querySelector("[data-time]")!;
    const status = this.querySelector('[role="status"]')!;
    const button = this.querySelector<HTMLButtonElement>("[data-start]")!;
    const events = new AbortController();
    const keys = new Set<string>();
    let stars: Star[] = [];
    let x = 360;
    let score = 0;
    let remaining = 30;
    let spawn = 0;
    let running = false;
    let previous = 0;
    let frame = 0;

    const draw = () => {
      context.clearRect(0, 0, 720, 400);
      context.fillStyle = "#536480";
      for (let i = 0; i < 40; i++) {
        context.fillRect((i * 137 + 23) % 720, (i * 79 + 13) % 330, 2, 2);
      }
      context.fillStyle = "#ffcf75";
      context.font = "28px serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const star of stars) context.fillText("✦", star.x, star.y);
      context.fillStyle = "#c3edb0";
      context.beginPath();
      context.roundRect(x - 38, 348, 76, 18, 8);
      context.fill();
      context.fillStyle = "#6c967d";
      context.fillRect(x - 25, 368, 50, 4);
      if (!running) {
        context.fillStyle = "#eaf0ff";
        context.font = "bold 24px system-ui";
        context.fillText(remaining === 0 ? `${score} stars collected!` : "Catch the stars.", 360, 190);
      }
    };

    const tick = (now: number) => {
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      if (running && !document.hidden) {
        remaining = Math.max(0, remaining - elapsed);
        x +=
          ((keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0)) *
          460 *
          elapsed;
        x = Math.max(38, Math.min(682, x));
        spawn -= elapsed;
        if (spawn <= 0) {
          stars.push({ x: 20 + Math.random() * 680, y: -16, speed: 130 + Math.random() * 70 });
          spawn = 0.45;
        }
        stars = stars.filter((star) => {
          const oldY = star.y;
          star.y += star.speed * elapsed;
          if (oldY < 348 && star.y >= 348 && Math.abs(star.x - x) <= 48) {
            score++;
            scoreLabel.textContent = String(score);
            return false;
          }
          return star.y < 420;
        });
        timeLabel.textContent = String(Math.ceil(remaining));
        if (remaining === 0) {
          running = false;
          keys.clear();
          status.textContent = `Time is up! You collected ${score} stars. Try again!`;
          button.textContent = "Play again";
        }
      }
      draw();
      if (running) frame = requestAnimationFrame(tick);
    };

    button.addEventListener(
      "click",
      () => {
        cancelAnimationFrame(frame);
        stars = [];
        keys.clear();
        x = 360;
        score = 0;
        remaining = 30;
        spawn = 0;
        previous = 0;
        running = true;
        scoreLabel.textContent = "0";
        timeLabel.textContent = "30";
        status.textContent = "Catch the falling stars!";
        button.textContent = "Restart";
        canvas.focus({ preventScroll: true });
        frame = requestAnimationFrame(tick);
      },
      { signal: events.signal },
    );

    for (const type of ["keydown", "keyup"] as const) {
      canvas.addEventListener(
        type,
        (event) => {
          const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
          if (!["ArrowLeft", "ArrowRight", "a", "d"].includes(key)) return;
          event.preventDefault();
          if (type === "keydown") keys.add(key);
          else keys.delete(key);
        },
        { signal: events.signal },
      );
    }
    canvas.addEventListener("blur", () => keys.clear(), { signal: events.signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        keys.clear();
        previous = 0;
      },
      { signal: events.signal },
    );
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      x = Math.max(38, Math.min(682, ((event.clientX - bounds.left) / bounds.width) * 720));
      if (!running) draw();
    };
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        move(event);
      },
      { signal: events.signal },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (canvas.hasPointerCapture(event.pointerId)) move(event);
      },
      { signal: events.signal },
    );
    this.cleanup = () => {
      events.abort();
      cancelAnimationFrame(frame);
    };
    draw();
  }

  private cleanup = () => {};

  disconnectedCallback() {
    this.cleanup();
  }
}

if (!customElements.get("star-catcher")) customElements.define("star-catcher", StarCatcher);
