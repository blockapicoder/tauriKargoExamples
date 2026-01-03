import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updateFormulaPanel } from './formule';
import { creerFunction, distance, PointFeature, TypeFonction } from './spi';
import { defineVue } from './node_modules/tauri-kargo-tools/src/vue';
import { PagePrincpal, PlaneteEditeur } from './app';
import { ChoixCouleur } from './menu-couleur';
import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api";




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
interface MarkerData {
    color: THREE.Vector3Like
    worldPos: THREE.Vector3Like
    dir: THREE.Vector3Like
    h: number
}


export class PlaneteNavigation {
    titrePagePrincipal = "Page principal"
    pointFeatures: PointFeature<THREE.Vector3>[] = [];
    colorFeature: ColorFeature = { b: [], g: [], r: [] }
    base!: DeformBase
    currentSelection: number = 0
    tf: TypeFonction = "SIN"
    sel: number[] = [1]
    types: TypeFonction[] = ["DP", "SIN", "RDP"];
    choixCouleur!: ChoixCouleur
    couleurCourante = new THREE.Color("#FF0000")
    _pagePrincipal!: PagePrincpal

    display(t: TypeFonction): string {
        return t
    }
    markerSelectionne = false
    F!: (p: THREE.Vector3) => number
    pagePrincipal() {
        return this._pagePrincipal
    }


    tranformSphere() {
        const feature = this.pointFeatures
        const colorFeature = this.colorFeature
        const c: THREE.Vector3 = this.base.centerLocal
        console.log("center", c)


        const distance = (a: THREE.Vector3, b: THREE.Vector3) => {


            return a.distanceToSquared(b)
        }
        const tmpF = creerFunction(this.tf, feature, distance)
        this.F = (p: THREE.Vector3) => { return this.facto * tmpF(p) + this.rayon }
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
    client: TauriKargoClient = createClient()
    rayon = 10
    facto = 15


    createDiv(): HTMLDivElement {
        this.div = document.createElement("div")
        return this.div
    }
    async initThree() {


        this.scene = new THREE.Scene();

        // Lumières
        const ambient = new THREE.AmbientLight(0xffffff, 0.25);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(0, 0, 0);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 20;
        dirLight.shadow.normalBias = 0.02;
        this.scene.add(dirLight);

        // Point light colorée animée
        // Remplace le PointLight par un SpotLight "headlamp"
        const headLight = new THREE.SpotLight(0xffffff, 80, 0, Math.PI / 2, 0.4, 1);
        headLight.castShadow = false;
        this.scene.add(headLight);
        this.scene.add(headLight.target);

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

        const meshAndControlPointsGroup = new THREE.Group();

        this.scene.add(meshAndControlPointsGroup);
        const r = 1;
        const w = 150;
        const h = 100;

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
        await this.loadMarkers()
        this.tranformSphere()
        this.mesh.updateWorldMatrix(true, true);

        // Quaternion monde du mesh (inclut la rotation du parent)
        const qWorld = this.mesh.getWorldQuaternion(new THREE.Quaternion());
        const qInv = qWorld.clone().invert();

        // heightFn qui accepte un dir en MONDE mais appelle F en LOCAL


        const heightWorld: HeightFn = (worldDir) => {
            const localDir = worldDir.clone().applyQuaternion(qInv).normalize();
            return this.F(localDir);

        };
        this.cameraController = new SphericalTerrainController(camera, renderer.domElement, 1, heightWorld, 0.5,   // eyeHeight (à ajuster)
            4,    // speed (à ajuster)
            0.002)
        let p = new THREE.Vector3(0, 1, 0)
        //const offset = heightWorld(p)
        // p = new THREE.Vector3(0, 1 + offset, 0)

        this.cameraController.setPosition(p);
        this.cameraController.connect()
        const animate = () => {
            const dt = clock.getDelta();        // un seul delta
            const t = clock.elapsedTime;
            requestAnimationFrame(animate);

            this.cameraController.update(dt);

            // au-dessus de la tête + vers l’avant
            const headOffset = 1.2;   // ajuste
            const forwardOffset = 0;

            const fwd = new THREE.Vector3();
            camera.getWorldDirection(fwd);

            headLight.position
                .copy(camera.position)
                .addScaledVector(this.cameraController.up, headOffset)
                .addScaledVector(fwd, forwardOffset);

            // viser devant (sinon le spot ne sert à rien)
            headLight.target.position
                .copy(camera.position)
                .addScaledVector(fwd, forwardOffset);

            headLight.target.updateMatrixWorld();

            // controls.update(); // nécessaire pour enableDamping
            renderer.render(this.scene, camera);
        };
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        this.div.appendChild(renderer.domElement);



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
    async loadMarkers() {
        try {
            const s = await this.client.readFileText("planete.json")
            const data: MarkerData[] = JSON.parse(s)
            for (let md of data) {
                this.pointFeatures.push({
                    value: new THREE.Vector3(md.dir.x, md.dir.y, md.dir.z),
                    y: md.h
                })
                this.colorFeature.r.push({
                    value: new THREE.Vector3(md.dir.x, md.dir.y, md.dir.z),
                    y: md.color.x
                })
                this.colorFeature.g.push({
                    value: new THREE.Vector3(md.dir.x, md.dir.y, md.dir.z),
                    y: md.color.y
                })
                this.colorFeature.b.push({
                    value: new THREE.Vector3(md.dir.x, md.dir.y, md.dir.z),
                    y: md.color.z
                })
            }

            this.tranformSphere()

        } catch (e) {

        }


    }

}


//updateFormulaPanel();



defineVue(PlaneteNavigation, (vue) => {
    vue.flow({
        orientation: "column",
        width: "100vw",
        gap: 5,

        height: "90vh",

    }, () => {
        vue.bootVue({ factory:"pagePrincipal" , label:"titrePagePrincipal"})
        vue.custom({
            factory: "createDiv",
            init: "initThree",
            height: "90%"

        })
    })

})


export type HeightFn = (worldUpUnit: THREE.Vector3) => number;

/**
 * Repère local (orthonormal) attaché au point de contact sur la sphère :
 * - up      : normale du plan tangent (radiale, du centre vers le sol)  (unitaire)
 * - forward : direction d’avancement dans le plan tangent              (unitaire)
 * - right   : axe latéral dans le plan tangent                         (unitaire)
 *
 * Déplacements par rotations (pas d’addition de vecteurs sur la sphère) :
 * - avancer/reculer : rotation du repère autour de right
 * - pas de côté     : rotation du repère autour de forward
 * - tourner G/D     : rotation du repère autour de up (yaw)
 *
 * La caméra est “fixe” dans ce repère :
 * - position = up * (rayonSol + eyeHeight)
 * - orientation = forward, avec un pitch autour de right (optionnel)
 */
export class SphericalTerrainController {
    private readonly keys = new Set<string>();

    // Repère
    readonly up = new THREE.Vector3(0, 1, 0);
    private readonly forward = new THREE.Vector3(0, 0, 1); // tangent
    private readonly right = new THREE.Vector3(1, 0, 0);   // tangent

    // Camera look (dans le repère)
    private pitch = 0;
    private readonly pitchLimit = Math.PI * 0.49;

    // Scratch (zéro allocation en update)
    private readonly q = new THREE.Quaternion();
    private readonly vTmp = new THREE.Vector3();
    private readonly vTmp2 = new THREE.Vector3();

    private readonly onClick = () => this.dom.requestPointerLock();

    constructor(
        private readonly camera: THREE.PerspectiveCamera,
        private readonly dom: HTMLElement,
        private readonly baseRadius: number,
        private readonly heightFn: HeightFn,
        private readonly eyeHeight = 0.05,
        private readonly moveSpeed = 0.8,          // unités/sec sur la surface
        private readonly mouseSensitivity = 0.002  // rad/pixel
    ) { }

    /** Initialise à partir d’une position monde. La direction initiale est déduite de la caméra. */
    setPosition(worldPos: THREE.Vector3) {
        this.up.copy(worldPos).normalize();

        // forward = direction caméra projetée sur le plan tangent
        this.camera.getWorldDirection(this.vTmp); // déjà normalisé
        this.vTmp.projectOnPlane(this.up);

        if (this.vTmp.lengthSq() < 1e-12) {
            // fallback si caméra alignée avec up
            this.vTmp.set(0, 0, 1).projectOnPlane(this.up);
            if (this.vTmp.lengthSq() < 1e-12) this.vTmp.set(1, 0, 0).projectOnPlane(this.up);
        }

        this.forward.copy(this.vTmp).normalize();

        // right = up × forward (repère main droite), puis forward re-orthonormalisé
        this.right.copy(this.up).cross(this.forward).normalize();
        this.forward.copy(this.right).cross(this.up).normalize();

        this.snapToGround();
    }

    connect() {
        document.addEventListener("keydown", this.onKeyDown, { capture: true });
        document.addEventListener("keyup", this.onKeyUp, { capture: true });

        this.dom.addEventListener("click", this.onClick);
        document.addEventListener("mousemove", this.onMouseMove);
    }

    disconnect() {
        document.removeEventListener("keydown", this.onKeyDown, { capture: true } as any);
        document.removeEventListener("keyup", this.onKeyUp, { capture: true } as any);

        this.dom.removeEventListener("click", this.onClick);
        document.removeEventListener("mousemove", this.onMouseMove);
    }

    update(dt: number) {
        if (!isFinite(dt) || dt <= 0) return;

        // Inputs déplacement (ZQSD + flèches)
        let fwd = 0, strafe = 0;
        if (this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.keys.has("KeyZ")) fwd += 1;
        if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) fwd -= 1;
        if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) strafe += 1;
        if (this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.keys.has("KeyQ")) strafe -= 1;

        if (fwd !== 0 || strafe !== 0) {
            // vitesse constante même en diagonale : normaliser l’intention (fwd, strafe)
            const len = Math.hypot(fwd, strafe);
            const nf = fwd / len;
            const ns = strafe / len;

            // angle = arcLength / radius
            const radius = this.currentSurfaceRadius();
            const angle = (this.moveSpeed * dt) / Math.max(1e-9, radius);

            // Appliquer les rotations dans le repère :
            // - avancer/reculer : autour de right
            // - pas de côté     : autour de forward
            // Ordre: forward puis strafe (ou inverse) — à petit dt, l’écart est négligeable.
            if (nf !== 0) this.rotateFrame(this.right, nf * angle);
            if (ns !== 0) this.rotateFrame(this.forward, ns * angle);

            // Re-snap hauteur après déplacement
            this.snapToGround();
        } else {
            // Même sans bouger, la hauteur peut changer si heightFn dépend d'autre chose (rare), sinon optionnel.
            this.snapToGround();
        }

        // Caméra "fixe dans le repère" : up = normale locale
        this.camera.up.copy(this.up);

        // lookDir = forward pitché autour de right
        const lookDir = this.vTmp.copy(this.forward);
        if (this.pitch !== 0) {
            this.q.setFromAxisAngle(this.right, this.pitch);
            lookDir.applyQuaternion(this.q).normalize();
        }

        this.camera.lookAt(this.vTmp2.copy(this.camera.position).add(lookDir));
    }

    // ---------------- internals ----------------

    /** Rotation rigide du repère autour d’un axe (exprimé en monde). */
    private rotateFrame(axis: THREE.Vector3, angle: number) {
        if (angle === 0) return;

        this.q.setFromAxisAngle(axis, angle);

        // rotation du repère complet (caméra fixe dedans)
        this.up.applyQuaternion(this.q);
        this.forward.applyQuaternion(this.q);
        this.right.applyQuaternion(this.q);

        // Nettoyage numérique (orthonormalisation)
        this.up.normalize();

        // forward tangent à up
        this.forward.projectOnPlane(this.up);
        if (this.forward.lengthSq() < 1e-12) {
            // fallback : reconstruire un forward tangent depuis right si possible
            this.forward.copy(this.right).cross(this.up);
        }
        this.forward.normalize();

        // right = up × forward, puis forward re-orthonormalisé
        this.right.copy(this.up).cross(this.forward).normalize();
        this.forward.copy(this.right).cross(this.up).normalize();
    }

    private snapToGround() {
        const r = this.currentSurfaceRadius() + this.eyeHeight;
        this.camera.position.copy(this.up).multiplyScalar(r);
    }

    /** Rayon "sol" (sans eyeHeight) pour convertir distance->angle sur la surface. */
    private currentSurfaceRadius() {
        return this.baseRadius + this.heightFn(this.up);
    }

    private onKeyDown = (e: KeyboardEvent) => {
        this.keys.add(e.code);

        if (e.code.startsWith("Arrow")) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    };

    private onMouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement !== this.dom) return;

        // Tourner gauche/droite : rotation du repère autour de up (yaw)
        const yaw = -e.movementX * this.mouseSensitivity;
        if (yaw !== 0) this.rotateFrame(this.up, yaw);

        // Pitch caméra dans le repère (sans modifier le repère lui-même)
        this.pitch += e.movementY * this.mouseSensitivity;
        this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch));

    };
}
