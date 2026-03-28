type Atom = string | number;

type DistanceOptions = {
  stringReplaceCost: number;   // coût si deux chaînes sont différentes
  numberDiffFactor: number;    // facteur pour |a-b| entre deux nombres
  mixedTypeCost: number;       // coût si l'un est string et l'autre number
  insertDeleteCost?: number;   // coût insertion/suppression
};

function substitutionCost(a: Atom, b: Atom, opts: DistanceOptions): number {
  if (typeof a === "string" && typeof b === "string") {
    return a === b ? 0 : opts.stringReplaceCost;
  }

  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) * opts.numberDiffFactor;
  }

  return opts.mixedTypeCost;
}

export function levenshteinMixed(
  a: Atom[],
  b: Atom[],
  opts: DistanceOptions
): number {
  const insertDeleteCost = opts.insertDeleteCost ?? opts.stringReplaceCost;

  const m = a.length;
  const n = b.length;

  if (m === 0) return n * insertDeleteCost;
  if (n === 0) return m * insertDeleteCost;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i * insertDeleteCost;
  for (let j = 0; j <= n; j++) dp[0][j] = j * insertDeleteCost;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = substitutionCost(a[i - 1], b[j - 1], opts);

      dp[i][j] = Math.min(
        dp[i - 1][j] + insertDeleteCost, // suppression
        dp[i][j - 1] + insertDeleteCost, // insertion
        dp[i - 1][j - 1] + cost          // substitution
      );
    }
  }

  return dp[m][n];
}

export type EditCosts<T> = {
  sub: (a: T, b: T) => number;
  ins: (x: T) => number;
  del: (x: T) => number;
};

export function editDistance<T>(
  a: T[],
  b: T[],
  costs: EditCosts<T>
): number {
  const m = a.length;
  const n = b.length;

  // Optimisation mémoire : seulement 2 lignes
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  // Initialisation : transformer [] -> b[0..j]
  for (let j = 1; j <= n; j++) {
    prev[j] = prev[j - 1] + costs.ins(b[j - 1]);
  }

  for (let i = 1; i <= m; i++) {
    // Initialisation : transformer a[0..i] -> []
    curr[0] = prev[0] + costs.del(a[i - 1]);

    for (let j = 1; j <= n; j++) {
      const deleteCost = prev[j] + costs.del(a[i - 1]);
      const insertCost = curr[j - 1] + costs.ins(b[j - 1]);
      const substituteCost = prev[j - 1] + costs.sub(a[i - 1], b[j - 1]);

      curr[j] = Math.min(deleteCost, insertCost, substituteCost);
    }

    [prev, curr] = [curr, prev];
  }

  return prev[n];
}