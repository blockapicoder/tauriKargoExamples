import { Vector3 } from "three";
import { defineVue } from "./node_modules/tauri-kargo-tools/src/vue";
import {  createClient } from "./node_modules/tauri-kargo-tools/src/api";
import { creerFunction, PointFeature } from "./spi"
interface Point {


    x: number
    y: number
    ctx: number

}

const client = createClient()


export class PlacerPointsPourTrajectoire {
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D



    points: Point[] = []

    selection?: Point;
    mouseDown = false
    R = 0.01;
    peutSupprimerPoint = false
    selectionCtx: number[] = []
    listCtx: number[] = [0]

    constructor() {
        client.readFileText("trajectoires.json").then((value) => {
            const tmp: any = JSON.parse(value)
            this.points = tmp.points
            this.listCtx = [...new Set(this.points.map((p) => p.ctx))]
            this.drawGrid2D()
        })

    }
    async enregistrerTrajectoires() {
        const value: any = { points: this.points }
        await client.writeFileText("trajectoires.json", JSON.stringify(value))
    }


    ctxToString(n: number): string {
        return `${n}`
    }
    createCanvas(): HTMLCanvasElement {
        this.canvas = document.createElement("canvas")
        // this.canvas.style.width = `100%`;
        // this.canvas.style.flex = "1 1 auto"
        //  this.canvas.style.display = "block"
        this.canvas.style.minHeight = "0"
        return this.canvas
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
    initCanvas() {
        this.ctx = this.canvas.getContext("2d")!

        // const ro = new ResizeObserver(() => this.fitCanvasToParent());
        //  ro.observe(this.canvas);

        this.fitCanvasToParent()
        this.drawGrid2D()


        this.canvas.addEventListener('mousedown', (e) => {
            const p = this.getPos(e);
            let oldSelection = this.selection
            this.selection = undefined

            for (const e of this.points) {
                if (Math.abs(e.x - p.x) <= this.R && Math.abs(e.y - p.y) <= this.R) {
                    this.selection = e
                    this.selectionCtx = [this.listCtx.indexOf(e.ctx)]
                    this.peutSupprimerPoint = true

                }
            }
            if (!this.selection) {
                if (oldSelection) {
                    let idx = this.points.indexOf(oldSelection)
                    this.points.splice(idx + 1, 0, p);
                } else {
                    this.points.push(p)
                }
                this.selection = p

                this.peutSupprimerPoint = true
                this.enregistrerTrajectoires()
            }

            this.drawGrid2D()
            this.mouseDown = true

        })
        this.canvas.addEventListener('mouseup', (e) => {
            this.mouseDown = false
            this.drawGrid2D()
            this.enregistrerTrajectoires()

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
    drawGrid2D() {
        this.fitCanvasToParent();
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        console.log("client", w, h)
        console.log(this.canvas.width, this.canvas.height)



        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#e5e5e5';





        const last: Point[] = []

        for (const p of this.points) {
            const x = p.x * w
            const y = p.y * h



            this.ctx.strokeStyle = this.selection === p ? "blue" : "red"

            this.ctx.beginPath();
            this.ctx.arc(x, y, this.R * w, 0, 2 * Math.PI)
            this.ctx.stroke();
            this.ctx.font = `${w / 100}px Arial`
            const tmp = last[p.ctx]
            if (tmp) {
                this.ctx.beginPath();
                this.ctx.moveTo(tmp.x * w, tmp.y * h)
                this.ctx.lineTo(x, y)
                this.ctx.stroke();
            }
            last[p.ctx] = p
            this.ctx.fillStyle = "blue"
            this.ctx.fillText(`${p.ctx}`, x - this.R * w / 2, y + this.R * w / 2)
        }










        this.ctx.strokeStyle = "green"
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h)
        this.ctx.stroke();
        this.ctx.restore();
    }
    getPos(evt: MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();

        const p = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;


        return {
            x: p.x / w, y: p.y / h,
            ctx: this.getCtxValue()
        }

    }
    getCtxValue() {
        if (this.selectionCtx.length === 1) {
            return this.listCtx[this.selectionCtx[0]]
        }
        return 0

    }
    supprimerPoint() {
        this.points = this.points.filter((p) => p !== this.selection)
        this.selection = undefined
        this.peutSupprimerPoint = false
        this.drawGrid2D()

    }
    update() {

    }
    addCtx() {
        this.listCtx = [...this.listCtx, this.listCtx.length]
    }
}

defineVue(PlacerPointsPourTrajectoire, (vue) => {
    vue.flow({
        orientation: "column", width: "100vw",
        gap: 5,
        height: "90vh"
    }, () => {

        vue.flow({ orientation: "row" }, () => {
            vue.staticButton({ action: "supprimerPoint", enable: "peutSupprimerPoint", label: "Supprimer", width: "33%" })
            vue.select({ list: "listCtx", mode: "dropdown", displayMethod: "ctxToString", selection: "selectionCtx", update: "update", width: "33%" })
            vue.staticButton({ action: "addCtx", label: "Add ctx", width: "33%" })

        })

        vue.custom({ factory: "createCanvas", init: "initCanvas" })

    })
})
