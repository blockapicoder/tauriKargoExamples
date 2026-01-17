import {  P, PointFeature } from "./spec-spi"
export interface Ctx {
    nombreEssai: number
    nombreRetrait: number
    erreur: number
    
}
export interface DecoupageFeature {
    featuresR: PointFeature<P>[]
    featuresG: PointFeature<P>[]
    featuresB: PointFeature<P>[]
}
export interface Decoupage {
    x: number
    y: number

    r: (p: P) => number
    g: (p: P) => number
    b: (p: P) => number

}

export type ImagePixels = {
    width: number;
    height: number;
    data: Uint8ClampedArray; // RGBA, 4 * width * height
};
export interface CompressionDemande {
    imagePixels: ImagePixels
    ctx: Ctx
}
export const TAILLE_DECOUPAGE = 16
export type RGBA = { r: number; g: number; b: number; a: number };
export interface Trace {
    type: "trace",
    nbRetrait: number, nbTest: number,
    p: P,
    nombreTotalRetrait: number
}
export interface Result {
    type: 'result'
    p:P ,
    decoupageFeature: DecoupageFeature
}
