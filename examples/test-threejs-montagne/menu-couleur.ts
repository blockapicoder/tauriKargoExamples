import { Planete } from "./three-planete";
import { defineVue } from "./node_modules/tauri-kargo-tools/src/vue"
import * as THREE from 'three';
// TypeScript (navigateur)

type ColorGridOptions = {
    columns?: number;
    cellSizePx?: number;
    gapPx?: number;
    onSelect?: (color: string) => void;
};

export function createColorGrid(
    container: HTMLElement,
    colors: string[],
    options: ColorGridOptions = {},
) {
    const columns = options.columns ?? 10;
    const cellSizePx = options.cellSizePx ?? 24;
    const gapPx = options.gapPx ?? 6;

    // Reset
    container.innerHTML = "";

    // Grid layout
    Object.assign(container.style, {
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, ${cellSizePx}px)`,
        gap: `${gapPx}px`,
        alignItems: "center",
        justifyContent: "start",
    } as CSSStyleDeclaration);

    let selectedBtn: HTMLButtonElement | null = null;

    for (const color of colors) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = color;
        btn.setAttribute("aria-label", `Choisir la couleur ${color}`);
        btn.dataset.color = color;

        Object.assign(btn.style, {
            width: `${cellSizePx}px`,
            height: `${cellSizePx}px`,
            borderRadius: "6px",
            border: "1px solid rgba(0,0,0,0.25)",
            background: color,
            padding: "0",
            cursor: "pointer",
            outline: "none",
            boxSizing: "border-box",
        } as CSSStyleDeclaration);

        btn.addEventListener("click", () => {
            if (selectedBtn) {
                selectedBtn.style.boxShadow = "";
                selectedBtn.style.border = "1px solid rgba(0,0,0,0.25)";
            }
            selectedBtn = btn;
            btn.style.border = "2px solid rgba(0,0,0,0.65)";
            btn.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.75) inset";

            const selectedColor = btn.dataset.color!;
            options.onSelect?.(selectedColor);

            // Event custom si vous préférez écouter côté appli
            container.dispatchEvent(
                new CustomEvent("colorchange", { detail: { color: selectedColor } }),
            );
        });

        container.appendChild(btn);
    }
}



const palette = [
    "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF",
    "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080",
    "#808080", "#A52A2A", "#FFC0CB", "#00A86B", "#1E90FF",
];

export interface SelectionCouleur {
    tranformSphere:()=>void
    couleurCourante:THREE.Color
    setSelectedMarkerColor:(c:THREE.Color)=>void
}

export class ChoixCouleur {
    planete!: SelectionCouleur

    createDiv(): HTMLDivElement {
        const r = document.createElement("div")
        createColorGrid(r, palette, {
            columns: 8,
            cellSizePx: 28,
            onSelect: (c) => {
                this.planete.couleurCourante = new THREE.Color(c)
                this.planete.setSelectedMarkerColor(this.planete.couleurCourante)
                this.planete.tranformSphere()
            },
        });
        return r


    }


    init(div: HTMLDivElement) {
     

    }
}

defineVue(ChoixCouleur, {
    kind: 'flow',
    width: "100%",
    height: "100%",
    orientation: "column",
    children: [
        { kind: "custom", factory:"createDiv" }

    ]


})