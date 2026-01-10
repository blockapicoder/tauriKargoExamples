import * as schema from "./node_modules/tauri-kargo-tools/src/schema/base"
export const model= schema.createModel({
    Energie: {
        type: {union: ["Energie"]},
        position: {ref: ["Position"]},
        proprietaire: {optional: {ref: ["Drone", "Usine"]}}
    },
    Vie: {
        type: {union: ["Vie"]},
        position: {ref: ["Position"]},
        proprietaire: {optional: {ref: ["Drone"]}}
        },
    Drone: {
        type: {union: ["Drone"]},
        position: {ref: ["Position"]},
        usine: {ref: ["Usine"]},
        cible: {optional: {ref: ["Drone", "Usine", "Energie", "Position", "Vie"]}},
        joueur: {ref: ["Joueur"]}
    },
    Usine: {
        type: {union: ["Usine"]},
        position: {ref: ["Position"]},
        joueur: {optional: {ref: ["Joueur"]}},
        technologie: {union: ["Population", "Vitesse", "Porte", "Transport", "Puissance", "Bouclier"]},
        bouclier: "number"
    },
    Position: {
        type: {union: ["Position"]},
        x: "number",
        y: "number"
    },
    Joueur: {
        type: {union: ["Joueur"]},
    }

} );