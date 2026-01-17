import { CompressionDemande, Result, Trace } from "./model";
import { defineVue, boot } from "./node_modules/tauri-kargo-tools/src/vue"

import { Ctx, distance, PointFeature, simplifier, P } from "./spec-spi";


const TAILLE_DECOUPAGE = 16

interface DecoupageFeature {
    featuresR: PointFeature<P>[]
    featuresG: PointFeature<P>[]
    featuresB: PointFeature<P>[]
}
interface Decoupage {
    x: number
    y: number

    r: (p: P) => number
    g: (p: P) => number
    b: (p: P) => number

}

export type ImagePixels = {
    width: number;
    height: number;
    data: Uint8ClampedArray; // RGBA, 4 * width * height
};


export type RGBA = { r: number; g: number; b: number; a: number };

export function getRGBA(p: ImagePixels, x: number, y: number): RGBA {
    const { width, height, data } = p;

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
        throw new Error(`x and y must be integers (got x=${x}, y=${y})`);
    }
    if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(
            `Out of bounds: (x=${x}, y=${y}) for image ${width}x${height}`
        );
    }

    const i = (y * width + x) * 4;
    return {
        r: data[i + 0],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
    };
}

export function createImagePixels(width: number, height: number): ImagePixels {
    const imgData = new ImageData(width, height); // data initialisé à 0
    return { width, height, data: imgData.data };
}

export function setPixelRGB(
    p: ImagePixels,
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number = 255
): void {
    if (x < 0 || y < 0 || x >= p.width || y >= p.height) return; // ou throw
    const i = (y * p.width + x) * 4;
    p.data[i + 0] = r; // 0..255
    p.data[i + 1] = g;
    p.data[i + 2] = b;
    p.data[i + 3] = a; // alpha
}
function renderToCanvas(p: ImagePixels, canvas: HTMLCanvasElement): void {
    canvas.width = p.width;
    canvas.height = p.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // Crée un ImageData "vue" sur p.data
    const imgData = new ImageData(p.width, p.height);
    imgData.data.set(p.data)
    ctx.putImageData(imgData, 0, 0);
}
class ImageCompression {

    inputFile!: HTMLElement
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D
    imagePixels!: ImagePixels
    sortie = ""
    decoupages: Result[] = []
    titreNombreEssai = "Nombre essai"
    nombreEssai: number = 0
    titreNombreRetrait = "Nombre retrait"
    numbreRetrait: number = 0
    titreErreur = "Erreur"
    erreur: number = 2
    progression: string =""
    worker: Worker | undefined

    createCanvas(): HTMLElement {
        this.canvas = document.createElement("canvas")
        this.canvas.width = 256;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
        return this.canvas
    }
    async loadImageTo256(fileObj: File) {
        const url = URL.createObjectURL(fileObj);
        try {
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
            await img.decode();

            this.ctx.clearRect(0, 0, 256, 256);
            this.ctx.drawImage(img, 0, 0, 256, 256);
            const imgData = this.ctx.getImageData(0, 0, 256, 256);

            this.imagePixels = { width: imgData.width, height: imgData.height, data: imgData.data };
            this.sortie = `${this.imagePixels.width}*${this.imagePixels.height}`
            // Afficher l'original redimensionné
            // ctx0.putImageData(imageData, 0, 0);


        } finally {
            URL.revokeObjectURL(url);
        }
    }
    createInputFile(): HTMLElement {


        const input = document.createElement("input");
        this.inputFile = input;
        input.type = "file";
        input.accept = "image/*";
        input.multiple = false;


        const cleanup = () => {
            input.value = "";
            input.remove();
        };

        input.addEventListener(
            "change",
            () => {

                const file = input.files?.[0];
                this.loadImageTo256(file!)

            },
            { once: true }
        );
        return this.inputFile
    }



    async compresser() {


        this.sortie = ""
        if (this.worker) {
            this.worker.terminate()
        }
        const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker = worker

        const cible = createImagePixels(this.imagePixels.width, this.imagePixels.height)
        const ctx: Ctx = { erreur: this.erreur, nombreEssai: this.nombreEssai, nombreRetrait: this.numbreRetrait }
        const demandeCompression: CompressionDemande = {
            ctx: ctx,
            imagePixels: this.imagePixels

        }
        worker.postMessage(demandeCompression)
        worker.onmessage = (m) => {
            const data: Trace | Result = m.data
            if (data.type === "trace") {
                this.sortie += `${data.p.x},${data.p.y} nbRetrait = ${data.nbRetrait} , nbTest = ${data.nbTest} ,nombreTotalRetrait = ${data.nombreTotalRetrait} \n`
            }
            if (data.type ==="result") {
                this.decoupages.push(data)
                this.sortie =""
                this.progression = `${this.decoupages.length}`

            }
        }

        //  renderToCanvas(this.imagePixels, this.canvas)


    }
    arreter() {
        if (this.worker) {
            this.worker.terminate()
            this.worker = undefined
            this.sortie = ""
        }

    }
}
defineVue(ImageCompression, (vue) => {
    vue.flow({ orientation: "column" }, () => {
        vue.flow({ orientation: "row" }, () => {
            vue.custom({ factory: "createInputFile" })
            vue.label("titreNombreEssai"),
                vue.input({ name: "nombreEssai" })
            vue.label("titreNombreRetrait")
            vue.input({ name: "numbreRetrait" })
            vue.label("titreErreur")
            vue.input({ name: "erreur" })

        })
        vue.flow({ orientation: "row" }, () => {
            vue.staticButton({ action: "compresser", label: "Compresser" })
            vue.staticButton({ action: "arreter", label: "Arreter" })

        })
        vue.label("progression")
        vue.label("sortie")
        vue.custom({ factory: "createCanvas", width: 256, height: 256 })

    })

})
boot(new ImageCompression())