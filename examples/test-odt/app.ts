export { };

type State = {
    lines: string[];
    idx: number;
    playing: boolean; // on veut enchaîner les lignes automatiquement
    running: boolean
};

const state: State = { lines: [], idx: 0, playing: false, running: false };

const input = document.getElementById("odt") as HTMLInputElement;
const btnToggle = document.getElementById("toggle") as HTMLButtonElement;
const btnStop = document.getElementById("stop") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLSpanElement;
const linesDiv = document.getElementById("lines") as HTMLDivElement;

function setStatus(s: string) { status.textContent = s; }

function highlight(i: number) {
    const els = linesDiv.querySelectorAll<HTMLElement>("[data-line]");
    els.forEach((el) => el.style.background = "");
    const cur = linesDiv.querySelector<HTMLElement>(`[data-line="${i}"]`);
    if (cur) cur.style.background = "rgba(255, 230, 150, 0.6)";
}

function renderLines(lines: string[]) {
    linesDiv.innerHTML = lines
        .map((l, i) => `<div data-line="${i}">${String(i + 1).padStart(3, " ")} | ${escapeHtml(l)}</div>`)
        .join("");
}

function escapeHtml(s: string) {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// -------- ODT -> lines (ordre du document) --------

function extractNodeText(n: Node): string {
    if (n.nodeType === Node.TEXT_NODE) return n.nodeValue ?? "";
    if (n.nodeType !== Node.ELEMENT_NODE) return "";

    const el = n as Element;

    // ODT: <text:line-break/> et <text:tab/>
    if (el.tagName === "text:line-break" || el.localName === "line-break") return "\n";
    if (el.tagName === "text:tab" || el.localName === "tab") return "\t";

    let s = "";
    for (const c of Array.from(el.childNodes)) s += extractNodeText(c);
    return s;
}

function findOfficeText(doc: Document): Element | null {
    const direct = doc.getElementsByTagName("office:text")[0];
    if (direct) return direct;
    const all = Array.from(doc.getElementsByTagName("*"));
    return all.find((el) => (el as Element).localName === "text") ?? null;
}

async function readOdtLines(file: File): Promise<string[]> {
    const JSZip = (window as any).JSZip;
    if (!JSZip) throw new Error("JSZip non chargé (script jszip.min.js manquant).");

    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const entry = zip.file("content.xml");
    if (!entry) throw new Error("content.xml introuvable.");

    const xmlText = await entry.async("text");
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) throw new Error("content.xml invalide.");

    const officeText = findOfficeText(doc);
    if (!officeText) return [];

    const out: string[] = [];
    // getElementsByTagName("*") retourne en ordre du document
    const els = Array.from(officeText.getElementsByTagName("*")) as Element[];

    for (const el of els) {
        if (el.tagName === "text:p" || el.tagName === "text:h") {
            const t = extractNodeText(el)
                .replace(/\r/g, "")
                .replace(/[ \t]+\n/g, "\n")
                .trim();
            if (t) out.push(t);
        }
    }
    return out;
}

// -------- Lecture intégrée (SpeechSynthesis) ligne par ligne --------

function speakCurrentLine() {
    const synth = window.speechSynthesis;
    if (!state.lines.length) return;

    if (state.idx >= state.lines.length) {
        state.playing = false;
        btnToggle.textContent = "Lire";
        setStatus("✅ Terminé");
        return;
    }



    highlight(state.idx);
    setStatus(`Lecture ${state.idx + 1}/${state.lines.length}`);

    const utter = new SpeechSynthesisUtterance(state.lines[state.idx]);
    state.running = true
    utter.lang = "fr-FR";

    utter.onend = () => {
        state.running = false
        if (!state.playing) {
            return; // si l’utilisateur a cliqué pause
        }
        state.idx += 1;
        speakCurrentLine();
    };

    utter.onerror = () => {
        state.playing = false;
        state.running = false
        btnToggle.textContent = "Continuer";
        setStatus("❌ Erreur de synthèse vocale");
    };

    synth.speak(utter);
}

function togglePlayPause() {

    if (!state.lines.length) return;

    // Si ça parle et pas en pause => on PAUSE
    if (state.playing) {
        state.playing = false;
        btnToggle.textContent = "Continuer";
        setStatus(`Pause ${state.idx + 1}/${state.lines.length}`);
        return;
    }

    // Si en pause => on RESUME
    if (!state.playing) {
        state.playing = true;

        btnToggle.textContent = "Pause";
        if (!state.running) {
            speakCurrentLine();
        }
        setStatus(`Lecture ${state.idx + 1}/${state.lines.length}`);
        return;
    }

    // Sinon => on démarre / reprend au début de la ligne idx
    state.playing = true;
    btnToggle.textContent = "Pause";
    if (!state.running) {
        speakCurrentLine();
    }
}


// -------- UI wiring --------

input.addEventListener("change", async () => {
    try {
        const f = input.files?.[0];
        if (!f) return;

        // stop si on change de fichier

        state.idx = 0;

        setStatus("Lecture du fichier...");
        const lines = await readOdtLines(f);

        state.lines = lines;
        renderLines(lines);
        highlight(0);

        btnToggle.disabled = lines.length === 0;
        btnStop.disabled = lines.length === 0;

        btnToggle.textContent = "Lire";
        setStatus(lines.length ? `Prêt (${lines.length} lignes)` : "Aucune ligne trouvée");
    } catch (e) {
        setStatus(`Erreur: ${(e as Error).message}`);
    }
});

btnToggle.addEventListener("click", togglePlayPause);
