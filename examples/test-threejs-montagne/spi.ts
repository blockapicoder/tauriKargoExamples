import * as THREE from 'three';
// Types
export interface Point {
    value: THREE.Vector2;
    y: number;
}
function D(a: THREE.Vector2, b: THREE.Vector2): number {
    let d = a.distanceToSquared(b);
    return d;
}

function dirFromLonLat(lon: number, lat: number): THREE.Vector3 {
  const cl = Math.cos(lat);
  return new THREE.Vector3(Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl).normalize();
}  
function DS( a: THREE.Vector2, b: THREE.Vector2) {
    return dirFromLonLat(a.x,a.y).distanceToSquared(dirFromLonLat(b.x,b.y))
}
export function creerFunction(points: Point[]): (x: number, y: number) => number {
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