import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"

import { createClient, TauriKargoClient } from "./node_modules/tauri-kargo-tools/src/api"

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
class Explorateur {
    racine: string = "."
    parents: string[] = []
    noeuds: Noeud[] = []
    tauriKargoClient!: TauriKargoClient
    peutRemonter: boolean = false
    constructor() {
        this.tauriKargoClient = createClient();
        this.explorerRacine()

    }
    explorerRacine() {
        this.explorer(this.racine)
    }
    explorer(chemin: string) {
        const path = chemin == "." ? undefined : chemin

        this.tauriKargoClient.explorer({ path: path }).then((r) => {
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
                        rep.nom = e.path
               

                        rep.explorateur = this
                        noeuds.push(rep)
                    }

                }
            }
            this.noeuds = noeuds
        }).catch((r) => {

        })

    }
    remonter() {
        const e = this.parents.pop()
        if (e) {
            this.explorer(e)
        }
        this.peutRemonter = this.parents.length > 0





    }
}
defineVue(Explorateur, {
    kind: 'flow',
    orientation: "column",
    gap: 10,
    height:'100vh',

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
                overflow:"auto"
            }
        }
    ]
})
boot(new Explorateur())