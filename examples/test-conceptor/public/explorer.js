const state = {
  currentPath: '',
  parentPath: null,
  configuredDir: '',
  configFile: '',
  appDir: '',
  roots: []
};

const el = {
  configuredDir: document.getElementById('configuredDir'),
  configFile: document.getElementById('configFile'),
  appDir: document.getElementById('appDir'),
  currentPath: document.getElementById('currentPath'),
  pathInput: document.getElementById('pathInput'),
  directoryList: document.getElementById('directoryList'),
  roots: document.getElementById('roots'),
  status: document.getElementById('status'),
  refreshBtn: document.getElementById('refreshBtn'),
  goBtn: document.getElementById('goBtn'),
  upBtn: document.getElementById('upBtn'),
  chooseCurrentBtn: document.getElementById('chooseCurrentBtn')
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}

function setStatus(message = '', type = '') {
  el.status.textContent = message;
  el.status.className = `status${type ? ` ${type}` : ''}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderConfig() {
  el.configuredDir.textContent = state.configuredDir || '—';
  el.configFile.textContent = state.configFile || '—';
  el.appDir.textContent = state.appDir || '—';
}

function renderRoots() {
  el.roots.innerHTML = '';
  state.roots.forEach((rootPath) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn secondary${state.currentPath === rootPath ? ' active' : ''}`;
    btn.textContent = rootPath;
    btn.addEventListener('click', () => loadDirectory(rootPath));
    el.roots.appendChild(btn);
  });
}

function renderDirectories(entries) {
  el.directoryList.innerHTML = '';

  if (state.parentPath) {
    const parent = document.createElement('div');
    parent.className = 'entry';
    parent.innerHTML = `
      <div>
        <div class="entry-title">..</div>
        <div class="entry-meta">Monter au dossier parent</div>
      </div>
      <div>⬆️</div>
    `;
    parent.addEventListener('click', () => loadDirectory(state.parentPath));
    el.directoryList.appendChild(parent);
  }

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'entry';
    empty.style.cursor = 'default';
    empty.innerHTML = `
      <div>
        <div class="entry-title">Aucun sous-dossier</div>
        <div class="entry-meta">Choisis ce dossier ou remonte d’un niveau.</div>
      </div>
      <div>📁</div>
    `;
    el.directoryList.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML = `
      <div>
        <div class="entry-title">${escapeHtml(entry.name)}</div>
        <div class="entry-meta">${escapeHtml(entry.path)}</div>
      </div>
      <div>📁</div>
    `;
    row.addEventListener('click', () => loadDirectory(entry.path));
    el.directoryList.appendChild(row);
  });
}

async function loadConfig() {
  const data = await fetchJson('/api/storage/config');
  state.configuredDir = data.diagramsDir || '';
  state.configFile = data.configFile || '';
  state.appDir = data.appDir || '';
  renderConfig();
}

async function loadRoots() {
  const data = await fetchJson('/api/explorer/roots');
  state.roots = Array.isArray(data.roots) ? data.roots : [];
  renderRoots();
}

async function loadDirectory(targetPath) {
  try {
    setStatus('Chargement du dossier…');
    const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : '';
    const data = await fetchJson(`/api/explorer${query}`);

    state.currentPath = data.currentPath || '';
    state.parentPath = data.parentPath || null;
    state.configuredDir = data.diagramsDir || state.configuredDir;
    state.roots = Array.isArray(data.roots) ? data.roots : state.roots;

    el.currentPath.textContent = state.currentPath || '—';
    el.pathInput.value = state.currentPath || '';
    renderConfig();
    renderRoots();
    renderDirectories(Array.isArray(data.entries) ? data.entries : []);
    setStatus('');
  } catch (error) {
    setStatus(error.message || 'Impossible de charger le dossier.', 'error');
  }
}

async function saveCurrentDirectory() {
  if (!state.currentPath) {
    setStatus('Aucun dossier affiché à enregistrer.', 'error');
    return;
  }

  try {
    setStatus('Enregistrement du dossier…');
    const data = await fetchJson('/api/storage/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagramsDir: state.currentPath })
    });

    state.configuredDir = data.diagramsDir || state.currentPath;
    renderConfig();
    setStatus('Dossier de stockage enregistré.', 'ok');
  } catch (error) {
    setStatus(error.message || 'Impossible d’enregistrer le dossier.', 'error');
  }
}

async function initialize() {
  try {
    setStatus('Initialisation…');
    await loadConfig();
    await loadRoots();
    await loadDirectory(state.configuredDir);
    setStatus('');
  } catch (error) {
    setStatus(error.message || 'Impossible d’initialiser l’explorateur.', 'error');
  }
}

el.refreshBtn.addEventListener('click', () => loadDirectory(state.currentPath || state.configuredDir));
el.goBtn.addEventListener('click', () => loadDirectory(el.pathInput.value));
el.upBtn.addEventListener('click', () => state.parentPath && loadDirectory(state.parentPath));
el.pathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadDirectory(el.pathInput.value);
});
el.chooseCurrentBtn.addEventListener('click', saveCurrentDirectory);

initialize();
