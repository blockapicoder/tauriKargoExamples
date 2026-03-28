const express = require('express');
const fs = require('fs');
const path = require('path');

if (typeof process.setSourceMapsEnabled === 'function') {
  process.setSourceMapsEnabled(true);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const WORKSPACE_DIR = path.join(ROOT_DIR, 'workspace');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');

const TS_FILE = path.join(WORKSPACE_DIR, 'program.ts');
const JS_FILE = path.join(WORKSPACE_DIR, 'program.js');
const TS_TEMPLATE_FILE = path.join(TEMPLATES_DIR, 'program.template.ts');
const JS_TEMPLATE_FILE = path.join(TEMPLATES_DIR, 'program.template.js');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));

ensureWorkspace();

app.get('/api/source', (req, res) => {
  try {
    res.json({
      tsCode: fs.readFileSync(TS_FILE, 'utf8'),
      files: {
        ts: 'workspace/program.ts',
        js: 'workspace/program.js'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/save', (req, res) => {
  try {
    const tsCode = expectString(req.body.tsCode, 'tsCode');
    const jsCode = expectString(req.body.jsCode, 'jsCode');

    fs.writeFileSync(TS_FILE, tsCode, 'utf8');
    fs.writeFileSync(JS_FILE, jsCode, 'utf8');

    res.json({
      ok: true,
      saved: {
        ts: 'workspace/program.ts',
        js: 'workspace/program.js'
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/execute', async (req, res) => {
  try {
    if (!fs.existsSync(JS_FILE)) {
      throw new Error('Le fichier workspace/program.js est introuvable.');
    }

    delete require.cache[require.resolve(JS_FILE)];

    const exported = require(JS_FILE);
    const startedAt = Date.now();
    const result = typeof exported === 'function'
      ? await Promise.resolve(exported())
      : await Promise.resolve(exported);

    res.json({
      ok: true,
      result,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error && error.stack ? error.stack : String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur disponible sur http://localhost:${PORT}`);
});

function ensureWorkspace() {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  if (!fs.existsSync(TS_FILE)) {
    fs.writeFileSync(TS_FILE, fs.readFileSync(TS_TEMPLATE_FILE, 'utf8'), 'utf8');
  }

  if (!fs.existsSync(JS_FILE)) {
    fs.writeFileSync(JS_FILE, fs.readFileSync(JS_TEMPLATE_FILE, 'utf8'), 'utf8');
  }
}

function expectString(value, name) {
  if (typeof value !== 'string') {
    throw new Error(`Le champ ${name} doit être une chaîne.`);
  }
  return value;
}
