import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const USER_APP_DIR = path.join(os.homedir(), '.mermaid-diagram-editor');
const DEFAULT_DATA_DIR = path.join(USER_APP_DIR, 'diagrams');
const CONFIG_FILE = path.join(USER_APP_DIR, 'config.json');

await ensureStorageInfrastructure();

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

function ensureValidDirectoryPath(dirPath) {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    const err = new Error('Le chemin du répertoire est obligatoire.');
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

function normalizeDirectoryPath(dirPath) {
  return path.resolve(String(dirPath || '').trim());
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      diagramsDir: normalizeDirectoryPath(parsed?.diagramsDir || DEFAULT_DATA_DIR)
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { diagramsDir: DEFAULT_DATA_DIR };
    }
    throw error;
  }
}

async function writeConfig(config) {
  await fs.mkdir(USER_APP_DIR, { recursive: true });
  await fs.writeFile(
    CONFIG_FILE,
    JSON.stringify({ diagramsDir: normalizeDirectoryPath(config.diagramsDir) }, null, 2),
    'utf8'
  );
}

async function ensureDirectoryExists(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  const stats = await fs.stat(dirPath);
  if (!stats.isDirectory()) {
    const err = new Error('Le chemin sélectionné n’est pas un répertoire.');
    err.status = 400;
    throw err;
  }
}

async function ensureStorageInfrastructure() {
  await fs.mkdir(USER_APP_DIR, { recursive: true });
  await ensureDirectoryExists(DEFAULT_DATA_DIR);

  try {
    await fs.access(CONFIG_FILE);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await writeConfig({ diagramsDir: DEFAULT_DATA_DIR });
    } else {
      throw error;
    }
  }

  const config = await readConfig();
  await ensureDirectoryExists(config.diagramsDir);
}

async function getDataDir() {
  const config = await readConfig();
  await ensureDirectoryExists(config.diagramsDir);
  return config.diagramsDir;
}

async function readDiagramSource(name) {
  const filePath = path.join(await getDataDir(), filenameFromName(name));
  return await fs.readFile(filePath, 'utf8');
}

async function writeDiagramSource(name, source) {
  const filePath = path.join(await getDataDir(), filenameFromName(name));
  await fs.writeFile(filePath, source, 'utf8');
}

async function listDiagramNames() {
  const entries = await fs.readdir(await getDataDir(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mmd'))
    .map((entry) => nameFromFilename(entry.name))
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

async function listExplorerRoots() {
  if (process.platform === 'win32') {
    const roots = [];
    for (let code = 65; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      try {
        await fs.access(drive);
        roots.push(drive);
      } catch {}
    }
    return roots.length ? roots : [path.parse(process.cwd()).root || 'C:\\'];
  }
  return ['/'];
}

async function listDirectories(targetPath) {
  const currentPath = normalizeDirectoryPath(targetPath);
  await ensureDirectoryExists(currentPath);

  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(currentPath, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

  const parsed = path.parse(currentPath);
  const parentPath = parsed.root === currentPath ? null : path.dirname(currentPath);

  return { currentPath, parentPath, entries: directories };
}

app.get('/api/health', async (_req, res, next) => {
  try {
    const config = await readConfig();
    res.json({ ok: true, diagramsDir: config.diagramsDir });
  } catch (error) {
    next(error);
  }
});

app.get('/api/storage/config', async (_req, res, next) => {
  try {
    const config = await readConfig();
    res.json({
      diagramsDir: config.diagramsDir,
      defaultDiagramsDir: DEFAULT_DATA_DIR,
      configFile: CONFIG_FILE,
      appDir: USER_APP_DIR
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/storage/config', async (req, res, next) => {
  try {
    const diagramsDir = typeof req.body?.diagramsDir === 'string' ? req.body.diagramsDir : '';
    ensureValidDirectoryPath(diagramsDir);
    const normalized = normalizeDirectoryPath(diagramsDir);
    await ensureDirectoryExists(normalized);
    await writeConfig({ diagramsDir: normalized });
    res.json({ ok: true, diagramsDir: normalized, configFile: CONFIG_FILE });
  } catch (error) {
    next(error);
  }
});

app.get('/api/explorer/roots', async (_req, res, next) => {
  try {
    res.json({ roots: await listExplorerRoots() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/explorer', async (req, res, next) => {
  try {
    const requestedPath =
      typeof req.query.path === 'string' && req.query.path.trim()
        ? req.query.path
        : (await getDataDir());

    const listing = await listDirectories(requestedPath);
    const config = await readConfig();

    res.json({
      ...listing,
      roots: await listExplorerRoots(),
      diagramsDir: config.diagramsDir
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/diagrams', async (_req, res, next) => {
  try {
    res.json({ names: await listDiagramNames() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/diagram/:name', async (req, res, next) => {
  try {
    const name = getRequestedName(req);
    ensureValidName(name);
    res.json({ name, source: await readDiagramSource(name) });
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
    res.json({ name, source: await readDiagramSource(name) });
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
  res.status(err.status || 500).json({ error: err.message || 'Erreur interne du serveur.' });
});

app.listen(PORT, async () => {
  const config = await readConfig();
  console.log(`Serveur prêt sur http://localhost:${PORT}`);
  console.log(`Page: http://localhost:${PORT}/`);
  console.log(`Explorateur: http://localhost:${PORT}/explorer.html`);
  console.log(`Stockage des diagrammes: ${config.diagramsDir}`);
  console.log(`Configuration: ${CONFIG_FILE}`);
});
