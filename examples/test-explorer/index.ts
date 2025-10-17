import {Element, ElementBase, Api} from "./api.ts";
import { Gen } from './worker-tools.ts'
const canvas = document.getElementById("world") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const WORLD_SIZE = 2000;
const SENSOR_RANGE = 200;
const OBJECT_RADIUS = 5;
const NUM_OBJECTS = 100;
let worker: Worker | undefined;

let scale = WIDTH / WORLD_SIZE;

let objects: ElementBase[] = [];
let collectedCount = 0;
let totalDistance = 0;

function rand(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

function resetWorld() {
    objects = [];
    collectedCount = 0;
    totalDistance = 0;
    for (let i = 0; i < NUM_OBJECTS; i++) {
        objects.push({
            x: rand(0, WORLD_SIZE),
            y: rand(0, WORLD_SIZE),
            collected: false,
        });
    }
    controller.x = WORLD_SIZE / 2;
    controller.y = WORLD_SIZE / 2;
    controller.angle = 0;
}

const controller = {
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    angle: 0,
};

let count = {value: 0};
let running = false;

async function avancer(distance: number) {

    running = true;
    const step = 5;
    const steps = distance / step;
    for (let i = 0; i < steps; i++) {
        controller.x += step * Math.cos(controller.angle);
        controller.y += step * Math.sin(controller.angle);
        totalDistance += step;
        collecterObjetsVisibles();
        await sleep(10);
        draw();

    }
    running = false;
    return Promise.resolve(recupererDistanceObjets());
}

async function tourner(deg: number) {

    const rad = (deg * Math.PI) / 180;
    const steps = 20;
    const delta = rad / steps;
    for (let i = 0; i < steps; i++) {
        controller.angle += delta;
        await sleep(10);
        draw();

    }
    running = false;
    return Promise.resolve(recupererDistanceObjets());
}

function recupererDistanceObjets() {
    const visible: Element[] = [];
    let id = 0;
    const cx = controller.x;
    const cy = controller.y;
    const angleVaisseau = controller.angle;
    if (objects.every((o) => o.collected)) {
        throw new Error("fini");
    }
    for (const obj of objects) {
        if (!obj.collected) {
            const dx = obj.x - cx;
            const dy = obj.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < SENSOR_RANGE) {
                const angleAbsolu = Math.atan2(dy, dx);
                let angleRelatif = angleAbsolu - angleVaisseau;
                while (angleRelatif > Math.PI) {
                    angleRelatif -= 2 * Math.PI;
                }
                while (angleRelatif < -Math.PI) {
                    angleRelatif += 2 * Math.PI;
                }
                const angleDeg = angleRelatif * (180 / Math.PI);
                visible.push({id, dist, angle: angleDeg, ...obj});
            }
        }
        id++;
    }
    return visible;
}

function collecterObjetsVisibles() {
    const cx = controller.x;
    const cy = controller.y;
    for (const obj of objects) {
        if (!obj.collected) {
            const dx = obj.x - cx;
            const dy = obj.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 30) {
                obj.collected = true;
                collectedCount++;
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.scale(scale, scale);

    // Sensor zone
    ctx.beginPath();
    ctx.arc(
        controller.x,
        controller.y,
        SENSOR_RANGE,
        0,
        2 * Math.PI,
    );
    ctx.fillStyle = "gray";
    ctx.fill();

    // Objects
    for (const obj of objects) {
        if (!obj.collected) {
            ctx.beginPath();
            ctx.arc(obj.x, obj.y, OBJECT_RADIUS, 0, 2 * Math.PI);
            ctx.fillStyle = "blue";
            ctx.fill();
        }
    }

    // Triangle (ship)
    ctx.save();
    ctx.translate(controller.x, controller.y);
    ctx.rotate(controller.angle);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-10, 7);
    ctx.lineTo(-10, -7);
    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();
    ctx.restore();

    ctx.restore();

    document.getElementById("collected")!.textContent =
        `${collectedCount}/${objects.length}`;
    document.getElementById("distance")!.textContent = `${Math.round(
        totalDistance,
    )} `;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runUserCode() {
    if (worker) {
        worker.terminate();
    }
    resetWorld()
    const tmp = new Worker("./programme.ts", {type: "module"});
    worker = tmp
    tmp.addEventListener("message",async ( evt )=> {
        const q:Gen<Api> = evt.data
        if (q.operation ==="avancer") {
            tmp.postMessage( await avancer(q.args[0]))
        }
        if (q.operation ==="tourner") {
            tmp.postMessage(await tourner(q.args[0]))
        }



    })


}

document.getElementById("run-btn")?.addEventListener( "click" ,()=> {
    runUserCode()
})


draw();