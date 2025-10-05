// SPI — TypeScript module (color-aware)
// Usage: compile to JS and reference in HTML with:
// <script type="module" src="spi_app.js"></script>

// ---------- Types ----------
interface Point { x: number; y: number; r: number; g: number; b: number; }
interface Elements {
  file: HTMLInputElement; maxSize: HTMLInputElement; pou: HTMLSelectElement;
  nPoints: HTMLInputElement; q: HTMLInputElement; kneigh: HTMLInputElement; radius: HTMLInputElement;
  dx: HTMLInputElement; dy: HTMLInputElement; sample: HTMLButtonElement; reconstruct: HTMLButtonElement;
  stop: HTMLButtonElement; download: HTMLButtonElement; status: HTMLElement; npts: HTMLElement;
  psnr: HTMLElement; pct: HTMLElement; orig: HTMLCanvasElement; reco: HTMLCanvasElement; mask: HTMLCanvasElement;
  bar: HTMLElement;
}

// ---------- Helpers ----------
const psnr = (mse: number, max = 255) => 10 * Math.log10((max * max) / (mse || 1e-12));
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- Spatial grid ----------
class Grid {
  w: number; h: number; cell: number; cols: number; rows: number; bins: number[][];
  constructor(w: number, h: number, cell: number) {
    this.w = w; this.h = h; this.cell = Math.max(1, cell | 0);
    this.cols = Math.ceil(w / this.cell); this.rows = Math.ceil(h / this.cell);
    this.bins = new Array(this.cols * this.rows).fill(0).map(() => []);
  }
  key(x: number, y: number) { return ((y / this.cell) | 0) * this.cols + ((x / this.cell) | 0); }
  clear() { for (const b of this.bins) b.length = 0; }
  insert(id: number, x: number, y: number) { this.bins[this.key(x, y)].push(id); }
  forRadius(x: number, y: number, R: number, cb: (id: number) => void) {
    const c = this.cell, cols = this.cols, rows = this.rows;
    const xmin = Math.max(0, ((x - R) / c) | 0), xmax = Math.min(cols - 1, ((x + R) / c) | 0);
    const ymin = Math.max(0, ((y - R) / c) | 0), ymax = Math.min(rows - 1, ((y + R) / c) | 0);
    for (let cy = ymin; cy <= ymax; cy++) for (let cx = xmin; cx <= xmax; cx++) {
      const bin = this.bins[cy * cols + cx]; for (const id of bin) cb(id);
    }
  }
}
class SpacingGrid extends Grid {
  points: Point[] = [];
  constructor(W: number, H: number, q: number) { super(W, H, Math.max(1, q)); }
  rebuild(points: Point[]) { this.points = points; for (const b of this.bins) b.length = 0; points.forEach((p, i) => this.insert(i, p.x, p.y)); }
}

// ---------- SPI local eval (per channel) ----------
function spiLocalAtChannel(
  x: number, y: number,
  X: Int16Array, Y: Int16Array, V: Float32Array,
  gridPts: Grid, kneigh: number, R: number, normalize: boolean
): number {
  const kClosestCenters = (x0: number, y0: number, k: number) => {
    let Rloc = R; const out: number[] = []; const seen = new Set<number>();
    const lim = Math.max(gridPts.w, gridPts.h) * 2;
    while (out.length < k && Rloc < lim) {
      gridPts.forRadius(x0, y0, Rloc, (id) => { if (!seen.has(id)) { seen.add(id); out.push(id); } });
      Rloc *= 2;
    }
    return out.slice(0, k);
  };
  const neighborsWithin = (x0: number, y0: number, R0: number) => {
    const arr: number[] = []; gridPts.forRadius(x0, y0, R0, (id) => {
      const dx = X[id] - x0, dy = Y[id] - y0; if (dx * dx + dy * dy <= R0 * R0) arr.push(id);
    }); return arr;
  };

  const centers = kClosestCenters(x, y, kneigh);
  let Fsum = 0, Wsum = 0; const aroundP = neighborsWithin(x, y, R);
  for (const i of centers) {
    const aroundI = neighborsWithin(X[i], Y[i], R);
    const J = new Set<number>([...aroundI, ...aroundP]); J.delete(i);
    let w = 1.0;
    for (const j of J) {
      const dxpj = (X[j] - x), dypj = (Y[j] - y); const dppj = dxpj * dxpj + dypj * dypj;
      const dxij = (X[j] - X[i]), dyij = (Y[j] - Y[i]); const dpij = dxij * dxij + dyij * dyij;
      const denom = dppj + dpij; if (denom === 0) continue; const frac = dppj / denom;
      const s = Math.sin(Math.PI * frac); w *= s; if (w === 0) break;
    }
    Fsum += V[i] * w; Wsum += w;
  }
  return normalize ? (Wsum !== 0 ? Fsum / (Wsum + 1e-12) : 0) : Fsum;
}

// ---------- Module state ----------
let W = 0, H = 0;
let Rimg: Float32Array | null = null, Gimg: Float32Array | null = null, Bimg: Float32Array | null = null;
let points: Point[] = [];
let running = false;

// ---------- Core actions ----------
function onImageLoaded(img: HTMLImageElement, els: Elements) {
  const maxSize = +els.maxSize.value; const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  W = Math.max(1, (img.width * ratio) | 0); H = Math.max(1, (img.height * ratio) | 0);
  const c = els.orig; c.width = W; c.height = H; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, W, H);
  const data = g.getImageData(0, 0, W, H).data;
  Rimg = new Float32Array(W * H); Gimg = new Float32Array(W * H); Bimg = new Float32Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) { Rimg[p] = data[i]; Gimg[p] = data[i + 1]; Bimg[p] = data[i + 2]; }
  for (const id of ['reco', 'mask'] as const) { const cc = els[id]; cc.width = W; cc.height = H; cc.getContext('2d')!.clearRect(0, 0, W, H); }
  points = []; updateMask(els); els.npts.textContent = '0'; els.psnr.textContent = '–';
  els.sample.disabled = false; els.reconstruct.disabled = true; els.download.disabled = true; els.stop.disabled = true;
  els.bar.style.width = '0%'; els.pct.textContent = '0%'; els.status.textContent = 'Image prête. Choisis N et q puis « Sélectionner N points ».';
}

function updateMask(els: Elements) {
  const ctx = els.mask.getContext('2d')!; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H); const d = img.data;
  for (const p of points) { const idx = (p.y * W + p.x) * 4; d[idx] = d[idx + 1] = d[idx + 2] = 255; d[idx + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}

function randomInt(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }

function selectRandomWithMinDist(N: number, q: number, els: Elements): Point[] {
  if (!Rimg || !Gimg || !Bimg) return [];
  const pts: Point[] = []; const spacing = new SpacingGrid(W, H, q); const maxTries = N * 50; let tries = 0;
  while (pts.length < N && tries < maxTries) {
    tries++; const x = randomInt(0, W - 1), y = randomInt(0, H - 1);
    let ok = true; spacing.forRadius(x, y, q, (id) => { const p = spacing.points[id]; const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy <= q * q) ok = false; });
    if (!ok) continue; const idx = y * W + x; pts.push({ x, y, r: Rimg[idx], g: Gimg[idx], b: Bimg[idx] }); spacing.rebuild(pts);
    if (pts.length % 500 === 0) { const pct = Math.round((pts.length / N) * 100); els.bar.style.width = pct + '%'; els.pct.textContent = pct + '%'; }
  }
  return pts;
}

async function reconstructBlocks(els: Elements) {
  if (!Rimg || !Gimg || !Bimg || points.length === 0 || running) return; running = true;
  els.stop.disabled = false; els.sample.disabled = true; els.reconstruct.disabled = true; els.download.disabled = true; els.status.textContent = 'Reconstruction en cours…';
  const normalize = els.pou.value === '1'; const kneigh = +els.kneigh.value | 0; const R = +els.radius.value | 0; const dx = +els.dx.value | 0; const dy = +els.dy.value | 0;
  const ctx = els.reco.getContext('2d')!; ctx.clearRect(0, 0, W, H);
  const X = new Int16Array(points.length), Y = new Int16Array(points.length);
  const VR = new Float32Array(points.length), VG = new Float32Array(points.length), VB = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) { X[i] = points[i].x; Y[i] = points[i].y; VR[i] = points[i].r; VG[i] = points[i].g; VB[i] = points[i].b; }
  const gridPts = new Grid(W, H, Math.max(2, Math.floor(R / 1.5)));
  for (let i = 0; i < points.length; i++) gridPts.insert(i, X[i], Y[i]);

  const nRows = Math.ceil(H / dy), nCols = Math.ceil(W / dx); const total = nRows * nCols; let done = 0;
  for (let ry = 0; ry < nRows && running; ry++) {
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    for (let rx = 0; rx < nCols && running; rx++) {
      const x0 = rx * dx, y0 = ry * dy; const cx = x0 + Math.floor(dx / 2), cy = y0 + Math.floor(dy / 2);
      const rVal = spiLocalAtChannel(cx, cy, X, Y, VR, gridPts, kneigh, R, normalize);
      const gVal = spiLocalAtChannel(cx, cy, X, Y, VG, gridPts, kneigh, R, normalize);
      const bVal = spiLocalAtChannel(cx, cy, X, Y, VB, gridPts, kneigh, R, normalize);
      ctx.fillStyle = `rgb(${rVal | 0},${gVal | 0},${bVal | 0})`;
      ctx.fillRect(x0, y0, Math.min(dx, W - x0), Math.min(dy, H - y0));
      done++;
    }
    const p = Math.round((done / total) * 100); els.bar.style.width = p + '%'; els.pct.textContent = p + '%'; els.status.textContent = `Reconstruction… ${p}%`;
  }

  // PSNR over RGB (mean over channels)
  const imgData = ctx.getImageData(0, 0, W, H).data; let mse = 0, Npx = W * H;
  for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
    const dr = (Rimg[p] - imgData[i]);
    const dg = (Gimg[p] - imgData[i + 1]);
    const db = (Bimg[p] - imgData[i + 2]);
    mse += (dr * dr + dg * dg + db * db) / 3;
  }
  mse /= Npx; els.psnr.textContent = psnr(mse).toFixed(2);
  els.status.textContent = running ? 'Reconstruction terminée.' : 'Arrêté.';
  running = false; els.stop.disabled = true; els.sample.disabled = false; els.reconstruct.disabled = false; els.download.disabled = false;
}

// ---------- Public init ----------
export default function initSPI() {
  const els: Elements = {
    file: byId<HTMLInputElement>('file'), maxSize: byId<HTMLInputElement>('maxSize'), pou: byId<HTMLSelectElement>('pou'),
    nPoints: byId<HTMLInputElement>('nPoints'), q: byId<HTMLInputElement>('q'), kneigh: byId<HTMLInputElement>('kneigh'), radius: byId<HTMLInputElement>('radius'),
    dx: byId<HTMLInputElement>('dx'), dy: byId<HTMLInputElement>('dy'), sample: byId<HTMLButtonElement>('sample'), reconstruct: byId<HTMLButtonElement>('reconstruct'),
    stop: byId<HTMLButtonElement>('stop'), download: byId<HTMLButtonElement>('download'), status: byId('status'), npts: byId('npts'),
    psnr: byId('psnr'), pct: byId('pct'), orig: byId<HTMLCanvasElement>('orig'), reco: byId<HTMLCanvasElement>('reco'), mask: byId<HTMLCanvasElement>('mask'),
    bar: byId('bar'),
  };

  els.file.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; const img = new Image();
    img.onload = () => { onImageLoaded(img, els); };
    img.src = URL.createObjectURL(f);
  });

  els.sample.addEventListener('click', () => {
    const N = +els.nPoints.value | 0; const q = +els.q.value | 0; els.status.textContent = 'Sélection des points…';
    points = selectRandomWithMinDist(N, q, els);
    els.npts.textContent = points.length.toString(); els.status.textContent = `Sélectionné ${points.length} points (q=${q}).`;
    updateMask(els); els.reconstruct.disabled = points.length === 0; els.download.disabled = points.length === 0;
    els.stop.disabled = true; els.bar.style.width = '0%'; els.pct.textContent = '0%';
  });

  els.reconstruct.addEventListener('click', () => reconstructBlocks(els));
  els.stop.addEventListener('click', () => { if (running) { running = false; els.status.textContent = 'Arrêt demandé…'; }});
  els.download.addEventListener('click', () => {
    const meta = { W, H, normalize: (byId<HTMLSelectElement>('pou').value === '1'), q: +byId<HTMLInputElement>('q').value, k: +byId<HTMLInputElement>('kneigh').value, R: +byId<HTMLInputElement>('radius').value, dx: +byId<HTMLInputElement>('dx').value, dy: +byId<HTMLInputElement>('dy').value };
    const blob = new Blob([JSON.stringify({ meta, points }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spi_points.json'; a.click();
  });
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSPI());
} else {
  initSPI();
}
