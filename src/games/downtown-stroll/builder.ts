import * as THREE from "three";

type Vec3 = [number, number, number];

/** Accumulates triangles in world space so each material becomes a single draw call. */
export class Builder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private seeds: number[] = [];
  private indices: number[] = [];

  get empty() {
    return this.indices.length === 0;
  }

  /** Quad from corners in counter-clockwise order as seen from the front. */
  quad(corners: [Vec3, Vec3, Vec3, Vec3], normal: Vec3, uvs: [number, number][], color: THREE.Color, seed = 0) {
    const base = this.positions.length / 3;
    corners.forEach((corner, i) => {
      this.positions.push(...corner);
      this.normals.push(...normal);
      this.uvs.push(...uvs[i]!);
      this.colors.push(color.r, color.g, color.b);
      this.seeds.push(seed);
    });
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Vertical wall. `left` and `right` are the bottom corners as seen from outside;
   * u runs along the wall in `uScale` units and v runs up from `vBase` in `vScale` units.
   */
  wall(
    left: [number, number],
    right: [number, number],
    y0: number,
    y1: number,
    color: THREE.Color,
    opts: { uScale?: number; vScale?: number; vBase?: number; uSnap?: number; seed?: number } = {},
  ) {
    const dx = right[0] - left[0];
    const dz = right[1] - left[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4 || y1 - y0 < 1e-4) return;
    const normal: Vec3 = [-dz / length, 0, dx / length];
    const u = opts.uSnap ? Math.max(1, Math.round(length / opts.uSnap)) : length / (opts.uScale ?? 1);
    const vScale = opts.vScale ?? 1;
    const vBase = opts.vBase ?? y0;
    const v0 = (y0 - vBase) / vScale;
    const v1 = (y1 - vBase) / vScale;
    this.quad(
      [
        [left[0], y0, left[1]],
        [right[0], y0, right[1]],
        [right[0], y1, right[1]],
        [left[0], y1, left[1]],
      ],
      normal,
      [
        [0, v0],
        [u, v0],
        [u, v1],
        [0, v1],
      ],
      color,
      opts.seed,
    );
  }

  /** Four walls of an axis-aligned prism. */
  walls(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    color: THREE.Color,
    opts: Parameters<Builder["wall"]>[5] = {},
  ) {
    this.wall([x0, z1], [x1, z1], y0, y1, color, opts);
    this.wall([x1, z1], [x1, z0], y0, y1, color, opts);
    this.wall([x1, z0], [x0, z0], y0, y1, color, opts);
    this.wall([x0, z0], [x0, z1], y0, y1, color, opts);
  }

  /** Horizontal face at height y with world-space planar UVs. */
  cap(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.Color, uvScale = 1, down = false) {
    const uv = (x: number, z: number): [number, number] => [x / uvScale, -z / uvScale];
    const corners: [Vec3, Vec3, Vec3, Vec3] = down
      ? [
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
        ]
      : [
          [x0, y, z1],
          [x1, y, z1],
          [x1, y, z0],
          [x0, y, z0],
        ];
    this.quad(
      corners,
      [0, down ? -1 : 1, 0],
      corners.map(([x, , z]) => uv(x, z)),
      color,
    );
  }

  /** Axis-aligned box with world-space UVs on every face. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: THREE.Color,
    uvScale = 1,
    bottom = false,
  ) {
    this.walls(x0, z0, x1, z1, y0, y1, color, { uScale: uvScale, vScale: uvScale, vBase: 0 });
    this.cap(x0, z0, x1, z1, y1, color, uvScale);
    if (bottom) this.cap(x0, z0, x1, z1, y0, color, uvScale, true);
  }

  /** Appends an arbitrary geometry transformed by a matrix. */
  geometry(source: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, seed = 0) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    geometry.applyMatrix4(matrix);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const base = this.positions.length / 3;
    for (let i = 0; i < position.count; i++) {
      this.positions.push(position.getX(i), position.getY(i), position.getZ(i));
      this.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      this.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.colors.push(color.r, color.g, color.b);
      this.seeds.push(seed);
      this.indices.push(base + i);
    }
    geometry.dispose();
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("seed", new THREE.Float32BufferAttribute(this.seeds, 1));
    geometry.setIndex(
      this.indices.length > 65535
        ? new THREE.Uint32BufferAttribute(this.indices, 1)
        : new THREE.Uint16BufferAttribute(this.indices, 1),
    );
    geometry.computeBoundingSphere();
    return geometry;
  }
}
