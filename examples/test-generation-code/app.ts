/* eslint-disable @typescript-eslint/no-explicit-any */

declare const require: any;
declare const monaco: any;
declare const ts: any;

// alias safe (ne redeclare pas "ts")
const TS = (window as any).ts as any;

type Schema =
  | { kind: "string" | "number" | "boolean" | "any" | "unknown" | "null" | "undefined" }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "array"; element: Schema }
  | { kind: "tuple"; elements: Schema[] }
  | { kind: "object"; properties: Record<string, { schema: Schema; optional: boolean }>; index?: Schema; extends?: string[] }
  | { kind: "union"; options: Schema[] }
  | { kind: "intersection"; types: Schema[] }
  | { kind: "ref"; name: string };

type ParseResult = { defs: Map<string, Schema>; diagnostics: string[] };

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const tsDot = el<HTMLSpanElement>("tsDot");
const tsStatus = el<HTMLSpanElement>("tsStatus");
const jsonDot = el<HTMLSpanElement>("jsonDot");
const jsonStatus = el<HTMLSpanElement>("jsonStatus");
const errorsEl = el<HTMLPreElement>("errors");

const btnViewTs = el<HTMLButtonElement>("btnViewTs");
const btnViewForm = el<HTMLButtonElement>("btnViewForm");

const typeSelect = el<HTMLSelectElement>("typeSelect");
const includeOptional = { checked:false}

const btnLoadTs = el<HTMLButtonElement>("btnLoadTs");
const fileTs = el<HTMLInputElement>("fileTs");
const btnSaveTs = el<HTMLButtonElement>("btnSaveTs");

const btnLoadJson = el<HTMLButtonElement>("btnLoadJson");
const fileJson = el<HTMLInputElement>("fileJson");

const btnSaveJson = el<HTMLButtonElement>("btnSaveJson");
const btnValidate = el<HTMLButtonElement>("btnValidate");

const formHost = el<HTMLDivElement>("formHost");

function setTsStatus(ok: boolean, msg: string, errs = "") {
  tsDot.className = "dot " + (ok ? "ok" : "bad");
  tsStatus.textContent = msg;
  errorsEl.textContent = errs;
}
function setJsonStatus(ok: boolean, msg: string) {
  jsonDot.className = "dot " + (ok ? "ok" : "bad");
  jsonStatus.textContent = msg;
}
function debounce<F extends (...args: any[]) => void>(fn: F, ms = 250): F {
  let t: any;
  return ((...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as F;
}

// ---------- Mode (panel selection) ----------
type Mode = "ts" | "form";

function setMode(mode: Mode) {
  document.body.classList.toggle("mode-ts", mode === "ts");
  document.body.classList.toggle("mode-form", mode === "form");

  btnViewTs.classList.toggle("active", mode === "ts");
  btnViewForm.classList.toggle("active", mode === "form");

  // Monaco needs a layout when being shown again
  if (mode === "ts" && editor) {
    setTimeout(() => editor.layout(), 0);
  }
}

// ---------- Parse TS -> schemas ----------
function parseSchemas(tsCode: string): ParseResult {
  const diagnostics: string[] = [];
  const sf = TS.createSourceFile("input.ts", tsCode, TS.ScriptTarget.Latest, true, TS.ScriptKind.TS);
  const defs = new Map<string, Schema>();

  const diag = (node: any, msg: string) => {
    const lc = sf.getLineAndCharacterOfPosition(node.pos);
    diagnostics.push(`L${lc.line + 1}:C${lc.character + 1} ${msg}`);
  };

  const stripQuotes = (s: string) => {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    return s;
  };

  const schemaFromTypeLiteral = (typeLit: any): Schema => {
    const properties: Record<string, { schema: Schema; optional: boolean }> = {};
    let index: Schema | undefined;

    for (const m of typeLit.members) {
      if (TS.isPropertySignature(m)) {
        const n = m.name ? m.name.getText(sf) : undefined;
        if (!n) { diag(m, "Propriété sans nom"); continue; }
        properties[stripQuotes(n)] = { schema: schemaFromTypeNode(m.type), optional: !!m.questionToken };
      } else if (TS.isIndexSignatureDeclaration(m)) {
        if (m.type) index = schemaFromTypeNode(m.type);
      } else {
        diag(m, `Membre ignoré (seulement propriétés + index signature): ${m.getText(sf)}`);
      }
    }
    return { kind: "object", properties, index };
  };

  const schemaFromTypeNode = (node: any): Schema => {
    if (!node) return { kind: "any" };

    switch (node.kind) {
      case TS.SyntaxKind.StringKeyword: return { kind: "string" };
      case TS.SyntaxKind.NumberKeyword: return { kind: "number" };
      case TS.SyntaxKind.BooleanKeyword: return { kind: "boolean" };
      case TS.SyntaxKind.AnyKeyword: return { kind: "any" };
      case TS.SyntaxKind.UnknownKeyword: return { kind: "unknown" };
      case TS.SyntaxKind.NullKeyword: return { kind: "literal", value: null };
      case TS.SyntaxKind.UndefinedKeyword: return { kind: "undefined" };

      case TS.SyntaxKind.LiteralType: {
        const lit = node.literal;
        if (TS.isStringLiteral(lit)) return { kind: "literal", value: lit.text };
        if (TS.isNumericLiteral(lit)) return { kind: "literal", value: Number(lit.text) };
        if (lit.kind === TS.SyntaxKind.TrueKeyword) return { kind: "literal", value: true };
        if (lit.kind === TS.SyntaxKind.FalseKeyword) return { kind: "literal", value: false };
        diag(node, `LiteralType non supporté: ${lit.getText(sf)}`);
        return { kind: "any" };
      }

      case TS.SyntaxKind.ParenthesizedType:
        return schemaFromTypeNode(node.type);

      case TS.SyntaxKind.UnionType:
        return { kind: "union", options: node.types.map(schemaFromTypeNode) };

      case TS.SyntaxKind.IntersectionType:
        return { kind: "intersection", types: node.types.map(schemaFromTypeNode) };

      case TS.SyntaxKind.ArrayType:
        return { kind: "array", element: schemaFromTypeNode(node.elementType) };

      case TS.SyntaxKind.TupleType:
        return { kind: "tuple", elements: node.elements.map(schemaFromTypeNode) };

      case TS.SyntaxKind.TypeLiteral:
        return schemaFromTypeLiteral(node);

      case TS.SyntaxKind.TypeReference: {
        const name = node.typeName.getText(sf);
        const args = (node.typeArguments?.map(schemaFromTypeNode) ?? []) as Schema[];

        if ((name === "Array" || name === "ReadonlyArray") && args.length === 1) return { kind: "array", element: args[0] };
        if (name === "Record" && args.length === 2) return { kind: "object", properties: {}, index: args[1] };

        if (name === "String") return { kind: "string" };
        if (name === "Number") return { kind: "number" };
        if (name === "Boolean") return { kind: "boolean" };

        return { kind: "ref", name };
      }

      default:
        diag(node, `Type non supporté: ${TS.SyntaxKind[node.kind]} -> ${node.getText(sf)}`);
        return { kind: "any" };
    }
  };

  for (const st of sf.statements) {
    if (TS.isInterfaceDeclaration(st)) {
      const name = st.name.text;
      const properties: Record<string, { schema: Schema; optional: boolean }> = {};
      let index: Schema | undefined;

      for (const m of st.members) {
        if (TS.isPropertySignature(m)) {
          const n = m.name ? m.name.getText(sf) : undefined;
          if (!n) { diag(m, "Propriété sans nom"); continue; }
          properties[stripQuotes(n)] = { schema: schemaFromTypeNode(m.type), optional: !!m.questionToken };
        } else if (TS.isIndexSignatureDeclaration(m)) {
          if (m.type) index = schemaFromTypeNode(m.type);
        } else {
          diag(m, `Membre ignoré (seulement propriétés + index signature): ${m.getText(sf)}`);
        }
      }

      const ext = (st.heritageClauses ?? [])
        .filter((h: any) => h.token === TS.SyntaxKind.ExtendsKeyword)
        .flatMap((h: any) => h.types.map((t: any) => t.expression.getText(sf)));

      defs.set(name, { kind: "object", properties, index, extends: ext.length ? ext : undefined });
    }

    if (TS.isTypeAliasDeclaration(st)) {
      defs.set(st.name.text, schemaFromTypeNode(st.type));
    }
  }

  return { defs, diagnostics };
}

// ---------- Resolve / validate / example ----------
function resolveRef(defs: Map<string, Schema>, s: Schema): Schema {
  if (s.kind !== "ref") return s;
  return defs.get(s.name) ?? { kind: "any" };
}
function isPlainObject(v: any) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateValue(
  defs: Map<string, Schema>,
  schema: Schema,
  value: any,
  path = "$",
  state: { depth: number; stack: string[] } = { depth: 0, stack: [] }
): string[] {
  if (state.depth > 30) return [];

  if (schema.kind === "ref") {
    if (state.stack.includes(schema.name)) return [];
    const target = defs.get(schema.name);
    if (!target) return [`${path}: type introuvable: ${schema.name}`];
    return validateValue(defs, target, value, path, { depth: state.depth + 1, stack: [...state.stack, schema.name] });
  }

  switch (schema.kind) {
    case "any":
    case "unknown":
      return [];
    case "string":
      return typeof value === "string" ? [] : [`${path}: attendu string`];
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? [] : [`${path}: attendu number (fini)`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path}: attendu boolean`];
    case "null":
      return value === null ? [] : [`${path}: attendu null`];
    case "undefined":
      return [`${path}: attendu undefined (non-représentable en JSON)`];
    case "literal":
      return value === schema.value ? [] : [`${path}: attendu literal ${JSON.stringify(schema.value)}`];

    case "array":
      if (!Array.isArray(value)) return [`${path}: attendu array`];
      return value.flatMap((it, i) => validateValue(defs, schema.element, it, `${path}[${i}]`, { depth: state.depth + 1, stack: state.stack }));

    case "tuple":
      if (!Array.isArray(value)) return [`${path}: attendu tuple (array)`];
      if (value.length !== schema.elements.length) return [`${path}: attendu tuple de longueur ${schema.elements.length}`];
      return schema.elements.flatMap((s, i) => validateValue(defs, s, value[i], `${path}[${i}]`, { depth: state.depth + 1, stack: state.stack }));

    case "object": {
      if (!isPlainObject(value)) return [`${path}: attendu object`];
      let errs: string[] = [];

      if (schema.extends) {
        for (const base of schema.extends) {
          const baseSchema = defs.get(base);
          if (!baseSchema) errs.push(`${path}: type de base introuvable: ${base}`);
          else errs = errs.concat(validateValue(defs, baseSchema, value, path, { depth: state.depth + 1, stack: state.stack }));
        }
      }

      for (const [k, spec] of Object.entries(schema.properties)) {
        if (!(k in value)) {
          if (!spec.optional) errs.push(`${path}.${k}: propriété requise manquante`);
          continue;
        }
        errs = errs.concat(validateValue(defs, spec.schema, (value as any)[k], `${path}.${k}`, { depth: state.depth + 1, stack: state.stack }));
      }

      if (schema.index) {
        for (const [k, v] of Object.entries(value)) {
          if (schema.properties[k]) continue;
          errs = errs.concat(validateValue(defs, schema.index, v, `${path}.${k}`, { depth: state.depth + 1, stack: state.stack }));
        }
      }

      return errs;
    }

    case "union": {
      let best: string[] | null = null;
      for (const opt of schema.options) {
        const e = validateValue(defs, opt, value, path, { depth: state.depth + 1, stack: state.stack });
        if (e.length === 0) return [];
        if (!best || e.length < best.length) best = e;
      }
      return best ?? [`${path}: union invalide`];
    }

    case "intersection":
      return schema.types.flatMap((t) => validateValue(defs, t, value, path, { depth: state.depth + 1, stack: state.stack }));
  }
}

function makeExample(
  defs: Map<string, Schema>,
  schema: Schema,
  opts: { includeOptional: boolean },
  state: { depth: number; stack: string[] } = { depth: 0, stack: [] }
): any {
  if (state.depth > 12) return null;

  if (schema.kind === "ref") {
    if (state.stack.includes(schema.name)) return null;
    const t = defs.get(schema.name);
    if (!t) return null;
    return makeExample(defs, t, opts, { depth: state.depth + 1, stack: [...state.stack, schema.name] });
  }

  switch (schema.kind) {
    case "any":
    case "unknown": return null;
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    case "null": return null;
    case "undefined": return null;
    case "literal": return schema.value;

    case "array": return [];
    case "tuple": return schema.elements.map((s) => makeExample(defs, s, opts, { depth: state.depth + 1, stack: state.stack }));
    case "union": return makeExample(defs, schema.options[0], opts, { depth: state.depth + 1, stack: state.stack });

    case "intersection": {
      const parts = schema.types.map((t) => makeExample(defs, t, opts, { depth: state.depth + 1, stack: state.stack }));
      const objs = parts.filter(isPlainObject);
      if (objs.length === parts.length) return Object.assign({}, ...objs);
      return parts[0] ?? null;
    }

    case "object": {
      const o: any = {};
      if (schema.extends) {
        for (const base of schema.extends) {
          const bs = defs.get(base);
          if (!bs) continue;
          const bEx = makeExample(defs, bs, opts, { depth: state.depth + 1, stack: state.stack });
          if (isPlainObject(bEx)) Object.assign(o, bEx);
        }
      }
      for (const [k, spec] of Object.entries(schema.properties)) {
        if (!spec.optional || opts.includeOptional) {
          o[k] = makeExample(defs, spec.schema, opts, { depth: state.depth + 1, stack: state.stack });
        }
      }
      return o;
    }
  }
}

// ---------- Immutable set/delete by path ----------
type Path = Array<string | number>;

function setAt(root: any, p: Path, v: any) {
  if (p.length === 0) return v;
  const copy = Array.isArray(root) ? [...root] : (isPlainObject(root) ? { ...root } : {});
  let cur: any = copy;

  for (let i = 0; i < p.length - 1; i++) {
    const k = p[i];
    const nextK = p[i + 1];
    const existing = cur[k as any];

    const next =
      existing != null
        ? (Array.isArray(existing) ? [...existing] : isPlainObject(existing) ? { ...existing } : (typeof nextK === "number" ? [] : {}))
        : (typeof nextK === "number" ? [] : {});

    cur[k as any] = next;
    cur = next;
  }

  cur[p[p.length - 1] as any] = v;
  return copy;
}

function delAt(root: any, p: Path) {
  if (p.length === 0) return root;
  const copy = Array.isArray(root) ? [...root] : (isPlainObject(root) ? { ...root } : {});
  let cur: any = copy;

  for (let i = 0; i < p.length - 1; i++) {
    const k = p[i];
    const existing = cur[k as any];
    if (existing == null) return copy;
    cur[k as any] = Array.isArray(existing) ? [...existing] : isPlainObject(existing) ? { ...existing } : existing;
    cur = cur[k as any];
  }

  const last = p[p.length - 1];
  if (Array.isArray(cur) && typeof last === "number") cur.splice(last, 1);
  else if (isPlainObject(cur) && typeof last === "string") delete cur[last];
  return copy;
}

// ---------- UI (form renderer) ----------
let editor: any = null;
let currentDefs = new Map<string, Schema>();
let stateValue: any = {};
const unionChoice = new Map<string, number>();

function mk(tag: string, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function pathKey(p: Path) {
  return "$" + p.map((x) => (typeof x === "number" ? `[${x}]` : `.${x}`)).join("");
}

function isUnionOfLiterals(defs: Map<string, Schema>, s: Schema): { ok: true; values: any[] } | { ok: false } {
  const rs = resolveRef(defs, s);
  if (rs.kind !== "union") return { ok: false };
  const vals: any[] = [];
  for (const opt of rs.options) {
    const o = resolveRef(defs, opt);
    if (o.kind !== "literal") return { ok: false };
    vals.push(o.value);
  }
  return { ok: true, values: vals };
}

function schemaLabel(defs: Map<string, Schema>, s: Schema, idx: number) {
  const r = resolveRef(defs, s);
  if (r.kind === "object") {
    for (const key of ["kind", "type", "tag"]) {
      const prop = r.properties[key];
      const pv = prop ? resolveRef(defs, prop.schema) : null;
      if (pv && pv.kind === "literal") return `${key}=${JSON.stringify(pv.value)}`;
    }
    return `object#${idx}`;
  }
  if (r.kind === "literal") return `literal=${JSON.stringify(r.value)}`;
  if (r.kind === "array") return `array`;
  if (r.kind === "tuple") return `tuple(${r.elements.length})`;
  return `${r.kind}#${idx}`;
}

function pickUnionIndex(defs: Map<string, Schema>, union: Schema, value: any, pk: string): number {
  const u = resolveRef(defs, union);
  if (u.kind !== "union") return 0;
  for (let i = 0; i < u.options.length; i++) {
    const errs = validateValue(defs, u.options[i], value, pk);
    if (errs.length === 0) return i;
  }
  return unionChoice.get(pk) ?? 0;
}

// ----- FIX FOCUS (no full rerender on each keystroke in form) -----
const softValidateDebounced = debounce(() => softValidate(), 120);

function setValue(path: Path, v: any, opts: { rerender?: boolean } = {}) {
  stateValue = setAt(stateValue, path, v);
  if (opts.rerender) {
    renderForm();
    softValidate();
  } else {
    softValidateDebounced();
  }
}

function deleteValue(path: Path, opts: { rerender?: boolean } = {}) {
  stateValue = delAt(stateValue, path);
  if (opts.rerender) {
    renderForm();
    softValidate();
  } else {
    softValidateDebounced();
  }
}

function renderEditor(defs: Map<string, Schema>, schema: Schema, value: any, path: Path, label?: string): HTMLElement {
  const pk = pathKey(path);
  const s = resolveRef(defs, schema);

  // primitives
  if (s.kind === "string" || s.kind === "number" || s.kind === "boolean") {
    const row = mk("div", "row");
    row.appendChild(mk("div", "lbl", label ?? pk));
    const ctl = mk("div", "ctl");

    const inp = document.createElement("input");
    inp.className = "inp";
    if (s.kind === "number") inp.type = "number";
    else if (s.kind === "boolean") inp.type = "checkbox";
    else inp.type = "text";

    if (s.kind === "boolean") {
      (inp as HTMLInputElement).checked = !!value;
      inp.addEventListener("change", () => setValue(path, (inp as HTMLInputElement).checked));
    } else if (s.kind === "number") {
      (inp as HTMLInputElement).value = typeof value === "number" ? String(value) : "0";
      inp.addEventListener("input", () => setValue(path, Number((inp as HTMLInputElement).value)));
    } else {
      (inp as HTMLInputElement).value = typeof value === "string" ? value : "";
      inp.addEventListener("input", () => setValue(path, (inp as HTMLInputElement).value));
    }

    ctl.appendChild(inp);
    row.appendChild(ctl);
    return row;
  }

  if (s.kind === "literal") {
    const row = mk("div", "row");
    row.appendChild(mk("div", "lbl", label ?? pk));
    const ctl = mk("div", "ctl");
    ctl.appendChild(mk("div", "muted", `literal: ${JSON.stringify(s.value)}`));
    row.appendChild(ctl);
    return row;
  }

  if (s.kind === "any" || s.kind === "unknown" || s.kind === "undefined" || s.kind === "null") {
    const row = mk("div", "row");
    row.appendChild(mk("div", "lbl", label ?? pk));
    const ctl = mk("div", "ctl");
    const inp = document.createElement("input");
    inp.className = "inp";
    inp.type = "text";
    inp.placeholder = s.kind;
    inp.value = value == null ? "" : String(value);
    inp.addEventListener("input", () => setValue(path, (inp as HTMLInputElement).value));
    ctl.appendChild(inp);
    row.appendChild(ctl);
    return row;
  }

  // union
  if (s.kind === "union") {
    const litU = isUnionOfLiterals(defs, s);
    const grp = mk("div", "grp");
    const head = mk("div", "grpHeader");
    head.appendChild(mk("div", "grpTitle", label ?? "union"));

    if (litU.ok) {
      const sel = document.createElement("select");
      sel.className = "sel";
      for (const v of litU.values) {
        const o = document.createElement("option");
        o.value = JSON.stringify(v);
        o.textContent = String(v);
        sel.appendChild(o);
      }
      const current = litU.values.includes(value) ? value : litU.values[0];
      sel.value = JSON.stringify(current);
      sel.addEventListener("change", () => setValue(path, JSON.parse(sel.value)));
      head.appendChild(sel);
      grp.appendChild(head);
      return grp;
    }

    const idx = pickUnionIndex(defs, s, value, pk);
    unionChoice.set(pk, idx);

    const sel = document.createElement("select");
    sel.className = "sel";
    for (let i = 0; i < s.options.length; i++) {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = schemaLabel(defs, s.options[i], i);
      sel.appendChild(o);
    }
    sel.value = String(idx);

    // structure change => rerender
    sel.addEventListener("change", () => {
      const i = Number(sel.value);
      unionChoice.set(pk, i);
      const next = makeExample(defs, s.options[i], { includeOptional: includeOptional.checked });
      setValue(path, next, { rerender: true });
    });

    head.appendChild(sel);
    grp.appendChild(head);

    const branch = s.options[idx] ?? s.options[0];
    grp.appendChild(renderEditor(defs, branch, value, path));
    return grp;
  }

  // intersection
  if (s.kind === "intersection") {
    const grp = mk("div", "grp");
    const head = mk("div", "grpHeader");
    head.appendChild(mk("div", "grpTitle", label ?? "intersection"));
    grp.appendChild(head);
    for (let i = 0; i < s.types.length; i++) {
      grp.appendChild(renderEditor(defs, s.types[i], value, path, `part ${i + 1}`));
    }
    return grp;
  }

  // array
  if (s.kind === "array") {
    const arr = Array.isArray(value) ? value : [];
    const grp = mk("div", "grp");
    const head = mk("div", "grpHeader");
    head.appendChild(mk("div", "grpTitle", label ?? "array"));

    // structure change => rerender
    const add = mk("button", "btnSm", "+ item") as HTMLButtonElement;
    add.addEventListener("click", () => {
      const item = makeExample(defs, s.element, { includeOptional: includeOptional.checked });
      setValue(path, [...arr, item], { rerender: true });
    });
    head.appendChild(add);
    grp.appendChild(head);

    arr.forEach((it, i) => {
      const box = mk("div", "grp");
      const h = mk("div", "grpHeader");
      h.appendChild(mk("div", "grpTitle", `#${i}`));

      const rm = mk("button", "btnSm", "suppr") as HTMLButtonElement;
      rm.addEventListener("click", () => setValue(path, arr.filter((_, j) => j !== i), { rerender: true }));
      h.appendChild(rm);

      box.appendChild(h);
      box.appendChild(renderEditor(defs, s.element, it, [...path, i]));
      grp.appendChild(box);
    });

    return grp;
  }

  // tuple
  if (s.kind === "tuple") {
    const arr = Array.isArray(value) ? value : [];
    const grp = mk("div", "grp");
    const head = mk("div", "grpHeader");
    head.appendChild(mk("div", "grpTitle", label ?? `tuple(${s.elements.length})`));
    grp.appendChild(head);
    for (let i = 0; i < s.elements.length; i++) {
      grp.appendChild(renderEditor(defs, s.elements[i], arr[i], [...path, i], `[${i}]`));
    }
    return grp;
  }

  // object
  if (s.kind === "object") {
    const obj = isPlainObject(value) ? value : {};
    const grp = mk("div", "grp");
    const head = mk("div", "grpHeader");
    head.appendChild(mk("div", "grpTitle", label ?? "object"));
    grp.appendChild(head);

    for (const [k, spec] of Object.entries(s.properties)) {
      const has = Object.prototype.hasOwnProperty.call(obj, k);

      if (spec.optional) {
        const row = mk("div", "row");
        row.appendChild(mk("div", "lbl", k));
        const ctl = mk("div", "ctl");

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = has;

        // structure change => rerender
        chk.addEventListener("change", () => {
          if (chk.checked) {
            const ex = makeExample(defs, spec.schema, { includeOptional: includeOptional.checked });
            setValue([...path, k], ex, { rerender: true });
          } else {
            deleteValue([...path, k], { rerender: true });
          }
        });

        ctl.appendChild(chk);
        ctl.appendChild(mk("div", "muted", "optionnel"));
        row.appendChild(ctl);
        grp.appendChild(row);

        if (has) grp.appendChild(renderEditor(defs, spec.schema, obj[k], [...path, k], k));
      } else {
        grp.appendChild(renderEditor(defs, spec.schema, obj[k], [...path, k], k));
      }
    }

    if (s.index) {
      const known = new Set(Object.keys(s.properties));
      const extras = Object.keys(obj).filter((k) => !known.has(k));

      const extraGrp = mk("div", "grp");
      const eh = mk("div", "grpHeader");
      eh.appendChild(mk("div", "grpTitle", "champs dynamiques (index signature)"));

      const keyInp = document.createElement("input");
      keyInp.className = "inp";
      keyInp.placeholder = "nouvelle clé…";
      keyInp.style.width = "220px";

      const add = mk("button", "btnSm", "+ clé") as HTMLButtonElement;
      add.addEventListener("click", () => {
        const kk = keyInp.value.trim();
        if (!kk || known.has(kk)) return;
        const ex = makeExample(defs, s.index!, { includeOptional: includeOptional.checked });
        setValue([...path, kk], ex, { rerender: true });
        keyInp.value = "";
      });

      eh.appendChild(keyInp);
      eh.appendChild(add);
      extraGrp.appendChild(eh);

      for (const kk of extras) {
        const box = mk("div", "grp");
        const h = mk("div", "grpHeader");
        h.appendChild(mk("div", "grpTitle", kk));

        const rm = mk("button", "btnSm", "suppr") as HTMLButtonElement;
        rm.addEventListener("click", () => deleteValue([...path, kk], { rerender: true }));
        h.appendChild(rm);

        box.appendChild(h);
        box.appendChild(renderEditor(defs, s.index!, obj[kk], [...path, kk], kk));
        extraGrp.appendChild(box);
      }

      grp.appendChild(extraGrp);
    }

    return grp;
  }

  const row = mk("div", "row");
  row.appendChild(mk("div", "lbl", label ?? pk));
  row.appendChild(mk("div", "ctl", `non supporté: ${(s as any).kind}`));
  return row;
}

function renderForm() {
  formHost.innerHTML = "";
  const typeName = typeSelect.value;
  const rootSchema = currentDefs.get(typeName);
  if (!rootSchema) {
    formHost.appendChild(mk("div", "muted", "Aucun type sélectionné."));
    return;
  }
  formHost.appendChild(renderEditor(currentDefs, rootSchema, stateValue, [], typeName));
}

function softValidate() {
  const typeName = typeSelect.value;
  const sch = currentDefs.get(typeName);
  if (!sch) { setJsonStatus(false, `Type introuvable: ${typeName}`); return; }

  const errs = validateValue(currentDefs, sch, stateValue, "$");
  if (errs.length === 0) {
    setJsonStatus(true, `Valide pour ${typeName}`);
  } else {
    setJsonStatus(false, `Invalide (${errs.length} erreur(s))`);
    setTsStatus(tsDot.classList.contains("ok"), tsStatus.textContent || "", errs.join("\n"));
  }
}

// ---------- App flow ----------
function refreshTypeList(defs: Map<string, Schema>, prev: string | null) {
  const names = [...defs.keys()].sort((a, b) => a.localeCompare(b));
  typeSelect.innerHTML = "";
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    typeSelect.appendChild(opt);
  }
  if (names.length) typeSelect.value = prev && names.includes(prev) ? prev : names[0];
  return names;
}

function ensureRootStateIfNeeded(prevSelected: string | null) {
  const selected = typeSelect.value;
  const sch = currentDefs.get(selected);

  // si le type sélectionné a changé (ex: ancien type supprimé), on réinitialise l'objet
  if (prevSelected && selected !== prevSelected && sch) {
    stateValue = makeExample(currentDefs, sch, { includeOptional: includeOptional.checked });
  }

  // si pas encore d'état, on init
  if ((stateValue == null || (isPlainObject(stateValue) && Object.keys(stateValue).length === 0)) && sch) {
    // garde les cas où l'utilisateur a volontairement un objet vide pour un type vide
    stateValue = makeExample(currentDefs, sch, { includeOptional: includeOptional.checked });
  }
}

function reanalyze() {
  const code = editor ? editor.getValue() : "";
  const { defs, diagnostics } = parseSchemas(code);
  currentDefs = defs;

  const prevSelected = typeSelect.value || null;
  const names = refreshTypeList(defs, prevSelected);

  if (!names.length) {
    setTsStatus(false, "Aucun type/interface trouvé", diagnostics.join("\n"));
    formHost.innerHTML = `<div class="muted">Aucun type/interface trouvé.</div>`;
    setJsonStatus(false, "—");
    return;
  }

  const ok = diagnostics.length === 0;
  setTsStatus(
    ok,
    ok ? `OK — ${names.length} type(s) détecté(s)` : `Avec avertissements — ${names.length} type(s) détecté(s)`,
    diagnostics.join("\n")
  );

  // TS modifié => IHM régénérée automatiquement (DOM reconstruite)
  ensureRootStateIfNeeded(prevSelected);
  renderForm();
  softValidate();
}

function validateCurrent(): boolean {
  const typeName = typeSelect.value;
  const sch = currentDefs.get(typeName);
  if (!sch) { setJsonStatus(false, `Type introuvable: ${typeName}`); return false; }

  const errs = validateValue(currentDefs, sch, stateValue, "$");
  if (errs.length === 0) {
    setJsonStatus(true, `Valide pour ${typeName}`);
    return true;
  } else {
    setJsonStatus(false, `Invalide (${errs.length} erreur(s)) — détails côté TS`);
    setTsStatus(tsDot.classList.contains("ok"), tsStatus.textContent || "", errs.join("\n"));
    return false;
  }
}

function downloadText(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function downloadJson(obj: any, filename: string) {
  downloadText(JSON.stringify(obj, null, 2), filename, "application/json");
}

function wireUI() {
  // panel selection
  btnViewTs.addEventListener("click", () => setMode("ts"));
  btnViewForm.addEventListener("click", () => setMode("form"));

  // root type change => re-init object (pas de bouton "Générer IHM")
  typeSelect.addEventListener("change", () => {
    const sch = currentDefs.get(typeSelect.value);
    if (sch) stateValue = makeExample(currentDefs, sch, { includeOptional: includeOptional.checked });
    renderForm();
    softValidate();
  });

  btnValidate.addEventListener("click", () => {
    validateCurrent();
  });

  btnSaveJson.addEventListener("click", () => {
    const ok = validateCurrent();
    if (!ok && !confirm("L'objet ne valide pas. Enregistrer quand même ?")) return;
    const typeName = typeSelect.value || "data";
    downloadJson(stateValue, `${typeName}.json`);
  });

  // save TS
  btnSaveTs.addEventListener("click", () => {
    const code = editor ? editor.getValue() : "";
    const base = (typeSelect.value || "types").replace(/[^a-zA-Z0-9_\-]/g, "_");
    downloadText(code, `${base}.ts`, "text/typescript");
  });

  // load TS
  btnLoadTs.addEventListener("click", () => fileTs.click());
  fileTs.addEventListener("change", async () => {
    const f = fileTs.files?.[0];
    if (!f) return;
    const text = await f.text();
    editor.setValue(text);
    reanalyze();
    setTsStatus(true, `TS chargé: ${f.name}`, errorsEl.textContent || "");
    fileTs.value = "";
  });

  // load JSON
  btnLoadJson.addEventListener("click", () => fileJson.click());
  fileJson.addEventListener("change", async () => {
    const f = fileJson.files?.[0];
    if (!f) return;

    const text = await f.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setJsonStatus(false, `Fichier JSON invalide: ${e.message}`);
      fileJson.value = "";
      return;
    }

    const typeName = typeSelect.value;
    const sch = currentDefs.get(typeName);
    if (!sch) {
      setJsonStatus(false, `Type introuvable: ${typeName}`);
      fileJson.value = "";
      return;
    }

    const errs = validateValue(currentDefs, sch, parsed, "$");
    if (errs.length === 0) {
      stateValue = parsed;
      renderForm();
      setJsonStatus(true, `JSON chargé et valide pour ${typeName} (${f.name})`);
    } else {
      setTsStatus(tsDot.classList.contains("ok"), tsStatus.textContent || "", errs.join("\n"));
      if (confirm(`JSON invalide pour ${typeName} (${errs.length} erreur(s)).\n\nCharger quand même ?`)) {
        stateValue = parsed;
        renderForm();
        setJsonStatus(false, `Chargé (mais invalide) — ${f.name}`);
      } else {
        setJsonStatus(false, `Chargement annulé — ${f.name}`);
      }
    }

    fileJson.value = "";
    softValidate();
  });
}

// ---------- Monaco init ----------
function initMonaco() {
  require.config({ paths: { vs: "https://unpkg.com/monaco-editor@0.45.0/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      strict: true,
    });

    editor = monaco.editor.create(el("tsEditor"), {
      value:
`// Exemple
type Tag = "truc" | "bidule";

interface Person {
  id: string;
  age?: number;
  tags: Tag[];
}

type Payload =
  | { kind: "A"; p: Person }
  | { kind: "B"; data: Record<string, number> };
`,
      language: "typescript",
      theme: "vs-dark",
      minimap: { enabled: false },
      automaticLayout: true,
      fontSize: 13,
    });

    // TS modifié => reanalyze => IHM auto régénérée
    editor.onDidChangeModelContent(debounce(reanalyze, 250));

    wireUI();
    reanalyze();
    setMode("ts");
  });
}

// ---------- Boot ----------
if (!TS) {
  setTsStatus(false, "Erreur: typescript.js non chargé (global ts absent).");
} else {
  initMonaco();
}
