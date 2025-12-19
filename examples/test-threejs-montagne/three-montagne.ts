import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updateFormulaPanel } from './formule';
import { creerFunction, distance, PointFeature, TypeFonction } from './spi';
import { defineVue } from './node_modules/tauri-kargo-tools/src/vue';

interface P {
  id: number;
  x: number;
  y: number;
  h: number;
}

export class Montagne {
  data: PointFeature<THREE.Vector2>[] = [

  ];
  currentSelection: number = 0
  tf: TypeFonction = "SIN"
  sel: number[] = [1]
  types: TypeFonction[] = ["DP", "SIN", "RDP"];

  display(t: TypeFonction): string {
    return t
  }

  F!: (p: THREE.Vector2) => number
  creerFunction() {
    this.F = creerFunction(this.tf, this.data, distance)
  }
  scene!: THREE.Scene
  controlPointsGroup !: THREE.Group
  mesh!: THREE.Mesh
  div!: HTMLDivElement
  createDiv(): HTMLDivElement {
    this.div = document.createElement("div")
    return this.div
  }
  initThree() {
    this.setData([{ x: 0.5, y: 0.5, h: 5, id: 0 }, { x: 1, y: 1, h: 5, id: 0 }])
    this.creerFunction()
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
    this.controlPointsGroup = new THREE.Group();
    meshAndControlPointsGroup.add(this.controlPointsGroup);
    this.scene.add(meshAndControlPointsGroup);
    this.geometry = new ParametricGeometry(
      (u, v, vec) => {
        const x = 100 * u;
        const y = 100 * v;
        const z = this.F(new THREE.Vector2(x,y));
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

    // Matériaux (wireframe dispo si besoin)
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
    });

    // Mesh
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

    animate();



  }
  drawControlPoints(points: PointFeature<THREE.Vector2>[], selection: number) {
    this.controlPointsGroup.clear();
    const sphereGeom = new THREE.SphereGeometry(0.07, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphereMatSelection = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    let idx = 0;
    for (const p of points) {
      let m = sphereMat;
      if (idx === selection) {
        m = sphereMatSelection;
      }
      idx++;
      const s = new THREE.Mesh(sphereGeom, m);
      // mapping surface :
      // x' = x/10 - 5 ; z' = y/10 - 5 ; y' = F(x,y)/10
      const xScene = p.value.x / 10 - 5;
      const zScene = p.value.y / 10 - 5;
      const yScene = this.F(new THREE.Vector2(p.value.x, p.value.y)) / 10;
      s.position.set(xScene, yScene, zScene);

      this.controlPointsGroup.add(s);
    }
  }
  geometry!: ParametricGeometry

  setTypeFonction() {
    if (this.sel.length === 0) {
      return
    }
    this.tf = this.types[this.sel[0]]


    this.creerFunction();
    this.geometry.dispose();
    this.geometry = new ParametricGeometry(
      (u, v, vec) => {
        const x = 100 * u;
        const y = 100 * v;
        const z = this.F(new THREE.Vector2( x, y));
        vec.setX(x / 10 - 5);
        vec.setZ(y / 10 - 5);
        vec.setY(z / 10);
      },
      50,
      50
    );
    this.mesh.geometry = this.geometry;
    this.drawControlPoints(this.data, this.currentSelection);
 
  }
  setData(ls: P[]) {
    const newData: PointFeature<THREE.Vector2>[] = ls.map((p) => {
      return {
        value: new THREE.Vector2(p.x * 100, p.y * 100),
        y: p.h,
      };
    });
    this.data = newData
  }
  setPoints(ls: P[], selection: number) {
    if (!this.geometry) {
      return;
    }
    this.setData(ls)
    this.currentSelection = selection
    this.F = creerFunction(this.tf, this.data,distance);
    this.geometry.dispose();
    this.geometry = new ParametricGeometry(
      (u, v, vec) => {
        const x = 100 * u;
        const y = 100 * v;
        const z = this.F(new THREE.Vector2(x, y));
        vec.setX(x / 10 - 5);
        vec.setZ(y / 10 - 5);
        vec.setY(z / 10);
      },
      50,
      50
    );
    this.mesh.geometry = this.geometry;
    this.drawControlPoints(this.data, selection);
    for (let p of this.data) {
      console.log(p.y, this.F(new THREE.Vector2(p.value.x, p.value.y)));
    }
  }

}


//updateFormulaPanel();



defineVue(Montagne, (vue) => {
  vue.flow({
    orientation: "column",
    width: "50vw",
    gap: 5,

    height: "90vh",

  }, () => {
    vue.select({
      list: "types",
      displayMethod: "display",
      selection: "sel",
      update: "setTypeFonction",
      mode: "dropdown"
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


