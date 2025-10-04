import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';


const scene = new THREE.Scene();


// Initialisation de la caméra
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 10;

// Initialisation du rendu
const renderer = new THREE.WebGLRenderer();
renderer.setSize(600, 500);


function creerPoint(x: number, y: number, z: number): Point {
    return {
        value: new THREE.Vector2(x, y),
        y: z,
    };
}
let level = 1;
function D(a: THREE.Vector2, b: THREE.Vector2): number {
    let d = a.distanceToSquared(b);

    return d;
}

let max = 2;
function creerFunction(points: Point[]): (x: number, y: number) => number {
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

            result = result + W * yi;
        }

        return result;
    };
}

let data: Point[] = [
    creerPoint(20, 10, -1),
    creerPoint(80, 10, 2),
    creerPoint(40, 40, -15),
    creerPoint(90, 90, 3.5),
    creerPoint(30, 15, 2.75),
    creerPoint(75, 90, 10.85),
    creerPoint(70, 95, 3.25),
    creerPoint(70, 90, 3.1),
    creerPoint(40, 50, 3.1),
    creerPoint(10, 90, 4),
    creerPoint(50, 50, 1.5),
    creerPoint(65, 40, -23.25),
];
let F = creerFunction(data);
interface P {
    id: number, x: number, y: number, h: number
}
export function setPoints(ls: P[]) {
    console.log(JSON.stringify(ls,null,2))
    const newData: Point[] = ls.map((p) => {
        return {
            value: new THREE.Vector2(p.x/10, p.y/10),
            y: p.h

        }
    })
    F = creerFunction(newData)
    geometry.dispose()
    geometry = new ParametricGeometry(
        (u, v, vec) => {
            const x = 100 * u;
            const y = 100 * v;
            const z = F(x, y);
            // console.log(x, y, z);
            vec.setX(x / 10 - 5);
            vec.setZ(y / 10 - 5);
            vec.setY(z / 10);
            return new THREE.Vector3(y, x, z);
        },
        50,
        50
    );
    mesh.geometry = geometry;              // <-- remplacement


}
for (let p of data) {
    console.log(p.y, F(p.value.x, p.value.y));
}
// Création de la géométrie
let geometry = new ParametricGeometry(
    (u, v, vec) => {
        const x = 100 * u;
        const y = 100 * v;
        const z = F(x, y);
        // console.log(x, y, z);
        vec.setX(x / 10 - 5);
        vec.setZ(y / 10 - 5);
        vec.setY(z / 10);
        return new THREE.Vector3(y, x, z);
    },
    50,
    50
);

// Matériel et maillage
const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
});
let mesh = new THREE.Mesh(geometry, material);
// mesh.rotation.x += 0.01;
mesh.rotation.x = -Math.PI - Math.PI / 10;
scene.add(mesh);
function replaceMesh() {
    scene.remove(mesh);
    F = creerFunction(data);
    const oldRotation = mesh.rotation;
    geometry = new ParametricGeometry(
        (u, v, vec) => {
            const x = 100 * u;
            const y = 100 * v;
            const z = F(x, y);
            // console.log(x, y, z);
            vec.setX(x / 10 - 5);
            vec.setZ(y / 10 - 5);
            vec.setY(z / 10);
            return new THREE.Vector3(y, x, z);
        },
        50,
        50
    );
    mesh = new THREE.Mesh(geometry, material);
    // mesh.rotation.x += 0.01;
    mesh.setRotationFromEuler(oldRotation);
    scene.add(mesh);
    console.log(...data.map((p) => ` ( ${p.y}, ${F(p.value.x, p.value.y)} ) `));
}
// Animation de la scène
const animate = function () {
    requestAnimationFrame(animate);

    // Rotation du mesh
    // mesh.rotation.x += 0.01;
    //mesh.rotation.y += 0.01;

    renderer.render(scene, camera);
};

// Gestion du redimensionnement de la fenêtre
document.addEventListener('keydown', function (event) {
    switch (event.key) {
        case 'ArrowUp':
            mesh.rotation.x += 0.01;
            break;
        case 'ArrowDown':
            mesh.rotation.x -= 0.01;
            break;
        case 'ArrowLeft':
            mesh.rotation.y -= 0.01;
            break;
        case 'ArrowRight':
            mesh.rotation.y += 0.01;
            break;
        case '+':
            camera.position.z += 1;
            break;
        case '-':
            camera.position.z -= 1;
            break;
        case 'a':
            level++;
            replaceMesh();
            console.log(level);
            break;
        case 'b':
            if (level > 1) {
                level--;
                console.log(level);
                replaceMesh();
            }
            break;
    }
});
window.addEventListener('resize', function () {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth / 2, newHeight);
});
//renderer.setSize(window.innerWidth/2, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // retina sans exploser la charge
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
document.getElementById("app")!.appendChild(renderer.domElement);
// Lancement de l'animation
animate()

interface Point {
    value: THREE.Vector2;
    y: number;
}
