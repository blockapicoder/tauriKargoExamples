import { setPoints } from "./index2"

// --- Références ---
const stage = document.getElementById('stage');

const ctx2d = stage.getContext('2d');


// --- DPR / Resize ---
function fitCanvasToParent(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const { width: cssW, height: cssH } = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    // unité = px CSS
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function resizeAll() {
    fitCanvasToParent(stage, ctx2d);

    draw2D();

}
window.addEventListener('resize', resizeAll);

// --- État ---
/** @typedef {{ id:number, x:number, y:number, h:number }} P */
/** @type {P[]} */
let points = [];
let selectedId = null;
let draggingId = null;
let dragOffset = { x: 0, y: 0 };

const R = 8;      // rayon visuel du point 2D
const HIT = 12;   // rayon de hit-test 2D
const STEP = 1;   // pas d'ajustement de hauteur

// --- Utilitaires ---
const dist2 = (x1, y1, x2, y2) => (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
const nextId = (() => { let n = 1; return () => n++; })();

function getPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}
function hitTest2D(x, y) {
    let nearest = null;
    let bestD2 = Infinity;
    for (const p of points) {
        const d2 = dist2(x, y, p.x, p.y);
        if (d2 <= HIT * HIT && d2 < bestD2) { bestD2 = d2; nearest = p; }
    }
    return nearest;
}

// --- Dessin 2D ---
function drawGrid2D() {
    const w = stage.clientWidth, h = stage.clientHeight;
    ctx2d.save();
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.lineWidth = 1;
    ctx2d.strokeStyle = '#e5e5e5';
    for (let x = 50; x < w; x += 50) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, h); ctx2d.stroke(); }
    for (let y = 50; y < h; y += 50) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(w, y); ctx2d.stroke(); }
    ctx2d.restore();
}
function drawPoint2D(p, selected) {
    // disque
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx2d.fillStyle = selected ? '#222' : '#000';
    ctx2d.fill();

    // contour
    ctx2d.lineWidth = selected ? 3 : 1.5;
    ctx2d.strokeStyle = selected ? '#1e90ff' : '#444';
    ctx2d.stroke();

    // label hauteur
    const label = `h=${p.h}`;
    ctx2d.font = '13px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial';
    const tw = ctx2d.measureText(label).width;
    const tx = Math.round(p.x - tw / 2);
    const ty = Math.round(p.y - R - 12);

    // tige
    ctx2d.beginPath();
    ctx2d.moveTo(p.x, p.y - R);
    ctx2d.lineTo(p.x, ty + 15);
    ctx2d.lineWidth = 1;
    ctx2d.strokeStyle = '#666';
    ctx2d.stroke();

    // cartouche
    ctx2d.fillStyle = 'rgba(255,255,255,0.95)';
    ctx2d.fillRect(tx - 4, ty - 2, tw + 8, 20);
    ctx2d.strokeStyle = '#888';
    ctx2d.strokeRect(tx - 4, ty - 2, tw + 8, 20);

    ctx2d.fillStyle = '#000';
    ctx2d.fillText(label, tx, ty + 13);
}
function draw2D() {
    const w = stage.clientWidth, h = stage.clientHeight;
    ctx2d.clearRect(0, 0, w, h);
    drawGrid2D();
    for (const p of points) drawPoint2D(p, p.id === selectedId);
}

// --- Dessin 3D (isométrique simplifiée) ---
const GROUND_SIZE = 400;
const HEIGHT_SCALE = 10;
const ISO_SX = 0.6;
const ISO_SY = 0.35;
const COL_R = 8;

function worldFrom2D(p) {
    const gx = (p.x / Math.max(1, stage.clientWidth)) * GROUND_SIZE;
    const gy = (p.y / Math.max(1, stage.clientHeight)) * GROUND_SIZE;
    const hz = p.h * HEIGHT_SCALE;
    return { gx, gy, hz };
}
function isoProject(gx, gy, hz, centerX, baseY) {
    const sx = centerX + (gx - gy) * ISO_SX;
    const sy = baseY + (gx + gy) * ISO_SY - hz;
    return { sx, sy };
}
function drawGround3D() {
    const w = view3d.clientWidth, h = view3d.clientHeight;
    ctx3d.clearRect(0, 0, w, h);
    ctx3d.lineWidth = 1;
    ctx3d.strokeStyle = '#e9e9e9';

    const cx = Math.round(w * 0.5);
    const by = Math.round(h * 0.6);
    const step = 50;

    for (let t = 0; t <= GROUND_SIZE; t += step) {
        let a = isoProject(t, 0, 0, cx, by);
        let b = isoProject(t, GROUND_SIZE, 0, cx, by);
        ctx3d.beginPath(); ctx3d.moveTo(a.sx, a.sy); ctx3d.lineTo(b.sx, b.sy); ctx3d.stroke();

        a = isoProject(0, t, 0, cx, by);
        b = isoProject(GROUND_SIZE, t, 0, cx, by);
        ctx3d.beginPath(); ctx3d.moveTo(a.sx, a.sy); ctx3d.lineTo(b.sx, b.sy); ctx3d.stroke();
    }

    const A = isoProject(0, 0, 0, cx, by);
    const B = isoProject(GROUND_SIZE, 0, 0, cx, by);
    const C = isoProject(GROUND_SIZE, GROUND_SIZE, 0, cx, by);
    const D = isoProject(0, GROUND_SIZE, 0, cx, by);
    ctx3d.beginPath();
    ctx3d.moveTo(A.sx, A.sy); ctx3d.lineTo(B.sx, B.sy); ctx3d.lineTo(C.sx, C.sy); ctx3d.lineTo(D.sx, D.sy); ctx3d.closePath();
    ctx3d.strokeStyle = '#bbb'; ctx3d.stroke();
}


// --- Interactions 2D ---
stage.addEventListener('mousedown', (e) => {
    const { x, y } = getPos(stage, e);
    const target = hitTest2D(x, y);
    if (target) {
        selectedId = target.id;
        draggingId = target.id;
        dragOffset.x = x - target.x;
        dragOffset.y = y - target.y;
        draw2D();
    } else {
        const p = { id: nextId(), x, y, h: 0 };
        points.push(p);
        selectedId = p.id;
        draw2D();
    }
    setPoints(points)
});
stage.addEventListener('mousemove', (e) => {
    if (draggingId != null) {
        const p = points.find(pt => pt.id === draggingId);
        if (!p) return;
        const { x, y } = getPos(stage, e);
        p.x = Math.round(x - dragOffset.x);
        p.y = Math.round(y - dragOffset.y);
        draw2D();
        setPoints(points)
    }
});
window.addEventListener('mouseup', () => { draggingId = null; });

stage.addEventListener('dblclick', (e) => {
    const { x, y } = getPos(stage, e);
    const target = hitTest2D(x, y);
    if (target) {
        points = points.filter(p => p.id !== target.id);
        if (selectedId === target.id) selectedId = null;
        draw2D();
        setPoints(points)
    }
});

window.addEventListener('keydown', (e) => {
    if (selectedId == null) return;
    const p = points.find(pt => pt.id === selectedId);
    if (!p) return;

    if (e.key === '+' || e.key === '=') {
        p.h += STEP; draw2D();
    } else if (e.key === '-' || e.key === '_') {
        p.h -= STEP; draw2D();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        points = points.filter(pt => pt.id !== selectedId);
        selectedId = null; draw2D();
    }
    setPoints(points)
});

// --- Molette pour ajuster la hauteur (Shift = ×5) ---
stage.addEventListener('wheel', (e) => {
    e.preventDefault(); // empêche le scroll de la page
    const { x, y } = getPos(stage, e);
    let target = hitTest2D(x, y);
    if (!target && selectedId != null) {
        target = points.find(pt => pt.id === selectedId) || null;
    }
    if (!target) return;

    const dir = e.deltaY < 0 ? 1 : -1;
    const mult = e.shiftKey ? 5 : 1;
    target.h += dir * mult * STEP;
    selectedId = target.id;
    draw2D();
    setPoints(points)
}, { passive: false });

// --- Init ---
resizeAll();
points.push({ id: nextId(), x: 0.25 * stage.clientWidth, y: 0.30 * stage.clientHeight, h: 3 });
points.push({ id: nextId(), x: 0.55 * stage.clientWidth, y: 0.55 * stage.clientHeight, h: 6 });
points.push({ id: nextId(), x: 0.80 * stage.clientWidth, y: 0.35 * stage.clientHeight, h: -2 });
setPoints(points)
draw2D();
