// ask-ollama-chat.ts
// Remplace l'ancien "ask-ollama.ts" pour utiliser le mode CHAT d'Ollama (/api/chat)
import {ChatMessage , chatOllama } from "./ollama"
// --- Votre logique applicative (UI) ---
const question =
  "crée-moi un unique personnage de film fantastique en une seule ligne ; réponds en français et donne uniquement la description, sans baratin";

let personnages: string[] = [];
const selectionnes = new Set<string>(); // <-- ensemble des personnages cochés

const messages: ChatMessage[] = [
  { role: "system", content: "Tu es concis, tu réponds en une seule ligne, uniquement la description du personnage." },
];

// (optionnel) hook si tu as un bouton "Lancer conversation" à activer quand 2 sélectionnés
function updateStartButtonState() {
  const btn = document.getElementById("startChat") as HTMLButtonElement | null;
  if (!btn) return;
  const n = selectionnes.size;
  btn.disabled = n !== 2;
  btn.textContent = n === 2 ? "💬 Lancer conversation" : "💬 Lancer conversation (2 sélectionnés)";
}

// crée la coche et l'insère dans <li>
function ajouterCoche(li: HTMLLIElement, descriptionPerso: string) {
  const label = document.createElement("label");
  label.style.display = "flex";
  label.style.alignItems = "center";
  label.style.gap = "8px";

  const selectBox = document.createElement("input");
  selectBox.type = "checkbox";
  selectBox.className = "select";

  selectBox.addEventListener("change", () => {
    if (selectBox.checked) selectionnes.add(descriptionPerso);
    else selectionnes.delete(descriptionPerso);
    updateStartButtonState();
  });

  const descSpan = document.createElement("span");
  descSpan.className = "desc";
  // le texte sera renseigné ensuite (ou déjà présent) — on laisse comme conteneur
  if (!descSpan.textContent) descSpan.textContent = descriptionPerso;

  label.appendChild(selectBox);
  label.appendChild(descSpan);

  // Met la coche + texte au début du <li>
  li.prepend(label);
}

async function load() {
  try {
    const r = await fetch("/api/file/personnages.json", { method: "POST", cache: "no-cache" });
    personnages = await r.json();
    for (const p of personnages) {
      messages.push({ role: "user", content: question });
      messages.push({ role: "assistant", content: p });
      ajouterPersonnage(p);
    }
  } catch {
    console.log("pas de fichier");
  }
}

function ajouterPersonnage(descriptionPerso: string) {
  const li = document.createElement("li");

  // Ajoute la coche + texte
  ajouterCoche(li, descriptionPerso);
  // Met à jour le texte si besoin
  const span = li.querySelector(".desc") as HTMLSpanElement;
  if (span) span.textContent = descriptionPerso;

  // Bouton supprimer
  const removeButton = document.createElement("button");
  removeButton.setAttribute("class", "delete-btn");
  removeButton.textContent = "✕";
  removeButton.addEventListener("click", () => {
    personnages = personnages.filter((p) => p !== descriptionPerso);
    selectionnes.delete(descriptionPerso); // retire de la sélection si présent
    removeButton.parentElement!.remove();
    updateStartButtonState();
  });
  li.appendChild(removeButton);

  document.getElementById("list")!.appendChild(li);
}

async function addItem() {
  const bouton = document.getElementById("addItem") as HTMLButtonElement;
  const list = document.getElementById("list")!;

  // li en direct pour le streaming
  const li = document.createElement("li");

  // coche + placeholder texte (sera rempli au fil du stream)
  ajouterCoche(li, ""); // description remplie après
  const live = li.querySelector(".desc") as HTMLSpanElement;
  list.appendChild(li);

  bouton.disabled = true;
  try {
    messages.push({ role: "user", content: question });

    const answer = await chatOllama(messages, "gemma3-2060", {
      stream: true,
      onToken: (t) => { live.textContent = (live.textContent ?? "") + t; },
    });

    const descriptionPerso = answer.trim();
    live.textContent = descriptionPerso; // version finale propre
    personnages.push(descriptionPerso);
    messages.push({ role: "assistant", content: descriptionPerso });

    // recâble la coche avec la vraie valeur maintenant connue
    const checkbox = li.querySelector('input.select') as HTMLInputElement | null;
    if (checkbox) {
      // retirer l’ancien listener anonyme n’est pas trivial, on remplace le label pour être net
      const label = checkbox.closest("label")!;
      label.remove();
      ajouterCoche(li, descriptionPerso);
    }

    // Bouton supprimer
    const removeButton = document.createElement("button");
    removeButton.setAttribute("class", "delete-btn");
    removeButton.textContent = "✕";
    removeButton.addEventListener("click", () => {
      personnages = personnages.filter((p) => p !== descriptionPerso);
      selectionnes.delete(descriptionPerso);
      removeButton.parentElement!.remove();
      updateStartButtonState();
    });
    li.appendChild(removeButton);
  } catch (err) {
    console.error("Erreur en appelant Ollama :", err);
    li.remove(); // rollback si erreur
  } finally {
    bouton.disabled = false;
  }
}

document.getElementById("addItem")!.addEventListener("click", addItem);

async function save() {
  await fetch("/api/file/personnages.json", {
    method: "POST",
    body: JSON.stringify(personnages, null, 2),
  });
}
document.getElementById("save")!.addEventListener("click", save);
const btn = document.getElementById("startChat") as HTMLButtonElement | null;
if (btn) {
    btn.addEventListener("click",()=> {
        sessionStorage.setItem("personnages",JSON.stringify([...selectionnes]))
        window.location.href = "./chat.html"
    })
}
load().then(() => console.log("load"));
