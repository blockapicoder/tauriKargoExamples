const PROGRAM_URI = 'file:///workspace/program.ts';
const NODE_TYPES_LIB_URL = '/NODE_TYPES_LIB.d.ts';
const AUTOSAVE_DELAY_MS = 800;

let tsEditor;
let lastSavedTsCode = null;
let saveTimer = null;
let saveRequestId = 0;
let isBootstrapping = true;

const elements = {
  statusBox: document.getElementById('statusBox'),
  filesInfo: document.getElementById('filesInfo'),
  executeBtn: document.getElementById('executeBtn')
};

bootstrap();

async function bootstrap() {
  try {
    setStatus('Chargement des typings Node...');
    const nodeTypesLib = await loadText(NODE_TYPES_LIB_URL);
    await loadMonaco(nodeTypesLib);
    bindEvents();
    await loadSource();
    isBootstrapping = false;
    scheduleAutoSave('Prêt. La sauvegarde automatique est active.');
  } catch (error) {
    setStatus(error.stack || String(error), true);
  }
}

function loadMonaco(nodeTypesLib) {
  return new Promise((resolve) => {
    window.require(['vs/editor/editor.main'], () => {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        noEmitOnError: false,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        inlineSourceMap: true,
        inlineSources: true
      });

      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        nodeTypesLib,
        'file:///__injected/NODE_TYPES_LIB.d.ts'
      );

      const model = monaco.editor.createModel('', 'typescript', monaco.Uri.parse(PROGRAM_URI));
      tsEditor = monaco.editor.create(document.getElementById('tsEditor'), {
        model,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false }
      });

      resolve();
    });
  });
}

function bindEvents() {
  elements.executeBtn.addEventListener('click', executeCurrentSource);
  tsEditor.onDidChangeModelContent(() => {
    if (!isBootstrapping) {
      scheduleAutoSave('Modification détectée. Vérification TypeScript...');
    }
  });
}

async function loadSource() {
  setStatus('Chargement du fichier TypeScript...');
  try {
    const response = await fetch('/api/source');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur de chargement.');
    }

    tsEditor.setValue(data.tsCode || '');
    lastSavedTsCode = data.tsCode || '';
    elements.filesInfo.textContent = `${data.files.ts} | ${data.files.js}`;
    setStatus('Fichier chargé.');
  } catch (error) {
    setStatus(error.stack || String(error), true);
  }
}

function scheduleAutoSave(statusMessage) {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  if (statusMessage) {
    setStatus(statusMessage);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    autoSaveIfValid().catch((error) => {
      setStatus(error.stack || String(error), true);
    });
  }, AUTOSAVE_DELAY_MS);
}

async function autoSaveIfValid() {
  const model = tsEditor.getModel();
  const tsCode = model.getValue();

  if (tsCode === lastSavedTsCode) {
    setStatus('Aucune modification à sauvegarder.');
    return;
  }

  const diagnostics = await collectDiagnostics(model);
  if (diagnostics.length > 0) {
    setStatus(
      'Sauvegarde suspendue : le code contient des erreurs TypeScript.\n' +
      diagnostics.map((d) => formatWorkerDiagnostic(model, d)).join('\n'),
      true
    );
    return;
  }

  const jsCode = transpileCurrentSource(tsCode);
  const requestId = ++saveRequestId;
  setStatus('Code valide. Sauvegarde automatique du TypeScript et du JavaScript...');

  const response = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tsCode, jsCode })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Erreur de sauvegarde.');
  }

  if (requestId !== saveRequestId) {
    return;
  }

  lastSavedTsCode = tsCode;
  elements.filesInfo.textContent = `${data.saved.ts} | ${data.saved.js}`;
  setStatus('Sauvegarde automatique terminée avec source map inline.');
}

async function executeCurrentSource() {
  try {
    setStatus('Vérification avant exécution...');
    await autoSaveIfValid();

    if (tsEditor.getValue() !== lastSavedTsCode) {
      throw new Error('Exécution bloquée : le code courant n\'est pas encore sauvegardé car il contient des erreurs TypeScript.');
    }

    setStatus('Exécution en cours...');
    const response = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erreur d\'exécution.');
    }

    const summary = summarizeExecution(data);
    setStatus(`Exécution OK en ${data.durationMs} ms.${summary ? ' ' + summary : ''}`);
  } catch (error) {
    setStatus(error.stack || String(error), true);
  }
}

function transpileCurrentSource(tsCode) {
  return ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      inlineSourceMap: true,
      inlineSources: true
    },
    fileName: 'program.ts'
  }).outputText;
}

async function collectDiagnostics(model) {
  const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
  const client = await getWorker(model.uri);
  const uri = model.uri.toString();

  const [syntactic, semantic, compilerOptions] = await Promise.all([
    client.getSyntacticDiagnostics(uri),
    client.getSemanticDiagnostics(uri),
    client.getCompilerOptionsDiagnostics(uri)
  ]);

  return [...syntactic, ...semantic, ...compilerOptions];
}

function formatWorkerDiagnostic(model, diagnostic) {
  const start = typeof diagnostic.start === 'number' ? diagnostic.start : 0;
  const position = model.getPositionAt(start);
  return `L${position.lineNumber}:C${position.column} - ${flattenMessageText(diagnostic.messageText)}`;
}

function summarizeExecution(data) {
  if (data == null || typeof data !== 'object') {
    return '';
  }

  if ('result' in data) {
    const value = formatStatusValue(data.result);
    return value ? `Résultat : ${value}` : '';
  }

  if ('output' in data) {
    const value = formatStatusValue(data.output);
    return value ? `Résultat : ${value}` : '';
  }

  return '';
}

function formatStatusValue(value) {
  if (value == null) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function flattenMessageText(messageText) {
  if (typeof messageText === 'string') {
    return messageText;
  }

  let result = messageText.messageText || '';
  let next = messageText.next;
  while (next && next.length > 0) {
    result += '\n' + next.map((item) => flattenMessageText(item.messageText || item)).join('\n');
    break;
  }
  return result;
}

function setStatus(message, isError = false) {
  elements.statusBox.textContent = message;
  elements.statusBox.classList.toggle('error', isError);
}

async function loadText(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Impossible de charger ${url}`);
  }
  return text;
}
