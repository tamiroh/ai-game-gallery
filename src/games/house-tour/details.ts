import * as THREE from "three";
import { Kit, trs } from "./kit";
import { cylinder, lathe, plant, rbox, tube } from "./furniture";
import { D, DOMA, FL1, FL2, W } from "./plan";

const GATE_Z = 13.2;

/** A tall kei wagon: boxy body, big glasshouse, yellow kei plates. */
function keiCar(kit: Kit, x: number, z: number, yaw: number) {
  kit.at(x, 0, z, yaw, () => {
    const paint = 0xeceae4;
    const trim = 0x1c1d1f;
    rbox(kit, "gloss", 0, 0.63, 0, 3.36, 0.76, 1.46, 0.15, paint);
    // Glasshouse from an extruded side profile, then body-coloured pillars and roof over it.
    const glass = new THREE.Shape();
    glass.moveTo(-1.63, 0.98);
    glass.lineTo(-1.62, 1.68);
    glass.lineTo(0.6, 1.72);
    glass.lineTo(1.24, 1.0);
    glass.closePath();
    const glassGeometry = new THREE.ExtrudeGeometry(glass, {
      depth: 1.3,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      bevelSegments: 2,
    });
    kit.geometry("screen", glassGeometry, new THREE.Matrix4().makeTranslation(0, 0, -0.65), 0x1b2328, "keep");
    glassGeometry.dispose();
    rbox(kit, "gloss", -0.52, 1.74, 0, 2.26, 0.07, 1.4, 0.03, paint);
    for (const [x0, x1] of [
      [-1.69, -1.52],
      [-1.02, -0.9],
      [-0.16, -0.04],
    ] as const)
      kit.box("gloss", x0, 0.98, -0.705, x1, 1.72, 0.705, paint);
    const aLength = Math.hypot(0.64, 0.72);
    kit.within(trs(0.92, 1.36, 0, 0, 0, -Math.atan2(0.72, 0.64)), () =>
      kit.box("gloss", -aLength / 2, -0.035, -0.705, aLength / 2, 0.035, 0.705, paint),
    );
    // Lower trim, bumpers, grille, lamps, plates.
    for (const s of [-1, 1]) kit.box("matte", -1.5, 0.25, s * 0.735 - 0.01, 1.5, 0.33, s * 0.735 + 0.01, trim);
    kit.box("satin", 1.62, 0.27, -0.72, 1.71, 0.44, 0.72, 0x2a2b2d);
    kit.box("satin", -1.71, 0.27, -0.72, -1.62, 0.44, 0.72, 0x2a2b2d);
    kit.box("screen", 1.66, 0.6, -0.36, 1.71, 0.76, 0.36, 0x16181a);
    for (let i = 0; i < 4; i++)
      kit.box("chrome", 1.705, 0.62 + i * 0.04, -0.34, 1.712, 0.63 + i * 0.04, 0.34, 0x9a9da0);
    for (const s of [-1, 1]) {
      rbox(kit, "lamp", 1.66, 0.86, s * 0.52, 0.08, 0.13, 0.34, 0.04, 0xe8eef2);
      kit.box("gloss", -1.72, 0.98, s * 0.62 - 0.08, -1.69, 1.42, s * 0.62 + 0.08, 0x9c1a18);
      rbox(kit, "gloss", 0.66, 1.06, s * 0.8, 0.14, 0.11, 0.12, 0.03, paint);
      kit.box("screen", 0.6, 1.02, s * 0.855, 0.72, 1.1, s * 0.862, 0x2a3338);
      // Door seams, handles, sliding-door rail.
      for (const sx of [0.92, -0.12, -1.0])
        kit.box("matte", sx - 0.004, 0.3, s * 0.733 - 0.003, sx + 0.004, 0.98, s * 0.733 + 0.003, 0x55575a);
      for (const hx of [0.4, -0.72]) kit.box("chrome", hx - 0.08, 0.86, s * 0.735, hx, 0.89, s * 0.745, 0xb5b8ba);
      kit.box("matte", -1.55, 0.97, s * 0.72, -0.95, 0.99, s * 0.735, 0x3a3c3e);
    }
    for (const px of [1.715, -1.715]) {
      kit.box("satin", px - 0.005, 0.44, -0.17, px + 0.005, 0.58, 0.17, 0xf1c21b);
      for (let i = 0; i < 4; i++)
        kit.box(
          "matte",
          px + Math.sign(px) * 0.005,
          0.47,
          -0.12 + i * 0.07,
          px + Math.sign(px) * 0.007,
          0.54,
          -0.08 + i * 0.07,
          0x1f3a2a,
        );
    }
    // Wheels: tyre, alloy rim, dark arch lining.
    for (const wx of [-1.12, 1.12])
      for (const s of [-1, 1]) {
        cylinder(kit, "matte", wx, 0.28, s * 0.63, 0.28, 0.28, 0.18, 0x1a1a1a, 28, new THREE.Euler(Math.PI / 2, 0, 0));
        cylinder(
          kit,
          "metal",
          wx,
          0.28,
          s * 0.725,
          0.17,
          0.17,
          0.012,
          0xa4a8ab,
          20,
          new THREE.Euler(Math.PI / 2, 0, 0),
        );
        for (let k = 0; k < 5; k++)
          kit.within(trs(wx, 0.28, s * 0.733, 0, 0, (k / 5) * Math.PI * 2), () =>
            kit.box("metal", -0.015, 0.03, -0.004, 0.015, 0.16, 0.004, 0x8e9295),
          );
        const arch = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 20, 1, true, -Math.PI / 2, Math.PI);
        kit.geometry(
          "matte",
          arch,
          trs(wx, 0.3, s * 0.64, Math.PI / 2, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI)),
          trim,
          "keep",
        );
        arch.dispose();
      }
    kit.solid(-1.75, -0.8, 1.75, 0.8, 0, 1.8);
  });
}

/** Stone gate post with a steel house-number plate, camera intercom, mail slot and a post light. */
function gate(kit: Kit) {
  const z1 = GATE_Z + 0.05,
    z0 = GATE_Z - 0.3;
  const x0 = 7.9,
    x1 = 8.45;
  kit.box("granite", x0, 0, z0, x1, 1.45, z1, 0x8f8a83);
  for (let y = 0.3; y < 1.4; y += 0.3)
    kit.box("matte", x0 - 0.002, y - 0.004, z0 - 0.002, x1 + 0.002, y + 0.004, z1 + 0.002, 0x5d5953);
  kit.box("granite", x0 - 0.03, 1.45, z0 - 0.03, x1 + 0.03, 1.5, z1 + 0.03, 0xb4afa6);
  kit.solid(x0, z0, x1, z1, 0, 1.5);
  // House number plate: brushed steel with raised numerals (no family name).
  kit.box("metal", 8.0, 1.14, z1, 8.35, 1.3, z1 + 0.008, 0xc9ccce);
  const digit = (x: number, segments: [number, number, number, number][]) => {
    for (const [a, b, c, d] of segments)
      kit.box("matte", x + a, 1.17 + b, z1 + 0.008, x + c, 1.17 + d, z1 + 0.012, 0x2a2a2a);
  };
  digit(8.06, [
    [0, 0.09, 0.05, 0.1],
    [0.04, 0.05, 0.05, 0.1],
    [0, 0.045, 0.05, 0.055],
    [0.04, 0, 0.05, 0.05],
    [0, 0, 0.05, 0.01],
  ]);
  digit(8.14, [[0, 0.045, 0.05, 0.055]]);
  digit(8.22, [
    [0.02, 0, 0.03, 0.1],
    [0.005, 0.085, 0.02, 0.1],
  ]);
  // Intercom with camera, speaker holes and a lit call button.
  kit.at(8.175, 0.98, z1, 0, () => {
    rbox(kit, "satin", 0, 0, 0.015, 0.1, 0.17, 0.03, 0.01, 0x2d2e30);
    cylinder(kit, "screen", 0, 0.05, 0.031, 0.014, 0.014, 0.004, 0x0b0d0f, 16, new THREE.Euler(Math.PI / 2, 0, 0));
    for (let i = 0; i < 9; i++)
      cylinder(
        kit,
        "matte",
        -0.02 + (i % 3) * 0.02,
        0.0 - Math.floor(i / 3) * 0.015,
        0.031,
        0.003,
        0.003,
        0.002,
        0x0e0e0e,
        6,
        new THREE.Euler(Math.PI / 2, 0, 0),
      );
    cylinder(kit, "satin", 0, -0.055, 0.031, 0.02, 0.02, 0.006, 0x5a5c5e, 20, new THREE.Euler(Math.PI / 2, 0, 0));
    cylinder(kit, "lamp", 0, -0.055, 0.0345, 0.012, 0.012, 0.002, 0x7fb9ff, 20, new THREE.Euler(Math.PI / 2, 0, 0));
  });
  // Built-in mailbox slot with a hinged flap.
  kit.box("metal", 8.0, 0.66, z1, 8.35, 0.74, z1 + 0.01, 0x3b3a38);
  kit.box("metal", 8.02, 0.685, z1 + 0.01, 8.33, 0.725, z1 + 0.018, 0x2c2b29);
  // Post light on the cap.
  kit.at(8.175, 1.5, GATE_Z - 0.12, 0, () => {
    kit.box("sash", -0.05, 0, -0.05, 0.05, 0.03, 0.05, 0x2e2b28);
    kit.box("lamp", -0.04, 0.03, -0.04, 0.04, 0.2, 0.04, 0xfff0d8);
    kit.box("sash", -0.055, 0.2, -0.055, 0.055, 0.23, 0.055, 0x2e2b28);
  });
  // Aluminium gate leaves, swung open against the posts.
  const leaf = (hingeX: number, dir: number) =>
    kit.at(hingeX, 0.05, GATE_Z - 0.12, 0, () => {
      kit.box("sash", -0.02, 0, 0, 0.02, 1.1, -0.74, 0x3a3531);
      for (let y = 0.06; y < 1.08; y += 0.09) kit.box("sash", -0.012, y, -0.02, 0.012, y + 0.06, -0.72, 0x4a4540);
      kit.box("chrome", dir * 0.02, 0.8, -0.66, dir * 0.05, 0.84, -0.6, 0x9a9da0);
      kit.solid(-0.03, -0.75, 0.03, 0, -0.05, 1.1);
    });
  leaf(8.49, 1);
  leaf(9.96, -1);
}

/** Kasuga-style stone lantern built from hexagonal turnings. */
function stoneLantern(kit: Kit, x: number, z: number) {
  const stone = 0xa29d94;
  lathe(
    kit,
    "granite",
    [
      [0, 0],
      [0.3, 0],
      [0.3, 0.1],
      [0.24, 0.16],
      [0, 0.16],
    ],
    x,
    0,
    z,
    stone,
    6,
  );
  lathe(
    kit,
    "granite",
    [
      [0, 0],
      [0.09, 0],
      [0.08, 0.6],
      [0, 0.6],
    ],
    x,
    0.16,
    z,
    stone,
    12,
  );
  lathe(
    kit,
    "granite",
    [
      [0, 0],
      [0.14, 0],
      [0.24, 0.08],
      [0.24, 0.13],
      [0, 0.13],
    ],
    x,
    0.76,
    z,
    stone,
    6,
  );
  lathe(
    kit,
    "granite",
    [
      [0, 0],
      [0.17, 0],
      [0.17, 0.26],
      [0, 0.26],
    ],
    x,
    0.89,
    z,
    stone,
    6,
  );
  for (const a of [0, Math.PI])
    kit.within(trs(x, 1.02, z, 0, a, 0), () => kit.box("matte", -0.07, -0.08, 0.14, 0.07, 0.08, 0.152, 0x1b1a18));
  lathe(
    kit,
    "granite",
    [
      [0, 0],
      [0.4, -0.02],
      [0.42, 0.02],
      [0.34, 0.05],
      [0.1, 0.17],
      [0, 0.18],
    ],
    x,
    1.15,
    z,
    stone,
    6,
  );
  lathe(
    kit,
    "granite",
    [
      [0, 0],
      [0.05, 0],
      [0.07, 0.05],
      [0.04, 0.1],
      [0.012, 0.14],
      [0, 0.15],
    ],
    x,
    1.33,
    z,
    stone,
    16,
  );
  kit.solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 1.5);
}

/** A step-through city bicycle with a front basket and rear rack. */
function bicycle(kit: Kit, x: number, z: number, yaw: number) {
  kit.at(x, 0, z, yaw, () => {
    const frame = 0xd9d0bb;
    for (const wx of [-0.52, 0.52]) {
      kit.geometry("matte", new THREE.TorusGeometry(0.31, 0.022, 8, 40), trs(wx, 0.33, 0), 0x1a1a1a, "keep");
      kit.geometry("metal", new THREE.TorusGeometry(0.285, 0.008, 6, 40), trs(wx, 0.33, 0), 0xbfc2c4, "keep");
      for (let k = 0; k < 16; k++)
        kit.within(trs(wx, 0.33, 0, 0, 0, (k / 16) * Math.PI * 2), () =>
          kit.box("metal", -0.0015, 0, -0.0015, 0.0015, 0.28, 0.0015, 0xc9cbcd),
        );
      cylinder(kit, "metal", wx, 0.33, 0, 0.02, 0.02, 0.07, 0x9a9da0, 10, new THREE.Euler(Math.PI / 2, 0, 0));
      // Mudguards.
      kit.geometry(
        "satin",
        new THREE.TorusGeometry(0.34, 0.025, 4, 24, Math.PI * 0.75),
        trs(wx, 0.33, 0, 0, 0, wx < 0 ? 0.2 : Math.PI * 0.05),
        frame,
        "keep",
      );
    }
    const v = (a: number, b: number) => new THREE.Vector3(a, b, 0);
    tube(kit, "satin", [v(0.43, 0.9), v(0.36, 0.62), v(0.1, 0.38), v(-0.24, 0.36)], 0.02, frame);
    tube(kit, "satin", [v(-0.24, 0.36), v(-0.3, 0.62), v(-0.33, 0.84)], 0.018, frame);
    tube(kit, "satin", [v(-0.24, 0.36), v(-0.52, 0.33)], 0.012, frame);
    tube(kit, "satin", [v(-0.3, 0.72), v(-0.52, 0.33)], 0.012, frame);
    tube(kit, "metal", [v(0.44, 0.88), v(0.48, 0.6), v(0.52, 0.33)], 0.012, 0xbfc2c4);
    tube(kit, "metal", [v(0.43, 0.9), v(0.41, 1.02)], 0.012, 0xbfc2c4);
    tube(
      kit,
      "metal",
      [
        new THREE.Vector3(0.3, 1.04, -0.28),
        new THREE.Vector3(0.4, 1.02, -0.12),
        new THREE.Vector3(0.41, 1.02, 0.12),
        new THREE.Vector3(0.3, 1.04, 0.28),
      ],
      0.011,
      0xbfc2c4,
    );
    for (const s of [-1, 1])
      cylinder(kit, "matte", 0.3, 1.04, s * 0.24, 0.018, 0.018, 0.1, 0x2a2a2a, 10, new THREE.Euler(Math.PI / 2, 0, 0));
    rbox(kit, "satin", -0.34, 0.88, 0, 0.26, 0.07, 0.17, 0.035, 0x3b2d25);
    // Front wire basket.
    kit.at(0.58, 0.82, 0, 0, () => {
      for (let i = 0; i <= 4; i++) {
        kit.box("metal", -0.14, 0, -0.17 + i * 0.085, 0.14, 0.22, -0.168 + i * 0.085, 0x9a9da0);
        kit.box("metal", -0.14 + i * 0.07, 0, -0.17, -0.138 + i * 0.07, 0.22, 0.17, 0x9a9da0);
      }
      kit.box("metal", -0.14, 0, -0.17, 0.14, 0.004, 0.17, 0x9a9da0);
    });
    kit.box("metal", -0.72, 0.72, -0.08, -0.36, 0.73, 0.08, 0x9a9da0);
    tube(kit, "metal", [v(-0.36, 0.72), v(-0.52, 0.34)], 0.007, 0x9a9da0);
    tube(kit, "metal", [v(-0.5, 0.3), v(-0.62, 0.02)], 0.008, 0x9a9da0);
    kit.solid(-0.85, -0.3, 0.75, 0.3, 0, 1.1);
  });
}

function exteriorFittings(kit: Kit) {
  // Air-conditioner line covers rising from the west condensers.
  const duct = (z: number, top: number) => {
    const c = 0xe9e4d6;
    kit.box("satin", -0.5, 0.42, z - 0.045, -0.12, 0.5, z + 0.045, c);
    kit.box("satin", -0.21, 0.42, z - 0.045, -0.12, top, z + 0.045, c);
    rbox(kit, "satin", -0.16, top + 0.03, z, 0.1, 0.1, 0.12, 0.03, c);
    for (let y = 0.9; y < top; y += 0.9) kit.box("satin", -0.215, y, z - 0.05, -0.12, y + 0.02, z + 0.05, 0xdcd6c6);
  };
  duct(4.8, FL1 + 2.2);
  duct(2.0, FL2 + 2.1);
  // Vent hoods on the north wall: range hood, washroom, bath, toilets.
  const hood = (x: number, y: number) =>
    kit.at(x, y, -0.115, Math.PI, () => {
      cylinder(kit, "satin", 0, 0, 0.05, 0.07, 0.07, 0.1, 0xe4e0d6, 20, new THREE.Euler(Math.PI / 2, 0, 0));
      lathe(
        kit,
        "satin",
        [
          [0, 0],
          [0.11, 0],
          [0.11, 0.12],
          [0.1, 0.12],
          [0.1, 0.01],
          [0, 0.01],
        ],
        0,
        -0.06,
        0.1,
        0xe4e0d6,
        20,
        new THREE.Vector3(1, 1, 0.7),
      );
    });
  hood(2.1, FL1 + 2.15);
  hood(6.25, FL1 + 2.15);
  hood(8.0, FL1 + 2.15);
  hood(9.25, FL1 + 2.15);
  hood(9.25, FL2 + 2.05);
  // Entrance wall lamp beside the door, under the balcony.
  kit.at(8.33, 2.0, D + 0.115, 0, () => {
    kit.box("sash", -0.05, -0.1, 0, 0.05, 0.1, 0.02, 0x2e2b28);
    kit.box("sash", -0.06, -0.12, 0.02, 0.06, -0.1, 0.14, 0x2e2b28);
    kit.box("lamp", -0.05, -0.1, 0.03, 0.05, 0.12, 0.13, 0xfff0d8);
    kit.box("sash", -0.06, 0.12, 0.02, 0.06, 0.14, 0.14, 0x2e2b28);
  });
  // Gas meter with yellow pipework on the east side.
  kit.at(W + 0.115, 0.55, 2.2, Math.PI / 2, () => {
    rbox(kit, "satin", 0, 0.15, 0.1, 0.24, 0.3, 0.18, 0.02, 0xd8d6cf);
    kit.box("glass", -0.07, 0.18, 0.19, 0.07, 0.24, 0.192, 0xffffff);
    for (const px of [-0.08, 0.08]) cylinder(kit, "satin", px, -0.55, 0.08, 0.018, 0.018, 0.55, 0xc9b25a, 10);
  });
  // Porch planters.
  plant(kit, 8.15, 0.18, D + 1.0, 0.7, 101, 0x5d534a);
  plant(kit, 9.95, 0.18, D + 1.0, 0.55, 103, 0x5d534a);
  stoneLantern(kit, 6.9, 9.5);
  bicycle(kit, 10.9, 8.65, 0);
  keiCar(kit, 12.3, 10.95, Math.PI / 2);
  gate(kit);
  // Roadside gutter: concrete lids with a steel grating every few metres.
  for (let x = -10; x < 20; x += 0.6)
    kit.box("matte", x - 0.004, 0.04, GATE_Z + 0.02, x + 0.004, 0.042, GATE_Z + 0.23, 0x77736c);
  for (let x = -9; x < 20; x += 3.6) {
    kit.box("metal", x, 0.036, GATE_Z + 0.02, x + 0.6, 0.043, GATE_Z + 0.23, 0x3a3a3a);
    for (let k = 0; k < 12; k++)
      kit.box(
        "matte",
        x + 0.02 + k * 0.048,
        0.043,
        GATE_Z + 0.03,
        x + 0.035 + k * 0.048,
        0.044,
        GATE_Z + 0.22,
        0x111111,
      );
  }
}

/** Framed print facing local +z; `cell` picks one of the four atlas images. */
function print(
  kit: Kit,
  x: number,
  y: number,
  z: number,
  yaw: number,
  w: number,
  h: number,
  cell: number,
  frame: number,
  mat = true,
) {
  kit.at(x, y, z, yaw, () => {
    const f = 0.025;
    if (frame >= 0) {
      kit.box("satin", -w / 2, -h / 2, 0, w / 2, -h / 2 + f, 0.025, frame);
      kit.box("satin", -w / 2, h / 2 - f, 0, w / 2, h / 2, 0.025, frame);
      kit.box("satin", -w / 2, -h / 2 + f, 0, -w / 2 + f, h / 2 - f, 0.025, frame);
      kit.box("satin", w / 2 - f, -h / 2 + f, 0, w / 2, h / 2 - f, 0.025, frame);
      kit.box("matte", -w / 2 + f, -h / 2 + f, 0.004, w / 2 - f, h / 2 - f, 0.008, mat ? 0xf6f3ec : 0xffffff);
    }
    const inset = frame >= 0 ? (mat ? 0.07 : f) : 0;
    const u0 = (cell % 2) * 0.5,
      v1 = 1 - Math.floor(cell / 2) * 0.5,
      u1 = u0 + 0.5,
      v0 = v1 - 0.5;
    const ax = w / 2 - inset,
      ay = h / 2 - inset,
      z1 = frame >= 0 ? 0.009 : 0.002;
    // Crop the square image to the frame's aspect ratio.
    const aspect = ax / ay;
    const du = aspect < 1 ? (0.5 - 0.5 * aspect) / 2 : 0,
      dv = aspect > 1 ? (0.5 - 0.5 / aspect) / 2 : 0;
    kit.quad(
      "art",
      [
        [-ax, -ay, z1],
        [ax, -ay, z1],
        [ax, ay, z1],
        [-ax, ay, z1],
      ],
      [
        [u0 + du, v0 + dv],
        [u1 - du, v0 + dv],
        [u1 - du, v1 - dv],
        [u0 + du, v1 - dv],
      ],
      0xffffff,
      [0, 0, 1],
    );
  });
}

function interiorDetails(kit: Kit) {
  print(kit, 3.58, FL2 + 1.47, 4.75, -Math.PI / 2, 0.95, 0.62, 0, 0x2b2622);
  print(kit, 3.7, FL2 + 1.45, 5.9, Math.PI / 2, 0.5, 0.5, 2, 0xe9e2d2);
  print(kit, 7.34 + 0.06, FL2 + 1.45, 5.4, Math.PI / 2, 0.42, 0.58, 1, 0x7a5a42);
  print(kit, 9 * 0.91 + 0.06, DOMA + 1.6, 6.35, Math.PI / 2, 0.5, 0.62, 2, 0x2b2622);
  print(kit, 4.49, FL1 + 1.55, 1.25, -Math.PI / 2, 0.3, 0.4, 1, 0xc8a071, false);
  // Kitchen calendar hanging on a pin.
  print(kit, 4.488, FL1 + 1.4, 3.95, -Math.PI / 2, 0.3, 0.42, 3, -1);
  cylinder(kit, "metal", 4.47, FL1 + 1.63, 3.95, 0.006, 0.006, 0.02, 0x9a9da0, 8, new THREE.Euler(0, 0, Math.PI / 2));
  // Rolled bath lid resting across the tub end.
  cylinder(
    kit,
    "satin",
    7 * 0.91 + 0.2,
    FL1 + 0.65,
    0.47,
    0.1,
    0.1,
    0.72,
    0xdfe6e8,
    24,
    new THREE.Euler(Math.PI / 2, 0, 0),
  );
}

export function buildDetails(kit: Kit) {
  exteriorFittings(kit);
  interiorDetails(kit);
}
