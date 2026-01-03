import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updateFormulaPanel } from './formule';
import { creerFunction, distance, PointFeature, TypeFonction } from './spi';
import { defineVue } from './node_modules/tauri-kargo-tools/src/vue';
import { PlaneteEditeur } from './app';
import { ChoixCouleur, SelectionCouleur } from './menu-couleur';
import { PlaneteNavigation } from './three-planete-navigation';

import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api";
// MarkerSelection.ts (ou dans le même fichier)


export type Marker = THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;

export class MarkerSelection {
  private selected: Marker | null = null;

  // Couleurs (à adapter)
  public readonly defaultColor = new THREE.Color(0x66aaff);
  public readonly selectedColor = new THREE.Color(0xffaa00);
  planete!: Planete

  /**
   * Crée un marqueur (petite sphère) avec un matériau dédié (recommandé pour ~40 objets).
   */
  createMarker(markerRadius = 0.08): Marker {
    const geom = new THREE.SphereGeometry(markerRadius, 16, 12);
    const mat = new THREE.MeshStandardMaterial({ color: this.defaultColor.clone() });

    const marker = new THREE.Mesh(geom, mat) as Marker;

    // Couleur "normale" à restaurer lors d'une désélection
    marker.userData.normalColor = mat.color.clone();

    return marker;
  }

  /**
   * Sélectionne un marqueur : l'ancien revient à sa couleur normale, le nouveau prend la couleur sélection.
   */
  select(marker: Marker | null) {
    if (this.selected) {
      const normal = this.selected.userData.normalColor as THREE.Color | undefined;
      if (normal) this.selected.material.color.copy(normal);
    }

    this.selected = marker;

    if (this.selected) {
      this.selected.material.color.copy(this.selectedColor);
      if (this.planete) {
        this.planete.markerSelectionne = true
      }
    } else {
      if (this.planete) {
        this.planete.markerSelectionne = false
      }
    }
  }

  getSelected(): Marker | null {
    return this.selected;
  }
}

interface ColorFeature {
  r: PointFeature<THREE.Vector3>[],
  g: PointFeature<THREE.Vector3>[],
  b: PointFeature<THREE.Vector3>[]
}


export class SphereMarkerTool {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private readonly markers = new THREE.Group();
  private readonly selection = new MarkerSelection();

  // Paramètres
  public markerRadius = 0.08;
  public wheelStep = 0.03; // distance par "cran" molette
  public minOffset = 0; // autorise un léger enfoncement dans la sphère
  public maxOffset = 2.0;  // éloignement max*
  mapMarker: Map<Marker, THREE.Vector3> = new Map()

  /**
   * @param sphereMesh Mesh de la "grosse" sphère (celle qu'on clique)
   * @param baseRadius Rayon de référence (si non déformée)
   * @param getRadiusAtDir Optionnel : si sphère déformée radialement, donne le rayon de surface en fonction de la direction unitaire
   */
  constructor(

    planete: Planete,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.Camera,
    private readonly scene: THREE.Scene,
    private readonly sphereMesh: THREE.Mesh,
    private readonly baseRadius: number
  ) {
    this.selection.planete = planete
    this.sphereMesh.add(this.markers);
    const el = this.renderer.domElement;

    el.addEventListener("pointerdown", this.onPointerDown);
    //  el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  dispose() {
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("wheel", this.onWheel);

    // Optionnel : cleanup des marqueurs si tu veux tout enlever
    // this.scene.remove(this.markers);
    // this.markers.clear();
  }

  getSelectedMarker(): Marker | null {
    return this.selection.getSelected();
  }

  private onPointerDown = (e: PointerEvent) => {
    this.setNDCFromEvent(e);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    // 1) Sélection d'un marqueur si on clique dessus
    const markerHits = this.raycaster.intersectObjects(this.markers.children, false);
    if (markerHits.length > 0) {
      const m = markerHits[0].object as Marker;
      this.selection.select(m);
      return;
    }

    // 2) Sinon : clic sur la sphère principale => création d'un nouveau marqueur
    const sphereHits = this.raycaster.intersectObject(this.sphereMesh, false);
    if (sphereHits.length === 0) {
      // clic dans le vide => désélection
      this.selection.select(null);
      return;
    }

    const hit = sphereHits[0];
    this.createMarkerAt(hit.point);
    this.selection.planete.saveMarkers()
  };

  private onWheel = (e: WheelEvent) => {
    const selected = this.selection.getSelected();
    if (!selected) return;

    // Empêche le zoom page (et souvent OrbitControls si tu le laisses actif)
    e.preventDefault();

    // Convention : deltaY > 0 => éloigner ; deltaY < 0 => rapprocher (inverse si tu préfères)
    const sign = e.deltaY > 0 ? 1 : -1;

    const currentOffset = (selected.userData.offset as number) ?? 0;
    let nextOffset = currentOffset + sign * this.wheelStep;
    nextOffset = Math.max(this.minOffset, Math.min(this.maxOffset, nextOffset));

    selected.userData.offset = nextOffset;
    this.updateMarkerPosition(selected);
  };

  private setNDCFromEvent(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  createMarkerAt(worldPoint: THREE.Vector3) {
    // hit.point est WORLD -> on passe en LOCAL de la sphère
    const localPoint = this.sphereMesh.worldToLocal(worldPoint.clone());

    // direction radiale LOCALE (centre = 0,0,0)
    const dirUnit = localPoint.clone().normalize();

    // rayon de la surface déformée à cette direction
    const drSurface = this.selection.planete.F ? this.selection.planete.F(dirUnit) : 0
    const rSurface = this.baseRadius + drSurface;

    const marker = this.selection.createMarker(this.markerRadius);
    this.mapMarker.set(marker, worldPoint)

    marker.userData.color = this.selection.planete.couleurCourante
    marker.userData.dir = dirUnit;     // direction unitaire locale
    marker.userData.offset = drSurface;        // offset "y" du marqueur vs surface

    // position initiale : sur la surface déformée (offset=0)
    marker.position.copy(dirUnit).multiplyScalar(rSurface);

    this.markers.add(marker);
    this.selection.select(marker);
    return marker
  }


  private updateMarkerPosition(marker: Marker) {
    const dirUnit = (marker.userData.dir as THREE.Vector3).clone().normalize();
    const offset = (marker.userData.offset as number) ?? 0;

    const surfaceRadius = this.baseRadius;
    const r = surfaceRadius + offset;

    marker.position.copy(dirUnit.multiplyScalar(r));
  }

  public deleteSelectedMarker(): boolean {
    const m = this.getSelectedMarker();
    if (!m) return false;
    this.mapMarker.delete(m)
    // 1) désélectionner (restaure la couleur, évite référence pendante)
    // On doit appeler selection.select(null) (donc expose une méthode pour ça)
    this.selection.select(null);

    // 2) retirer du groupe
    this.markers.remove(m);

    // 3) libérer ressources GPU
    m.geometry.dispose();
    m.material.dispose();

    return true;
  }
  public setSelectedMarkerColor(color: THREE.Color) {
    const m = this.getSelectedMarker();
    if (!m) return false;
    m.userData.color = color
  }
  public moveSelectedMarker(delta: number): boolean {
    const m = this.getSelectedMarker();
    if (!m) return false;

    const currentOffset = (m.userData.offset as number) ?? 0;
    let nextOffset = currentOffset + delta;

    nextOffset = Math.max(this.minOffset, Math.min(this.maxOffset, nextOffset));

    m.userData.offset = nextOffset;
    this.updateMarkerPosition(m);
    return true;
  }

  public setSelectedMarkerOffset(offset: number): boolean {
    const m = this.getSelectedMarker();
    if (!m) return false;

    this.setMarkerOffset(m, offset)


    return true;
  }
  setMarkerOffset(m: Marker, offset: number) {
    const clamped = Math.max(this.minOffset, Math.min(this.maxOffset, offset));
    m.userData.offset = clamped;
    this.updateMarkerPosition(m);
  }

  public getSelectedMarkerOffset(): number | null {
    const m = this.getSelectedMarker();
    if (!m) return null;
    return (m.userData.offset as number) ?? 0;
  }

  public getAllMarkerData(): MarkerData[] {
    const out: MarkerData[] = []
    for (const obj of this.markers.children) {
      const m = obj as Marker;
      const storedDir = m.userData.dir as THREE.Vector3;
      const color = m.userData.color as THREE.Color
      const offset = (m.userData.offset as number) ?? 0;
      const md: MarkerData = {
        color: { x: color.r, y: color.g, z: color.b },
        dir: { x: storedDir.x, y: storedDir.y, z: storedDir.z },
        h: offset,
        worldPos: this.mapMarker.get(m)!

      }
      out.push(md)
    }
    return out

  }
  public getAllPointFeatures(): PointFeature<THREE.Vector3>[] {
    const out: PointFeature<THREE.Vector3>[] = [];

    for (const obj of this.markers.children) {
      const m = obj as Marker;

      const dirUnit = new THREE.Vector3();
      const storedDir = m.userData.dir as THREE.Vector3 | undefined;

      if (storedDir) {
        dirUnit.copy(storedDir).normalize();
      } else {
        // fallback : derive depuis position locale du marqueur
        dirUnit.copy(m.position).normalize();
      }

      const offset = (m.userData.offset as number) ?? 0;

      out.push({ value: dirUnit, y: offset });
    }

    return out;
  }
  public getAllColorFeatures(): ColorFeature {
    const out: ColorFeature = { b: [], g: [], r: [] }

    for (const obj of this.markers.children) {
      const m = obj as Marker;

      const dirUnit = new THREE.Vector3();
      const storedDir = m.userData.dir as THREE.Vector3 | undefined;

      if (storedDir) {
        dirUnit.copy(storedDir).normalize();
      } else {
        // fallback : derive depuis position locale du marqueur
        dirUnit.copy(m.position).normalize();
      }

      const offset = m.userData.color as THREE.Color

      out.r.push({ value: dirUnit, y: offset.r });
      out.g.push({ value: dirUnit, y: offset.g });
      out.b.push({ value: dirUnit, y: offset.b });
    }

    return out;
  }



}

interface MarkerData {
  color: THREE.Vector3Like
  worldPos: THREE.Vector3Like
  dir: THREE.Vector3Like
  h: number
}


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



export class Planete {
  data: PointFeature<THREE.Vector2>[] = [];
  base!: DeformBase
  currentSelection: number = 0
  tf: TypeFonction = "SIN"
  sel: number[] = [1]
  types: TypeFonction[] = ["DP", "SIN", "RDP"];
  choixCouleur!: ChoixCouleur
  couleurCourante = new THREE.Color("#FF0000")
  client: TauriKargoClient = createClient()

  display(t: TypeFonction): string {
    return t
  }
  markerSelectionne = false
  F!: (p: THREE.Vector3) => number


  choisirCouleur(): ChoixCouleur {
    this.choixCouleur = new ChoixCouleur()
    this.choixCouleur.planete = this
    return this.choixCouleur


  }
  saveMarkers() {
    const data = this.tool.getAllMarkerData()
    this.client.writeFileText("planete.json", JSON.stringify(data))


  }
  async loadMarkers() {
    try {
      const s = await this.client.readFileText("planete.json")
      const data: MarkerData[] = JSON.parse(s)
      for (const d of data) {
        const m = this.tool.createMarkerAt(new THREE.Vector3(d.worldPos.x, d.worldPos.y, d.worldPos.z))
        const color = new THREE.Color()
        color.setRGB(d.color.x, d.color.y, d.color.z)
        m.userData.color = color

        m.userData.dir = new THREE.Vector3(d.dir.x, d.dir.y, d.dir.z)

        this.tool.setMarkerOffset(m, d.h)

      }
      this.tranformSphere()

    } catch (e) {

    }


  }

  tranformSphere() {
    const feature = this.tool.getAllPointFeatures()
    const colorFeature = this.tool.getAllColorFeatures()
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
  eloignerDuCentre() {
    this.tool.moveSelectedMarker(0.1)
    this.tranformSphere()
    this.saveMarkers()

  }
  raprocherDuCentre() {
    this.tool.moveSelectedMarker(-0.1)
    this.tranformSphere()
    this.saveMarkers()
  }
  supprimer() {

    const m = this.tool.getSelectedMarker()
    if (m) {
      if (this.tool.deleteSelectedMarker()) {
        this.markerSelectionne = false
        this.tranformSphere()
        this.saveMarkers()
      }

    }

  }
  scene!: THREE.Scene
  controlPointsGroup !: THREE.Group
  mesh!: THREE.Mesh
  div!: HTMLDivElement
  tool!: SphereMarkerTool
  createDiv(): HTMLDivElement {
    this.div = document.createElement("div")
    return this.div
  }
  setSelectedMarkerColor(c: THREE.Color) {
    this.tool.setSelectedMarkerColor(c)
    this.saveMarkers()

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
    this.tool = new SphereMarkerTool(this, renderer, camera, this.scene, this.mesh, r)

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
    this.loadMarkers()

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



defineVue(Planete, (vue) => {
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
      vue.staticButton({ action: "eloignerDuCentre", label: "Eloigner", width: "20%", enable: "markerSelectionne" })
      vue.staticButton({ action: "raprocherDuCentre", label: "Raprocher", width: "20%", enable: "markerSelectionne" })
      vue.staticButton({ action: "supprimer", label: "Supprimer", width: "20%", enable: "markerSelectionne" })
      vue.menu({ label: "Couleur", id: "choixCouleur", action: "choisirCouleur", name: "choixCouleur", buttonWidth: "20%" })
 
    })

    vue.custom({
      factory: "createDiv",
      init: "initThree",
      height: "90%"

    })
  })

})







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


