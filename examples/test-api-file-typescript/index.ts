import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"

import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api"
import { initMonacoFromFilesObject } from "./monaco"
import { buildLightContext } from "./context"
class Noeud {
    nom!: string
    explorateur!: Explorateur
    constructor() {

    }
}
class Reperoire extends Noeud {
    explorer() {
        this.explorateur.explorer(this.nom)
    }
}


defineVue(Reperoire, {
    kind: "flow",
    orientation: "row",
    gap: 10,
    children: [
        { kind: "label", name: "nom", width: '90%' },
        { kind: "staticButton", label: "Explorer", action: "explorer", width: '10%' }
    ]
})
class TypescriptFile extends Noeud {
    repertoire!: string

    ouvrirMonacoEditor(): MonacoEditor {
        const r: MonacoEditor = new MonacoEditor();
        r.nom = this.nom
        r.repertoire = this.repertoire
        r.explorateur = this.explorateur


        return r;
    }
}
defineVue(TypescriptFile, {
    kind: "flow",
    orientation: "row",
    gap: 10,
    children: [
        { kind: "label", name: "nom", width: '90%' },
        { kind: "staticBootVue", label: "Editer", factory: "ouvrirMonacoEditor", width: '10%' }
    ]
})
interface ExplorateurTypescriptContext {
    contexte: TypescriptContext
    path: string
}
class Explorateur {
    racine: string = "."
    parents: string[] = []
    noeuds: Noeud[] = []
    tauriKargoClient!: TauriKargoClient
    peutRemonter: boolean = false
    contexte?: ExplorateurTypescriptContext
    constructor() {
        this.tauriKargoClient = createClient();
        this.explorerRacine()

    }
    explorerRacine() {
        this.explorer(this.racine)
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
    async explorer(chemin: string) {
        const path = chemin == "." ? undefined : chemin

        const r = await this.tauriKargoClient.explorer({ path: path })
        const noeuds: Noeud[] = []
        this.racine = chemin
        let createContext = false

        if (r.type === "directory") {
            if (r.parent) {
                this.parents.push(r.parent)
                this.peutRemonter = true
            }

            for (const e of r.content) {
                if (e.type === "directory") {
                    const rep: Reperoire = new Reperoire()
                    rep.nom = e.path


                    rep.explorateur = this
                    noeuds.push(rep)
                }
                if (e.type === "file" && e.path.endsWith(".ts")) {
                    const f: TypescriptFile = new TypescriptFile()
                    f.nom = e.name
                    if (!this.contexte) {
                        createContext = true
                    }

                    f.repertoire = e.path
                    f.explorateur = this
                    noeuds.push(f)
                }

            }
            if (createContext) {
                const p = this.racine
                this.contexte = {
                    contexte: await this.createContexte(p, {}),
                    path: p
                }
            }

        }
        this.noeuds = noeuds





    }
    remonter() {
        const e = this.parents.pop()
        if (e) {
            if (this.contexte) {
                if (this.contexte.path === this.racine) {
                    this.contexte = undefined
                }
            }
            this.explorer(e)
        }
        this.peutRemonter = this.parents.length > 0





    }
}
defineVue(Explorateur, {
    kind: 'flow',
    orientation: "column",
    gap: 10,
    height: '100vh',

    children: [
        {
            kind: 'flow',
            orientation: "row",
            gap: 10,

            children: [{ kind: "input", name: "racine", update: "explorerRacine", width: "50%" },
            { kind: "staticButton", label: "Remonter", enable: "peutRemonter", action: "remonter", width: "50%" }]
        }
        ,
        {
            kind: "listOfVue",
            list: "noeuds",
            gap: 10,
            orientation: "column",
            width: '100%',

            style: {
                overflow: "auto"
            }
        }
    ]
})
export interface Content {
    path: string, content?: string

}
export type TypescriptContext = { [path: string]: Content }
class MonacoEditor {
    div!: HTMLDivElement
    source: string = ""
    nom!: string
    repertoire!: string
    explorateur!: Explorateur
    titre = "Explorateur"
    constructor() {
        this.source = "function test() {\n  console.log('Hello Monaco');\n}\n"
    }


    factory(): HTMLDivElement {
        this.div = document.createElement("div")

        return this.div
    }
    async init() {
        const basePath = this.explorateur.contexte!.path
        await this.explorateur.tauriKargoClient.setCurrentDirectory({ path: basePath })

        const filePath = this.repertoire.substring(basePath.length + 1)
        this.source = await this.explorateur.tauriKargoClient.readFileText(filePath)
        const ctx = await buildLightContext(this.explorateur.contexte!.contexte, filePath)

        const editor = await initMonacoFromFilesObject(this.div, {
            files: ctx,
            entry: filePath,
            language: "typescript",
        });


    }
    ouvrirExplorateur(): Explorateur {
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
boot(new Explorateur())