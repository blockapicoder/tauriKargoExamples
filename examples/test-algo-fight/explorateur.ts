import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"

import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api"
import { initMonacoFromFilesObject } from "./monaco"
import { buildLightContext } from "./context"
class Noeud {
    nom!:string
    path!: string
    explorateur!: Explorateur
    constructor() {

    }
}
class Reperoire extends Noeud {
    explorer() {
        this.explorateur.explorer(this.path)
    }
}


defineVue(Reperoire, {
    kind: "flow",
    orientation: "row",
    gap: 10,
    children: [
        { kind: "label", name: "path", width: '90%' },
        { kind: "staticButton", label: "Explorer", action: "explorer", width: '10%' }
    ]
})


interface ExplorateurTypescriptContext {
    contexte: TypescriptContext
    path: string
}
class DialogCreerProjet {
    nom: string = ""
    explorateur!: Explorateur
    peutCreer = false

    verifier() {
        this.peutCreer = this.explorateur.noeuds.every( (n)=>n.nom.toLocaleLowerCase() != this.nom.trim().toLocaleLowerCase())

    }


    async creer() {
        const racine = this.explorateur.racine
        await this.explorateur.tauriKargoClient.setCurrentDirectory( { path:this.explorateur.racine})
    
        await this.explorateur.tauriKargoClient.createDirectory(this.nom);
        await this.explorateur.explorer(racine)
        this.explorateur.dialogCreerProjet = undefined
    }
    annuler() {
        this.explorateur.dialogCreerProjet = undefined

    }
}
defineVue(DialogCreerProjet, (vue) => {
    vue.flow({ orientation: 'column', gap: 10 }, () => {
        vue.input({ name: "nom" , update:"verifier"})
        vue.flow({
            orientation: "row",
            gap: 10
        }, () => {
            vue.staticButton({ action: "creer", label: "Creer", width: '50%' , enable:"peutCreer" })
            vue.staticButton({ action: "annuler", label: "Annuler", width: '50%' })
        })

    })

})
export class Explorateur {
    racine: string = "."
    parents: string[] = []
    noeuds: Noeud[] = []
    tauriKargoClient!: TauriKargoClient
    peutRemonter: boolean = false
    contexte?: ExplorateurTypescriptContext
    dialogCreerProjet?: DialogCreerProjet

    constructor() {
        this.tauriKargoClient = createClient();
        this.explorerRacine()

    }
    explorerRacine() {
        this.explorer(this.racine)
    }

    async explorer(chemin: string) {
        const path = chemin == "." ? undefined : chemin

        const r = await this.tauriKargoClient.explorer({ path: path })
        const noeuds: Noeud[] = []
        this.racine = chemin


        if (r.type === "directory") {
            if (r.parent) {
                this.parents.push(r.parent)
                this.peutRemonter = true
            }

            for (const e of r.content) {
                if (e.type === "directory") {
                    const rep: Reperoire = new Reperoire()
                    rep.path = e.path
                    rep.nom = e.name


                    rep.explorateur = this
                    noeuds.push(rep)
                }


            }


        }
        this.noeuds = noeuds





    }
    creerProjet() {
        this.dialogCreerProjet = new DialogCreerProjet()
        this.dialogCreerProjet.explorateur = this;
        return this.dialogCreerProjet

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
defineVue(Explorateur, (vue) => {

    vue.flow({

        orientation: "column",
        gap: 10,
        height: '100vh',
    }, () => {
        vue.flow({
            orientation: "row",
            gap: 10,
        }, () => {
            vue.input({ name: "racine", update: "explorerRacine", width: "33%" })
            vue.staticButton({ label: "Remonter", enable: "peutRemonter", action: "remonter", width: "33%" })
            vue.dialog({ name: "dialogCreerProjet", action: "creerProjet", label: "Creer projet", buttonWidth: "34%" })

        })
        vue.listOfVue({
            list: "noeuds",
            gap: 10,
            orientation: "column",
            width: '100%',
            wrap: false,
            style: {
                overflow: "auto"
            }
        })


    })
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
