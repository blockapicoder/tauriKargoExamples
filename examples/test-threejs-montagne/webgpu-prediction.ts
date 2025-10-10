import { BufferVector, FeaturesWithBuffer } from "./compute";

function setVector(idx: number, buffer: Float32Array, vecteur: number[]) {
  vecteur.forEach((v, i) => {
    buffer[idx * vecteur.length + i] = v
  })
}
interface BufferInit {
  label?: string;
  usage: number;
  contents: ArrayBuffer;
}
export interface FeaturesBuffer {
  gpuBuffer: GPUBuffer
}

export class WebgpuProcess {
  features: FeaturesWithBuffer
  adapter!: GPUAdapter
  device!: GPUDevice
  gpuMatriceDistanceBuffer!: GPUBuffer
  gpuVecteurBuffer!: GPUBuffer
  gpuMatrcePoidBuffer!: GPUBuffer

  nombreDeCalcul!: number
  computeMatriceDistanceBuffer = true


  constructor(feattures: FeaturesWithBuffer) {
    this.features = feattures
  }

  async initWebgpu() {
    this.adapter = (await navigator.gpu.requestAdapter())!;
    this.device = await this.adapter?.requestDevice();
    if (!this.device) {
      console.error("no suitable adapter found");
    }
  }

  private async readFloat32Copy(stagingBuffer: GPUBuffer, floatLength: number): Promise<Float32Array> {
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mapped = stagingBuffer.getMappedRange();
    const view = new Float32Array(mapped);
    const copy = new Float32Array(floatLength);
    copy.set(view);
    stagingBuffer.unmap();
    return copy;
  }

  createGpuBuffer(data: Float32Array) {
    const gpuBuffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(gpuBuffer.getMappedRange()).set(data);
    gpuBuffer.unmap();
    return gpuBuffer
  }

  async createResultat(): Promise<Float32Array> {
    const sorties = new Float32Array(this.features.dimS * this.nombreDeCalcul)

    const n = this.features.size
    const dimS = this.features.dimS
    const nc = this.nombreDeCalcul
    const entreesBuffer = this.createGpuBuffer(this.features.sorties)
    const shaderCode = `
    @group(0)
    @binding(0)
    var<storage, read_write> sorties: array<f32>;
    @group(0)
    @binding(1)
    var<storage, read> entrees: array<f32>;
    @group(0)
    @binding(2)
    var<storage, read> entreesBis: array<f32>; 
    
    @compute
    @workgroup_size(4)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        var value=0.0;
        var spoid: f32 = 0.0;
        for (var i = 0u; i < ${n}u; i = i + 1u) {
            let poid = entrees[i*${nc}u+id.y];
            let s=entreesBis[i*${dimS}u+id.x];
            value = value + poid*s;
            spoid = spoid + poid;
        }
        sorties[id.x*${nc}u+id.y] = value / spoid;
    }`;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const pr = (shaderModule as any).getCompilationInfo?.bind(shaderModule);
    if (pr) {
      const compilationInfo = await pr();
      if (compilationInfo.messages.length > 0) {
        console.log('Compilation info:', compilationInfo);
        for (const message of compilationInfo.messages) {
          if (message.type === 'error') {
            console.error(`Shader compilation error: ${message.message}`);
            console.error(`Line ${message.lineNum}, column ${message.linePos}`);
          }
        }
      } else {
        console.log('Shader compiled successfully');
      }
    }

    const stagingBuffer = this.device.createBuffer({
      size: sorties.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const storageBuffer = createBufferInit(this.device, {
      label: "Storage Buffer",
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      contents: sorties.buffer,
    });

    const computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    const bindGroupLayout = computePipeline.getBindGroupLayout(0);
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: storageBuffer } },
        { binding: 1, resource: { buffer: this.gpuMatrcePoidBuffer } },
        { binding: 2, resource: { buffer: entreesBuffer } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(this.features.dimS, this.nombreDeCalcul);
    computePass.end();

    encoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, sorties.byteLength);
    this.device.queue.submit([encoder.finish()]);

    // COPIE avant unmap
    return this.readFloat32Copy(stagingBuffer, sorties.length);
  }

  async createMatricePoid(copyBuffer: boolean): Promise<Float32Array | null> {
    const sorties = new Float32Array(this.features.size * this.nombreDeCalcul)
    const n = this.features.size
    const shaderCode = `
    @group(0)
    @binding(0)
    var<storage, read_write> sorties: array<f32>;
    @group(0)
    @binding(1)
    var<storage, read> entrees: array<f32>;
    @group(0)
    @binding(2)
    var<storage, read> entreesBis: array<f32>; 
    
    @compute
    @workgroup_size(4)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        var value=1.0;
        let pi = 3.1415926535897932384626433832795;
        for (var i = 0u; i < ${n}u; i = i + 1u) {
            if (i != id.x) {
                let d = entrees[i*${n}u+id.x];
                let dbis = entreesBis[id.y + i*${this.nombreDeCalcul}u];
                let s = sin(pi*dbis/(dbis+d));
                value = value * s;
            }
        }
        sorties[id.x*${this.nombreDeCalcul}u+id.y] = value;
    }`;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const pr = (shaderModule as any).getCompilationInfo?.bind(shaderModule);
    if (pr) {
      const compilationInfo = await pr();
      if (compilationInfo.messages.length > 0) {
        console.log('Compilation info:', compilationInfo);
        for (const message of compilationInfo.messages) {
          if (message.type === 'error') {
            console.error(`Shader compilation error: ${message.message}`);
            console.error(`Line ${message.lineNum}, column ${message.linePos}`);
          }
        }
      } else {
        console.log('Shader compiled successfully');
      }
    }

    const stagingBuffer = this.device.createBuffer({
      size: sorties.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const storageBuffer = createBufferInit(this.device, {
      label: "Storage Buffer",
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      contents: sorties.buffer,
    });
    this.gpuMatrcePoidBuffer = storageBuffer

    const computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    const bindGroupLayout = computePipeline.getBindGroupLayout(0);
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: storageBuffer } },
        { binding: 1, resource: { buffer: this.gpuMatriceDistanceBuffer } },
        { binding: 2, resource: { buffer: this.gpuVecteurBuffer } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(n, this.nombreDeCalcul);
    computePass.end();

    if (copyBuffer) {
      encoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, sorties.byteLength);
      this.device.queue.submit([encoder.finish()]);
      // COPIE avant unmap
      return this.readFloat32Copy(stagingBuffer, sorties.length);
    }

    this.device.queue.submit([encoder.finish()]);
    return null;
  }

  async createVecteurNorme(copyBuffer: boolean, bufferVector: BufferVector): Promise<Float32Array | null> {
    const n = this.features.size
    const m = this.features.dimE
    if (bufferVector.dim !== m) {
      throw new Error(" pas bonne dimension")
    }
    const entrees = this.features.entrees
    const entreesBis = bufferVector.buffer
    this.nombreDeCalcul = bufferVector.size
    const sorties = new Float32Array(n * bufferVector.size)

    const entreesBuffer = this.createGpuBuffer(entrees)
    const entreesBufferBis = this.createGpuBuffer(entreesBis)
    const shaderCode = `
    @group(0)
    @binding(0)
    var<storage, read_write> sorties: array<f32>;
    @group(0)
    @binding(1)
    var<storage, read> entrees: array<f32>;
    @group(0)
    @binding(2)
    var<storage, read> entreesBis: array<f32>; 
    
    @compute
    @workgroup_size(4)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        var value=0.0;
        for (var i = 0u; i < ${m}u; i = i + 1u) {
            let dx = entrees[id.x*${m}u + i];
            let dy = entreesBis[id.y*${m}u + i];
            let d = dx - dy;
            value = value + d*d;
        }
        sorties[id.x*${bufferVector.size}u+id.y] = value;
    }`;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const pr = (shaderModule as any).getCompilationInfo?.bind(shaderModule);
    if (pr) {
      const compilationInfo = await pr();
      if (compilationInfo.messages.length > 0) {
        console.log('Compilation info:', compilationInfo);
        for (const message of compilationInfo.messages) {
          if (message.type === 'error') {
            console.error(`Shader compilation error: ${message.message}`);
            console.error(`Line ${message.lineNum}, column ${message.linePos}`);
          }
        }
      } else {
        console.log('Shader compiled successfully');
      }
    }

    const stagingBuffer = this.device.createBuffer({
      size: sorties.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const storageBuffer = createBufferInit(this.device, {
      label: "Storage Buffer",
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      contents: sorties.buffer,
    });
    this.gpuVecteurBuffer = storageBuffer

    const computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    const bindGroupLayout = computePipeline.getBindGroupLayout(0);
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: storageBuffer } },
        { binding: 1, resource: { buffer: entreesBuffer } },
        { binding: 2, resource: { buffer: entreesBufferBis } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.insertDebugMarker("compute SPI");
    computePass.dispatchWorkgroups(n, bufferVector.size);
    computePass.end();

    if (copyBuffer) {
      encoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, sorties.byteLength);
      this.device.queue.submit([encoder.finish()]);
      // COPIE avant unmap
      return this.readFloat32Copy(stagingBuffer, sorties.length);
    }

    this.device.queue.submit([encoder.finish()]);
    return null;
  }

  async createMatriceNorme(copyBuffer: boolean): Promise<Float32Array | null> {
    const n = this.features.size
    const m = this.features.dimE
    const entrees = this.features.entrees
    const sorties = new Float32Array(n * n)
    const entreesBuffer = this.createGpuBuffer(entrees)

    const shaderCode = `
    @group(0)
    @binding(0)
    var<storage, read_write> sorties: array<f32>;
    @group(0)
    @binding(1)
    var<storage, read> entrees: array<f32>;
    
    @compute
    @workgroup_size(4)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        var value=0.0;
        for (var i = 0u; i < ${m}u; i = i + 1u) {
            let dx = entrees[id.x*${m}u + i];
            let dy = entrees[id.y*${m}u + i];
            let d = dx - dy;
            value = value + d*d;
        }
        sorties[id.x*${n}u+id.y] = value;
    }`;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    const pr = (shaderModule as any).getCompilationInfo?.bind(shaderModule);
    if (pr) {
      const compilationInfo = await pr();
      if (compilationInfo.messages.length > 0) {
        console.log('Compilation info:', compilationInfo);
        for (const message of compilationInfo.messages) {
          if (message.type === 'error') {
            console.error(`Shader compilation error: ${message.message}`);
            console.error(`Line ${message.lineNum}, column ${message.linePos}`);
          }
        }
      } else {
        console.log('Shader compiled successfully');
      }
    }

    const stagingBuffer = this.device.createBuffer({
      size: sorties.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const storageBuffer = createBufferInit(this.device, {
      label: "Storage Buffer",
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      contents: sorties.buffer,
    });
    this.gpuMatriceDistanceBuffer = storageBuffer

    const computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    const bindGroupLayout = computePipeline.getBindGroupLayout(0);
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: storageBuffer } },
        { binding: 1, resource: { buffer: entreesBuffer } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.insertDebugMarker("compute SPI");
    computePass.dispatchWorkgroups(n, n);
    computePass.end();

    this.computeMatriceDistanceBuffer = false

    if (copyBuffer) {
      encoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, sorties.byteLength);
      this.device.queue.submit([encoder.finish()]);
      // COPIE avant unmap
      return this.readFloat32Copy(stagingBuffer, sorties.length);
    }

    this.device.queue.submit([encoder.finish()]);
    return null;
  }

  async compute(bufferVector: BufferVector) {
    if (this.computeMatriceDistanceBuffer) {
      await this.createMatriceNorme(true)
    }
    const r = await this.createVecteurNorme(true, bufferVector)
    await this.createMatricePoid(true)
    return await this.createResultat()
  }
}

export function createBufferInit(
  device: GPUDevice,
  descriptor: BufferInit,
): GPUBuffer {
  const contents = new Float32Array(descriptor.contents);

  const alignMask = 4 - 1;
  const paddedSize = Math.max(
    (contents.byteLength + alignMask) & ~alignMask,
    4,
  );

  const buffer = device.createBuffer({
    label: descriptor.label,
    usage: descriptor.usage,
    mappedAtCreation: true,
    size: paddedSize,
  });

  const data = new Float32Array(buffer.getMappedRange());
  data.set(contents);
  buffer.unmap();
  return buffer;
}
