import type { Preset } from './preset';

/** Endpoints of the fragment shader's linear noise threshold for this brush. */
export function wearThreshold(noise: number, rough: number): number {
  return .5 + rough * (.04 + .92 * noise - .5);
}

/** Screen-space wear, bottom row first to match the shader's viewport UV. */
export class WearGrid {
  readonly columns = 192;
  readonly rows: number;
  readonly pixels: Uint8Array<ArrayBuffer>;
  private readonly value: Float32Array;
  private fromX = NaN;
  private fromY = NaN;
  private toX = NaN;
  private toY = NaN;
  active = false;
  firstRow = 0;
  lastRow = 0;

  constructor(aspect: number, private readonly lifetime: number,
    private readonly brush: Pick<Preset['photo'], 'lens' | 'lensSoftness'>) {
    this.rows = Math.max(1, Math.round(this.columns / aspect));
    this.value = new Float32Array(this.columns * this.rows);
    this.pixels = new Uint8Array(this.value.length);
  }

  /** Coalesce mouse events until the next draw, retaining the last stamped endpoint. */
  move(u: number, v: number): boolean {
    this.toX = u * this.columns;
    this.toY = v * this.rows;
    if (Number.isNaN(this.fromX)) {
      this.fromX = this.toX;
      this.fromY = this.toY;
    }
    return this.moved();
  }

  private moved(): boolean {
    return Math.hypot(this.toX - this.fromX, this.toY - this.fromY) > .05;
  }

  private stamp(): void {
    const radius = this.brush.lens * this.rows / 2;
    const soft = Math.max(1e-6, this.brush.lensSoftness * radius);
    const x0 = Math.max(0, Math.floor(Math.min(this.fromX, this.toX) - radius));
    const y0 = Math.max(0, Math.floor(Math.min(this.fromY, this.toY) - radius));
    const x1 = Math.min(this.columns, Math.ceil(Math.max(this.fromX, this.toX) + radius));
    const y1 = Math.min(this.rows, Math.ceil(Math.max(this.fromY, this.toY) + radius));
    const dx = this.toX - this.fromX, dy = this.toY - this.fromY;
    const lengthSq = dx * dx + dy * dy;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const ax = x + .5 - this.fromX, ay = y + .5 - this.fromY;
        const t = Math.min(1, Math.max(0, (ax * dx + ay * dy) / lengthSq));
        const distance = Math.sqrt((ax - t * dx) ** 2 + (ay - t * dy) ** 2);
        const coverage = Math.min(1, Math.max(0, (radius - distance) / soft));
        const i = y * this.columns + x;
        this.value[i] = Math.max(this.value[i], Math.min(1, coverage * 1.35));
      }
    }
    this.fromX = this.toX;
    this.fromY = this.toY;
  }

  /** Return true only when the texture must be uploaded, including its final clear. */
  update(dt: number): boolean {
    const moved = this.moved();
    if (!this.active && !moved) return false;
    if (this.active) {
      const loss = dt / this.lifetime;
      for (let i = 0; i < this.value.length; i++) this.value[i] = Math.max(0, this.value[i] - loss);
    }
    if (moved) this.stamp();
    let first = this.value.length, last = -1;
    for (let i = 0; i < this.value.length; i++) {
      const byte = Math.round(this.value[i] * 255);
      this.pixels[i] = byte;
      if (byte > 0) {
        if (first > i) first = i;
        last = i;
      }
    }
    this.active = last >= first;
    this.firstRow = Math.floor(first / this.columns);
    this.lastRow = Math.floor(last / this.columns);
    return true;
  }

  end(clear = false): void {
    this.fromX = this.fromY = this.toX = this.toY = NaN;
    if (clear && this.active) {
      this.value.fill(0);
      this.pixels.fill(0);
      this.active = false;
    }
  }
}
