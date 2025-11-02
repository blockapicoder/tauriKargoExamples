
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatRequest  = { model: string; messages: ChatMessage[]; stream?: boolean; format?: string };
export type ChatChunk    = { model?: string; created_at?: string; message?: ChatMessage; response?: string; done?: boolean };

// --- Client CHAT ---
export async function chatOllama(
  messages: ChatMessage[],
  model = "gemma3-2060",
  opts: { stream?: boolean; onToken?: (t: string) => void; url?: string; format?: string } = {}
): Promise<string> {
  const { stream = false, onToken, url = "https://blockapicoder.com/ollama/api/chat", format } = opts;
  const body: ChatRequest = { model, messages, stream, format };

  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);

  if (stream && res.body) {
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let full = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split(/\n+/).filter(Boolean)) {
        try {
          const json = JSON.parse(line) as ChatChunk;
          const piece = json.message?.content ?? json.response ?? "";
          if (piece) { full += piece; opts.onToken?.(piece); }
        } catch {}
      }
    }
    return full.trim();
  }
  const json = (await res.json()) as ChatChunk;
  return (json.message?.content ?? json.response ?? "").toString().trim();
}
