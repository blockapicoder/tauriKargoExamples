import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updateFormulaPanel } from './formule';
import { creerFunction, distance, PointFeature, TypeFonction } from './spi';
import { defineVue } from './node_modules/tauri-kargo-tools/src/vue';
import { PlaneteEditeur } from './app';
import { ChoixCouleur } from './menu-couleur';





export type DeformBase = {
    basePositions: Float32Array;
    baseRadius: number;
    centerLocal: THREE.Vector3; // centre de déformation dans l'espace local
};

export function captureDeformBase(
    geom: THREE.BufferGeometry,
    baseRadius: number,
    centerLocal = new THREE.Vector3(0, 0, 0)
): DeformBase {
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    if (!pos || pos.itemSize !== 3) throw new Error("Missing/invalid position attribute.");

    return {
        basePositions: new Float32Array(pos.array as ArrayLike<number>),
        baseRadius,
        centerLocal: centerLocal.clone(),
    };
}

interface Interpolation {
    f: (dirUnit: THREE.Vector3) => number,
    r: (dirUnit: THREE.Vector3) => number,
    g: (dirUnit: THREE.Vector3) => number,
    b: (dirUnit: THREE.Vector3) => number
}
/**
 * p' = center + dir * (baseRadius + f(dir))
 * avec dir = normalize(p0 - center)
 */
export function applyRadialDeformFromBase(
    geom: THREE.BufferGeometry,
    base: DeformBase,
    interpolation: Interpolation
) {
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    if (!pos || pos.itemSize !== 3) throw new Error("Missing/invalid position attribute.");
    let color = geom.getAttribute("color") as THREE.BufferAttribute;

    const arr = pos.array as Float32Array;
    const baseArr = base.basePositions;
    const c = base.centerLocal;

    const dir = new THREE.Vector3();

    const colors = color.array // r,g,b pour chaque sommet




    for (let i = 0; i < pos.count; i++) {
        const ix = i * 3;
        const x0 = baseArr[ix + 0];
        const y0 = baseArr[ix + 1];
        const z0 = baseArr[ix + 2];

        // direction centre -> point (dans le même espace local)
        dir.set(x0 - c.x, y0 - c.y, z0 - c.z);
        const len = dir.length();
        if (len === 0) continue;
        dir.multiplyScalar(1 / len);

        const dr = interpolation.f(dir);
        color.setXYZ(i, interpolation.r(dir), interpolation.g(dir), interpolation.b(dir))
        /* colors[ix + 0] =0;//interpolation.r(dir);
         colors[ix + 1] =0.2;// interpolation.g(dir);
         colors[ix + 2] =0;// interpolation.b(dir);*/
        const r2 = base.baseRadius + dr;

        // nouveau point (recentré)
        arr[ix + 0] = c.x + dir.x * r2;
        arr[ix + 1] = c.y + dir.y * r2;
        arr[ix + 2] = c.z + dir.z * r2;
    }

    pos.needsUpdate = true;
    color.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
}

interface ColorFeature {
    r: PointFeature<THREE.Vector3>[],
    g: PointFeature<THREE.Vector3>[],
    b: PointFeature<THREE.Vector3>[]
}

export class PlaneteNavigation {
    pointFeatures: PointFeature<THREE.Vector3>[] = [];
    colorFeature: ColorFeature = { b: [], g: [], r: [] }
    base!: DeformBase
    currentSelection: number = 0
    tf: TypeFonction = "SIN"
    sel: number[] = [1]
    types: TypeFonction[] = ["DP", "SIN", "RDP"];
    choixCouleur!: ChoixCouleur
    couleurCourante = new THREE.Color("#FF0000")

    display(t: TypeFonction): string {
        return t
    }
    markerSelectionne = false
    F!: (p: THREE.Vector3) => number




    tranformSphere() {
        const feature = this.pointFeatures
        const colorFeature = this.colorFeature
        const c: THREE.Vector3 = this.base.centerLocal
        console.log("center", c)


        const distance = (a: THREE.Vector3, b: THREE.Vector3) => {


            return a.distanceToSquared(b)
        }
        this.F = creerFunction(this.tf, feature, distance)
        for (const f of feature) {
            console.log(f.value, this.F(f.value), f.y)
        }
        const interpolation: Interpolation = {
            f: this.F,
            r: creerFunction(this.tf, colorFeature.r, distance),
            g: creerFunction(this.tf, colorFeature.g, distance),
            b: creerFunction(this.tf, colorFeature.b, distance)
        }
        applyRadialDeformFromBase(this.geometry, this.base, interpolation)



    }

    scene!: THREE.Scene
    controlPointsGroup !: THREE.Group
    mesh!: THREE.Mesh
    div!: HTMLDivElement
    cameraController!: SphericalTerrainController

    createDiv(): HTMLDivElement {
        this.div = document.createElement("div")
        return this.div
    }
    initThree() {


        this.scene = new THREE.Scene();

        // Lumières
        const ambient = new THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 6, 4);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 20;
        dirLight.shadow.normalBias = 0.02;
        this.scene.add(dirLight);

        // Point light colorée animée
        const pointLight = new THREE.PointLight(0x66ccff, 1.0, 20, 2);
        pointLight.position.set(-2, 2, -2);
        this.scene.add(pointLight);

        // Caméra
        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.z = 10;

        // Rendu
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(600, 500);

        // OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 2;
        controls.maxDistance = 50;
        controls.target.set(0, 0, 0);
        controls.update();
        const meshAndControlPointsGroup = new THREE.Group();

        this.scene.add(meshAndControlPointsGroup);
        const r = 1;
        const w = 64;
        const h = 32;

        this.geometry = new THREE.SphereGeometry(r, w, h);
        this.geometry.computeBoundingSphere();
        const centerLocal = this.geometry.boundingSphere!.center.clone();
        this.base = captureDeformBase(this.geometry, r, centerLocal)
        console.log(centerLocal)


        this.geometry.toNonIndexed();


        const matMetal: THREE.MeshStandardMaterialParameters = {
            roughness: 0.35,
            metalness: 0.4,
            color: this.couleurCourante, // corail
        };

        // Matériaux (wireframe dispo si besoin)
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
        });

        // Mesh
        matMetal.vertexColors = true;
        matMetal.color = new THREE.Color("#FFFFFF");
        let color = this.geometry.getAttribute("color") as THREE.BufferAttribute;
        const pos = this.geometry.getAttribute("position") as THREE.BufferAttribute;
        if (!color || color.itemSize !== 3) {
            const colors = new Float32Array(pos.count * 3);
            color = new THREE.BufferAttribute(colors, 3);
            this.geometry.setAttribute("color", color);
            for (let i = 0; i < pos.count; i++) {
                color.setXYZ(i, 0, 0.5, 0)

            }
        }
        this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial(matMetal));


        meshAndControlPointsGroup.add(this.mesh);
        meshAndControlPointsGroup.rotation.x = -Math.PI - Math.PI / 10;

        const clock = new THREE.Clock();
        const animate = () => {
            const t = clock.getElapsedTime();
            requestAnimationFrame(animate);

            pointLight.position.x = Math.cos(t * 0.8) * 2.2;
            pointLight.position.z = Math.sin(t * 0.8) * 2.2;
            pointLight.position.y = 1.8 + Math.sin(t * 1.6) * 0.3;

            controls.update(); // nécessaire pour enableDamping
            renderer.render(this.scene, camera);
        };
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        this.div.appendChild(renderer.domElement);
        this.tranformSphere()
        this.cameraController = new SphericalTerrainController(camera, this.div, 1, this.F)

        animate();



    }

    geometry!: THREE.SphereGeometry

    setTypeFonction() {
        if (this.sel.length === 0) {
            return
        }
        this.tf = this.types[this.sel[0]]


        this.tranformSphere()


    }

}


//updateFormulaPanel();



defineVue(PlaneteNavigation, (vue) => {
    vue.flow({
        orientation: "column",
        width: "50vw",
        gap: 5,

        height: "90vh",

    }, () => {
        vue.flow({ orientation: "row", gap: '1vw' }, () => {
            vue.select({
                list: "types",
                displayMethod: "display",
                selection: "sel",
                update: "setTypeFonction",
                mode: "dropdown",
                width: "20%"
            })
        })

        vue.custom({
            factory: "createDiv",
            init: "initThree",
            height: "90%"

        })
    })

})





type HeightFn = (p: THREE.Vector3) => number;

export class SphericalTerrainController {
    private keys = new Set<string>();

    private heading = 0; // yaw autour de la normale locale
    private pitch = 0;   // pitch autour de l’axe "right" local
    private readonly pitchLimit = Math.PI * 0.49;

    private dir = new THREE.Vector3(0, 1, 0); // direction “sol sous la caméra” (unitaire)
    private tmp = new THREE.Vector3();

    constructor(
        private camera: THREE.PerspectiveCamera,
        private dom: HTMLElement,
        private readonly baseRadius: number,        // rayon de la sphère “au niveau 0”
        private readonly heightFn: HeightFn,        // f: Vector3 -> number
        private readonly eyeHeight = 1.7,           // hauteur des yeux au-dessus du sol
        private readonly moveSpeed = 10,            // unités / seconde
        private readonly mouseSensitivity = 0.002   // rad / pixel
    ) { }

    /** Place la caméra initialement (position monde). */
    setPosition(worldPos: THREE.Vector3) {
        this.dir.copy(worldPos).normalize();
        this.snapToGround();
    }

    connect() {
        // Clavier
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);

        // Pointer lock recommandé (sinon movementX/Y sera souvent 0)
        this.dom.addEventListener("click", () => this.dom.requestPointerLock());

        // Souris
        window.addEventListener("mousemove", this.onMouseMove);
    }

    disconnect() {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("mousemove", this.onMouseMove);
    }

    update(dt: number) {
        // 1) repère local au point courant
        const up = this.dir; // normale locale (unitaire)

        const globalUp = new THREE.Vector3(0, 1, 0);
        const fallback = new THREE.Vector3(0, 0, 1);

        // east = globalUp x up (si proche des pôles, fallback)
        const east = this.tmp.copy(globalUp).cross(up);
        if (east.lengthSq() < 1e-10) east.copy(fallback).cross(up);
        east.normalize();

        // north = up x east
        const north = new THREE.Vector3().copy(up).cross(east).normalize();

        // 2) direction “forward” dans le plan tangent (heading)
        const cosH = Math.cos(this.heading);
        const sinH = Math.sin(this.heading);

        const forwardTangent = new THREE.Vector3()
            .copy(north).multiplyScalar(cosH)
            .addScaledVector(east, sinH)
            .normalize();

        const rightTangent = new THREE.Vector3()
            .copy(east).multiplyScalar(cosH)
            .addScaledVector(north, -sinH)
            .normalize();

        // 3) déplacement clavier dans le plan tangent
        let fwd = 0, strafe = 0;
        if (this.keys.has("KeyZ") || this.keys.has("ArrowUp")) fwd += 1;
        if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
        if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
        if (this.keys.has("KeyQ") || this.keys.has("ArrowLeft")) strafe -= 1;

        if (fwd !== 0 || strafe !== 0) {
            const disp = new THREE.Vector3()
                .addScaledVector(forwardTangent, fwd)
                .addScaledVector(rightTangent, strafe);

            // normaliser pour vitesse constante en diagonale
            disp.normalize().multiplyScalar(this.moveSpeed * dt);

            // On “pousse” la direction sur la tangente, puis on renormalise
            // (approximation correcte pour petits pas)
            this.dir.addScaledVector(disp, 1 / this.currentRadiusApprox()).normalize();

            // recoller au sol après déplacement
            this.snapToGround();
        }

        // 4) orientation caméra (pitch autour de rightTangent)
        const cosP = Math.cos(this.pitch);
        const sinP = Math.sin(this.pitch);

        // forward = forwardTangent*cos(pitch) + up*sin(pitch)
        const forward = new THREE.Vector3()
            .copy(forwardTangent).multiplyScalar(cosP)
            .addScaledVector(up, sinP)
            .normalize();

        this.camera.up.copy(up);
        this.camera.lookAt(this.camera.position.clone().add(forward));
    }

    // ---- internals ----

    private snapToGround() {
        const ground = this.baseRadius + this.heightFn(this.dir) + this.eyeHeight;
        this.camera.position.copy(this.dir).multiplyScalar(ground);
    }

    private currentRadiusApprox() {
        // approximation locale pour convertir un déplacement monde en delta de direction
        // (suffit pour la plupart des usages)
        return this.baseRadius + this.heightFn(this.dir) + this.eyeHeight;
    }

    private onKeyDown = (e: KeyboardEvent) => {
        this.keys.add(e.code);
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    };

    private onMouseMove = (e: MouseEvent) => {
        // Ne réagit vraiment que si pointer lock actif
        if (document.pointerLockElement !== this.dom) return;

        this.heading -= e.movementX * this.mouseSensitivity;
        this.pitch -= e.movementY * this.mouseSensitivity;

        // clamp pitch
        this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch));
    };
}




// Géométrie


// Animation

// Contrôles clavier (peuvent coexister avec OrbitControls)
/*
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
  controls.update();
});
*/


