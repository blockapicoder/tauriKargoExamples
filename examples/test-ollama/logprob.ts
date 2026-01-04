// Node 18+ : fetch est natif.
// Fichier: ollama-maximize.ts

const OLLAMA_URL = "http://localhost:11434";
const model = "gemma3-2060";

type TopLogprob = {
  token: string;
  logprob: number;
  bytes?: number[];
};

type TokenLogprob = {
  token: string;
  logprob: number;
  bytes?: number[];
  top_logprobs?: TopLogprob[];
};

type OllamaGenerateResponse = {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  logprobs?: unknown; // volontairement souple
};

async function callOllamaGenerate(args: {
  prompt: string;
  top_logprobs: number;
  num_predict: number;
  temperature: number;
}): Promise<OllamaGenerateResponse> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: args.prompt,
      stream: false,
      logprobs: true,
      top_logprobs: args.top_logprobs,
      options: {
        num_predict: args.num_predict,
        temperature: args.temperature,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  return (await res.json()) as OllamaGenerateResponse;
}

function normalizeLogprobs(logprobs: unknown): TokenLogprob[] {
  // Dans ta réponse, logprobs est un tableau d’objets {token, logprob, top_logprobs...}
  if (Array.isArray(logprobs)) return logprobs as TokenLogprob[];
  // Par sécurité, si un jour c’est un objet unique
  if (logprobs && typeof logprobs === "object") return [logprobs as TokenLogprob];
  return [];
}

function extractTopCandidates(data: OllamaGenerateResponse): TopLogprob[] {
  const lp = normalizeLogprobs(data.logprobs);
  const first = lp[0];
  if (!first) return [];

  // Cas nominal : top_logprobs disponibles
  const top = first.top_logprobs;
  if (Array.isArray(top) && top.length > 0) {
    return top.slice().sort((a, b) => b.logprob - a.logprob);
  }

  // Fallback : si on a au moins le token choisi + son logprob, on renvoie 1 candidat (greedy)
  if (typeof first.token === "string" && typeof first.logprob === "number") {
    return [{ token: first.token, logprob: first.logprob, bytes: first.bytes }];
  }

  return [];
}

async function nextTokenTopK(args: {
  prompt: string;
  topLogprobs: number;
  temperature: number;
}): Promise<TopLogprob[]> {
  // Essai 1 : num_predict=1 (idéal pour coût)
  const d1 = await callOllamaGenerate({
    prompt: args.prompt,
    top_logprobs: args.topLogprobs,
    num_predict: 1,
    temperature: args.temperature,
  });

  let cands = extractTopCandidates(d1);
  if (cands.length > 0 && (cands[0].token ?? "").length > 0) return cands;

  // Essai 2 : certains setups ne remplissent top_logprobs qu’avec >1 token
  const d2 = await callOllamaGenerate({
    prompt: args.prompt,
    top_logprobs: args.topLogprobs,
    num_predict: 2,
    temperature: args.temperature,
  });

  cands = extractTopCandidates(d2);
  return cands;
}

type Beam = { text: string; score: number };

export async function maximizeN(
  prompt: string,
  cfg: {
    nTokens: number;      // N
    beamWidth: number;    // B
    topLogprobs: number;  // K
    temperature?: number; // 0 par défaut pour une distribution stable
    verbose?: boolean;
  }
): Promise<string> {
  const n = Math.max(1, Math.trunc(cfg.nTokens));
  const B = Math.max(1, Math.trunc(cfg.beamWidth));
  const K = Math.max(1, Math.trunc(cfg.topLogprobs));
  const temperature = cfg.temperature ?? 0;

  let beams: Beam[] = [{ text: "", score: 0 }];

  for (let step = 0; step < n; step++) {
    // Expand chaque beam -> topK candidats
    const expansions = await Promise.all(
      beams.map(async (b) => {
        const cands = await nextTokenTopK({
          prompt: prompt + b.text,
          topLogprobs: K,
          temperature,
        });

        if (cands.length === 0) return [] as Beam[];

        return cands.map((c) => ({
          text: b.text + c.token,
          score: b.score + c.logprob, // somme des logprobs (objectif)
        }));
      })
    );

    const next = expansions.flat();
    if (next.length === 0) {
      if (cfg.verbose) console.warn(`Arrêt anticipé à step=${step} (aucune expansion)`);
      break;
    }

    next.sort((a, b) => b.score - a.score);
    beams = next.slice(0, B);

    if (cfg.verbose) {
      const best = beams[0];
      console.log(`[step ${step + 1}/${n}] bestScore=${best.score.toFixed(3)} bestTail=${JSON.stringify(best.text.slice(-40))}`);
    }
  }

  beams.sort((a, b) => b.score - a.score);
  return beams[0]?.text ?? "";
}

// ---------------------- Exemple d’utilisation ----------------------
async function demo() {
  const out = await maximizeN("Explique la dérivée en 1 phrase: ", {
    nTokens: 48,
    topLogprobs: 20,
    beamWidth: 6,
    temperature: 0,
    verbose: true,
  });

  console.log("\n=== Continuation optimisée ===");
  console.log(out);

  console.log("\n=== Texte complet ===");
  console.log("Explique la dérivée en 1 phrase: " + out);
}

// Décommente si tu veux exécuter directement
// demo().catch(console.error);
