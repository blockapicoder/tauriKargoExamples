import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"
import { Montagne } from "./three-montagne";

const R = 0.02;      // rayon visuel du point 2D

interface Point {
    x: number
    y: number
    h: number

}

const nx = 10
const ny = 10
export class PlacerPoints {

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
                if (Math.abs(e.x - p.x) <= R && Math.abs(e.y - p.y) <= R) {
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
        this.canvas.addEventListener('wheel', (e) => {

            const dir = e.deltaY < 0 ? 1 : -1;
            const mult = e.shiftKey ? 5 : 1;
            if (this.selection) {
                this.selection.h += dir

                this.drawGrid2D()
            }

        }, { passive: false });

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
    drawGrid2D() {
        this.fitCanvasToParent();
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        console.log("client", w, h)
        console.log(this.canvas.width, this.canvas.height)


        const dx = w / nx;
        const dy = h / ny;
        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#e5e5e5';
        for (let x = 0; x <= nx; x += 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * dx, 0);
            this.ctx.lineTo(x * dx, h);
            this.ctx.stroke();
        }
        for (let y = 0; y <= ny; y += 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * dy);
            this.ctx.lineTo(w, y * dy);
            this.ctx.stroke();
        }



        for (const p of this.points) {

            const x = p.x * w
            const y = p.y * h
            this.ctx.strokeStyle = this.selection === p ? "blue" : "red"

            this.ctx.beginPath();
            this.ctx.arc(x, y, R * w, 0, 2 * Math.PI)
            this.ctx.stroke();
            this.ctx.font = `${dx / 4}px Arial`

            this.ctx.fillStyle = "blue"
            this.ctx.fillText(`${p.h}`, x - R * w / 2, y + R * w / 2)


        }

        this.ctx.strokeStyle = "green"
        this.ctx.beginPath();
        this.ctx.rect(0, 0, w, h)
        this.ctx.stroke();
        this.ctx.restore();
    }

}

defineVue(PlacerPoints, {
    kind: "flow",
    orientation: "column",
   // width: "100%",
    height: "100vh",
    width:"50vw",


    children: [
        { kind: "staticButton", action: "supprimerPoint", enable: "peutSupprimerPoint", label: "Supprimer", },
        { kind: "custom", factory: "createCanvas", init: "initCanvas" },
        { kind: "label", name: "label" }
    ]
}, {
    init: "init"
})
class T {
    p1: PlacerPoints
    p2: Montagne
    constructor() {
        this.p1 = new PlacerPoints()
        this.p2 = new Montagne()
    }
}
defineVue(T, {
    orientation: "row",
    kind: "flow",
   // height: "100vh",
    children: [{
        kind: "singleVue",
        name: "p1"
    }, {
        kind: "singleVue",
        name: "p2"
    }]
})
boot(new T())