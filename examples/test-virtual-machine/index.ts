
import * as vm from "./model"
import { parse } from "./parser"
import * as cm from "./codemirror-module"
import { defineVue, boot } from "./node_modules/tauri-kargo-tools/src/vue"

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

class Editor {

    editeur!: HTMLTextAreaElement
    div!: HTMLDivElement
    sortie: string = ""
    codemirror: any
    constructor() {

    }
    async run() {
        const PRIMS = {
            print: (s: string) => {
                this.sortie += s
            },
            clear: ()=> {
                this.sortie =""
            },
            cur:( f:(...values:any[])=>any , ...args:any[]) => {
                return (...newArgs:any[])=> {
                    const tmp:any[]= [...args,...newArgs]
                    return f(...tmp)
                }

            }
        }
        const prog = await parse(this.codemirror.getValue())
        const js = vm.generateProg(prog)
        const run = eval(js) as (prims: any) => any

        run(PRIMS)
    }
    creerEditeur(): HTMLDivElement {

        this.div = document.createElement("div")


        return this.div
    }
    init() {
        const shadow = this.div.shadowRoot ?? this.div.attachShadow({ mode: "open" });
        shadow.innerHTML = "";

        // (Optionnel mais souvent nécessaire) donner une hauteur
        const style = document.createElement("style");
        style.textContent = `
    :host { display: block; }
    .CodeMirror { height: 100%; }
  `;
        shadow.appendChild(style);

        // Charger CSS AVANT de créer CodeMirror
        const cssReady = this.ensureCodemirrorCss(shadow);

        const ta = document.createElement("textarea");
        ta.value = "Tessst"; // fromTextArea lit ça, pas options.value
        shadow.appendChild(ta);

        this.codemirror = cm.CodeMirror.fromTextArea(ta, {
            lineNumbers: true,
            mode: "luxlang",
            theme: "default",
            tabSize: 2,
        });

        // Important en Shadow DOM : refresh après chargement CSS + layout
        Promise.resolve(cssReady).then(() => requestAnimationFrame(() =>   this.codemirror.refresh()));
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
            ensureLink("codemirror-motclef", "mot-clef.css"),
        ]).then(() => undefined);
    }

}
defineVue(Editor, (vue) => {
    vue.flow({ orientation: "column" }, () => {
        vue.custom({ factory: "creerEditeur", width: "100%", height: "100%", init: "init" })
        vue.staticButton({ action: "run", label: "Run" })
        vue.label("sortie")

    })


})
boot(new Editor())