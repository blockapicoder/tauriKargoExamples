
import { ImagePixels, CompressionDemande, TAILLE_DECOUPAGE, RGBA, DecoupageFeature, Trace, Result ,Ctx} from "./model"
import {  distance, P,  TypeFonction ,PointFeature} from "./spec-spi"
import {  creerFunction ,initWebGpu} from "./spi-webgpu"

export type TraceFct = (nbRetrait: number, nbTest: number) => void

export interface ResultSimplifier<T> {
    result: PointFeature<T>[] 
    nombreRetrait: number
}



export  function simplifier(type: TypeFonction, points: PointFeature<P>[], ctx: Ctx, D: (a: P, b: P) => number,trace: TraceFct): ResultSimplifier<P>  {
    let retrait: PointFeature<P>[] = []
    let nombreErreur = 0
    let result: PointFeature<P>[] = [...points]
    let nbTest = 0
    const r: ResultSimplifier<P> = { nombreRetrait: 0, result:result }

    while (nombreErreur < ctx.nombreEssai && retrait.length < ctx.nombreRetrait) {
        let idx = Math.trunc(Math.random() * result.length);
        nbTest++;
        let value = result[idx]
        let newResult = result.filter((e, i) => i !== idx)
        let newRetrait = [...retrait, value]
        const f = creerFunction(type, newResult, D)
        const values = f(newRetrait.map((e)=>e.value))
        if (values.every((y,idx) => Math.abs(y - newRetrait[idx].y) <= ctx.erreur)) {
            result = newResult
            retrait = newRetrait
        } else {
            nombreErreur++
        }
       trace(retrait.length, nbTest)
    }
    r.nombreRetrait = retrait.length
    r.result = result
    return r




}
export function getRGBA(p: ImagePixels, x: number, y: number): RGBA {
    const { width, height, data } = p;

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
        throw new Error(`x and y must be integers (got x=${x}, y=${y})`);
    }
    if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(
            `Out of bounds: (x=${x}, y=${y}) for image ${width}x${height}`
        );
    }

    const i = (y * width + x) * 4;
    return {
        r: data[i + 0],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
    };
}
function creerDecoupageFeature(imagePixels: ImagePixels, x: number, y: number) {
    const feature: DecoupageFeature = { featuresB: [], featuresG: [], featuresR: [] }
    for (let px = 0; px < TAILLE_DECOUPAGE; px++) {
        for (let py = 0; py < TAILLE_DECOUPAGE; py++) {
            const ox = x + px;
            const oy = y + py;
            try {
                const cl = getRGBA(imagePixels, ox, oy)
                const p: P = { x: ox, y: oy }
                feature.featuresB.push({
                    value: p,
                    y: cl.b
                })
                feature.featuresR.push({
                    value: p,
                    y: cl.r
                })
                feature.featuresG.push({
                    value: p,
                    y: cl.g
                })
            } catch (e) {

            }
        }
    }
    return feature

}

self.onmessage = async (evt) => {
    await initWebGpu()
    const compressionDemande: CompressionDemande = evt.data
    const ctx: Ctx = compressionDemande.ctx
    const imagePixels = compressionDemande.imagePixels
    const dx = imagePixels.width / TAILLE_DECOUPAGE
    const dy = imagePixels.height / TAILLE_DECOUPAGE
    const pTrace: P = { x: 0, y: 0 }
    const t: Trace = {
        type: "trace",
        nbRetrait: 0,
        nbTest: 0,
        p: pTrace,
        nombreTotalRetrait: 0
    }
    const traceFct: TraceFct = (nbRetrait: number, nbTest: number) => {
        if (t.nbRetrait !== nbRetrait) {
            t.nbRetrait = nbRetrait
            t.nbTest = nbTest
         //   self.postMessage(t)
        }
    }

    for (let px = 0; px < dx; px++) {
        for (let py = 0; py < dy; py++) {
            const ox = px * TAILLE_DECOUPAGE
            const oy = py * TAILLE_DECOUPAGE
            t.p.x = px 
            t.p.y = py
            const f = creerDecoupageFeature(imagePixels, ox, oy)
            let fr = simplifier("SIN", f.featuresR, ctx, distance, traceFct)
            if (!fr) {
                return;
            }

            t.nombreTotalRetrait += fr.nombreRetrait
            self.postMessage(t)
            let fg = simplifier("SIN", f.featuresG, ctx, distance, traceFct)
            if (!fg) {
                return;
            }

            t.nombreTotalRetrait += fr.nombreRetrait
            self.postMessage(t)
            let fb = simplifier("SIN", f.featuresB, ctx, distance, traceFct)
            if (!fb) {
                return;
            }
            t.nombreTotalRetrait += fr.nombreRetrait
            self.postMessage(t)
            const r: Result = {
                type: "result",
                decoupageFeature: {
                    featuresB: fb.result,
                    featuresG: fg.result,
                    featuresR: fr.result

                },
                p:{ x:px,y:py }
            }
            self.postMessage(r)



            /* for (let ux = 0; ux < TAILLE_DECOUPAGE; ux++) {
                 for (let uy = 0; uy < TAILLE_DECOUPAGE; uy++) {
                     const p: P = { x: ux + ox, y: uy + oy }
                     setPixelRGB(cible, p.x, p.y, fr.f(p), fg.f(p), fb.f(p))
                 }
             }
                 */


        }
    }


}