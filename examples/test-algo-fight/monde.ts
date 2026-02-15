import { RobotTypescriptFile } from "./robot-explorateur";
import { DataModelServer } from "./node_modules/tauri-kargo-tools/src/schema/server"
import { model } from "./algofight-model"
import { runWorker } from "./worker-management"
import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api"
import { defineVue } from "./node_modules/tauri-kargo-tools/src/vue";
export interface MondeContexte {
    workerA: Worker
    workerB: Worker
}

let mondeContexte: MondeContexte | undefined = undefined
const dataModel = new DataModelServer(model, "Joueur")

export class Monde {
    robot1!: RobotTypescriptFile
    robot2!: RobotTypescriptFile

    sortie = ""
    client!: TauriKargoClient

    constructor() {
        this.client = createClient()
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
            const joueurA = dataModel.createValue("Joueur", { type: "Joueur" });
            const joueurB = dataModel.createValue("Joueur", { type: "Joueur" });
            const usine = dataModel.createValue("Usine", { position: { x: 10, y: 88 }, technologie: "Bouclier", type: "Usine" })
            const drone = dataModel.createValue("Drone", { joueur: joueurA, position: { x: 10, y: 11 }, type: "Drone", usine: usine })
            dataModel.process(mondeContexte.workerA, (action) => {
                this.sortie += JSON.stringify(action, null, 2)
                return false
            }, joueurA)
            dataModel.process(mondeContexte.workerB, (action) => {
                this.sortie += JSON.stringify(action, null, 2)
                return false
            }, joueurB)
        }

    }


}
defineVue(Monde, (vue) => {
    vue.flow({ orientation: "column" }, () => {
        vue.label("sortie")

    })
}, { init: "init" })