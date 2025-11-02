


export function dist(v: number[], u: number[]) {

    const i = Math.min(v.length, u.length)
    let s = 0
    for (let j = 0; j < i; j++) {
        const d = v[j] - u[j]
        s += d * d
    }
    return s

}
export interface Feature {
    e: number[]
    s: number[]
}
export interface ConexteFeature {
    features: Feature[]
    matDist?: number[][]
    poids: number []
}
export function computeValue(ctx: ConexteFeature, p: number[]) {
    const somme: number[] = []
    const ls: number[] = []

    for (const f of ctx.features) {
        ls.push(dist(p, f.e))
    }
    let matDist: number[][] = []
    if (ctx.matDist) {
        matDist = ctx.matDist
    } else {
        for (let i = 0; i < ctx.features.length; i++) {
            matDist.push([])
            for (let j = 0; j < ctx.features.length; j++) {
                matDist[i].push(dist(ctx.features[i].e, ctx.features[j].e))
            }
        }
        ctx.matDist = matDist
    }
    for (let i = 0; i < ctx.features.length; i++) {
        let produit = 1
        let poid = ctx.poids[i]??1
        for (let j = 0; j < ctx.features.length; j++) {
            if (i != j) {
                const d = matDist[i][j]
                const lsj = Math.pow(ls[j],poid)
                const dp =Math.pow(d,poid)
                produit = produit * Math.sin(Math.PI * (lsj / (lsj + dp)))
            }
        }
        ctx.features[i].s.forEach((v, k) => {
            if (k >= somme.length) {
                somme[k] = 0
            }
            somme[k] = somme[k] + produit * v
        })
    }
    return somme
}
export function computeError(grid: ConexteFeature, values: Feature[]) {
    let error: number[] = []
    for (const value of values) {
        const r = computeValue(grid, value.e)
        const tmpError = value.s.map((v, i) => { return (r[i] - v) * (r[i] - v) })
        error = tmpError.map((v, i) => error[i] + v)
    }
    return error

}
export class Features {

    dimE: number
    dimS: number
    features: Feature[] = []
    constructor(dimE: number, dimS: number) {
        this.dimE = dimE
        this.dimS = dimS
    }
    addFeature(e: number[], s: number[]) {
        if (e.length != this.dimE) {
            throw new Error("pb dimE")
        }
        if (s.length != this.dimS) {
            throw new Error("pb dimS")
        }
        this.features.push({ e: e, s: s })
    }
    asFeaturesBuffer(): FeaturesWithBuffer {
        const featuresBuffer = new FeaturesWithBuffer(this.dimE, this.dimS, this.features.length);
        this.features.forEach((value) => {
            featuresBuffer.addFeature(value.e, value.s)
        })
        return featuresBuffer
    }
}

export class BufferVector {
    dim: number
    buffer: Float32Array
    size: number
    sizeMax: number
    constructor(dim: number, sizeMax: number) {
        this.buffer = new Float32Array(sizeMax * dim)
        this.sizeMax = sizeMax
        this.size = 0
        this.dim = dim

    }
    addVector(e: number[]) {
        if (this.size === this.sizeMax) {
            throw new Error("ko")
        }
        e.forEach((v, i) => {
            this.buffer[this.size * this.dim + i] = v
        })
        this.size++;
    }

}
export class FeaturesWithBuffer {

    dimE: number
    dimS: number
    entrees: Float32Array
    sorties: Float32Array
    size: number
    sizeMax: number
    constructor(dimE: number, dimS: number, sizeMax: number) {
        this.dimE = dimE
        this.dimS = dimS

        this.size = 0
        this.sizeMax = sizeMax
        this.entrees = new Float32Array(dimE * sizeMax)
        this.sorties = new Float32Array(dimS * sizeMax)
    }
    createBufferVectorInput(size: number): BufferVector {
        return new BufferVector(this.dimE, size)
    }
    removeIdx(idx: number): Feature {
        const r: Feature = { e: [], s: [] }
        for (let i = 0; i < this.dimE; i++) {
            r.e.push(this.entrees[idx * this.dimE + i])
        }
        for (let i = 0; i < this.dimS; i++) {
            r.s.push(this.sorties[idx * this.dimS + i])
        }
        while (idx < this.size) {
            this.copy(idx + 1, idx)
        }
        this.size--;
        return r

    }
    copy(idxSrc: number, idxTarget: number) {
        for (let i = 0; i < this.dimE; i++) {
            this.entrees[idxTarget * this.dimE + i] = this.entrees[idxSrc * this.dimE + i]
        }
        for (let i = 0; i < this.dimS; i++) {
            this.sorties[idxTarget * this.dimS + i] = this.sorties[idxSrc * this.dimS + i]
        }

    }
    addFeature(e: number[], s: number[]) {
        if (this.size === this.sizeMax) {
            throw new Error("pb size")
        }
        if (e.length != this.dimE) {
            throw new Error("pb dimE")
        }
        if (s.length != this.dimS) {
            throw new Error("pb dimS")
        }
        e.forEach((v, i) => {
            this.entrees[this.size * this.dimE + i] = v
        })
        s.forEach((v, i) => {
            this.sorties[this.size * this.dimS + i] = v
        })
        this.size++;
    }
}
export function computeMatrixDist(ls: Feature[]): ConexteFeature {
    const r: number[][] = []
    for (let i = 0; i < ls.length; i++) {
        const current: number[] = []
        r.push(current)
        for (let j = 0; j < ls.length; j++) {
            //  if (i <= j) {
            current.push(dist(ls[i].e, ls[j].e))
            // }
        }
    }
    return { features: ls, matDist: r ,poids:[]}
}

export function featuresForDist(features: Feature[], p: number[], distFeature: number): Feature[] {
    const featureProche: Feature[] = []

    for (const f of features) {
        if (dist(f.e, p) <= distFeature) {
            featureProche.push(f)
        }
    }
    return featureProche
}

