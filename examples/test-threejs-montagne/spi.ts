import * as THREE from 'three';


export type TypeFonction = "DP"|"RDP"|"SIN"
// Types (compatibles)
export interface Point {
    value: THREE.Vector2;
    y: number;
}

// Distance euclidienne au carré dans R^2
function D(a: THREE.Vector2, b: THREE.Vector2): number {
    let d = a.distanceToSquared(b);
    return d;
}

// Outils présents dans ton fichier (conservés pour compatibilité)
function dirFromLonLat(lon: number, lat: number): THREE.Vector3 {
  const cl = Math.cos(lat);
  return new THREE.Vector3(Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl).normalize();
}
function DS(a: THREE.Vector2, b: THREE.Vector2) {
    return dirFromLonLat(a.x, a.y).distanceToSquared(dirFromLonLat(b.x, b.y))
}
export function creerFunction( type:TypeFonction ,points: Point[]): (x: number, y: number) => number {
    if (type ==="SIN") {
        return creerFunctionSinus(points)
    }
    if (type ==="DP") {
        return creerFunctionDP(points)
    }
    return creerFunctionRDP(points)

}
/** === 1) Schéma SIN (ton schéma d'origine) — inchangé ==================== */
export function creerFunctionSinus(points: Point[]): (x: number, y: number) => number {
    const m: number[][] = [];

    for (let i = 0; i < points.length; i++) {
        m[i] = [];
        for (let j = 0; j < points.length; j++) {
            let d = D(points[i].value, points[j].value);
            m[i][j] = d;
        }
    }

    return (x: number, y: number): number => {
        const p: THREE.Vector2 = new THREE.Vector2(x, y);
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
export function creerFunctionDP(points: Point[]): (x: number, y: number) => number {
    return (x: number, y: number): number => {
        const p = new THREE.Vector2(x, y);
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
export function creerFunctionRDP(points: Point[]): (x: number, y: number) => number {
    return (x: number, y: number): number => {
        const p = new THREE.Vector2(x, y);
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
