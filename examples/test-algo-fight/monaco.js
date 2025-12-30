// monaco.js (ES module)

const MONACO_BASE = window.MONACO_BASE || "/node_modules/monaco-editor/min";
const PROJECT_ROOT = "file:///";

let monacoPromise = null;

/* ---------- utils scripts + CSS ---------- */

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
    });
}

function ensureMonacoCss(rootNode) {
    const target =
        rootNode && rootNode.nodeType === 11 ? rootNode : document.head;

    if (
        target.querySelector &&
        target.querySelector('link[data-name="vs/editor/editor.main"]')
    ) {
        return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MONACO_BASE + "/vs/editor/editor.main.css";
    link.dataset.name = "vs/editor/editor.main";
    target.appendChild(link);
}

/* ---------- loadMonaco ---------- */

async function loadMonaco() {
    if (window.monaco) return window.monaco;

    if (!monacoPromise) {
        monacoPromise = (async () => {
            if (typeof window.require === "undefined" || !window.require.config) {
                await loadScript(MONACO_BASE + "/vs/loader.js");
            }

            window.require.config({
                paths: { vs: MONACO_BASE + "/vs" },
            });

            return new Promise((resolve, reject) => {
                window.require(["vs/editor/editor.main"], () => {

                    const ts = monaco.languages.typescript;

                    ts.typescriptDefaults.setEagerModelSync(true);
                    ts.typescriptDefaults.setDiagnosticsOptions({
                        noSemanticValidation: false,
                        noSyntaxValidation: false,
                    });

                    ts.typescriptDefaults.setCompilerOptions({
                        target: ts.ScriptTarget.ES2020,
                        module: ts.ModuleKind.ESNext,
                        moduleResolution: ts.ModuleResolutionKind.NodeJs,
                        allowNonTsExtensions: true,
                        allowJs: true,   // ✅ autorise les .js
                        checkJs: true,
                        strict: true,
                        noEmit: true,
                        lib: ["es2020", "dom"],
                    });

                    resolve(monaco);
                }, reject);
            });
        })();
    }

    return monacoPromise;
}

/* ---------- helpers projet (FS virtuel) ---------- */

function projectUri(monaco, path) {
    const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
    return monaco.Uri.parse(`${PROJECT_ROOT}${clean}`);
}

function languageFromPath(path) {
    if (
        path.endsWith(".ts") ||
        path.endsWith(".tsx") ||
        path.endsWith(".js") ||
        path.endsWith(".jsx")
    ) {
        // ✅ tout passe par le worker TypeScript
        return "typescript";
    }
    return "plaintext";
}

/**
 * filesObj: { [path: string]: string }
 * entryPath (optionnel) : ce fichier sera traité en dernier
 */
function syncProjectFiles(monaco, filesObj, entryPath) {
    const files = filesObj || {};
    const existing = monaco.editor.getModels();

    const allPaths = Object.keys(files);
    const needed = new Set(
        allPaths.map((p) => projectUri(monaco, p).toString()),
    );

    // nettoyer les anciens modèles
    for (const model of existing) {
        const uriStr = model.uri.toString();
        if (uriStr.startsWith(PROJECT_ROOT) && !needed.has(uriStr)) {
            model.dispose();
        }
    }

    // ordre: tous sauf entry, puis entry
    let orderedPaths = allPaths;
    if (entryPath && allPaths.includes(entryPath)) {
        orderedPaths = allPaths.filter((p) => p !== entryPath);
        orderedPaths.push(entryPath); // ✅ entry en dernier
    }

    for (const path of orderedPaths) {
        const content = files[path].content;
        const uri = projectUri(monaco, path);
        const lang = languageFromPath(path);
        let model = monaco.editor.getModel(uri);

        if (!model) {
            monaco.editor.createModel(content, lang, uri);
        } else {
            if (model.getLanguageId() !== lang) {
                monaco.editor.setModelLanguage(model, lang);
            }
            if (model.getValue() !== content) {
                model.setValue(content);
            }
        }
    }
}

/* ---------- 1) Charger à partir d’un objet { [path]: string } ---------- */

export async function loadProjectFromObject(files) {
    const monaco = await loadMonaco();
    const filesObj = files || {};
    syncProjectFiles(monaco, filesObj);
    return { monaco, files: filesObj };
}

/* ---------- 2) Init éditeur dans Shadow DOM à partir de l’objet ---------- */

export async function initMonacoFromFilesObject(host, options = {}) {
    const { files, entry, editorOptions = {} } = options;
    if (!host) throw new Error("initMonacoFromFilesObject: host manquant");
    if (!files) throw new Error("initMonacoFromFilesObject: files manquant");

    // dispose ancien éditeur
    if (host._monacoEditor) {
        host._monacoEditor.dispose();
        host._monacoEditor = null;
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    while (shadow.firstChild) shadow.removeChild(shadow.firstChild);

    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    shadow.appendChild(container);

    ensureMonacoCss(shadow);

    const monaco = await loadMonaco();
    const filesObj = files || {};

    const entryPath = entry || Object.keys(filesObj)[0];
    if (!entryPath) {
        throw new Error("initMonacoFromFilesObject: aucun fichier fourni");
    }

    // ⚙️ sync avec entry en dernier
    syncProjectFiles(monaco, filesObj, entryPath);

    const entryUri = projectUri(monaco, entryPath);
    let model = monaco.editor.getModel(entryUri);

    if (!model) {
        console.warn(
            "Models exist:",
            monaco.editor.getModels().map((m) => m.uri.toString())
        );
        throw new Error(
            `initMonacoFromFilesObject: fichier d'entrée introuvable: ${entryPath}`
        );
    }

    try {
        const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
        await getWorker(entryUri);
    } catch (e) {
        console.warn("[monaco] TS worker init failed:", e);
    }

    const editor = monaco.editor.create(container, {
        model,
        theme: "vs-dark",
        automaticLayout: true,
        ...editorOptions,
    });

    host._monacoEditor = editor;
    return { editor, monaco };
}

/* ---------- init simple ---------- */

export async function initMonacoEditor(container, options = {}) {
    if (!container) {
        throw new Error("initMonacoEditor: container manquant");
    }

    if (container._monacoEditor) {
        container._monacoEditor.dispose();
        container._monacoEditor = null;
    }

    ensureMonacoCss(document);
    const monaco = await loadMonaco();

    const editor = monaco.editor.create(
        container,
        Object.assign(
            {
                value: "",
                language: "typescript",
                theme: "vs-dark",
                automaticLayout: true,
            },
            options,
        ),
    );

    container._monacoEditor = editor;
    return editor;
}

export { monacoPromise };
