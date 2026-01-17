

export type TypeFonction = "DP" | "RDP" | "SIN"
// Types (compatibles)
export interface PointFeature<T> {
    value: T;
    y: number;
}

export interface P {
    x: number
    y: number
}
// Distance euclidienne au carré dans R^2
export function distance(a: P, b: P): number {
    let dx = a.x - b.x
    let dy = a.y - b.y
    return dx * dx + dy * dy;
}


export function creerFunction<T>(type: TypeFonction, points: PointFeature<T>[], D: (a: T, b: T) => number): (p: T) => number {

    if (type === "SIN") {
        return creerFunctionSinus(points, D)
    }
    if (type === "DP") {
        return creerFunctionDP(points, D)
    }
    return creerFunctionRDP(points, D)

}
/** === 1) Schéma SIN (ton schéma d'origine) — inchangé ==================== */
export function creerFunctionSinus<T>(points: PointFeature<T>[], D: (a: T, b: T) => number): (p: T) => number {
    const m: number[][] = [];

    for (let i = 0; i < points.length; i++) {
        m[i] = [];
        for (let j = 0; j < points.length; j++) {
            let d = D(points[i].value, points[j].value);
            m[i][j] = d;
        }
    }

    return (p: T): number => {

        let result = 0;
        let s = 0;

        for (let i = 0; i < points.length; i++) {
            let o = 1;
            for (let j = 0; j < points.length; j++) {
                if (i != j) {
                    let d = D(p, points[j].value);
                    o = o * Math.sin(Math.PI * (d / (d + m[i][j])));
                }
            }

            const W = o;
            const yi = points[i].y;
            s += W;

            result = result + W * yi;
        }

        return result / s;
    };
}

/** === 2) Schéma DP : φ_i(p) = ∏_{j≠i} r_j(p) ==============================
 *  Invariance similitude, interpolation exacte, combinaison convexe.
 */
export function creerFunctionDP<T>(points: PointFeature<T>[], D: (a: T, b: T) => number): (p: T) => number {
    return (p: T): number => {

        let result = 0;
        let s = 0;

        // Pré-calcul des r_j(p)
        const r: number[] = new Array(points.length);
        for (let j = 0; j < points.length; j++) {
            r[j] = D(p, points[j].value);
        }

        for (let i = 0; i < points.length; i++) {
            let o = 1;
            for (let j = 0; j < points.length; j++) {
                if (i !== j) {
                    o = o * r[j];              // φ_i = ∏_{j≠i} r_j(p)
                }
            }
            const W = o;
            const yi = points[i].y;
            s += W;
            result += W * yi;
        }

        return result / s;
    };
}

/** === 3) Schéma RDP : φ_i(p) = ∏_{j≠i} r_j(p) / (r_i(p) + r_j(p)) ==========
 *  Invariance similitude, interpolation exacte, combinaison convexe.
 */
export function creerFunctionRDP<T>(points: PointFeature<T>[], D: (a: T, b: T) => number): (p: T) => number {
    return (p: T): number => {

        let result = 0;
        let s = 0;

        // Pré-calcul des r_j(p)
        const r: number[] = new Array(points.length);
        for (let j = 0; j < points.length; j++) {
            r[j] = D(p, points[j].value);
        }

        for (let i = 0; i < points.length; i++) {
            const ri = r[i];
            let o = 1;
            for (let j = 0; j < points.length; j++) {
                if (i !== j) {
                    const rj = r[j];
                    o = o * (rj / (ri + rj));  // φ_i = ∏_{j≠i} rj/(ri+rj)
                }
            }
            const W = o;
            const yi = points[i].y;
            s += W;
            result += W * yi;
        }

        return result / s;
    };
}

export interface Ctx {
    nombreEssai: number
    nombreRetrait: number
    erreur: number
    
}
export type TraceFct = (nbRetrait: number, nbTest: number) => void

export interface ResultSimplifier<T> {
    result: PointFeature<T>[] 
    nombreRetrait: number
}
export  function simplifier<T>(type: TypeFonction, points: PointFeature<T>[], ctx: Ctx, D: (a: T, b: T) => number,trace: TraceFct): ResultSimplifier<T>  {
    let retrait: PointFeature<T>[] = []
    let nombreErreur = 0
    let result: PointFeature<T>[] = [...points]
    let nbTest = 0
    const r: ResultSimplifier<T> = { nombreRetrait: 0, result:result }

    while (nombreErreur < ctx.nombreEssai && retrait.length < ctx.nombreRetrait) {
        let idx = Math.trunc(Math.random() * result.length);
        nbTest++;
        let value = result[idx]
        let newResult = result.filter((e, i) => i !== idx)
        let newRetrait = [...retrait, value]
        const f = creerFunction(type, newResult, D)
        if (newRetrait.every((p) => Math.abs(f(p.value) - p.y) <= ctx.erreur)) {
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