// worker.mjs
const ORIGIN = new URL(import.meta.url).origin;      // https://example.com
const BASE   = new URL(".", import.meta.url).href;   // https://example.com/path/to/

function absolutizeImports(code:string, baseHref = BASE) {
  // Convertit from "./x" ou from "../x" en from "base/x"
  return code.replace(/from\s+["'](\.\/|\.\.\/[^"']*)/g, (m, rel) => {
    // rel vaut "./" ou "../something" => on récupère la partie complète entre quotes via une regex plus large
    return ' from "'+baseHref; // (voir fonction robuste ci-dessous)
  });
}

export function runWorker(code: string) {
    code = absolutizeImports(code)
    const blob = new Blob([code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    return new Worker(url, { type: "module" });

}