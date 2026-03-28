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
const BUILD_TIME = 50
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


interface DroneWaitState {
    type: 'wait'
    ref: Drone

}
type DroneState = DroneMoveState | DroneWaitState
interface UsineState {
    ref: Usine


}
interface RessourceState {
    ref: Ressource

}
function dist(p: Pos, q: Pos) {
    const dx = p.x - q.x
    const dy = p.y - q.y
    return Math.sqrt(dx * dx + dy * dy)
}
export class GestionMonde {
    droneStates: DroneState[] = []
    usineStates: UsineState[] = []
    ressourceStates: RessourceState[] = []
    joueurA: Joueur
    joueurB: Joueur
    constructor() {
        dataModel.map = {}
        dataModel.types = {}
        dataModel.idForModelElement = new Map()
        dataModel.idx = 0
        this.joueurA = dataModel.createValue("Joueur", { type: "Joueur" })
        this.joueurB = dataModel.createValue("Joueur", { type: "Joueur" })
    }
    populationCount(j: Joueur, u: Usine) {
        let populationCount = 0
        for (const d of dataModel.getRefs("Drone")) {
            const dv = d.getValue()
            if (dv.joueur.ref === j.ref && dv.usine.ref === u.ref) {
                populationCount++
            }
        }
        return populationCount
    }
    createRessources(w: number, h: number, createFunction: (pos: Pos, energieCount: number, vieCount: number) => boolean) {
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
                gen = createFunction(pos, energies.length, vies.length)
            }


        } while (gen)

    }
    createWorld(w: number, h: number) {

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
                    type: "Usine"


                })
                this.usineStates.push({
                    ref: u
                })
            }

            gen = lst.length < USINE_COUNT
        } while (gen)
        this.createRessources(w, h, (pos, energieCount, vieCount) => {
            const r = dataModel.createValue("Energie", {
                position: pos,
                type: "Energie"
            })
            this.ressourceStates.push({
                ref: r

            })
            return (energieCount < ENERGIE_COUNT)
        })
        this.createRessources(w, h, (pos, energieCount, vieCount) => {
            const r = dataModel.createValue("Vie", {
                position: pos,
                type: "Vie"
            })
            this.ressourceStates.push({
                ref: r
            })
            return (vieCount < VIE_COUNT)
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
        usineJoueurA.getValue().etat = { joueur: this.joueurA, time: BUILD_TIME, energieCount: 0, populationCount: 0 }
        usineJoueurB.getValue().etat = { joueur: this.joueurB, time: BUILD_TIME, energieCount: 0, populationCount: 0 }





    }
    getDronePopulation(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Population" && v.etat && v.etat.joueur.ref === joueur.ref
        }).length + 5
        return n
    }
    getDroneSpeed(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Vitesse" && v.etat && v.etat.joueur.ref === joueur.ref
        }).length + 1
        return n * 2
    }
    getDroneRange(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Porte" && v.etat && v.etat.joueur.ref === joueur.ref
        }).length + 1
        return n * 10
    }
    getDronePower(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Puissance" && v.etat && v.etat.joueur.ref === joueur.ref
        }).length + 1
        return n
    }
    getDroneTransport(joueur: Joueur) {
        let n = dataModel.getRefs("Usine").filter((r) => {
            const v = r.getValue()
            return v.technologie === "Transport" && v.etat && v.etat.joueur.ref === joueur.ref
        }).length + TRANSPORT_COUNT
        return n
    }
    initDroneState(joueur: Joueur, drone: Drone, target: Target) {
        const droneValue = drone.getValue()
        const p = target.getValue().position
        const q = droneValue.position
        const dx = p.x - q.x
        const dy = p.y - q.y
        const d = Math.sqrt(dx * dx + dy * dy) - this.getDroneRange(joueur)
        let idx = this.droneStates.findIndex((ds) => ds.ref.ref === drone.ref)
        if (!idx) {
            return false
        }
        if (droneValue.joueur.ref === joueur.ref) {
            return false
        }
        let ds: DroneState = this.droneStates[idx]
        if (droneValue.cible && droneValue.cible.fireTime > 0) {
            return false
        }

        const speed = this.getDroneSpeed(joueur)
        droneValue.cible = { cible: target, fireTime: 0 }
        const usineValue = droneValue.usine.getValue()
        if (usineValue.etat && usineValue.etat.newDrone?.ref === drone.ref) {
            usineValue.etat.newDrone = undefined
        }
        ds = {
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
        return true

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
            value.cible = undefined
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
            value.cible = { cible: ds.refTarget, fireTime: FIRE_TIME }
            return ds
        }
        if (target.type === "Drone") {
            let puissance = this.getDronePower(value.joueur)
            let removeEnergie = true
            for (const r of this.ressourceStates) {
                if (puissance === 0 && !removeEnergie) {
                    break;
                }
                const v = r.ref.getValue()
                if (v.type === "Vie" && puissance > 0 && v.proprietaire?.ref === ds.refTarget.ref && target.vieCount > 0) {
                    v.proprietaire = undefined
                    puissance--;
                    target.vieCount--;
                }
                if (v.type === "Energie" && v.proprietaire?.ref === ds.ref.ref && removeEnergie) {
                    removeEnergie = false;
                    v.proprietaire = undefined
                    value.energieCount--;

                }

            }
            if (target.vieCount <= 0) {
                const usine = target.usine.getValue()
                if (usine.etat && usine.etat.joueur.ref === target.joueur.ref) {
                    usine.etat.populationCount--
                }
                delete dataModel.map[ds.refTarget.ref]
            }
            value.cible = { cible: ds.refTarget, fireTime: FIRE_TIME }
            return ds
        }
        if (target.type === "Usine") {
            let puissance = this.getDronePower(value.joueur)
            const tmpRef: any = ds.refTarget
            if (!target.etat || target.etat.joueur.ref === value.joueur.ref) {
                let energieCount = 0
                for (const r of this.ressourceStates) {
                    const v = r.ref.getValue()
                    if (v.type === "Energie" && v.proprietaire?.ref === ds.ref.ref && puissance > 0) {

                        v.proprietaire = tmpRef
                        value.energieCount--;
                        energieCount++;
                        puissance--;
                    }
                }
                if (energieCount) {
                    if (target.etat) {
                        target.etat.energieCount += energieCount
                    } else {
                        target.etat = { joueur: value.joueur, time: BUILD_TIME, energieCount: energieCount, populationCount: this.populationCount(value.joueur, tmpRef) }
                    }
                }

            } else if (target.etat) {
                let total = 0;
                let energieCount = 0
                for (const r of this.ressourceStates) {
                    const v = r.ref.getValue()
                    if (v.type === "Energie" && v.proprietaire?.ref === tmpRef.ref) {
                        if (puissance > 0) {

                            v.proprietaire = undefined
                            value.energieCount--;
                            energieCount++;
                            puissance--;
                        } else {
                            total++;
                        }
                    }
                }
                if (total === 0) {
                    target.etat = { joueur: value.joueur, time: BUILD_TIME, energieCount: energieCount, populationCount: this.populationCount(value.joueur, tmpRef) }

                } else {
                    if (target.etat) target.etat.energieCount = total
                }


                value.cible = { cible: ds.refTarget, fireTime: FIRE_TIME }

            }
        }
        return { type: "wait", ref: ds.ref }

    }
    processUsine(usineState: UsineState) {
        const v = usineState.ref.getValue()
        if (v.etat) {
            if (v.etat.newDrone) {
                return
            }
            if (v.etat.time === 0) {
                if (v.etat.populationCount < this.getDronePopulation(v.etat.joueur)) {
                    v.etat.newDrone = dataModel.createValue("Drone", { type: "Drone", energieCount: 0, vieCount: 0, joueur: v.etat.joueur, position: v.position, usine: usineState.ref })
                    v.etat.populationCount++
                }
                v.etat.time = BUILD_TIME
                return
            }
            v.etat.time--
        }

    }
    processUsines() {
        for (const u of this.usineStates) {
            this.processUsine(u)
        }
    }

    processDrone(droneState: DroneState): DroneState {
        const droneValue = droneState.ref.getValue()
        if (droneState.type === "wait") {
            return droneState
        }
        if (droneValue.cible && droneValue.cible.fireTime > 0) {
            droneValue.cible.fireTime--

            if (droneValue.cible.fireTime <= 0) {
                droneValue.cible = undefined
                return { type: "wait", ref: droneState.ref }
            }

            return droneState
        }
        droneState.distance = droneState.distance - droneState.dep
        if (droneState.distance < 0) {
            droneValue.position = droneState.target
            return this.fire(droneState)
        }
        const p = droneValue.position
        p.x += droneState.sx
        p.y += droneState.sy
        return droneState

    }
    processDrones() {
        this.droneStates = this.droneStates.filter((s) => !!dataModel.map[(s.ref.ref)])
        for (let idx = 0; idx < this.droneStates.length; idx++) {
            this.droneStates[idx] = this.processDrone(this.droneStates[idx])
        }
    }
}

export class Monde {
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D
    robot1!: RobotTypescriptFile
    robot2!: RobotTypescriptFile

    sortie = ""
    client!: TauriKargoClient
    gestionMonde!: GestionMonde

    constructor() {
        this.client = createClient()
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

        this.ctx.beginPath();


        for (const s of this.gestionMonde.usineStates) {
            const u = s.ref.getValue()
            this.ctx.beginPath();
            if (u.etat && u.etat.joueur === this.gestionMonde.joueurA) {
                this.ctx.strokeStyle = "blue"
            } else
                if (u.etat && u.etat.joueur === this.gestionMonde.joueurB) {
                    this.ctx.strokeStyle = "red"
                } else {
                    this.ctx.strokeStyle = "green"
                }
            this.ctx.arc(u.position.x, u.position.y, USINE_RAYON, 0, 2 * Math.PI)
            this.ctx.fillStyle = "green"
            this.ctx.fillText("U", u.position.x - 4, u.position.y + 4)
            this.ctx.stroke();
        }

        for (const s of this.gestionMonde.ressourceStates) {
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

    }


    async init(div: HTMLDivElement) {

        if (mondeContexte) {
            mondeContexte.workerA.terminate()
            mondeContexte.workerB.terminate()
        }
        this.fitCanvasToParent()
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        this.gestionMonde = new GestionMonde()
        this.gestionMonde.createWorld(w, h)


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
                return this.gestionMonde.initDroneState(this.gestionMonde.joueurA, action.value.mobile, action.value.target)

            }, this.gestionMonde.joueurA)
            dataModel.process(mondeContexte.workerB, (action) => {
                return this.gestionMonde.initDroneState(this.gestionMonde.joueurB, action.value.mobile, action.value.target)

            }, this.gestionMonde.joueurB)
        }
        this.afficher()

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