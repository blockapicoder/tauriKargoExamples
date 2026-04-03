// public/peggy-shim.js
// Charge la build navigateur UMD depuis node_modules et l’expose en ESM.
import "./node_modules/peggy/browser/peggy.min.js";   // doit être servi par ton dev server

const peggy = globalThis.peggy || globalThis.peg || self.peggy || self.peg;

if (!peggy) {
  throw new Error("Peggy introuvable dans le contexte global du worker");
}       // selon la version
export default peggy;
export const generate = peggy.generate.bind(peggy);
