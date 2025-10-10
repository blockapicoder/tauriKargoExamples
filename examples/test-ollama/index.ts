// ask-ollama-chat.ts
// Remplace l'ancien "ask-ollama.ts" pour utiliser le mode CHAT d'Ollama (/api/chat)
import { parseNDJSON, chatOllama, ChatRequest } from "./ollama"

const model: string = "gemma3-2060";

(async () => {
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