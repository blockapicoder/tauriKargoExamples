import { defineVue, boot } from "./node_modules/tauri-kargo-tools/src/vue"
//document.body.append("Index ts sans index.html tt" + lib.print())
interface L {
    valeur: number
    nom: string
}

class Recherche {
    min: number = 0
    titreMin = "Min"
    max: number = 0
    titreMax = "Max"
    count: number = 0
    titreCount = "Count"
    n: number = 10000
    titreN = "N"

    sortie: string = ""
    ls: L[] = []
    donnees: string = ""
    resultat: string = ""
    generer() {
        
        this.donnees = ""
        this.ls = []
        for (let i = 0; i < this.n; i++) {
            const r = Math.random() * 100
            const o: L = { valeur: Math.trunc(r), nom: `B${i}` }
            this.donnees += (`${o.valeur} est la valeur de ${o.nom}\n`)
            this.ls.push(o)
        }
        this.sortie = this.donnees
    }
    copiePrompt() {
        navigator.clipboard.writeText(this.sortie)
    }

    chercher() {
        this.count = this.ls.filter((e) => e.valeur >= this.min && e.valeur <= this.max).length
        this.sortie = `donne moi dans les données suivante le nombre d'éléments qui ont une valeur entre ${this.min} et ${this.max} \n`
        this.sortie += this.donnees
        this.resultat = this.ls.filter((e) => e.valeur >= this.min && e.valeur <= this.max).map((o) => o.nom).join(",")
    }
}

defineVue(Recherche, (vue) => {
    vue.flow({ orientation: "column", gap: 10 }, () => {
        vue.flow({
            orientation: "row", gap: 10
        }, () => {
            vue.label("titreMin"),
                vue.input({ name: "min" })
            vue.label("titreMax")
            vue.input({ name: "max" })
            vue.label("titreCount")
            vue.label("count")

        })
        vue.flow({
            orientation: "row", gap: 10
        }, () => {
            vue.staticButton({ action: "generer", label: "Generer" })
            vue.staticButton({ action: "chercher", label: "Chercher" })
            vue.staticButton({ action: "copiePrompt", label: "Copier prompt" })


        })
        vue.label("resultat")
        vue.label("sortie")


    })
})
boot(new Recherche())