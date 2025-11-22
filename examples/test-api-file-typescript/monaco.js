// monaco.js (ES module)

const MONACO_BASE = window.MONACO_BASE || "/node_modules/monaco-editor/min";

let monacoPromise = null;

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

async function loadMonaco() {
  // déjà chargé ?
  if (window.monaco) return window.monaco;

  if (!monacoPromise) {
    monacoPromise = (async () => {
      // charger loader.js si besoin
      if (typeof window.require === "undefined" || !window.require.config) {
        await loadScript(MONACO_BASE + "/vs/loader.js");
      }

      // config AMD
      window.require.config({
        paths: { vs: MONACO_BASE + "/vs" },
      });

      // charger editor.main
      return new Promise((resolve, reject) => {
        window.require(["vs/editor/editor.main"], () => {
          // config TypeScript
          monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
          monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ES2020,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            allowJs: true,
            checkJs: false,
            strict: false,
            allowNonTsExtensions: true,
          });

          resolve(monaco);
        }, reject);
      });
    })();
  }

  return monacoPromise;
}

// 🔹 Fonction exportée : initialise un div et retourne l’éditeur
export async function initMonacoEditor(container, options = {}) {
  if (!container) {
    throw new Error("initMonacoEditor: container manquant");
  }

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

  return editor;
}

// (optionnel) exposer monaco brut
export { monacoPromise };
