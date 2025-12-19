// Node 18+ : fetch est natif. Sinon: npm i undici, ou utilisez Deno.
const OLLAMA_URL = "http://localhost:11434";
const model: string = "gemma3-2060";
type OllamaGenerateResponse = {
  model: string;
  created_at: string;
  response: string;
  done: boolean;

  // Selon versions/modèles, le format exact peut varier.
  // On le laisse volontairement souple.
  logprobs?: unknown;
};

export async function generateWithLogprobs(prompt: string) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: model,      // remplacez par votre modèle
      prompt,
      stream: false,          // important pour recevoir un seul JSON
      logprobs: true,         // demande les logprobs
      top_logprobs: 5         // top-N alternatives (si supporté)
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as OllamaGenerateResponse;

  console.log("=== Texte ===");
  console.log(data.response);

  console.log("\n=== logprobs (brut) ===");
  console.dir(data.logprobs, { depth: null });
}


