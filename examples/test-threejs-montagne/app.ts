import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"
import { PlacerPointsPourPlanete } from "./planete";
import { Montagne } from "./three-montagne";
import { Planete } from "./three-planete";
import { PlaneteNavigation } from "./three-planete-navigation";

// rayon visuel du point 2D

interface Point {
    x: number
    y: number
    h: number

}


export class PlacerPoints {
    nx = 10
    ny = 10
    R = 0.02;
    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D
    montagne!: Montagne
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
        this.montagne.setPoints(this.points.map((p, idx) => {
            return { x: p.x, y: p.y, h: p.h, id: idx }
        }), this.points.indexOf(this.selection!))
        this.fitCanvasToParent();
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        console.log("client", w, h)
        console.log(this.canvas.width, this.canvas.height)


        const dx = w / this.nx;
        const dy = h / this.ny;
        this.ctx.save();
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#e5e5e5';
        for (let x = 0; x <= this.nx; x += 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * dx, 0);
            this.ctx.lineTo(x * dx, h);
            this.ctx.stroke();
        }
        for (let y = 0; y <= this.ny; y += 1) {
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
            this.ctx.arc(x, y, this.R * w, 0, 2 * Math.PI)
            this.ctx.stroke();
            this.ctx.font = `${dx / 4}px Arial`

            this.ctx.fillStyle = "blue"
            this.ctx.fillText(`${p.h}`, x - this.R * w / 2, y + this.R * w / 2)


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

    width: "50vw",
    gap: 5,
    height: "90vh",


    children: [
        { kind: "staticButton", action: "supprimerPoint", enable: "peutSupprimerPoint", label: "Supprimer", },
        { kind: "custom", factory: "createCanvas", init: "initCanvas", height: "90%" }
    ]
}, {
    init: "init"
})
class MontagneEditeur {
    titrePagePrincipal = "Page principal"
    pagePrincipal() {
        return new PagePrincpal()
    }
    p1: PlacerPoints
    p2: Montagne
    constructor() {
        this.p1 = new PlacerPoints()

        this.p2 = new Montagne()
        this.p1.montagne = this.p2
    }
}
defineVue(MontagneEditeur, {
    kind: "flow",
    orientation: "column",
    height: "99vh",
    gap: "1vh",
    // width: "100vh",
    children: [
        {
            kind: "bootVue",
            factory: "pagePrincipal",
            label: "titrePagePrincipal",


        },
        {
            orientation: "row",
            kind: "flow",

            height: '90%',


            children: [{
                kind: "singleVue",
                name: "p1"
            }, {
                kind: "singleVue",
                name: "p2"
            }]
        }
    ]
})
export class PlaneteEditeur {
    titrePagePrincipal = "Page principal"
    placerPointsPourPlanete!: PlacerPointsPourPlanete
    planete!: Planete
    constructor() {
        this.placerPointsPourPlanete = new PlacerPointsPourPlanete()
        this.planete = new Planete()
    }
    pagePrincipal() {
        return new PagePrincpal()
    }


}
defineVue(PlaneteEditeur, {
    kind: "flow",
    orientation: "column",
    children: [
        { kind: "bootVue", factory: "pagePrincipal", label: "titrePagePrincipal", width: "100%" },
        {
            kind: "flow",
            orientation: "row",
            children: [
                {
                    kind: "singleVue",
                    name: "placerPointsPourPlanete"
                }

                ,
                {
                    kind: "singleVue",
                    name: "planete"
                }
            ]
        }



    ]
})
export class PagePrincpal {
    titreMontagneEditeur = "Montagne editeur"
    titrePlaneteEditeur = "Planete editeur"
    titrePlaneteNavigation = "Planete navigation"
    montagneEditeur() {
        return new MontagneEditeur()
    }
    planeteEditeur() {
        return new PlaneteEditeur()
    }
    planeteNavigation() {
        const r = new PlaneteNavigation()
        r._pagePrincipal = this

        return r
    }



}
defineVue(PagePrincpal, {
    kind: "flow",
    orientation: "row",
    children: [
        { kind: "bootVue", factory: "montagneEditeur", label: "titreMontagneEditeur", width: "33%" },
        { kind: "bootVue", factory: "planeteEditeur", label: "titrePlaneteEditeur", width: "33%" },
        { kind: "bootVue", factory: "planeteNavigation", label: "titrePlaneteNavigation", width: "33%" },
    ]
})
boot(new PagePrincpal())