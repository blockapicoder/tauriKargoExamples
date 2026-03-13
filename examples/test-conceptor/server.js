import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

await fs.mkdir(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));

function getRequestedName(req) {
  const raw = req.params.name ?? req.query.name;
  return typeof raw === 'string' ? raw.trim() : '';
}

function ensureValidName(name) {
  if (!name) {
    const err = new Error('Le nom du diagramme est obligatoire.');
    err.status = 400;
    throw err;
  }
  if (name.length > 200) {
    const err = new Error('Le nom du diagramme est trop long.');
    err.status = 400;
    throw err;
  }
}

function filenameFromName(name) {
  return `${encodeURIComponent(name)}.mmd`;
}

function nameFromFilename(filename) {
  return decodeURIComponent(filename.replace(/\.mmd$/i, ''));
}

async function readDiagramSource(name) {
  const filePath = path.join(DATA_DIR, filenameFromName(name));
  return await fs.readFile(filePath, 'utf8');
}

async function writeDiagramSource(name, source) {
  const filePath = path.join(DATA_DIR, filenameFromName(name));
  await fs.writeFile(filePath, source, 'utf8');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/diagrams', async (_req, res, next) => {
  try {
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mmd'))
      .map((entry) => nameFromFilename(entry.name))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    res.json({ names });
  } catch (error) {
    next(error);
  }
});

app.get('/api/diagram/:name', async (req, res, next) => {
  try {
    const name = getRequestedName(req);
    ensureValidName(name);
    const source = await readDiagramSource(name);
    res.json({ name, source });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Diagramme introuvable.' });
    }
    next(error);
  }
});

app.get('/api/diagram', async (req, res, next) => {
  try {
    const name = getRequestedName(req);
    ensureValidName(name);
    const source = await readDiagramSource(name);
    res.json({ name, source });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Diagramme introuvable.' });
    }
    next(error);
  }
});

app.post('/api/diagram/:name', async (req, res, next) => {
  try {
    const name = getRequestedName(req);
    ensureValidName(name);

    const source = typeof req.body?.source === 'string'
      ? req.body.source
      : typeof req.body?.mermaid === 'string'
        ? req.body.mermaid
        : '';

    if (!source.trim()) {
      return res.status(400).json({ error: 'Le corps JSON doit contenir "source" ou "mermaid" non vide.' });
    }

    await writeDiagramSource(name, source);
    res.json({ ok: true, name });
  } catch (error) {
    next(error);
  }
});

app.post('/api/diagram', async (req, res, next) => {
  try {
    const name = getRequestedName(req);
    ensureValidName(name);

    const source = typeof req.body?.source === 'string'
      ? req.body.source
      : typeof req.body?.mermaid === 'string'
        ? req.body.mermaid
        : '';

    if (!source.trim()) {
      return res.status(400).json({ error: 'Le corps JSON doit contenir "source" ou "mermaid" non vide.' });
    }

    await writeDiagramSource(name, source);
    res.json({ ok: true, name });
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Erreur interne du serveur.' });
});

app.listen(PORT, () => {
  console.log(`Serveur prêt sur http://localhost:${PORT}`);
  console.log(`Page: http://localhost:${PORT}/`);
  console.log("GO")
});
