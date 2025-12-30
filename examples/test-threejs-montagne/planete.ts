import { Vector2 } from "three";
import { defineVue } from "./node_modules/tauri-kargo-tools/src/vue";

import { creerFunction, distance, PointFeature, TypeFonction } from "./spi";


interface Point {
    x: number
    y: number
    h: number

}
export class PlacerPointsPourPlanete {
    nx = 10
    ny = 10
    R = 0.02;
    tf: TypeFonction = "SIN"
    sel: number[] = [1]
    types: TypeFonction[] = ["DP", "SIN", "RDP"];
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D

    points: Point[] = []
    selection?: Point;
    mouseDown = false
    peutSupprimerPoint = false
    label = "hellp"
    cssW = 0
    cssH = 0
  


    constructor() {


    }
    supprimerPoint() {
        this.points = this.points.filter((p) => p !== this.selection)
        this.selection = undefined
        this.peutSupprimerPoint = false
        this.drawGrid2D()

    }
    createCanvas(): HTMLCanvasElement {
        this.canvas = document.createElement("canvas")
        // this.canvas.style.width = `100%`;
        // this.canvas.style.flex = "1 1 auto"
        //  this.canvas.style.display = "block"
        this.canvas.style.minHeight = "0"
        return this.canvas
    }
    resizeAll() {
        this.fitCanvasToParent();

        this.drawGrid2D();

    }
    init(div: HTMLDivElement) {
        console.log("hello")
        window.addEventListener('resize', () => {
            this.resizeAll()
        });

        //   this.drawGrid2D()
        // this.initCanvas()

    }
    initCanvas() {
        this.ctx = this.canvas.getContext("2d")!

        // const ro = new ResizeObserver(() => this.fitCanvasToParent());
        //  ro.observe(this.canvas);

        this.fitCanvasToParent()
        this.drawGrid2D()


        this.canvas.addEventListener('mousedown', (e) => {
            const p = this.getPos(e);
            this.selection = undefined
            for (const e of this.points) {
                if (Math.abs(e.x - p.x) <= this.R && Math.abs(e.y - p.y) <= this.R) {
                    this.selection = e
                    this.peutSupprimerPoint = true

                }
            }
            if (!this.selection) {
                this.points.push(p)
                this.selection = p
                this.peutSupprimerPoint = true
            }

            this.drawGrid2D()
            this.mouseDown = true

        })
        this.canvas.addEventListener('mouseup', (e) => {
            this.mouseDown = false
            this.drawGrid2D()

        })
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.selection && this.mouseDown) {


                const { x, y } = this.getPos(e);
                this.selection.x = x
                this.selection.y = y

                this.drawGrid2D()
            }
        });


    }
    fitCanvasToParent() {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, this.canvas.clientWidth);
        const h = Math.max(1, this.canvas.clientHeight);

        const pw = Math.round(w * dpr);
        const ph = Math.round(h * dpr);

        if (this.canvas.width !== pw) this.canvas.width = pw;
        if (this.canvas.height !== ph) this.canvas.height = ph;





        // unité = px CSS
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    }

    getPos(evt: MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();

        const p = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;


        return {
            x: p.x / w, y: p.y / h,
            h: 0
        }

    }
    drawPlanete() {
        //this.drawGrid2D()
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        const centerX = w / 2
        const centerY = h / 2
        const r = Math.min(centerX, centerY) / 2
        const list: PointFeature<Vector2>[] = []




        for (const p of this.points) {
            const x = p.x * w
            const y = p.y * h

            const nx = x - centerX;
            const ny = y - centerY;
            const n = Math.sqrt(nx * nx + ny * ny)
            const pf: PointFeature<Vector2> = {
                value: new Vector2(r * nx / n, r * ny / n),
                y: n - r
            }

            list.push(pf)

        }
    
        const f = creerFunction(this.tf, list,distance)
        const nbPoint = 150
        this.ctx.strokeStyle = '#e5e5e5';
        this.ctx.beginPath();
        for (let k = 0; k <= nbPoint; k++) {

            const a = 2 * Math.PI * k / nbPoint
            const ca = Math.cos(a)
            const sa = Math.sin(a)
            let px = ca * r
            let py = sa * r
            let hr = f(new Vector2(px, py))
            let ax = px + ca * hr+centerX
            let ay = py + sa * hr+centerY
            if (k === 0) {
                this.ctx.moveTo(ax, ay)
            } else {
                this.ctx.lineTo(ax, ay)
            }

        }
        this.ctx.stroke();

    }
    drawGrid2D() {

        this.fitCanvasToParent();
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        console.log("client", w, h)
        console.log(this.canvas.width, this.canvas.height)



        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#e5e5e5';
        const centerX = w / 2
        const centerY = h / 2
        const r = Math.min(centerX, centerY) / 2
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, r, 0, 2 * Math.PI)
        this.ctx.stroke();





        for (const p of this.points) {
            const x = p.x * w
            const y = p.y * h



            this.ctx.strokeStyle = this.selection === p ? "blue" : "red"

            this.ctx.beginPath();
            this.ctx.arc(x, y, this.R * w, 0, 2 * Math.PI)
            this.ctx.stroke();
        }





        this.drawPlanete()




        this.ctx.strokeStyle = "green"
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h)
        this.ctx.stroke();
        this.ctx.restore();
    }
    setTypeFonction() {
        this.tf = this.types[this.sel[0]]
        this.drawGrid2D()
    }
    display(t: TypeFonction): string {
        return t
    }


}
/*defineVue(PlacerPointsPourPlanete, {
    kind: "flow",
    orientation: "column",
    // width: "100%",

    width: "50vw",
    gap: 5,
    height: "90vh",


    children: [
        { kind: "staticButton", action: "supprimerPoint", enable: "peutSupprimerPoint", label: "Supprimer", },
        { kind: "custom", factory: "createCanvas", init: "initCanvas", height: "90%" }
    ]
}, {
    init: "init"
})*/
defineVue(PlacerPointsPourPlanete, (vue) => {
    vue.flow({
        orientation: "column", width: "50vw",
        gap: 5,
        height: "90vh"
    }, () => {

        vue.flow({ orientation: "row" }, () => {
            vue.staticButton({ action: "supprimerPoint", enable: "peutSupprimerPoint", label: "Supprimer", width: "50%" })
            vue.select({
                list: "types",
                displayMethod: "display",
                selection: "sel",
                update: "setTypeFonction",
                mode: "dropdown"
                , width: "50%"
            })
      
        })

        vue.custom({ factory: "createCanvas", init: "initCanvas", height: "90%" })

    })
}), {
    init: "init"
}



