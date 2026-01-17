import { creerFunction, distance } from './spi.js';

const W = 256;
const H = 256;
const N = W * H;

const K = 32;
const MAX_R = 20;

let stopRequested = false;

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg?.type === 'stop') {
    stopRequested = true;
    return;
  }
  if (msg?.type === 'start') {
    stopRequested = false;
    run(msg).catch((err) => {
      self.postMessage({ type: 'error', message: String(err?.stack || err) });
    });
  }
};

function idxToXY(idx) {
  return { x: idx % W, y: (idx / W) | 0 };
}

function clampByte(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

function gatherNeighbors(pIdx, activeMask, channelValues) {
  const p = idxToXY(pIdx);
  const pts = [];

  if (activeMask[pIdx] === 1) {
    pts.push({ value: p, y: channelValues[pIdx] });
    if (pts.length >= K) return pts;
  }

  for (let r = 1; r <= MAX_R && pts.length < K; r++) {
    const x0 = p.x;
    const y0 = p.y;

    for (let dx = -r; dx <= r && pts.length < K; dx++) {
      const xTop = x0 + dx;
      const yTop = y0 - r;
      const yBot = y0 + r;

      if (xTop >= 0 && xTop < W) {
        if (yTop >= 0) {
          const id = yTop * W + xTop;
          if (activeMask[id] === 1) pts.push({ value: { x: xTop, y: yTop }, y: channelValues[id] });
        }
        if (pts.length < K && yBot < H) {
          const id = yBot * W + xTop;
          if (activeMask[id] === 1) pts.push({ value: { x: xTop, y: yBot }, y: channelValues[id] });
        }
      }
    }

    for (let dy = -r + 1; dy <= r - 1 && pts.length < K; dy++) {
      const ySide = y0 + dy;
      const xLeft = x0 - r;
      const xRight = x0 + r;

      if (ySide >= 0 && ySide < H) {
        if (xLeft >= 0) {
          const id = ySide * W + xLeft;
          if (activeMask[id] === 1) pts.push({ value: { x: xLeft, y: ySide }, y: channelValues[id] });
        }
        if (pts.length < K && xRight < W) {
          const id = ySide * W + xRight;
          if (activeMask[id] === 1) pts.push({ value: { x: xRight, y: ySide }, y: channelValues[id] });
        }
      }
    }
  }
  return pts;
}

function predictAt(pIdx, type, activeMask, channelValues) {
  const localPoints = gatherNeighbors(pIdx, activeMask, channelValues);
  if (localPoints.length === 0) return NaN;
  if (localPoints.length === 1) return localPoints[0].y;

  const f = creerFunction(type, localPoints, distance);
  return f(idxToXY(pIdx));
}

function removeAtActiveList(activeList, pos) {
  const last = activeList.length - 1;
  const tmp = activeList[pos];
  activeList[pos] = activeList[last];
  activeList.pop();
  return tmp;
}

async function simplifyChannel(channelName, type, ctx, channelValues) {
  const activeMask = new Uint8Array(N);
  activeMask.fill(1);

  const activeList = new Array(N);
  for (let i = 0; i < N; i++) activeList[i] = i;

  const removed = [];
  let nombreErreur = 0;
  let nbTest = 0;

  let lastSentTest = -1;
  let lastSentRetrait = -1;

  function maybeSendProgress(force = false) {
    if (force || nbTest - lastSentTest >= 250 || removed.length !== lastSentRetrait) {
      lastSentTest = nbTest;
      lastSentRetrait = removed.length;
      self.postMessage({ type: 'progress', channel: channelName, nbTest, nbRetrait: removed.length });
    }
  }

  maybeSendProgress(true);

  while (nombreErreur < ctx.nombreEssai && removed.length < ctx.nombreRetrait) {
    if (stopRequested) {
      maybeSendProgress(true);
      return { stopped: true };
    }
    if (activeList.length <= 1) break;

    const pickPos = (Math.random() * activeList.length) | 0;
    const candIdx = removeAtActiveList(activeList, pickPos);
    activeMask[candIdx] = 0;
    nbTest++;

    let ok = true;

    for (let k = 0; k < removed.length; k++) {
      const ridx = removed[k];
      const pred = predictAt(ridx, type, activeMask, channelValues);
      const y = channelValues[ridx];
      if (!Number.isFinite(pred) || Math.abs(pred - y) >= ctx.erreur) { ok = false; break; }
    }

    if (ok) {
      const pred = predictAt(candIdx, type, activeMask, channelValues);
      const y = channelValues[candIdx];
      if (!Number.isFinite(pred) || Math.abs(pred - y) >= ctx.erreur) ok = false;
    }

    if (ok) {
      removed.push(candIdx);
      nombreErreur = 0;
    } else {
      activeMask[candIdx] = 1;
      activeList.push(candIdx);
      nombreErreur++;
    }

    maybeSendProgress(false);
  }

  maybeSendProgress(true);
  return { stopped: false, activeMask, removedCount: removed.length, keptCount: activeList.length };
}

async function run(msg) {
  const { imageBuffer, type, ctx } = msg;

  const rgba = new Uint8ClampedArray(imageBuffer);
  if (rgba.length !== N * 4) throw new Error(`Buffer image inattendu: ${rgba.length} (attendu ${N * 4})`);

  const R = new Uint8Array(N);
  const G = new Uint8Array(N);
  const B = new Uint8Array(N);

  for (let i = 0, p = 0; p < N; p++, i += 4) {
    R[p] = rgba[i];
    G[p] = rgba[i + 1];
    B[p] = rgba[i + 2];
  }

  self.postMessage({ type: 'status', message: 'Simplification canal R…' });
  const rRes = await simplifyChannel('R', type, ctx, R);
  if (rRes.stopped) return self.postMessage({ type: 'stopped' });

  self.postMessage({ type: 'status', message: 'Simplification canal G…' });
  const gRes = await simplifyChannel('G', type, ctx, G);
  if (gRes.stopped) return self.postMessage({ type: 'stopped' });

  self.postMessage({ type: 'status', message: 'Simplification canal B…' });
  const bRes = await simplifyChannel('B', type, ctx, B);
  if (bRes.stopped) return self.postMessage({ type: 'stopped' });

  self.postMessage({
    type: 'kept',
    kept: { R: rRes.keptCount, G: gRes.keptCount, B: bRes.keptCount },
    removed: { R: rRes.removedCount, G: gRes.removedCount, B: bRes.removedCount },
  });

  self.postMessage({ type: 'status', message: 'Reconstruction…' });

  const out = new Uint8ClampedArray(N * 4);

  const rMask = rRes.activeMask;
  const gMask = gRes.activeMask;
  const bMask = bRes.activeMask;

  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const rv = rMask[p] ? R[p] : clampByte(predictAt(p, type, rMask, R));
    const gv = gMask[p] ? G[p] : clampByte(predictAt(p, type, gMask, G));
    const bv = bMask[p] ? B[p] : clampByte(predictAt(p, type, bMask, B));

    out[i] = rv;
    out[i + 1] = gv;
    out[i + 2] = bv;
    out[i + 3] = 255;

    if (stopRequested) {
      self.postMessage({ type: 'stopped' });
      return;
    }
    if ((p & 4095) === 0) self.postMessage({ type: 'reconProgress', done: p, total: N });
  }

  self.postMessage({ type: 'done', imageBuffer: out.buffer }, [out.buffer]);
}
