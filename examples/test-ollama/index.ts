// ask-ollama-chat.ts
// Remplace l'ancien "ask-ollama.ts" pour utiliser le mode CHAT d'Ollama (/api/chat)
import { generateWithLogprobs } from "./logprob-test";
import { parseNDJSON, chatOllama, ChatRequest } from "./ollama"
import { boot, defineVue } from "./node_modules/tauri-kargo-tools/src/vue"
import { maximizeN } from "./logprob";

const model: string = "gemma3-2060";
class Chat {
  entree: string = "Explique la dérivée en 1 phrase: "
  sortie = ""
  req: ChatRequest = {
    messages: [],

    model: model
  }
  constructor() {


  }
  async generateWithLogprobs() {
   // const r1 = await generateWithLogprobs("Écris une phrase courte en français.")
     const out = await maximizeN(this.entree, {
        nTokens: 48,
        topLogprobs: 20,
        beamWidth: 6,
        temperature: 0,
        verbose: true,
      });
    
    this.sortie += out

  }
  async appelerOllama() {
    this.req.messages.push({ content: this.entree, role: "user" })
    const r = await chatOllama(this.req)
    const obj = parseNDJSON(r)
    let message = ""
    for (let e of obj) {
      message += e.message.content
    }
    this.req.messages.push({ role: "assistant", content: message })

    this.sortie = this.req.messages.map((m) => {
      return `${m.role}:\n${m.content}`
    }).join("\n======")

  }
  async resumer() {
    const conversation = this.req.messages.map((m) => {
      return `${m.role}:\n${m.content}`
    }).join("\n======")
    const resumerReq: ChatRequest = {
      messages: [{ role: "user", content: "resume moi la conversation entre nous suivante " + conversation }],

      model: model
    }
    const r = await chatOllama(resumerReq)
    const obj = parseNDJSON(r)
    let message = ""
    for (let e of obj) {
      message += e.message.content
    }
    this.req.messages.push({ role: "assistant", content: message })

    this.sortie = message
  }

}
defineVue(Chat, (vue) => {
  vue.flow({ orientation: "column", gap: 10 }, () => {
    vue.input({ name: "entree" })
    vue.flow({ orientation: "row", gap: 10 }, () => {
      vue.staticButton({ action: "appelerOllama", label: "Appeler ollama", width: "33%" })
      vue.staticButton({ action: "generateWithLogprobs", label: "Appeler logprob", width: "33%" })
      vue.staticButton({ action: "resumer", label: "Resumer", width: "33%" })
    })
    vue.label("sortie")


  })
})
boot(new Chat())
