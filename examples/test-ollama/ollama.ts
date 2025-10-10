
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatChunk = { model?: string; created_at?: string; message?: ChatMessage; response?: string; done?: boolean };
export interface OllamaOptions {
  // Sampling & décodage
  num_keep?: number;
  seed?: number;
  num_predict?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  typical_p?: number;
  temperature?: number;
  repeat_last_n?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: 0 | 1 | 2;
  mirostat_tau?: number;
  mirostat_eta?: number;
  penalize_newline?: boolean;
  stop?: string[]; // la doc montre un tableau de motifs

  // Mémoire/contexte & perfs
  numa?: boolean;
  num_ctx?: number;
  num_batch?: number;

  // GPU/CPU & mémoire modèle
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  vocab_only?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  num_thread?: number;
}
export interface Options {
  onToken?: (t: string) => void; url?: string
}
// extras communs aux deux endpoints OpenAI-compat
export interface WithLogProbs {
  /** Active le retour des log-probas des tokens générés */
  logprobs?: boolean;
  /** Nombre d’alternatives renvoyées par position (OpenAI: 0..5 typiquement) */
  top_logprobs?: number;
}

// /v1/generate (OpenAI: /v1/completions)
export interface GenerateRequest extends WithLogProbs {
  model: string;
  prompt?: string;
  suffix?: string;
  images?: string[];
  format?: "json" | Record<string, unknown>;
  options?: OllamaOptions;
  system?: string;
  template?: string;
  stream?: boolean;
  raw?: boolean;
  keep_alive?: number | string;
  context?: number[]; // (déprécié)
}

// /v1/chat/completions
export interface ChatRequest extends WithLogProbs {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  format?: "json" | Record<string, unknown>;
  options?: OllamaOptions;
  stream?: boolean;
  keep_alive?: number | string;
}
export type ChatRole = 'assistant';

export interface ToolCall {
  function: {
    name: string;
    // La doc montre des arguments objet JSON
    arguments: Record<string, unknown>;
  };
}

export interface ChatMessageRep {
  role: ChatRole;                // 'assistant'
  content: string;               // texte généré
  images?: string[] | null;      // présent/nullable selon modèles multimodaux
  tool_calls?: ToolCall[];       // présent si le modèle appelle des outils
}

export type DoneReason = 'stop' | 'length' | 'load' | string;

export interface ChatResponseNonStream {
  model: string;
  created_at: string;            // ISO timestamp
  message: ChatMessageRep;          // réponse de l’assistant
  done: true;                    // en non-stream, c’est la réponse finale
  done_reason?: DoneReason;      // ex: "stop", "load" (voir exemples outils)
  // Métriques & stats (nanosecondes pour les durations)
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// --- Client CHAT ---
export async function chatOllama(
  chatRequest: ChatRequest,
  opts: Options = {}
): Promise<string> {
  const { onToken, url = "http://localhost:11434/api/chat" } = opts;
  const body: ChatRequest = { ...chatRequest };


  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  
  if (body.stream && res.body) {
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let full = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split(/\n+/).filter(Boolean)) {
        try {
          const json = JSON.parse(line) as ChatChunk;
          const piece = json.message?.content ?? json.response ?? "";
          if (piece) { full += piece; opts.onToken?.(piece); }
        } catch { }
      }
    }
    return full.trim();
  }
  return await res.text()
}
/**
 * Transforme une chaîne NDJSON (JSONL) en tableau d'objets JS.
 * - Ignore les lignes vides et les espaces.
 * - Accepte des lignes préfixées par "data: " (au cas où).
 * - Lève une erreur si une ligne JSON est invalide (avec son index).
 */
export function parseNDJSON(input: string): ChatResponseNonStream[] {
  const out: ChatResponseNonStream[] = [];
  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;                    // skip vide
    if (line.startsWith("data:")) line = line.slice(5).trim(); // tolère "data: {...}"
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      // Option: ignorer au lieu de throw -> remplacer par `continue;`
      throw new Error(`Ligne ${i + 1} invalide: ${line}\nCause: ${(e as Error).message}`);
    }
  }
  return out;
}
