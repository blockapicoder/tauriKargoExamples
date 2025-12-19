// ask-ollama-chat.ts
// Remplace l'ancien "ask-ollama.ts" pour utiliser le mode CHAT d'Ollama (/api/chat)
import { generateWithLogprobs } from "./logprob-test";
import { parseNDJSON, chatOllama, ChatRequest } from "./ollama"

const model: string = "gemma3-2060";

(async () => {
  const r1 = await generateWithLogprobs("Écris une phrase courte en français.")
  document.body.append(JSON.stringify(r1, null, 2))
  const req: ChatRequest = {
    messages: [{ role: 'user', content: 'bonjour' }],

    model: model
  }

  const r = await chatOllama(req)
  const obj = parseNDJSON(r)
  for (let e of obj) {

    document.body.appendChild(document.createElement("br"))
    document.body.append(JSON.stringify(e, null, 2))
  }


})()