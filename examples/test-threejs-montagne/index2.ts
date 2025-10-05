import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';
import { updateFormulaPanel } from './formule'
updateFormulaPanel()
const scene = new THREE.Scene();
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 6, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 20;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);

// Point light colorée animée, pour des reflets sympas
const pointLight = new THREE.PointLight(0x66ccff, 1.0, 20, 2);
pointLight.position.set(-2, 2, -2);
scene.add(pointLight);
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
        let s = 0

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
            s+=W

            result = result + W * yi;
        }

        return result/s;
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
// Groupe pour les points de contrôle
const meshAndControlPointsGroup = new THREE.Group();
const controlPointsGroup = new THREE.Group();
meshAndControlPointsGroup.add(controlPointsGroup)
scene.add(meshAndControlPointsGroup);

function drawControlPoints(points: Point[], selection: number) {
    controlPointsGroup.clear();
    const sphereGeom = new THREE.SphereGeometry(0.07, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMatSelection = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    let idx = 0
    for (const p of points) {
        let m = sphereMat
        if (idx === selection) {
            m = sphereMatSelection
        }
        idx++
        const s = new THREE.Mesh(sphereGeom, m);
        // Même mapping que la surface :
        // x' = x/10 - 5 ; z' = y/10 - 5 ; y' = F(x,y)/10  (ici y' = p.y/10)
        const xScene = p.value.x / 10 - 5;
        const zScene = p.value.y / 10 - 5;
        const yScene = F(p.value.x, p.value.y) / 10; // <-- clé : hauteur depuis F
        s.position.set(xScene, yScene, zScene);


        controlPointsGroup.add(s);
    }
}

let F = creerFunction(data);
interface P {
    id: number, x: number, y: number, h: number
}
export function setPoints(ls: P[],selection:number) {
    //console.log(JSON.stringify(ls, null, 2))
    const newData: Point[] = ls.map((p) => {
        return {
            value: new THREE.Vector2(p.x / 10, p.y / 10),
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

        },
        50,
        50
    );
    mesh.geometry = geometry;
    drawControlPoints(newData,selection)
    for (let p of newData) {
        console.log(p.y, F(p.value.x, p.value.y));
    }     // <-- remplacement


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

    },
    50,
    50
);
const matMetal: THREE.MeshStandardMaterialParameters = {
    roughness: 0.35,
    metalness: 0.4,
    color: new THREE.Color('#ff7f50'), // corail
};
// Matériel et maillage
const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
});

let mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(matMetal));
meshAndControlPointsGroup.add(mesh)
// mesh.rotation.x += 0.01;
meshAndControlPointsGroup.rotation.x = -Math.PI - Math.PI / 10;

const clock = new THREE.Clock();
// Animation de la scène
const animate = function () {
    const t = clock.getElapsedTime();
    requestAnimationFrame(animate);
    pointLight.position.x = Math.cos(t * 0.8) * 2.2;
    pointLight.position.z = Math.sin(t * 0.8) * 2.2;
    pointLight.position.y = 1.8 + Math.sin(t * 1.6) * 0.3;
    // Rotation du mesh
    // mesh.rotation.x += 0.01;
    //mesh.rotation.y += 0.01;

    renderer.render(scene, camera);
};

// Gestion du redimensionnement de la fenêtre
document.addEventListener('keydown', function (event) {
    switch (event.key) {
        case 'ArrowUp':
            meshAndControlPointsGroup.rotation.x += 0.01;
            break;
        case 'ArrowDown':
            meshAndControlPointsGroup.rotation.x -= 0.01;
            break;
        case 'ArrowLeft':
            meshAndControlPointsGroup.rotation.y -= 0.01;
            break;
        case 'ArrowRight':
            meshAndControlPointsGroup.rotation.y += 0.01;
            break;
        case '+':
            camera.position.z += 1;
            break;
        case '-':
            camera.position.z -= 1;
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
