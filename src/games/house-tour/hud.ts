import { BALCONY, D, DECK, FL2, OPENINGS, ROOMS, STAIR, W, type Room } from './plan';

/** The room you are standing in: the highest walkable floor at or below `maxY`. */
export function roomAt(x: number, z: number, maxY: number): Room | null {
  let best: Room | null = null;
  for (const r of ROOMS) {
    if (!r.walk || r.hidden) continue;
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1 || r.y > maxY) continue;
    if (!best || r.y > best.y) best = r;
  }
  return best;
}

const SHORT: Record<string, string> = {
  ldk: 'LDK', wash: 'Wash', bath: 'Bath', toilet1: 'WC', closet1: 'Cl', corridor1: '', hall1: 'Hall', genkan: 'Genkan',
  stair: '', toko: 'Toko', oshiire: 'Osh.', washitsu: 'Tatami', den: 'Study', storage: 'Store', toilet2: 'WC', linen: 'Cl',
  master: 'Main Bed', landing: '', corridor2: '', hall2: 'Hall', bed2: 'Bed 2', bed3: 'Bed 3',
};

function fill(room: Room) {
  if (room.id === 'washitsu') return '#cfd4b0';
  if (room.id === 'genkan') return '#b9b6b0';
  if (['wash', 'bath', 'toilet1', 'toilet2'].includes(room.id)) return '#c9d6db';
  if (room.hidden || room.id === 'toko') return '#d8d2c4';
  return '#eadfca';
}

/** Draws a real-estate style floor plan of the current storey with the visitor marked. */
export function drawPlan(canvas: HTMLCanvasElement, px: number, pz: number, py: number, yaw: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width) return;
  const floor = py > 2.6 ? 2 : 1;
  const pad = canvas.width * 0.07;
  const extra = floor === 2 ? BALCONY.z1 - D : DECK.z1 - D;
  const scale = Math.min((canvas.width - pad * 2) / W, (canvas.height - pad * 2 - canvas.width * 0.06) / (D + extra));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(pad + (canvas.width - pad * 2 - W * scale) / 2, pad + canvas.width * 0.05);
  ctx.scale(scale, scale);
  const px1 = 1 / scale;

  // Outdoor attachments.
  ctx.fillStyle = 'rgba(160,140,110,0.5)';
  if (floor === 1) ctx.fillRect(DECK.x0, DECK.z0, DECK.x1 - DECK.x0, DECK.z1 - DECK.z0);
  else ctx.fillRect(BALCONY.x0, BALCONY.z0, BALCONY.x1 - BALCONY.x0, BALCONY.z1 - BALCONY.z0);

  const rooms = ROOMS.filter((r) => r.floor === floor || r.id === 'stair');
  const here = roomAt(px, pz, py + 0.4);
  for (const r of rooms) {
    ctx.fillStyle = r === here ? '#f6e3a8' : fill(r);
    ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  }
  if (floor === 1) {
    ctx.strokeStyle = 'rgba(90,100,60,0.55)';
    ctx.lineWidth = px1;
    const x0 = 4.55, z0 = 4.55, sx = 0.91, sz = 0.91;
    for (const [a, b, c, d] of [[0, 0, 2, 1], [2, 0, 4, 1], [0, 1, 1, 3], [3, 1, 4, 3], [1, 1, 3, 2], [1, 2, 3, 3]]) ctx.strokeRect(x0 + a! * sx, z0 + b! * sz, (c! - a!) * sx, (d! - b!) * sz);
  }
  // Stair treads with the climbing arrow.
  ctx.strokeStyle = 'rgba(60,50,40,0.5)';
  ctx.lineWidth = px1;
  for (let i = 1; i < STAIR.steps; i++) {
    const x = STAIR.x1 - (i * (STAIR.x1 - STAIR.x0)) / STAIR.steps;
    ctx.beginPath();
    ctx.moveTo(x, STAIR.z0);
    ctx.lineTo(x, STAIR.z1);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(STAIR.x1 - 0.2, (STAIR.z0 + STAIR.z1) / 2);
  ctx.lineTo(STAIR.x0 + 0.3, (STAIR.z0 + STAIR.z1) / 2);
  ctx.lineTo(STAIR.x0 + 0.5, STAIR.z0 + 0.25);
  ctx.stroke();

  // Walls, then door and window openings cut through them.
  ctx.strokeStyle = '#2b2622';
  for (const r of rooms) {
    ctx.lineWidth = 0.12;
    ctx.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  }
  ctx.lineWidth = 0.2;
  ctx.strokeRect(0, 0, W, D);
  for (const o of OPENINGS) {
    const upper = o.y0 >= FL2 - 0.15;
    if ((floor === 2) !== upper || o.kind === 'rail') continue;
    const window = o.kind === 'window' && !o.walk;
    const along = o.axis === 'x';
    const [x, z, w, h] = along ? [o.a0, o.at - 0.12, o.a1 - o.a0, 0.24] : [o.at - 0.12, o.a0, 0.24, o.a1 - o.a0];
    ctx.fillStyle = window ? '#f7f4ee' : fill(ROOMS.find((r) => r.floor === floor && r.x0 <= x + w / 2 && r.x1 >= x + w / 2 && r.z0 <= z + h / 2 && r.z1 >= z + h / 2) ?? ROOMS[0]!);
    ctx.fillRect(x, z, w, h);
    if (window || o.kind === 'window') {
      ctx.strokeStyle = '#2b2622';
      ctx.lineWidth = px1;
      ctx.strokeRect(x, z, w, h);
    }
  }
  // Labels.
  ctx.fillStyle = '#3b332c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${0.36}px system-ui, sans-serif`;
  for (const r of rooms) {
    const text = SHORT[r.id];
    if (!text || r.x1 - r.x0 < 0.8) continue;
    ctx.fillText(text, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  }
  // Visitor.
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-yaw);
  ctx.fillStyle = 'rgba(214,80,50,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 1.6, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d65032';
  ctx.beginPath();
  ctx.arc(0, 0, 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Storey tag and north arrow.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b2622';
  ctx.font = `700 ${Math.round(canvas.width * 0.055)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(floor === 1 ? '1F' : '2F', pad * 0.6, pad * 0.45);
  ctx.textAlign = 'right';
  ctx.fillText('N ↑', canvas.width - pad * 0.6, pad * 0.45);
}
