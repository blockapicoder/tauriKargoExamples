// tester.ts — compiler en ES modules (ex: `tsc --target es2020 --module es2020 tester.ts`)
type Rect = { x: number; y: number; w: number; h: number };
type Snapshot = {
  vw: number; vh: number;
  dir: 'row' | 'column';
  root: Rect; sidebar: Rect; main: Rect; aside: Rect;
  rootContentW: number;  // largeur de contenu du container (padding exclus)
  gap: number;           // valeur CSS gap (px)
};

type Size = [number, number];

const SIZES: Size[] = [
  [1200, 800],
  [1000, 700],
  [800, 600],
  [700, 600],
  [600, 500],
  [500, 400],
];

function rectOf(el: Element): Rect {
  const r = (el as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function snapshot(win: Window): Snapshot {
  const d = win.document;
  const root = d.getElementById("layoutRoot") as HTMLElement | null;
  const sidebar = d.getElementById("sidebar");
  const main = d.getElementById("main");
  const aside = d.getElementById("aside");
  if (!root || !sidebar || !main || !aside) {
    throw new Error("IDs manquants dans index.html (layoutRoot, sidebar, main, aside).");
  }
  const cs = win.getComputedStyle(root);
  const dir = cs.flexDirection as 'row' | 'column';

  // largeur de contenu = border-box - padding horizontal
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const rootContentW = root.getBoundingClientRect().width - padX;

  // gap (uniforme dans notre CSS)
  const gap = parseFloat(cs.gap || "0") || 0;

  return {
    vw: win.innerWidth, vh: win.innerHeight, dir,
    root: rectOf(root), sidebar: rectOf(sidebar), main: rectOf(main), aside: rectOf(aside),
    rootContentW, gap,
  };
}

function approx(a: number, b: number, tol = 4) { return Math.abs(a - b) <= tol; }

function check(s: Snapshot) {
  const lines: string[] = [];
  const push = (ok: boolean, name: string, details?: string) =>
    lines.push(`${ok ? "✅" : "❌"} ${name}${details ? " — " + details : ""}`);

  const expectedDir = s.vw <= 700 ? "column" : "row";
  push(s.dir === expectedDir, "Orientation flex-direction", `attendu=${expectedDir}, mesuré=${s.dir}`);

  if (s.dir === "row") {
    // Ordre horizontal sidebar -> main -> aside
    const order = s.sidebar.x < s.main.x && s.main.x < s.aside.x;
    push(order, "Ordre horizontal (sidebar < main < aside)",
      `x=[${s.sidebar.x.toFixed(1)}, ${s.main.x.toFixed(1)}, ${s.aside.x.toFixed(1)}]`);

    // Alignement vertical approximatif
    const sameTop = Math.max(s.sidebar.y, s.main.y, s.aside.y) - Math.min(s.sidebar.y, s.main.y, s.aside.y) < 8;
    push(sameTop, "Alignement vertical (≈ même top)",
      `y=[${s.sidebar.y.toFixed(1)}, ${s.main.y.toFixed(1)}, ${s.aside.y.toFixed(1)}]`);

    // Ratio sidebar basé sur la largeur de contenu effective (on retire 2 gaps pour 3 colonnes)
    const effectiveRowContentW = Math.max(1, s.rootContentW - 2 * s.gap);
    const ratio = s.sidebar.w / effectiveRowContentW;
    push(ratio > 0.25 && ratio < 0.35, "Sidebar ~30% (sur contenu - gaps)",
      `ratio=${(ratio * 100).toFixed(1)}% ; base=${effectiveRowContentW.toFixed(1)}`);

    // Aside ≈ 220px
    push(Math.abs(s.aside.w - 220) < 10, "Aside ≈ 220px", `mesuré=${s.aside.w.toFixed(1)}px`);

    // Hauteurs similaires
    const sameH = Math.max(s.sidebar.h, s.main.h, s.aside.h) - Math.min(s.sidebar.h, s.main.h, s.aside.h) < 40;
    push(sameH, "Hauteurs similaires des colonnes",
      `h=[${s.sidebar.h.toFixed(0)}, ${s.main.h.toFixed(0)}, ${s.aside.h.toFixed(0)}]`);
  } else {
    // Ordre vertical sidebar -> main -> aside
    const order = s.sidebar.y < s.main.y && s.main.y < s.aside.y;
    push(order, "Ordre vertical (sidebar au-dessus de main, puis aside)",
      `y=[${s.sidebar.y.toFixed(1)}, ${s.main.y.toFixed(1)}, ${s.aside.y.toFixed(1)}]`);

    // Largeurs ≈ largeur de contenu du root (padding exclus)
    push(approx(s.sidebar.w, s.rootContentW), "Sidebar ~100% largeur (contenu)",
      `sidebar=${s.sidebar.w.toFixed(1)} / rootContent=${s.rootContentW.toFixed(1)}`);
    push(approx(s.aside.w, s.rootContentW), "Aside ~100% largeur (contenu)",
      `aside=${s.aside.w.toFixed(1)} / rootContent=${s.rootContentW.toFixed(1)}`);
  }

  const all = lines.every(l => l.startsWith("✅"));
  return { all, lines };
}

const testsFait: Set<string> = new Set();
let idx = 0;

async function openAndVerify(size: Size, label: string) {
  idx++;
  const features = `popup=yes,width=${size[0]},height=${size[1]}`;
  const w = window.open(`pageTest.html?t=${idx}`, `${idx}`, features);
  if (!w) throw new Error("Pop-up bloquée. Autorisez les pop-ups pour ce site.");

  let resolveFn: (b: boolean) => void = () => {};
  const pAll = new Promise<boolean>((r) => { resolveFn = r; });

  const origin = window.location.origin;

  window.addEventListener("message", async (m) => {
    try {
      if (testsFait.has(label)) return;
      // (optionnel) sécurité :
      if (m.origin !== origin) return;
      testsFait.add(label);

      const snap = snapshot(w);
      const { all, lines } = check(snap);

      const header = [
        `\n=== ${label} ===`,
        `fenêtre: ${snap.vw} × ${snap.vh}`,
        `flex-direction: ${snap.dir}`,
        `root: ${snap.root.w.toFixed(1)}×${snap.root.h.toFixed(1)}`,
        `rootContent: ${snap.rootContentW.toFixed(1)} (gap=${snap.gap.toFixed(1)})`,
        `sidebar: ${snap.sidebar.w.toFixed(1)}×${snap.sidebar.h.toFixed(1)} @ (${snap.sidebar.x.toFixed(1)},${snap.sidebar.y.toFixed(1)})`,
        `main: ${snap.main.w.toFixed(1)}×${snap.main.h.toFixed(1)} @ (${snap.main.x.toFixed(1)},${snap.main.y.toFixed(1)})`,
        `aside: ${snap.aside.w.toFixed(1)}×${snap.aside.h.toFixed(1)} @ (${snap.aside.x.toFixed(1)},${snap.aside.y.toFixed(1)})`,
      ].join("\n");

      console.log(header);
      lines.forEach(l => console.log(l));
      console.log(`Résultat: ${all ? "OK" : "ÉCHEC"}`);

      const out = document.getElementById("results");
      if (out) {
        out.textContent += "\n" + header + "\n" + lines.join("\n") + `\nRésultat: ${all ? "OK" : "ÉCHEC"}\n`;
      }
      resolveFn(all);
    } finally {
      try { w.close(); } catch {}
    }
  }, { once: true });

  // Déclenche la réponse depuis pageTest.html
  try { w.postMessage({ type: "startTest", label }, origin); } catch {}

  return pAll;
}

export async function runAll() {
  let ok = true;
  testsFait.clear();
  const out = document.getElementById("results");
  if (out) out.textContent = "";
  for (const [i, size] of SIZES.entries()) {
    const label = `Test ${size[0]}×${size[1]} (#${i + 1})`;
    const r = await openAndVerify(size, label);
    ok &&= r;
  }
  console.log(`\n=== BILAN GLOBAL: ${ok ? "OK" : "ÉCHEC"} ===`);
  if (out) out.textContent += `\n=== BILAN GLOBAL: ${ok ? "OK" : "ÉCHEC"} ===\n`;
}

// Wiring bouton
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("run")?.addEventListener("click", () => {
    runAll().catch(e => alert(e.message));
  });
  const url = new URL(window.location.href);
  if (url.searchParams.get("auto") === "1") runAll().catch(e => alert(e.message));
});
