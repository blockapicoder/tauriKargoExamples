export type TypeFonction = "DP" | "RDP" | "SIN";

// Types (compatibles)
export interface PointFeature<T> {
  value: T;
  y: number;
}

export interface P {
  x: number;
  y: number;
}

// Distance euclidienne au carré dans R^2
export function distance(a: P, b: P): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/* ========================= WebGPU runtime ========================= */

type WebGpuState = {
  device: GPUDevice;
  queue: GPUQueue;
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
};

let _wgpu: WebGpuState | null = null;

/** Optionnel : appelle-le une fois au démarrage. Après, c'est transparent. */
export async function initWebGpu(): Promise<boolean> {
  try {
    const gpu = (globalThis as any).navigator?.gpu as GPU | undefined;
    if (!gpu) return false;

    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;

    const device = await adapter.requestDevice();
    const queue = device.queue;

    const shaderCode = /* wgsl */ `
struct Params {
  n: u32,
  typeId: u32,
  batch: u32,
  _pad: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> pointsXY: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> ys: array<f32>;
@group(0) @binding(3) var<storage, read> m: array<f32>;         // N*N (SIN), peut etre vide sinon
@group(0) @binding(4) var<storage, read> inputsXY: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> outY: array<f32>;

const PI: f32 = 3.141592653589793;

fn dist2(a: vec2<f32>, b: vec2<f32>) -> f32 {
  let d = a - b;
  return dot(d, d);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.batch) { return; }

  let p = inputsXY[idx];
  let n = params.n;
  let t = params.typeId;

  var result: f32 = 0.0;
  var s: f32 = 0.0;

  // Chaque invocation calcule un input complet, en boucles i/j.
  // Très efficace si batch grand (parallélisme sur inputs).
  for (var i: u32 = 0u; i < n; i = i + 1u) {
    let pi = pointsXY[i];
    let ri = dist2(p, pi);

    var W: f32 = 1.0;

    for (var j: u32 = 0u; j < n; j = j + 1u) {
      if (j == i) { continue; }

      let pj = pointsXY[j];
      let rj = dist2(p, pj);

      if (t == 1u) {               // DP
        W = W * rj;
      } else if (t == 2u) {        // RDP
        W = W * (rj / (ri + rj));
      } else {                      // SIN
        let mij = m[i * n + j];
        W = W * sin(PI * (rj / (rj + mij)));
      }
    }

    let yi = ys[i];
    s = s + W;
    result = result + W * yi;
  }

  outY[idx] = result / s;
}
`;

    const module = device.createShaderModule({ code: shaderCode });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    const pipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: "main" },
    });

    _wgpu = { device, queue, pipeline, bindGroupLayout };
    return true;
  } catch {
    _wgpu = null;
    return false;
  }
}

// Tentative de "sync" via Atomics.wait si disponible; sinon on retombe CPU (transparence).
function _canBlockWithAtomicsWait(): boolean {
  try {
    const sab = new SharedArrayBuffer(4);
    const ia = new Int32Array(sab);
    // timeout 0 => "timed-out" si autorisé, sinon throw
    Atomics.wait(ia, 0, 0, 0);
    return true;
  } catch {
    return false;
  }
}

function _mapReadSync(buf: GPUBuffer): ArrayBuffer {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);

  let err: unknown = null;

  buf.mapAsync(GPUMapMode.READ)
    .then(() => {
      Atomics.store(ia, 0, 1);
      Atomics.notify(ia, 0);
    })
    .catch((e) => {
      err = e;
      Atomics.store(ia, 0, 2);
      Atomics.notify(ia, 0);
    });

  // Boucle de blocage courte; on ne donne pas d'estimation.
  while (true) {
    const v = Atomics.load(ia, 0);
    if (v !== 0) break;
    Atomics.wait(ia, 0, 0, 1000);
  }

  if (Atomics.load(ia, 0) === 2) throw err;

  const copy = buf.getMappedRange().slice(0);
  buf.unmap();
  return copy;
}

function _isP(v: any): v is P {
  return v && typeof v.x === "number" && typeof v.y === "number";
}

function _typeId(type: TypeFonction): number {
  // WGSL: 0=SIN, 1=DP, 2=RDP
  if (type === "DP") return 1;
  if (type === "RDP") return 2;
  return 0;
}

/* ========================= API publique (transparent) ========================= */

export function creerFunction(
  type: TypeFonction,
  points: PointFeature<P>[],
  D: (a: P, b: P) => number
): {
  (p: P): number;
  (ps: P[]): number[];
} {
  // WebGPU possible uniquement si T ~ P et D est exactement distance
  const wantGpu =
    _wgpu !== null &&
    _canBlockWithAtomicsWait() &&
    (D as any) === (distance as any) &&
    points.length > 0 &&
    points.every((pt) => _isP(pt.value));

  if (wantGpu) {
    return _creerFunctionWebGpu(type, points as unknown as PointFeature<P>[]);
  }

  // Fallback CPU (toujours correct quel que soit T et D)
  if (type === "SIN") return creerFunctionSinus(points, D);
  if (type === "DP") return creerFunctionDP(points, D);
  return creerFunctionRDP(points, D);
}

/** === 1) SIN — batch + scalaire (CPU) =================================== */
export function creerFunctionSinus<T>(
  points: PointFeature<T>[],
  D: (a: T, b: T) => number
): { (p: T): number; (ps: T[]): number[] } {
  const n = points.length;

  // Pré-calcul m[i][j]
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      m[i][j] = D(points[i].value, points[j].value);
    }
  }

  const scalar = (p: T): number => {
    let result = 0;
    let s = 0;

    for (let i = 0; i < n; i++) {
      let o = 1;
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const d = D(p, points[j].value);
          o *= Math.sin(Math.PI * (d / (d + m[i][j])));
        }
      }
      const W = o;
      s += W;
      result += W * points[i].y;
    }
    return result / s;
  };

  const fn = ((arg: T | T[]): number | number[] => {
    if (Array.isArray(arg)) return arg.map(scalar);
    return scalar(arg);
  }) as any;

  return fn;
}

/** === 2) DP — batch + scalaire (CPU) ==================================== */
export function creerFunctionDP<T>(
  points: PointFeature<T>[],
  D: (a: T, b: T) => number
): { (p: T): number; (ps: T[]): number[] } {
  const n = points.length;
  const r = new Array<number>(n);

  const scalar = (p: T): number => {
    let result = 0;
    let s = 0;

    for (let j = 0; j < n; j++) r[j] = D(p, points[j].value);

    for (let i = 0; i < n; i++) {
      let o = 1;
      for (let j = 0; j < n; j++) {
        if (i !== j) o *= r[j];
      }
      const W = o;
      s += W;
      result += W * points[i].y;
    }
    return result / s;
  };

  const fn = ((arg: T | T[]): number | number[] => {
    if (Array.isArray(arg)) return arg.map(scalar);
    return scalar(arg);
  }) as any;

  return fn;
}

/** === 3) RDP — batch + scalaire (CPU) =================================== */
export function creerFunctionRDP<T>(
  points: PointFeature<T>[],
  D: (a: T, b: T) => number
): { (p: T): number; (ps: T[]): number[] } {
  const n = points.length;
  const r = new Array<number>(n);

  const scalar = (p: T): number => {
    let result = 0;
    let s = 0;

    for (let j = 0; j < n; j++) r[j] = D(p, points[j].value);

    for (let i = 0; i < n; i++) {
      const ri = r[i];
      let o = 1;
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const rj = r[j];
          o *= rj / (ri + rj);
        }
      }
      const W = o;
      s += W;
      result += W * points[i].y;
    }
    return result / s;
  };

  const fn = ((arg: T | T[]): number | number[] => {
    if (Array.isArray(arg)) return arg.map(scalar);
    return scalar(arg);
  }) as any;

  return fn;
}

/* ========================= Impl WebGPU (T = P, D = distance) ========================= */

function _creerFunctionWebGpu(
  type: TypeFonction,
  points: PointFeature<P>[]
): { (p: P): number; (ps: P[]): number[] } {
  const wgpu = _wgpu!;
  const device = wgpu.device;

  const n = points.length;
  const typeId = _typeId(type);

  // Buffers points & ys (persistants dans la closure)
  const pointsXY = new Float32Array(2 * n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pointsXY[2 * i + 0] = points[i].value.x;
    pointsXY[2 * i + 1] = points[i].value.y;
    ys[i] = points[i].y;
  }

  const pointsBuf = device.createBuffer({
    size: pointsXY.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(pointsBuf, 0, pointsXY);

  const ysBuf = device.createBuffer({
    size: ys.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ysBuf, 0, ys);

  // m (SIN) : N*N. Pour DP/RDP on met un buffer minimal (1 float).
  let mArr: Float32Array;
  if (type === "SIN") {
    mArr = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        mArr[i * n + j] = distance(points[i].value, points[j].value);
      }
    }
  } else {
    mArr = new Float32Array(1);
  }

  const mBuf = device.createBuffer({
    size: mArr.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(mBuf, 0, mArr.buffer);

  // Params buffer (uniform)
  const paramsBuf = device.createBuffer({
    size: 16, // 4*u32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Buffers inputs/outputs (redimensionnables)
  let cap = 0;
  let inputsBuf: GPUBuffer | null = null;
  let outBuf: GPUBuffer | null = null;
  let readBuf: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;

  const ensureCapacity = (batch: number) => {
    if (batch <= cap) return;

    cap = Math.max(batch, cap * 2, 256);

    inputsBuf = device.createBuffer({
      size: cap * 8, // vec2<f32>
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    outBuf = device.createBuffer({
      size: cap * 4, // f32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    readBuf = device.createBuffer({
      size: cap * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    bindGroup = device.createBindGroup({
      layout: wgpu.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: paramsBuf } },
        { binding: 1, resource: { buffer: pointsBuf } },
        { binding: 2, resource: { buffer: ysBuf } },
        { binding: 3, resource: { buffer: mBuf } },
        { binding: 4, resource: { buffer: inputsBuf } },
        { binding: 5, resource: { buffer: outBuf } },
      ],
    });
  };

  const gpuBatch = (ps: P[]): number[] => {
    const batch = ps.length;
    if (batch === 0) return [];

    ensureCapacity(batch);

    // Ecriture inputs
    const inArr = new Float32Array(2 * batch);
    for (let i = 0; i < batch; i++) {
      inArr[2 * i + 0] = ps[i].x;
      inArr[2 * i + 1] = ps[i].y;
    }
    device.queue.writeBuffer(inputsBuf!, 0, inArr);

    // Params: n, typeId, batch
    const p = new Uint32Array([n >>> 0, typeId >>> 0, batch >>> 0, 0]);
    device.queue.writeBuffer(paramsBuf, 0, p);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(wgpu.pipeline);
    pass.setBindGroup(0, bindGroup!);
    pass.dispatchWorkgroups(Math.ceil(batch / 64));
    pass.end();

    encoder.copyBufferToBuffer(outBuf!, 0, readBuf!, 0, batch * 4);

    device.queue.submit([encoder.finish()]);

    // Lecture sync (si non possible, on ne devrait pas être ici -> fallback CPU plus haut)
    const ab = _mapReadSync(readBuf!);
    const out = new Float32Array(ab, 0, batch);

    // Convert en number[]
    const res = new Array<number>(batch);
    for (let i = 0; i < batch; i++) res[i] = out[i];
    return res;
  };

  const fn = ((arg: P | P[]): number | number[] => {
    if (Array.isArray(arg)) return gpuBatch(arg);
    return gpuBatch([arg])[0];
  }) as any;

  return fn;
}
