# Express + Monaco + TypeScript runtime

Application Node.js avec Express qui fournit seulement :

- une API pour lire le fichier TypeScript
- une API pour écrire le fichier TypeScript et le fichier JavaScript transpilé
- une API pour exécuter `workspace/program.js`
- une page HTML avec Monaco Editor
- une transpilation TypeScript faite dans le navigateur
- une librairie de typings Node chargée par `fetch('/NODE_TYPES_LIB.d.ts')`

## Règles retenues

- le front transpile le TypeScript en CommonJS
- le backend sauvegarde seulement `workspace/program.ts` et `workspace/program.js`
- l'exécution recharge seulement `workspace/program.js`
- le script utilisateur doit utiliser `module.exports`
- il n'y a plus d'arguments d'exécution dans l'interface
- il n'y a plus de panneau "Exécution"

## Installation

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000`.

## Structure

- `server.js` : backend Express minimal
- `public/index.html` : page Monaco
- `public/app.js` : logique front
- `public/NODE_TYPES_LIB.d.ts` : typings Node injectés dans Monaco
- `public/styles.css` : styles
- `templates/program.template.ts` : modèle TypeScript initial
- `templates/program.template.js` : modèle JavaScript initial
- `workspace/program.ts` : source TypeScript
- `workspace/program.js` : JavaScript transpilé

## API

### GET `/api/source`
Retourne le contenu de `workspace/program.ts`.

### POST `/api/save`
Body JSON :

```json
{
  "tsCode": "...",
  "jsCode": "..."
}
```

### POST `/api/execute`
Recharge `workspace/program.js`, supprime son entrée du cache `require`, puis :

- si `module.exports` est une fonction, elle est exécutée sans argument
- sinon la valeur exportée est renvoyée telle quelle

## Typage `require(...)`

Dans Monaco :

- `require("fs")` → `typeof import("fs")`
- `require("path")` → `typeof import("path")`
- `require("os")` → `typeof import("os")`
- fallback : `require(id: string): any`

La librairie injecte aussi :

- `declare var exports`
- `declare var module`
- `declare var __filename`
- `declare var __dirname`
- `declare var process`

## Exemple de script

```ts
const fs = require("fs");
const path = require("path");

async function main(): Promise<string> {
  const result = {
    fileExists: fs.existsSync(__filename),
    basename: path.basename(__filename),
    cwd: process.cwd()
  };

  return JSON.stringify(result, null, 2);
}

module.exports = main;
```


## Source maps

La transpilation TypeScript ajoute maintenant une **source map inline** directement dans `workspace/program.js`. Le backend reste simple : il continue à sauvegarder uniquement `program.ts` et `program.js`.
