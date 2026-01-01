// public/peggy-shim.js
// Charge la build navigateur UMD depuis node_modules et l’expose en ESM.
import "./node_modules/peggy/browser/peggy.min.js";   // doit être servi par ton dev server

const peggy = window.peggy || window.peg;            // selon la version
export default peggy;
export const generate = peggy.generate.bind(peggy);
