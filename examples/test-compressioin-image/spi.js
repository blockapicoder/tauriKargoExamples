// spi.js
// Adaptation JavaScript (ESM) de votre module TypeScript.

export const TypeFonction = {
  DP: "DP",
  RDP: "RDP",
  SIN: "SIN",
};

// Distance euclidienne au carre dans R^2
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function creerFunction(type, points, D) {
  if (type === "SIN") return creerFunctionSinus(points, D);
  if (type === "DP") return creerFunctionDP(points, D);
  return creerFunctionRDP(points, D);
}

export function creerFunctionSinus(points, D) {
  const m = [];
  for (let i = 0; i < points.length; i++) {
    m[i] = [];
    for (let j = 0; j < points.length; j++) {
      m[i][j] = D(points[i].value, points[j].value);
    }
  }

  return (p) => {
    let result = 0;
    let s = 0;

    for (let i = 0; i < points.length; i++) {
      let o = 1;
      for (let j = 0; j < points.length; j++) {
        if (i !== j) {
          const d = D(p, points[j].value);
          o *= Math.sin(Math.PI * (d / (d + m[i][j])));
        }
      }
      const W = o;
      const yi = points[i].y;
      s += W;
      result += W * yi;
    }

    return result / s;
  };
}

// DP stable: f(p) = sum(y_i/r_i)/sum(1/r_i)
export function creerFunctionDP(points, D) {
  return (p) => {
    let num = 0;
    let den = 0;

    for (let i = 0; i < points.length; i++) {
      const ri = D(p, points[i].value);
      if (ri === 0) return points[i].y;
      const inv = 1 / ri;
      num += points[i].y * inv;
      den += inv;
    }
    return num / den;
  };
}

export function creerFunctionRDP(points, D) {
  return (p) => {
    let result = 0;
    let s = 0;

    const r = new Array(points.length);
    for (let j = 0; j < points.length; j++) {
      r[j] = D(p, points[j].value);
    }

    for (let i = 0; i < points.length; i++) {
      const ri = r[i];
      if (ri === 0) return points[i].y;

      let o = 1;
      for (let j = 0; j < points.length; j++) {
        if (i !== j) {
          const rj = r[j];
          o *= rj / (ri + rj);
        }
      }
      const W = o;
      const yi = points[i].y;
      s += W;
      result += W * yi;
    }

    return result / s;
  };
}

// Votre simplifier() d'origine (utile sur petits ensembles de points)
export async function simplifier(type, points, ctx, D) {
  let retrait = [];
  let nombreErreur = 0;
  let result = [...points];
  let nbTest = 0;

  while (nombreErreur < ctx.nombreEssai && retrait.length < ctx.nombreRetrait) {
    const idx = Math.floor(Math.random() * result.length);
    nbTest++;

    const value = result[idx];
    const newResult = result.filter((_, i) => i !== idx);
    const newRetrait = [...retrait, value];

    const f = creerFunction(type, newResult, D);

    if (newRetrait.every((p) => Math.abs(f(p.value) - p.y) < ctx.erreur)) {
      result = newResult;
      retrait = newRetrait;
      nombreErreur = 0;
    } else {
      nombreErreur++;
    }

    if (await ctx.stopFct(retrait.length, nbTest)) {
      return undefined;
    }
  }

  return result;
}
