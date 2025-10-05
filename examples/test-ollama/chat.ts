import { ChatMessage, chatOllama } from "./ollama";

type Msg = { from: "A" | "B"; text: string; at: number };

const el = {
    msgs: document.getElementById("messages") as HTMLUListElement,


    status: document.getElementById("status") as HTMLSpanElement,
};

let messages: Msg[] = [];


function initials(name: string) {
    return name.trim().split(/\s+/).map(s => s[0]?.toUpperCase() ?? "").slice(0, 2).join("") || "?";
}
function fmtTime(ts: number) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function render() {
    el.msgs.innerHTML = "";
    const a = ""
    const b = ""

    for (const m of messages) {
        const li = document.createElement("li");
        const isA = m.from === "A";
        li.className = `msg ${isA ? "left" : "right"}`;

        const row = document.createElement("div");
        row.className = "row";

        const av = document.createElement("div");
        av.className = "avatar";
        av.textContent = initials(isA ? a : b);

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = isA ? a : b;

        const time = document.createElement("div");
        time.className = "time";
        time.textContent = fmtTime(m.at);

        row.appendChild(av);
        row.appendChild(name);
        row.appendChild(time);

        const text = document.createElement("div");
        text.className = "text";
        text.textContent = m.text;

        li.appendChild(row);
        li.appendChild(text);
        el.msgs.appendChild(li);
    }

    // auto-scroll

}






// wiring


function speak(text: string, { lang = "fr-FR", pitch = 1, rate = 1, volume = 1 } = {}) {
    return new Promise<void>((resolve, reject) => {
        speechSynthesis.cancel(); // évite les chevauchements
        const u = new SpeechSynthesisUtterance(text);
        Object.assign(u, { lang, pitch, rate, volume });
        u.onend = () => resolve();
        u.onerror = (e) => reject(e.error || e);
        speechSynthesis.speak(u);
    });
}
const personnagesSrc = sessionStorage.getItem("personnages")

let personnages = JSON.parse(personnagesSrc!)

document.getElementById("descLeft")!.textContent = personnages[0]
document.getElementById("descRight")!.textContent = personnages[1]

// Démo: quelques messages initiaux
messages = [

];
const messagesA: ChatMessage[] = [
    { role: "system", content: `tu est ${personnages[0]} et tu parle à  ${personnages[1]} , tu répond en une ligne` },
    { role: 'user', content: 'Bonjour' }
];
const messagesB: ChatMessage[] = [
    { role: "system", content: `tu est ${personnages[1]} et tu parle à  ${personnages[0]}, tu répond en une ligne` }
];
let run = false
let idx = 0;
async function faireDialogue() {
    let r = await chatOllama(messagesA, "gemma3-2060", {
        stream: false,
        onToken: (t) => { },
    });

    messagesA.push({ role: 'assistant', content: r })
    messages.push({ from: "A", text: r, at: idx })
    messagesB.push({ role: 'user', content: r })
    let r2 = await chatOllama(messagesB, "gemma3-2060", {
        stream: false,
        onToken: (t) => { },
    });

    messagesB.push({ role: 'assistant', content: r2 })
    messagesA.push({ role: "user", content: r2 })
    messages.push({ from: "B", text: r2, at: idx })
    idx++
    render()
    await speak(r)
    await speak(r2)
}
async function step(n: number) {
    let tmpResolve = () => { }
    let p = new Promise<void>((r) => { tmpResolve = r })
    setTimeout(() => { tmpResolve() }, n)
    return p

}
(async () => {
    while (true) {
        await step(300)
        if (run) {
            await faireDialogue()
        }
    }
})()
document.getElementById("radioStart")?.addEventListener("click", () => {
    run = true

})
document.getElementById("radioStop")?.addEventListener("click", () => {
    run = false

})
render();
