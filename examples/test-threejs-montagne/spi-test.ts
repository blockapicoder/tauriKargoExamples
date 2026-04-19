import { creerFunction, PointFeature, TypeFonction } from './spi';

const D = (a: number, b: number) => Math.pow(a - b, 2);

const canvas = document.getElementById('curveCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
const addPointButton = document.getElementById('add-point') as HTMLButtonElement;
const resetButton = document.getElementById('reset-points') as HTMLButtonElement;
const minXInput = document.getElementById('min-x') as HTMLInputElement;
const maxXInput = document.getElementById('max-x') as HTMLInputElement;
const selectedPointDiv = document.getElementById('selected-point') as HTMLDivElement;
const pointCoordsDiv = document.getElementById('point-coords') as HTMLDivElement;
const matrixContainer = document.getElementById('matrix-container') as HTMLDivElement;
const selectedWInput = document.getElementById('selected-w') as HTMLInputElement;
const deleteSelectedPointButton = document.getElementById('delete-selected-point') as HTMLButtonElement;

let currentMode: TypeFonction = 'SIN';
let points: PointFeature<number>[] = [
    { value: -8, y: -2 },
    { value: -3, y: 2 },
    { value: 0, y: 0 },
    { value: 5, y: 3 },
];
let wMatrix: number[][] = [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
];
let selectedSourceIndex = -1;
let selectedTargetIndex = -1;
let selectedList: number[] = []
const fixedYLo = -10;
const fixedYHi = 10;
let isDragging = false;
let dragIndex = -1;

function updateMatrixDisplay() {
    const table = document.createElement('table');
    table.className = 'matrix-table';

    // Header row
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th')); // Empty top-left corner
    points.forEach((_, index) => {
        const th = document.createElement('th');
        th.textContent = `P${index}`;
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Data rows
    points.forEach((point, i) => {
        const row = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = `P${i}`;
        row.appendChild(th);

        points.forEach((_, j) => {
            const td = document.createElement('td');
            td.textContent = wMatrix[i][j].toFixed(1);
            if (i === selectedSourceIndex) {
                td.classList.add('source-cell');
            }
            if (j === selectedTargetIndex && selectedSourceIndex !== -1) {
                td.classList.add('target-cell');
            }
            row.appendChild(td);
        });
        table.appendChild(row);
    });

    matrixContainer.innerHTML = '';
    matrixContainer.appendChild(table);
}

function updateSelectedPointUI() {
    if (selectedSourceIndex >= 0 && selectedSourceIndex < points.length) {
        selectedPointDiv.classList.remove('hidden');
        const sourcePoint = points[selectedSourceIndex];
        pointCoordsDiv.innerHTML = `Source: (${sourcePoint.value.toFixed(2)}, ${sourcePoint.y.toFixed(2)})`;
        if (selectedTargetIndex >= 0 && selectedTargetIndex < points.length) {
            const targetPoint = points[selectedTargetIndex];
            pointCoordsDiv.innerHTML += ` → Cible: (${targetPoint.value.toFixed(2)}, ${targetPoint.y.toFixed(2)})`;
            selectedWInput.value = wMatrix[selectedSourceIndex][selectedTargetIndex].toString();
            selectedWInput.style.display = 'block';
            (selectedWInput.previousElementSibling as HTMLElement).style.display = 'block';
        } else {
            selectedWInput.style.display = 'none';
            (selectedWInput.previousElementSibling as HTMLElement).style.display = 'none';
        }
    } else {
        selectedPointDiv.classList.add('hidden');
    }
}

function getRange() {
    const minX = Number(minXInput.value);
    const maxX = Number(maxXInput.value);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX >= maxX) {
        return { minX: -10, maxX: 10 };
    }
    return { minX, maxX };
}

function drawAxes() {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    ctx.strokeStyle = '#333';
    for (let i = 1; i < 10; i++) {
        const x = (w / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        const y = (h / 10) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
}

function renderCurve() {
    if (!ctx) return;
    const { minX, maxX } = getRange();
    const f = creerFunction(currentMode, points, D, wMatrix);
    const resolution = 400;
    const sampleX: number[] = [];
    for (let i = 0; i <= resolution; i++) {
        sampleX.push(minX + ((maxX - minX) * i) / resolution);
    }
    const sampleY = sampleX.map((x) => f(x));

    const w = canvas.width;
    const h = canvas.height;
    const xToScreen = (x: number) => ((x - minX) / (maxX - minX)) * w;
    const yToScreen = (y: number) => h - ((y - fixedYLo) / (fixedYHi - fixedYLo)) * h;

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#58b3ff';
    ctx.beginPath();
    sampleX.forEach((x, idx) => {
        const sx = xToScreen(x);
        const sy = yToScreen(sampleY[idx]);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
    });
    ctx.stroke();

    points.forEach((point, index) => {
        const sx = xToScreen(point.value);
        const sy = yToScreen(point.y);
        let color = '#ffd700';
        let radius = 6;
        if (index === selectedSourceIndex) {
            color = '#00ff00'; // vert pour source
            radius = 8;
        } else if (index === selectedTargetIndex) {
            color = '#ff0000'; // rouge pour cible
            radius = 8;
        }
        ctx.fillStyle = color;
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Afficher les coordonnées
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const label = `(${point.value.toFixed(1)}, ${point.y.toFixed(1)})`;
        ctx.fillText(label, sx, sy - 12);
    });

    // Dessiner la flèche entre source et cible
    if (selectedSourceIndex >= 0 && selectedTargetIndex >= 0 && selectedSourceIndex !== selectedTargetIndex) {
        const sourcePoint = points[selectedSourceIndex];
        const targetPoint = points[selectedTargetIndex];
        const sx = xToScreen(sourcePoint.value);
        const sy = yToScreen(sourcePoint.y);
        const tx = xToScreen(targetPoint.value);
        const ty = yToScreen(targetPoint.y);

        // Dessiner la ligne
        ctx.strokeStyle = '#ff8c00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Dessiner la tête de flèche
        const angle = Math.atan2(ty - sy, tx - sx);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - arrowLength * Math.cos(angle - arrowAngle), ty - arrowLength * Math.sin(angle - arrowAngle));
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - arrowLength * Math.cos(angle + arrowAngle), ty - arrowLength * Math.sin(angle + arrowAngle));
        ctx.stroke();
    }
}

function render() {
    if (!ctx) return;
    drawAxes();
    if (points.length > 0) {
        renderCurve();
    }
}

function addPoint() {
    points.push({ value: 0, y: 0 });
    // Ajouter une ligne et une colonne à la matrice w
    wMatrix.forEach(row => row.push(1));
    wMatrix.push(new Array(points.length).fill(1));
    selectedSourceIndex = points.length - 1;
    selectedTargetIndex = -1;
    updateSelectedPointUI();
    updateMatrixDisplay();
    render();
}

function resetPoints() {
    points = [
        { value: -8, y: -2 },
        { value: -3, y: 2 },
        { value: 0, y: 0 },
        { value: 5, y: 3 },
    ];
    wMatrix = [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
    ];
    selectedSourceIndex = -1;
    selectedTargetIndex = -1;
    updateSelectedPointUI();
    updateMatrixDisplay();
    render();
}

function onCanvasClick(event: MouseEvent) {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { minX, maxX } = getRange();

    const hitIndex = points.findIndex((point) => {
        const px = ((point.value - minX) / (maxX - minX)) * rect.width;
        const py = rect.height - ((point.y - fixedYLo) / (fixedYHi - fixedYLo)) * rect.height;
        const dx = px - x;
        const dy = py - y;
        return Math.sqrt(dx * dx + dy * dy) < 12;
    });

    if (hitIndex >= 0) {
        if (selectedList.length === 2) {
            selectedList = []
        }
        if (!selectedList.includes(hitIndex)) {

            selectedList.push(hitIndex)
        }
        selectedSourceIndex = selectedList[0] ?? -1
        selectedTargetIndex = selectedList[1] ?? -1

        updateSelectedPointUI();
        updateMatrixDisplay();
        render();
        return;
    } else {
        selectedSourceIndex = -1;
        selectedTargetIndex = -1;
    }

    // Ajouter un nouveau point seulement si aucun point source n'est sélectionné
    if (selectedSourceIndex === -1) {
        points.push({ value: minX + (x / rect.width) * (maxX - minX), y: fixedYHi - (y / rect.height) * (fixedYHi - fixedYLo) });
        // Ajouter une ligne et une colonne à la matrice w
        wMatrix.forEach(row => row.push(1));
        wMatrix.push(new Array(points.length).fill(1));
        selectedSourceIndex = points.length - 1;
        selectedTargetIndex = -1;
        updateSelectedPointUI();
        updateMatrixDisplay();
        render();
    } else {
        // Si on clique ailleurs alors qu'un source est sélectionné, désélectionner
        selectedSourceIndex = -1;
        selectedTargetIndex = -1;
        updateSelectedPointUI();
        updateMatrixDisplay();
        render();
    }
}

function onCanvasMouseDown(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { minX, maxX } = getRange();

    dragIndex = points.findIndex((point) => {
        const px = ((point.value - minX) / (maxX - minX)) * rect.width;
        const py = rect.height - ((point.y - fixedYLo) / (fixedYHi - fixedYLo)) * rect.height;
        const dx = px - x;
        const dy = py - y;
        return Math.sqrt(dx * dx + dy * dy) < 12;
    });

    if (dragIndex >= 0) {
        isDragging = true;
        selectedSourceIndex = dragIndex;
        selectedTargetIndex = -1;
        updateSelectedPointUI();
    }
}

function onCanvasMouseMove(event: MouseEvent) {
    if (!isDragging || dragIndex < 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { minX, maxX } = getRange();
    const newX = minX + (x / rect.width) * (maxX - minX);
    const newY = fixedYHi - (y / rect.height) * (fixedYHi - fixedYLo);
    points[dragIndex].value = newX;
    points[dragIndex].y = newY;
    updateSelectedPointUI();
    render();
}

function onCanvasMouseUp() {
    isDragging = false;
    dragIndex = -1;
}

selectedWInput.addEventListener('input', () => {
    if (selectedSourceIndex >= 0 && selectedTargetIndex >= 0) {
        const w = Math.max(0.01, Number(selectedWInput.value));
        wMatrix[selectedSourceIndex][selectedTargetIndex] = w;
        selectedWInput.value = w.toString();
        updateMatrixDisplay();
        render();
    }
});

deleteSelectedPointButton.addEventListener('click', () => {
    if (selectedSourceIndex >= 0) {
        // Supprimer le point de la liste
        points.splice(selectedSourceIndex, 1);
        // Supprimer la ligne et la colonne de la matrice w
        wMatrix.splice(selectedSourceIndex, 1);
        wMatrix.forEach(row => row.splice(selectedSourceIndex, 1));
        selectedSourceIndex = -1;
        selectedTargetIndex = -1;
        updateSelectedPointUI();
        updateMatrixDisplay();
        render();
    }
});

canvas.addEventListener('wheel', (event) => {
    if (selectedSourceIndex >= 0 && selectedTargetIndex >= 0) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        const currentW = wMatrix[selectedSourceIndex][selectedTargetIndex];
        const newW = Math.max(0.01, currentW + delta);
        wMatrix[selectedSourceIndex][selectedTargetIndex] = newW;
        updateSelectedPointUI();
        updateMatrixDisplay();
        render();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' && selectedSourceIndex >= 0) {
        // Supprimer le point source
        points.splice(selectedSourceIndex, 1);
        wMatrix.splice(selectedSourceIndex, 1);
        wMatrix.forEach(row => row.splice(selectedSourceIndex, 1));
        selectedSourceIndex = -1;
        selectedTargetIndex = -1;
        updateSelectedPointUI();
        render();
    }
});

modeSelect.addEventListener('change', () => {
    currentMode = modeSelect.value as TypeFonction;
    render();
});
minXInput.addEventListener('input', render);
maxXInput.addEventListener('input', render);
addPointButton.addEventListener('click', addPoint);
resetButton.addEventListener('click', resetPoints);
canvas.addEventListener('click', onCanvasClick);
canvas.addEventListener('mousedown', onCanvasMouseDown);
canvas.addEventListener('mousemove', onCanvasMouseMove);
canvas.addEventListener('mouseup', onCanvasMouseUp);

updateSelectedPointUI();
render();