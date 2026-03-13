# Backend Node.js pour l'éditeur Mermaid / Blockly

## Installation

```bash
npm install
npm start
```

Le serveur démarre par défaut sur `http://localhost:3000`.

## Structure

- `public/index.html` : la page Blockly/Mermaid servie à la racine
- `data/*.mmd` : un fichier Mermaid par diagramme
- `server.js` : backend Express

## API

### Lister les diagrammes

```bash
curl http://localhost:3000/api/diagrams
```

Réponse :

```json
{ "names": ["MonDiagramme", "AutreDiagramme"] }
```

### Lire un diagramme par nom

```bash
curl http://localhost:3000/api/diagram/MonDiagramme
```

ou

```bash
curl "http://localhost:3000/api/diagram?name=MonDiagramme"
```

Réponse :

```json
{
  "name": "MonDiagramme",
  "source": "sequenceDiagram\nAlice->>Bob: Bonjour"
}
```

### Enregistrer un diagramme par nom

```bash
curl -X POST http://localhost:3000/api/diagram/MonDiagramme \
  -H "Content-Type: application/json" \
  -d '{"source":"sequenceDiagram\nAlice->>Bob: Bonjour"}'
```

ou

```bash
curl -X POST "http://localhost:3000/api/diagram?name=MonDiagramme" \
  -H "Content-Type: application/json" \
  -d '{"mermaid":"classDiagram\nclass Test"}'
```

## Notes

- Chaque diagramme est stocké dans `data/` au format `.mmd`
- Le nom logique du diagramme est converti en nom de fichier via `encodeURIComponent`
- Les API acceptent les propriétés JSON `source` ou `mermaid`
