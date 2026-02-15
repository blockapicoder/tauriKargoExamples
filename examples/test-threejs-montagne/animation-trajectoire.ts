import { Vector3 } from "three";
import { defineVue } from "./node_modules/tauri-kargo-tools/src/vue";
import { creerFunction, PointFeature } from "./spi"
import { createClient } from "./node_modules/tauri-kargo-tools/src/api";
interface Point {
    x: number
    y: number
    ctx: number
    gen: number
    target?: Target

}
interface Target {
    dx: number
    dy: number
    x: number
    y: number
    d: number
}

interface FonctionTrajectoire {
    fx: (p: Vector3) => number
    fy: (p: Vector3) => number
    fctx: (p: Vector3) => number
}
const client = createClient()

export class AnimationTrajectoire {
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D

    fonctionTrajectoire!: FonctionTrajectoire
    rid?: number

    points: Point[] = []
    trajectoires: Point[] = []


    selection?: Point;
    mouseDown = false
    R = 0.01;
    V = 0.001;
    peutSupprimerPoint = false
    selectionCtx: string = ""
    listCtx: number[] = [0]

    constructor() {
        client.readFileText("trajectoires.json").then((value) => {
            const tmp: any = JSON.parse(value)
            const tmpPoints: Point[] = tmp.points
            this.trajectoires = tmpPoints
            this.listCtx = [...new Set(tmpPoints.map((p) => p.ctx))]
            this.creerFonctionTrajectoire(tmpPoints)
        })
    }
    move(p: Point, speed: number) {
        if (!p.target) {
            this.getTarget(p)
            return true
        }
        let vx = speed * p.target.dx
        let vy = speed * p.target.dy
        let d = p.target.d - speed

        if (d < 0) {
            this.getTarget(p)
            return true
        }
        p.target.d = d
        p.x += vx
        p.y += vy
        return true

    }
    creerFonctionTrajectoire(points: Point[]) {
        const featureX: PointFeature<Vector3>[] = []
        const featureY: PointFeature<Vector3>[] = []
        const featureCtx: PointFeature<Vector3>[] = []
        for (const ctx of this.listCtx) {
            const tmpPoints = points.filter((p) => p.ctx === ctx)
            for (let idx = 0; idx < tmpPoints.length - 1; idx++) {
                const currentP = tmpPoints[idx]
                const nextP = tmpPoints[idx + 1]
                const vector3 = new Vector3(currentP.x, currentP.y, currentP.ctx)
                featureX.push({
                    value: vector3,
                    y: nextP.x
                })
                featureY.push({
                    value: vector3,
                    y: nextP.y
                })
                featureCtx.push({
                    value: vector3,
                    y: nextP.ctx
                })
            }
        }
        this.fonctionTrajectoire = {
            fx: creerFunction("SIN", featureX, (a, b) => a.distanceToSquared(b)),
            fy: creerFunction("SIN", featureY, (a, b) => a.distanceToSquared(b)),
            fctx: creerFunction("SIN", featureCtx, (a, b) => a.distanceToSquared(b)),
        }

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
                    this.peutSupprimerPoint = true
                    e.target = p.target
                    this.selectionCtx = `${this.selection.ctx.toFixed(2)}`

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


                const p = this.getPos(e);
                this.selection.x = p.x
                this.selection.y = p.y
                this.selection.target = p.target

                this.drawGrid2D()
            }
        });


    }
    stopAnimate() {
        if (this.rid) {
            cancelAnimationFrame(this.rid)
        }
    }
    animate() {
        this.rid = requestAnimationFrame(() => {
            this.points = this.points.filter((p) => this.move(p, this.V))
            this.drawGrid2D()
            this.animate()
        })
    }
    drawGrid2D() {
        this.fitCanvasToParent();
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        // console.log("client", w, h)
        //  console.log(this.canvas.width, this.canvas.height)



        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#e5e5e5';







        for (const p of this.points) {
            const x = p.x * w
            const y = p.y * h







            this.ctx.strokeStyle = this.selection === p ? "blue" : "red"

            this.ctx.beginPath();
            this.ctx.arc(x, y, this.R * w, 0, 2 * Math.PI)
            this.ctx.stroke();
            this.ctx.fillStyle = "blue"
            this.ctx.font = `${w / 100}px Arial`
            this.ctx.fillText(`${p.gen}`, x - this.R * w / 2, y + this.R * w / 2)

        }

        const last: Point[] = []

        for (const p of this.trajectoires) {
            const x = p.x * w
            const y = p.y * h




            const tmp = last[p.ctx]
            if (tmp) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = "green"
                this.ctx.moveTo(tmp.x * w, tmp.y * h)
                this.ctx.lineTo(x, y)
                this.ctx.stroke();
            }
            last[p.ctx] = p

        }








        this.ctx.strokeStyle = "green"
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h)
        this.ctx.stroke();
        this.ctx.restore();
    }
    getTarget(p: Point) {

        let v = new Vector3(p.x, p.y, p.ctx)
        let px = this.fonctionTrajectoire.fx(v)
        let py = this.fonctionTrajectoire.fy(v)

        let dx = px - p.x
        let dy = py - p.y
        let d = Math.sqrt(dx * dx + dy * dy)
        if (d <= 0.005) {
            p.ctx = this.getCtxValue()
            p.target = undefined
            p.gen++
            return

        }
        const target: Target = {
            d: d,
            dx: dx / d,
            dy: dy / d,
            x: px,
            y: py
        }
        p.target = target
    }
    getPos(evt: MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();

        const p = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        let ctx = this.getCtxValue()
        let cx = p.x / w
        let cy = p.y / h

        const r: Point = {
            x: cx, y: cy,
            ctx: ctx,
            gen: 0


        }
        this.getTarget(r)

        return r

    }
    getCtxValue() {
        return Math.random() * this.listCtx.length

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

defineVue(AnimationTrajectoire, (vue) => {
    vue.flow({
        orientation: "column", width: "100vw",
        gap: 5,
        height: "90vh"
    }, () => {

        vue.flow({ orientation: "row" }, () => {
            vue.staticButton({ action: "supprimerPoint", enable: "peutSupprimerPoint", label: "Supprimer", width: "25%" })
            vue.label("selectionCtx", { width: "25%" })
            vue.staticButton({ action: "animate", label: "Animer", width: "25%" })
            vue.staticButton({ action: "stopAnimate", label: "Stopper", width: "25%" })
        })

        vue.custom({ factory: "createCanvas", init: "initCanvas" })

    })
}), {
    init: "init"
}
