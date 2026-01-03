import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updateFormulaPanel } from './formule';
import { creerFunction, distance, PointFeature, TypeFonction } from './spi';
import { defineVue } from './node_modules/tauri-kargo-tools/src/vue';
import { PlaneteEditeur } from './app';
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
        const tmpF= creerFunction(this.tf, feature, distance)
        this.F = (p:THREE.Vector3)=> { return this.facto*tmpF(p)+this.rayon}
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
    facto =4


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

        const meshAndControlPointsGroup = new THREE.Group();

        this.scene.add(meshAndControlPointsGroup);
        const r = 1;
        const w = 80;
        const h = 50;

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

        const rayon = 10
        const heightWorld: HeightFn = (worldDir) => {
         const localDir = worldDir.clone().applyQuaternion(qInv).normalize();
           return this.F(localDir);
          
        };
        this.cameraController = new SphericalTerrainController(camera, renderer.domElement, 1, heightWorld, 0.25,   // eyeHeight (à ajuster)
            0.8,    // speed (à ajuster)
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

            pointLight.position.x = Math.cos(t * 0.8) * 2.2;
            pointLight.position.z = Math.sin(t * 0.8) * 2.2;
            pointLight.position.y = 1.8 + Math.sin(t * 1.6) * 0.3;
    
            this.cameraController.update(dt);
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





export type HeightFn = (worldDirUnit: THREE.Vector3) => number;

/**
 * FPS-like controller constrained to a spherical terrain:
 * - ArrowUp/ArrowDown (and Z/S) move forward/backward along the local tangent plane
 * - ArrowLeft/ArrowRight (and Q/D) strafe left/right
 * - Mouse (pointer-lock) controls heading/pitch
 * - Camera is snapped to terrain radius: R + height(dir) + eyeHeight
 *
 * Key fix vs pole singularities:
 * - Maintains a persistent tangent "northRef" and parallel-transports it when moving,
 *   preventing sudden basis flips near poles.
 */
export class SphericalTerrainController {
  private keys = new Set<string>();

  private heading = 0; // yaw around local up
  private pitch = 0;   // pitch around local right
  private readonly pitchLimit = Math.PI * 0.49;

  private dir = new THREE.Vector3(0, 1, 0);     // world-unit direction from center to ground point
  private northRef = new THREE.Vector3(0, 0, 1); // persistent tangent reference
  private tmp = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,                   // use renderer.domElement
    private readonly baseRadius: number,        // sphere radius at height 0
    private readonly heightFn: HeightFn,        // height(worldDirUnit) -> number
    private readonly eyeHeight = 0.05,          // small if baseRadius=1
    private readonly moveSpeed = 0.8,           // units/second on the surface
    private readonly mouseSensitivity = 0.002   // rad/pixel
  ) {}

  /** Set initial camera position (world). */
  setPosition(worldPos: THREE.Vector3) {
    this.dir.copy(worldPos).normalize();

    // Ensure northRef is tangent to dir (avoid degeneracy)
    this.northRef.projectOnPlane(this.dir);
    if (this.northRef.lengthSq() < 1e-10) {
      this.northRef.set(1, 0, 0).projectOnPlane(this.dir);
    }
    this.northRef.normalize();

    this.snapToGround();
  }

  connect() {
    // Capture phase helps when UI elements (select, inputs) eat arrows
    document.addEventListener("keydown", this.onKeyDown, { capture: true });
    document.addEventListener("keyup", this.onKeyUp, { capture: true });

    // Pointer lock for mouse look
    this.dom.addEventListener("click", () => this.dom.requestPointerLock());
    document.addEventListener("mousemove", this.onMouseMove);
  }

  disconnect() {
    document.removeEventListener("keydown", this.onKeyDown, { capture: true } as any);
    document.removeEventListener("keyup", this.onKeyUp, { capture: true } as any);
    document.removeEventListener("mousemove", this.onMouseMove);
  }

  update(dt: number) {
    if (!isFinite(dt) || dt <= 0) dt = 0;

    const oldUp = this.dir.clone();
    const up = this.dir; // local normal (world)

    // Build a continuous tangent basis from northRef
    const north = this.tmp.copy(this.northRef).projectOnPlane(up);
    if (north.lengthSq() < 1e-10) {
      // If somehow degenerate, pick a fallback and re-project
      north.set(1, 0, 0).projectOnPlane(up);
    }
    north.normalize();

    const east = new THREE.Vector3().copy(up).cross(north).normalize();
    // Re-orthonormalize north to be safe
    north.copy(east).cross(up).normalize();

    // Save back the cleaned, tangent north reference
    this.northRef.copy(north);

    // Heading rotation inside tangent plane
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

    // Keyboard movement intent
    let fwd = 0, strafe = 0;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyZ")) fwd += 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) fwd -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) strafe += 1;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyQ")) strafe -= 1;

    if (fwd !== 0 || strafe !== 0) {
      const disp = new THREE.Vector3()
        .addScaledVector(forwardTangent, fwd)
        .addScaledVector(rightTangent, strafe);

      // Constant speed even on diagonals
      disp.normalize().multiplyScalar(this.moveSpeed * dt);

      // Small-step update on the sphere: push direction by tangent displacement
      this.dir.addScaledVector(disp, 1 / this.currentRadiusApprox()).normalize();

      // Parallel transport of northRef from oldUp to new dir to avoid "self-rotation"
      const qUp = new THREE.Quaternion().setFromUnitVectors(oldUp, this.dir);
      this.northRef.applyQuaternion(qUp).projectOnPlane(this.dir).normalize();

      // Snap camera to terrain
      this.snapToGround();
    }

    // Camera orientation (pitch around local right axis)
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);

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
    return this.baseRadius + this.heightFn(this.dir) + this.eyeHeight;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);

    // prevent scroll / UI capture for arrows
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

    this.heading -= e.movementX * this.mouseSensitivity;
    this.pitch   -= e.movementY * this.mouseSensitivity;

    this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch));
  };
}
