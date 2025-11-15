import { defineVue, boot } from "./node_modules/tauri-kargo-tools/src/vue"
import { ChatMessage, chatOllama } from "./ollama"
// --- Votre logique applicative (UI) ---
const question =
    "crée-moi un unique personnage de film fantastique en une seule ligne ; réponds en français et donne uniquement la description, sans baratin";

class Personnage {
    estSelectionne: boolean
    description!: string
    listePersonnage!: ListePersonnage
    constructor() {
        this.estSelectionne = false
    }
    selectionnerPersonnage() {
        this.listePersonnage.selectionnerPersonnage()

    }
}
defineVue(Personnage, {
    kind: 'flow',
    orientation: "row",
    children: [
        {
            kind: 'input', inputType: 'checkbox', name: "estSelectionne", update: "selectionnerPersonnage"

        },
        { kind: 'label', name: "description" }
    ]
})
class ListePersonnage {

    peutLancerConversation: boolean
    afficherSupprimerPersonnages: boolean
    personnages: Personnage[] = []
    conversation!: Conversation
    titre = "Conversation"
    messages: ChatMessage[] = [
        { role: "system", content: "Tu es concis, tu réponds en une seule ligne, uniquement la description du personnage." },
    ];
    constructor() {
        this.peutLancerConversation = false
        this.afficherSupprimerPersonnages = false;
        (async () => {
            const r = await fetch("/api/file/personnages.json", { method: "POST", cache: "no-cache" });
            const personnages: string[] = await r.json();
            const tmpList: Personnage[] = []
            for (const p of personnages) {
                const tmp = new Personnage()
                tmp.listePersonnage = this
                tmp.description = p
                this.messages.push({ role: "user", content: question });
                this.messages.push({ role: "assistant", content: p });
                tmpList.push(tmp)
            }
            this.personnages = tmpList
        })()
    }
    selectionnerPersonnage() {
        this.afficherSupprimerPersonnages = this.personnages.some((p) => p.estSelectionne)
        const n = this.personnages.filter((p) => p.estSelectionne).length
        this.peutLancerConversation = (n === 2)
    }
    async ajouterPersonnage() {
        const newPersonnage = new Personnage()
        newPersonnage.description = ""
        newPersonnage.listePersonnage = this
        this.personnages = [...this.personnages, newPersonnage]
        this.messages.push({ role: "user", content: question });

        const answer = await chatOllama(this.messages, "gemma3-2060", {
            stream: true,
            onToken: (t) => { newPersonnage.description = (newPersonnage.description ?? "") + t; },
        });

        const descriptionPerso = answer.trim();
        newPersonnage.description = descriptionPerso; // version finale propre

        this.messages.push({ role: "assistant", content: descriptionPerso });
        const personnages = this.personnages.map((p) => p.description)
        await fetch("/api/file/personnages.json", {
            method: "POST",
            body: JSON.stringify(personnages, null, 2),
        });


    }
    async supprimerPersonnages() {
        this.personnages = this.personnages.filter((p) => !p.estSelectionne)
        this.selectionnerPersonnage()
        const personnages = this.personnages.map((p) => p.description)
        await fetch("/api/file/personnages.json", {
            method: "POST",
            body: JSON.stringify(personnages, null, 2),
        });

    }
    lancerConversation(): Conversation {
        const r = new Conversation()
        const l = this.personnages.filter((p) => p.estSelectionne)
        r.init(l[0].description, l[1].description)
        return r;


    }


}
defineVue(ListePersonnage, {
    kind: "flow",
    orientation: "column",
    gap: 15,
    style: { margin: "20px" },
    align: "center",
    children: [
        {
            kind: "flow",
            orientation: "row",
            width: '100%',
            gap: 15,
            children: [
                {
                    kind: "staticButton",
                    action: "ajouterPersonnage",
                    label: "Ajouter",
                    width: '50%'
                },
                {
                    kind: "staticButton",
                    action: "supprimerPersonnages",
                    label: "Supprimer",
                    enable: "afficherSupprimerPersonnages",

                    width: '50%'
                }
            ]

        },
        {
            kind: "listOfVue",
            list: "personnages",
            gap: 10
        },
        { kind: "bootVue", factory: "lancerConversation", label: "titre", enable: "peutLancerConversation", width: "100%" }
    ]
})
class Echange {
    personnageA!: string
    personnageB!: string
    space = "..."
    showSpace = false
    constructor() {

    }
}
defineVue(Echange, {
    kind: "flow",
    orientation: "row",
    width: "100%",
    gap: 10,
    children: [
        {
            kind: 'label',
            name: "personnageA",
            width: "40%"

        }, {
            kind: "staticLabel",
            label: "...",
            width: "20%",
            visible:"showSpace" ,
            useVisibility:true
        }, {
            kind: 'label',
            name: 'personnageB',
            width: "40%"
        }
    ]
})
class Conversation {
    messagesA: ChatMessage[] = []
    messagesB: ChatMessage[] = []
    echanges: Echange[] = []
    personnageA!: string
    personnageB!: string
    interval: number | undefined
    titreBouton = "Demarer"
    running = false
    constructor() {

    }
    init(personnageA: string, personnageB: string) {
        this.personnageA = personnageA
        this.personnageB = personnageB
        this.messagesA = [
            { role: "system", content: `tu est ${personnageA} et tu parle à  ${personnageB} , tu répond en une ligne` },
            { role: 'user', content: 'Bonjour' }
        ];
        this.messagesB = [
            { role: "system", content: `tu est ${personnageB} et tu parle à  ${personnageA}, tu répond en une ligne` }
        ];
    }
    async faireDialogue() {
        if (this.running) {
            return
        }
        this.running = true
        let r = await chatOllama(this.messagesA, "gemma3-2060", {
            stream: false,
            onToken: (t) => { },
        });

        this.messagesA.push({ role: 'assistant', content: r })

        this.messagesB.push({ role: 'user', content: r })
        let r2 = await chatOllama(this.messagesB, "gemma3-2060", {
            stream: false,
            onToken: (t) => { },
        });

        this.messagesB.push({ role: 'assistant', content: r2 })
        this.messagesA.push({ role: "user", content: r2 })
        const echange = new Echange()
        echange.personnageA = r
        echange.personnageB = r2
        this.echanges = [...this.echanges, echange]
        this.running = false
    }
    demarer() {
        if (this.interval !== undefined) {
            return;
        }

        this.interval = setInterval(async () => {
            await this.faireDialogue()
        })
    }
    arreter() {
        if (this.interval === undefined) {
            return;
        }
        clearInterval(this.interval)
    }
    faireAction() {
        if (this.interval === undefined) {
            this.titreBouton = "Arreter"
            this.demarer()
            return
        }
        this.titreBouton = "Demarer"
        this.arreter()
    }


}
defineVue(Conversation, {
    kind: 'flow',
    orientation: "column",
    gap: 30,
    children: [
        {
            kind: 'flow',
            orientation: "row",
            width: "100%",
            gap: 10,
            children: [
                { kind: "label", name: "personnageA", width: "40%" },
                { kind: "button", label: "titreBouton", action: "faireAction", width: "20%" },
                { kind: "label", name: "personnageB", width: "40%" }
            ]
        },
        {
            kind: "listOfVue",
            list: "echanges",
            gap: 15
        }
    ]
})

boot(new ListePersonnage(), "#app")