
import * as vm from "./model"
import { parse } from "./parser"
import * as cm from "./codemirror-module"
import { defineVue, boot } from "./node_modules/tauri-kargo-tools/src/vue"
import { TauriKargoClient, createClient } from "./node_modules/tauri-kargo-tools/src/api"
import { compileProgram } from "./luxlang-compile"



const client = createClient()
cm.CodeMirror.defineSimpleMode("luxlang", {
    start: [
        { regex: /"(?:[^\\]|\\.)*?"/, token: "string" },
        {
            regex: /\b(setGlobal|set|ret|call|fun|if)\b/,
            token: "keyword-special",
        },
        {
            regex: /\b[a-zA-Z_][a-zA-Z0-9_]*:/,
            token: "keyword-special",
        },
        {
            regex: /\b[a-zA-Z_][a-zA-Z0-9_]*\b(?=\s*\()/,
            token: "function",
        },
        { regex: /\b[a-zA-Z_][a-zA-Z0-9_]*\b/, token: "variable" },
        { regex: /[\{\}\[\]\(\)]/, token: "bracket" },
    ],
    meta: {
        dontIndentStates: ["comment"],
        lineComment: "//",
    },
});

class DialogCreerScript {
    nom: string = ""
    editor!: Editor
    peutCreer = false

    verifier() {
        this.peutCreer = this.editor.scriptNames.every((n) => n != this.nom.trim().toLocaleLowerCase())

    }


    async creer() {

        this.editor.dialogCreerScript = undefined
    }
    annuler() {
        this.editor.dialogCreerScript = undefined

    }
}
defineVue(DialogCreerScript, (vue) => {
    vue.flow({ orientation: 'column', gap: 10 }, () => {
        vue.input({ name: "nom", update: "verifier" })
        vue.flow({
            orientation: "row",
            gap: 10
        }, () => {
            vue.staticButton({ action: "creer", label: "Creer", width: '50%', enable: "peutCreer" })
            vue.staticButton({ action: "annuler", label: "Annuler", width: '50%' })
        })

    })

})
class Editor {

    editeur!: HTMLTextAreaElement
    div!: HTMLDivElement
    sortie: string = ""
    message: string = ""
    codemirror: any
    scriptNames: string[] = []
    selections: number[] = []
    dialogCreerScript?: DialogCreerScript
    estExecutable = false
    PRIMS: any = {}
    constructor() {
        this.PRIMS = {
            cr: () => {
                this.sortie += "\n"
            },
            print: (s: any) => {
                if (typeof s === "string") {
                    this.sortie += s
                } else {
                    this.sortie += JSON.stringify(s)
                }
            },
            clear: () => {
                this.sortie = ""
            },
            cur: (f: (...values: any[]) => any, ...args: any[]) => {
                return (...newArgs: any[]) => {
                    const tmp: any[] = [...args, ...newArgs]
                    return f(...tmp)
                }

            },
            createArray: (...args: any[]) => args,
            map: (lst: any[], f: (o: any) => any) => lst.map(f),
            filter: (lst: any[], f: (o: any) => boolean) => lst.filter(f),
            concat: (...args: any[][]) => args.flatMap((e) => e),
            all: (a: any[], p: (e: any) => boolean) => { return a.every(p) },
            exist: (a: any[], p: (e: any) => boolean) => { return a.some(p) },
            beastNumber: 666
        }
    }
    println(src: string) {
        this.sortie += src + "\n"

    }
    async selectScript() {
        if (this.selections.length === 0) {
            this.codemirror.setValue("")
            return
        }
        this.codemirror.setValue(await client.readFileText(this.scriptNames[this.selections[0]]))


    }
    nameScript(name: string): string {
        return name
    }
    addScript() {
        this.dialogCreerScript = new DialogCreerScript()
        this.dialogCreerScript.editor = this

    }
    removeScript() {

    }
    async run() {

        try {
            const progRaw = await parse(this.codemirror.getValue())
            const prog = compileProgram(progRaw, new Set(Object.keys(this.PRIMS)))
            console.log(JSON.stringify(prog, null, 2))
            const js = vm.generateProg(prog)

            const run = eval(js) as (prims: any) => any

            run(this.PRIMS)
            this.message = "Execution ✅ Succès"
        } catch (e: any) {
            this.message = e.message + " ❌ Erreur "

        }
    }
    creerEditeur(): HTMLDivElement {

        this.div = document.createElement("div")


        return this.div
    }
    async init() {
        const shadow = this.div.shadowRoot ?? this.div.attachShadow({ mode: "open" });
        shadow.innerHTML = "";



        // Charger CSS AVANT de créer CodeMirror
        const cssReady = this.ensureCodemirrorCss(shadow);

        const ta = document.createElement("textarea");
        ta.value = ""; // fromTextArea lit ça, pas options.value
        shadow.appendChild(ta);

        this.codemirror = cm.CodeMirror.fromTextArea(ta, {
            lineNumbers: true,
            mode: "luxlang",
            theme: "dracula",
            tabSize: 2,
        });
        this.codemirror.on("change", async (instance: any, changeObj: any) => {
            const code = instance.getValue();
            try {
                const progRaw = await parse(this.codemirror.getValue())
                const prog = compileProgram(progRaw, new Set(Object.keys(this.PRIMS)))
                this.message = "Compile ✅ Succès"
                this.estExecutable = true

            } catch (e: any) {
                this.message = e.message + " ❌ Erreur "
                this.estExecutable = false

            }
            console.log("Code modifié, longueur:", code.length, "origin:", changeObj.origin);
        });
        // Important en Shadow DOM : refresh après chargement CSS + layout
        Promise.resolve(cssReady).then(() => requestAnimationFrame(() => this.codemirror.refresh()));
        const config = await client.getConfig()
        await client.setCurrentDirectory({ path: `${config.code}/examples` })
        const rep = await client.explorer({ path: `${config.code}/examples` })
        if (rep.type === "directory") {
            this.scriptNames = rep.content.map((e) => e.name)
        }

    }

    ensureCodemirrorCss(root: ShadowRoot) {
        const target = root;

        const ensureLink = (name: string, href: string) => {
            let link = target.querySelector(`link[data-name="${name}"]`) as HTMLLinkElement | null;
            if (link) return Promise.resolve();

            link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.dataset.name = name;
            target.appendChild(link);

            return new Promise<void>((resolve, reject) => {
                link!.addEventListener("load", () => resolve());
                link!.addEventListener("error", () => reject(new Error(`CSS load error: ${href}`)));
            });
        };

        // IMPORTANT: adapte le chemin si besoin (sinon 404)
        return Promise.all([
            ensureLink("codemirror-core", "codemirror/lib/codemirror.css"),
            ensureLink("codemirror-theme", "codemirror/theme/dracula.css"), // <-- AJOUT
            ensureLink("codemirror-motclef", "mot-clef.css"),
        ]).then(() => undefined);
    }

}
defineVue(Editor, (vue) => {

    vue.flow({ orientation: "row", gap: 5 }, () => {
        vue.flow({ orientation: "column", gap: 5 }, () => {
            vue.flow({
                orientation: "row", gap: 5
            }, () => {
                vue.staticButton({ action: "run", label: "Run", enable: "estExecutable" })
                vue.staticButton({ action: "removeScript", label: "Remove script" })
                vue.menu({ name: "dialogCreerScript", action: "addScript", label: "Add script" })

            })
            vue.select({ list: "scriptNames", displayMethod: "nameScript", selection: "selections", update: "selectScript", height: "80%" })


        })
        vue.flow({ orientation: "column", width: "80%", gap: 5 }, () => {
            vue.custom({ factory: "creerEditeur", width: "100%", height: "100%", init: "init" })
            vue.label("message")
            vue.label("sortie")

        })
    })


})
boot(new Editor())