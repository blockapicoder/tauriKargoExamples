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
const pouvoirs = ["Population", "Vitesse", "Porte", "Transport", "Puissance"] as const
const USINE_COUNT = 20
const USINE_RAYON = 15
const VIE_COUNT = 100
const ENERGIE_COUNT = 100

const RESSOURCE_RAYON = 5
const USINE_DISTANCE_MIN = 100
const RESSOURCE_DISTANCE_MIN = 35
const FIRE_TIME = 1000
const TRANSPORT_COUNT = 10
type Joueur = Ref<typeof dataModel.def, "Joueur">
type Drone = Ref<typeof dataModel.def, "Drone">
type Usine = Ref<typeof dataModel.def, "Usine">
type Energie = Ref<typeof dataModel.def, "Energie">
type Vie = Ref<typeof dataModel.def, "Vie">
type Ressource = Vie | Energie
type Target = Ref<typeof dataModel.def, "Drone"> | Energie | Vie | Ref<typeof dataModel.def, "Usine">
interface DroneMoveState {
    type: "move"
    ref: Drone
    refTarget: Target
    target: Pos
    distance: number
    sx: number
    sy: number
    dep: number
}
interface DroneFireState {
    type: 'fire'
    time: number
    ref: Drone

}

interface DroneWaitState {
    type: 'wait'
    ref: Drone

}
type DroneState = DroneMoveState | DroneFireState | DroneWaitState
interface UsineState {
    ref: Usine
    currentDrone?: Drone
    count: number

}
interface RessourceState {
    ref: Ressource

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
    usineStates: UsineState[] = []
    ressourceStates: RessourceState[] = []
    joueurA!: Ref<typeof dataModel.def, "Joueur">
    joueurB!: Ref<typeof dataModel.def, "Joueur">
    loop() {
        this.droneStates = this.droneStates.filter((s) => !!dataModel.map[(s.ref.ref)])
        for (let idx = 0; idx < this.droneStates.length; idx++) {
            this.droneStates[idx] = this.process(this.droneStates[idx])
        }


    }

    fire(ds: DroneMoveState): DroneState {
        const value = ds.ref.getValue()
        const target = ds.refTarget.getValue()
        const p = target.position
        const q = value.position
        const dx = p.x - q.x
        const dy = p.y - q.y
        const d = Math.sqrt(dx * dx + dy * dy)
        const range = this.getDroneRange(value.joueur)
        if (d >= range) {
            return { type: "wait", ref: ds.ref }
        }
        if (target.type === "Energie" || target.type === "Vie") {
            const tc = this.getDroneTransport(value.joueur)
            if (tc >= value.energieCount + value.vieCount) {
                return { type: "wait", ref: ds.ref }
            }
            if (target.proprietaire) {
                return { type: "wait", ref: ds.ref }
            }
            target.proprietaire = ds.ref
            return { type: 'fire', time: FIRE_TIME, ref: ds.ref }
        }
        if (target.type === "Drone") {
            let puissance = this.getDronePower(value.joueur)
            let removeEnergie = true
            for (const r of this.ressourceStates) {
                if (puissance === 0 && !removeEnergie) {
                    break;
                }
                const v = r.ref.getValue()
                if (v.type === "Vie" && puissance > 0 && v.proprietaire === ds.refTarget && target.vieCount > 0) {
                    v.proprietaire = undefined
                    puissance--;
                    target.vieCount--;
                }
                if (v.type === "Energie" && v.proprietaire === ds.ref && removeEnergie) {
                    removeEnergie = false;
                    v.proprietaire = undefined
                    value.energieCount--;

                }

            }
            if (target.vieCount <= 0) {
                delete dataModel.map[ds.refTarget.ref]
            }
            return { type: 'fire', time: FIRE_TIME, ref: ds.ref }
        }
        if (target.type === "Usine") {
            let puissance = this.getDronePower(value.joueur)
            const tmpRef: any = ds.refTarget
            if (target.joueur === value.joueur || !target.joueur) {
                for (const r of this.ressourceStates) {
                    const v = r.ref.getValue()
                    if (v.type === "Energie" && v.proprietaire === ds.ref && puissance > 0) {

                        v.proprietaire = tmpRef
                        value.energieCount--;
                        target.energieCount++;
                        puissance--;
                    }
                }
                target.joueur = value.joueur
            } else if (target.joueur) {
                let total = 0;
                for (const r of this.ressourceStates) {
                    const v = r.ref.getValue()
                    if (v.type === "Energie" && v.proprietaire === tmpRef) {
                        if (puissance > 0) {

                            v.proprietaire = undefined
                            value.energieCount--;
                            puissance--;
                        } else {
                            total++;
                        }
                    }
                }
                if (total === 0) {
                    target.joueur = undefined
                }
                target.energieCount = total

            }
        }
        return { type: "wait", ref: ds.ref }

    }

    process(droneState: DroneState): DroneState {
        if (droneState.type !== "move") {
            if (droneState.type === "fire") {
                droneState.time--;
                if (droneState.time <= 0) {
                    return { type: "wait", ref: droneState.ref }
                }
            }
            return droneState
        }
        droneState.distance = droneState.distance - droneState.dep
        if (droneState.distance < 0) {
            droneState.ref.getValue().position = droneState.target
            return this.fire(droneState)
        }
        const p = droneState.ref.getValue().position
        p.x += droneState.sx
        p.y += droneState.sy
        return droneState

    }

    createRessources(w: number, h: number, createFunction: (pos: Pos) => void) {
        let gen = true
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
                createFunction(pos)
            }

            gen = (energies.length < ENERGIE_COUNT) && (vies.length < VIE_COUNT)
        } while (gen)

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

                const u = dataModel.createValue("Usine", {
                    position: pos,
                    technologie: pouvoirs[ip],
                    type: "Usine",
                    energieCount: 0
                })
                this.usineStates.push({
                    count: 0,
                    ref: u
                })
            }

            gen = lst.length < USINE_COUNT
        } while (gen)
        this.createRessources(w, h, (pos) => {
            const r = dataModel.createValue("Energie", {
                position: pos,
                type: "Energie"
            })
            this.ressourceStates.push({
                ref: r

            })
        })
        this.createRessources(w, h, (pos) => {
            const r = dataModel.createValue("Vie", {
                position: pos,
                type: "Vie"
            })
            this.ressourceStates.push({
                ref: r
            })
        })

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
    afficher() {
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


        for (const s of this.usineStates) {
            const u = s.ref.getValue()
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

        for (const s of this.ressourceStates) {
            const u = s.ref.getValue()
            if (!u.proprietaire) {

                this.ctx.beginPath();
                this.ctx.strokeStyle = u.type === "Energie" ? "orange" : "white"
                this.ctx.arc(u.position.x, u.position.y, RESSOURCE_RAYON, 0, 2 * Math.PI)
                this.ctx.stroke();
            }
        }

        this.ctx.restore();
    }
    initCanvas() {
        this.ctx = this.canvas.getContext("2d")!
        this.afficher()
    }
    getDroneSpeed(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Vitesse" && v.joueur === joueur
        }).length + 1
        return n * 2
    }
    getDroneRange(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Porte" && v.joueur === joueur
        }).length + 1
        return n * 10
    }
    getDronePower(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Puissance" && v.joueur === joueur
        }).length + 1
        return n
    }
    getDroneTransport(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Transport" && v.joueur === joueur
        }).length + TRANSPORT_COUNT
        return n
    }
    initDroneState(joueur: Joueur, drone: Drone, target: Target) {
        const p = target.getValue().position
        const q = drone.getValue().position
        const dx = p.x - q.x
        const dy = p.y - q.y
        const d = Math.sqrt(dx * dx + dy * dy) - this.getDroneRange(joueur)
        let idx = this.droneStates.findIndex((ds) => ds.ref === drone)
        if (!idx) {
            return
        }

        const speed = this.getDroneSpeed(joueur)
        const ds: DroneState = {
            type: 'move',
            ref: drone,
            refTarget: target,
            distance: d,
            sx: speed * dx / d,
            sy: speed * dy / d,
            dep: speed,
            target: p
        }
        this.droneStates[idx] = ds

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