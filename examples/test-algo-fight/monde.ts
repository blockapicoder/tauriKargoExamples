import { RobotTypescriptFile } from "./robot-explorateur";
import { DataModelServer } from "./node_modules/tauri-kargo-tools/src/schema/server"
import { Ref } from "./node_modules/tauri-kargo-tools/src/schema/base"
import { model } from "./algofight-model"
import { runWorker } from "./worker-management"
import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api"
import { defineVue } from "./node_modules/tauri-kargo-tools/src/vue";
export interface MondeContexte {
    workerA: Worker
    workerB: Worker
}

let mondeContexte: MondeContexte | undefined = undefined
interface Pos {
    x: number
    y: number
}
const dataModel = new DataModelServer(model, "Joueur")
const pouvoirs = ["Population", "Vitesse", "Porte", "Transport", "Puissance", "Bouclier"] as const
const USINE_COUNT = 20
const USINE_RAYON = 15
const VIE_COUNT = 100
const ENERGIE_COUNT = 100

const RESSOURCE_RAYON = 5
const USINE_DISTANCE_MIN = 100
const RESSOURCE_DISTANCE_MIN = 35
type Joueur = Ref<typeof dataModel.def, "Joueur">
type Drone = Ref<typeof dataModel.def, "Drone">
type Target = Ref<typeof dataModel.def, "Drone"> | Ref<typeof dataModel.def, "Energie"> | Ref<typeof dataModel.def, "Vie"> | Ref<typeof dataModel.def, "Usine">
interface DroneState {
    ref: Drone
    target: Pos
    distance: number
    sx: number
    sy: number
    dep: number
}
function dist(p: Pos, q: Pos) {
    const dx = p.x - q.x
    const dy = p.y - q.y
    return Math.sqrt(dx * dx + dy * dy)
}

export class Monde {
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D
    robot1!: RobotTypescriptFile
    robot2!: RobotTypescriptFile

    sortie = ""
    client!: TauriKargoClient

    constructor() {
        this.client = createClient()
    }
    droneStates: DroneState[] = []
    joueurA!: Ref<typeof dataModel.def, "Joueur">
    joueurB!: Ref<typeof dataModel.def, "Joueur">
    loop() {
        this.droneStates = this.droneStates.filter((s) => !!dataModel.map[(s.ref.ref)] && this.process(s))

    }

    process(droneState: DroneState) {
        droneState.distance = droneState.distance - droneState.dep
        if (droneState.distance < 0) {
            droneState.ref.getValue().position = droneState.target
            return false
        }
        const p = droneState.ref.getValue().position
        p.x += droneState.sx
        p.y += droneState.sy
        return true;
    }

    clearWorld(w: number, h: number) {
        dataModel.map = {}
        dataModel.types = {}
        dataModel.idForModelElement = new Map()
        dataModel.idx = 0
        let gen = true
        do {
            const lst = dataModel.getRefs("Usine").map((ref) => ref.getValue())
            let x = Math.random() * w
            let y = Math.random() * h
            const pos: Pos = { x: x, y: y }
            if (lst.every((u) => {
                return dist(pos, u.position) >= USINE_DISTANCE_MIN
            })) {
                let ip = Math.trunc(Math.random() * (pouvoirs.length - 1))

                dataModel.createValue("Usine", {
                    position: pos,
                    technologie: pouvoirs[ip],
                    type: "Usine"
                })
            }

            gen = lst.length < USINE_COUNT
        } while (gen)
        gen = true
        do {
            const energies = dataModel.getRefs("Energie").map((ref) => ref.getValue())
            const vies = dataModel.getRefs("Vie").map((ref) => ref.getValue())
            const usines = dataModel.getRefs("Usine").map((ref) => ref.getValue())
            let x = Math.random() * w
            let y = Math.random() * h
            const pos: Pos = { x: x, y: y }
            if (vies.every((u) => {
                return dist(pos, u.position) >= RESSOURCE_DISTANCE_MIN
            }) && energies.every((u) => {
                return dist(pos, u.position) >= RESSOURCE_DISTANCE_MIN
            }) && usines.every((u) => {
                return dist(pos, u.position) >= RESSOURCE_DISTANCE_MIN
            })) {
                dataModel.createValue("Energie", {
                    position: pos,
                    type: "Energie"
                })
            }

            gen = energies.length < ENERGIE_COUNT
        } while (gen)
        gen = true
        do {
            const energies = dataModel.getRefs("Energie").map((ref) => ref.getValue())
            const vies = dataModel.getRefs("Vie").map((ref) => ref.getValue())
            const usines = dataModel.getRefs("Usine").map((ref) => ref.getValue())
            let x = Math.random() * w
            let y = Math.random() * h
            const pos: Pos = { x: x, y: y }
            if (vies.every((u) => {
                return dist(pos, u.position) >= RESSOURCE_DISTANCE_MIN
            }) && energies.every((u) => {
                return dist(pos, u.position) >= RESSOURCE_DISTANCE_MIN
            }) && usines.every((u) => {
                return dist(pos, u.position) >= RESSOURCE_DISTANCE_MIN
            })) {
                dataModel.createValue("Vie", {
                    position: pos,
                    type: "Vie"
                })
            }

            gen = vies.length < VIE_COUNT
        } while (gen)
        this.joueurA = dataModel.createValue("Joueur", { type: "Joueur" });
        this.joueurB = dataModel.createValue("Joueur", { type: "Joueur" });
        const lst = dataModel.getRefs("Usine")
        let usineJoueurA = lst[0]
        let usineJoueurB = lst[1]
        let distUsine = dist(usineJoueurA.getValue().position, usineJoueurB.getValue().position)
        for (let i = 0; i < lst.length; i++) {
            for (let j = i + 1; j < lst.length; j++) {
                const tmpUsineJoueurA = lst[i]
                const tmpUsineJoueurB = lst[j]
                const tmpDistUsine = dist(tmpUsineJoueurA.getValue().position, tmpUsineJoueurB.getValue().position)
                if (tmpDistUsine > distUsine) {
                    distUsine = tmpDistUsine
                    usineJoueurA = tmpUsineJoueurA
                    usineJoueurB = tmpUsineJoueurB

                }
            }
        }
        usineJoueurA.getValue().joueur = this.joueurA
        usineJoueurB.getValue().joueur = this.joueurB





    }
    fitCanvasToParent() {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, this.canvas.clientWidth);
        const h = Math.max(1, this.canvas.clientHeight);

        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);

        if (this.canvas.width !== pw) this.canvas.width = pw;
        if (this.canvas.height !== ph) this.canvas.height = ph;





        // unité = px CSS
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    }
    createCanvas() {
        this.canvas = document.createElement("canvas")
        // this.canvas.style.width = `100%`;
        // this.canvas.style.flex = "1 1 auto"
        //  this.canvas.style.display = "block"
        this.canvas.style.minHeight = "0"
        return this.canvas
    }
    initCanvas() {
        this.ctx = this.canvas.getContext("2d")!
        this.fitCanvasToParent()
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;

        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineWidth = 2;

        this.ctx.strokeStyle = "green"
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h)

        this.ctx.stroke();
        this.clearWorld(w, h)
        this.ctx.beginPath();
        const lst = dataModel.getRefs("Usine").map((ref) => ref.getValue())

        for (const u of lst) {
            this.ctx.beginPath();
            if (u.joueur === this.joueurA) {
                this.ctx.strokeStyle = "blue"
            } else
                if (u.joueur === this.joueurB) {
                    this.ctx.strokeStyle = "red"
                } else {
                    this.ctx.strokeStyle = "green"
                }
            this.ctx.arc(u.position.x, u.position.y, USINE_RAYON, 0, 2 * Math.PI)
            this.ctx.fillStyle = "green"
            this.ctx.fillText("U", u.position.x - 4, u.position.y + 4)
            this.ctx.stroke();
        }
        const energies = dataModel.getRefs("Energie").map((ref) => ref.getValue())
        const vies = dataModel.getRefs("Vie").map((ref) => ref.getValue())
        for (const u of energies) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = "orange"
            this.ctx.arc(u.position.x, u.position.y, RESSOURCE_RAYON, 0, 2 * Math.PI)


            this.ctx.stroke();
        }
        for (const u of vies) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = "white"
            this.ctx.arc(u.position.x, u.position.y, RESSOURCE_RAYON, 0, 2 * Math.PI)


            this.ctx.stroke();
        }
        this.ctx.restore();
    }
    getDroneSpeed(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Vitesse" && v.joueur === joueur
        }).length + 1
        return n * 2


    }
    initDroneState(joueur: Joueur, drone: Drone, target: Target) {
        const p = target.getValue().position
        const q = drone.getValue().position
        const dx = p.x - q.x
        const dy = p.y - q.y
        this.droneStates = this.droneStates.filter((e) => e.ref !== drone)
        const d = Math.sqrt(dx * dx + dy * dy)
        const speed = this.getDroneSpeed(joueur)
        const ds: DroneState = {
            ref: drone,
            distance: d,
            sx: speed * dx / d,
            sy: speed * dy / d,
            dep: speed,
            target: p
        }
        this.droneStates.push(ds)

    }

    async init(div: HTMLDivElement) {

        if (mondeContexte) {
            mondeContexte.workerA.terminate()
            mondeContexte.workerB.terminate()
        }


        const typescriptSourceRobot1: string = await this.robot1.getSource()
        const typescriptSourceRobot2: string = await this.robot2.getSource()
        const javascriptSourceRobot1 = await this.client.typescriptTranspile(typescriptSourceRobot1)
        const javascriptSourceRobot2 = await this.client.typescriptTranspile(typescriptSourceRobot2)
        if (javascriptSourceRobot1.ok && javascriptSourceRobot2.ok) {
            mondeContexte = {
                workerA: runWorker(javascriptSourceRobot1.src),
                workerB: runWorker(javascriptSourceRobot2.src)
            }

            dataModel.process(mondeContexte.workerA, (action) => {
                this.initDroneState(this.joueurA, action.value.mobile, action.value.target)
                return true
            }, this.joueurA)
            dataModel.process(mondeContexte.workerB, (action) => {
                this.initDroneState(this.joueurB, action.value.mobile, action.value.target)
                return false
            }, this.joueurB)
        }

    }


}
defineVue(Monde, (vue) => {
    vue.flow({
        orientation: "column", width: "100vw",
        gap: 5,
        height: "90vh"
    }, () => {
        // vue.label("sortie")
        vue.custom({ factory: "createCanvas", init: "initCanvas" })
    })
}, { init: "init" })