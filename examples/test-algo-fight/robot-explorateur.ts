import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"

import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api"
import { initMonacoFromFilesObject } from "./monaco"
import { buildLightContext } from "./context"
import { Robot } from "./model"
import { Explorateur } from "./explorateur"




class RobotTypescriptFile implements Robot {
    nom: string = ""
    repertoire: string = ""
    explorateur!: RobotExplorateur

    ouvrirMonacoEditor(): MonacoEditor {
        const r: MonacoEditor = new MonacoEditor();
        r.nom = this.nom
        r.repertoire = this.repertoire
        r.explorateur = this.explorateur


        return r;
    }
}
defineVue(RobotTypescriptFile, {
    kind: "flow",
    orientation: "row",
    gap: 10,
    children: [
        { kind:"label" , name:"nom", width:"10%"},
        { kind: "label", name: "repertoire", width: '80%' },

        { kind: "staticBootVue", label: "Editer", factory: "ouvrirMonacoEditor", width: '10%' }
    ]
})
interface ExplorateurTypescriptContext {
    contexte: TypescriptContext
    path: string
}
export class RobotExplorateur {
    robots: RobotTypescriptFile[] = []
    tauriKargoClient!: TauriKargoClient


    constructor() {
        this.tauriKargoClient = createClient();


    }
    async init(div: HTMLDivElement) {
        await this.tauriKargoClient.setCurrentDirectory({ path: "." })
        try {
            const src = await this.tauriKargoClient.readFileText("robots.json")
            const robots: Robot[] = JSON.parse(src)
            this.robots = robots.map((r) => {
                const tmp = new RobotTypescriptFile()
                tmp.nom = r.nom
                tmp.repertoire = r.repertoire
                tmp.explorateur = this
                return tmp

            })
        } catch (e) {

        }
    }

    async createContexte(repertoire: string, contexte: TypescriptContext) {
        const content = await this.tauriKargoClient.explorer({
            type: "array",
            path: repertoire
        })
        if (content.type === "directory") {
            for (let e of content.content) {
                if ((e.name.endsWith(".ts") || e.name.endsWith(".js"))) {

                    const tmp = e.path.substring(content.path.length + 1)
                    contexte[tmp] = { path: tmp }



                }


            }

        }
        return contexte
    }
    async executer() {

    }

    ajouterRobot(): Explorateur {
        const r=  new Explorateur()
        r.robotExplorateur = this
        return r

    }
}
defineVue(RobotExplorateur, (vue) => {

    vue.flow({ orientation: "column" ,gap:10}, () => {
        vue.flow({ orientation: "row" ,gap:10}, () => {
            vue.staticButton({ action: "executer", label: "Executer", width: "50%" })
            vue.staticBootVue({ factory: "ajouterRobot", label: "Ajouter robot", width: "50%" })
        })
        vue.listOfVue({
            list: "robots",
            gap: 10,
            orientation: "column",
            width: '100%',
            wrap: false,
            style: {
                overflow: "auto"
            }
        })


    })

},{ init:"init"})
export interface Content {
    path: string, content?: string

}
export type MonacoChangeType = "syntaxError" | "semanticError" | "value";

export type MonacoOnChange = (type: MonacoChangeType, payload: string) => void;

export type TypescriptContext = { [path: string]: Content }
class MonacoEditor {
    div!: HTMLDivElement
    source: string = ""
    nom!: string
    repertoire!: string
    explorateur!: RobotExplorateur
    titre = "Explorateur"
    constructor() {
        this.source = "function test() {\n  console.log('Hello Monaco');\n}\n"
    }


    factory(): HTMLDivElement {
        this.div = document.createElement("div")

        return this.div
    }
    async init() {
    
        await this.explorateur.tauriKargoClient.setCurrentDirectory({ path: this.repertoire })

     
        this.source = await this.explorateur.tauriKargoClient.readFileText("robot.ts")
        const ctx = await buildLightContext( { "robot.ts":{
            path:"./robot.ts",
            content:this.source
        } }, "robot.ts")

        const editor = await initMonacoFromFilesObject(this.div, {
            files: ctx,
            entry:  "robot.ts",
            language: "typescript",
            onChange:async ( type:MonacoChangeType , payload:string) => {
                if (type ==="value") {
                    await this.explorateur.tauriKargoClient.writeFileText("robot.ts",payload)
                }
            }
        });


    }
    ouvrirExplorateur(): RobotExplorateur {
        return this.explorateur
    }

}
defineVue(MonacoEditor, {
    kind: "flow",
    orientation: "column",
    height: "100vh",
    gap: 10,
    children: [
        { kind: "bootVue", factory: "ouvrirExplorateur", label: "titre", height: "5%" },
        {
            kind: "custom",
            factory: "factory",
            id: "my-monaco-editor",
            init: "init",
            height: "80%",

        }]
})
