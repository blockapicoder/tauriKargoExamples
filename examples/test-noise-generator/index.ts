import { defineVue, boot } from "./node_modules/tauri-kargo-tools/src/vue"


interface Point {
    x: number
    y: number
}

class NoiseGenerator {

    batch: number
    values: number[][] = []
    points: Point[] = []

    canvas!: HTMLCanvasElement
    ctx!: CanvasRenderingContext2D
    dx: number
    dy: number
    result: string = ""
    max = 0

    stopLoop = true;
    contraste = 1
    constructor() {

        this.batch = 10000
        this.dx = 256
        this.dy = 256
        this.initData()
    }
    initData() {
        this.values = []
        this.points = []
        for (let x = 0; x < this.dx; x++) {
            let tmp: number[] = []
            for (let y = 0; y < this.dy; y++) {
                this.points.push({ x: x, y: y })
                tmp.push(0)
            }
            this.values.push(tmp)
        }
    }
    createCanvas(): HTMLElement {
        this.canvas = document.createElement("canvas")
        this.canvas.width = this.dx;
        this.canvas.height = this.dy;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
        return this.canvas
    }
    init() {
        this.ctx.fillStyle = `white`;   // ou `#a0a0a0`
        this.ctx.fillRect(0, 0, this.dx, this.dy);
    }
    loop() {
        this.init()
        this.initData()

        this.stopLoop = false
        this.max = 0
        const i = setInterval(() => {
            if (this.stopLoop || this.max >= 256) {
                clearInterval(i)
                this.stopLoop = true
                return
            }
            this.run()

            this.result = ` ${this.max} ${this.points.length}`
        })


    }
    stop() {
        this.stopLoop = true
    }
    run() {
        let count = this.batch
        while (count > 0) {
            let idx = Math.trunc(Math.random() * this.points.length)
            let p = this.points[idx]
            if (this.check(p)) {
                this.process(p)
                this.points.push(p)

            }
            count--;
        }

        //  this.result = "Ok"
        return true
    }
    process(p: Point) {
        this.values[p.x][p.y]++
        const v = this.values[p.x][p.y]
        if (v > this.max) {
            this.max = v
        }
        let c = Math.max((256 - v), 0);
        let color = `rgb(${c}, ${c}, ${c})`
        this.ctx.fillStyle = color;   // ou `#a0a0a0`

        this.ctx.fillRect(p.x, p.y, 1, 1);
    }
    check(p: Point) {
        let r = this.values[p.x][p.y] + 1
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {

                let tmp = this.values[p.x + x]
                if (tmp) {
                    const val = tmp[p.y + y]
                    if (typeof val === "number") {
                        if (Math.abs(r - val) > this.contraste) {
                            return false
                        }
                    }
                }


            }
        }
        return true
    }

}


defineVue(NoiseGenerator, (vue) => {
    vue.flow({ orientation: "column", gap: 10 }, () => {
        vue.flow({ orientation: "row" }, () => {
            vue.staticLabel("Batch")
            vue.input({ name: "batch", inputType: "number" })

            vue.staticLabel("Contraste")
            vue.input({ name: "contraste" })

            vue.staticButton({ action: "loop", label: "Run", enable: "stopLoop" })

            vue.staticButton({ action: "stop", label: "Stop" })
            vue.label("result")
        })
        vue.custom({ factory: "createCanvas", width: 512, height: 512, init: "init" })


    })
})
boot(new NoiseGenerator())