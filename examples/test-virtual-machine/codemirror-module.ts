const CodeMirror = (globalThis as any).CodeMirror;
if (!CodeMirror) throw new Error("CodeMirror global not loaded (CM5 scripts missing)");
export default CodeMirror;
export { CodeMirror };