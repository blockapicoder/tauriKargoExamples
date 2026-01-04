{
  function v(name) { return { type: "var", name }; }
  function lit(value) { return { type: "literal", value }; }

  // ------------------------------------------------------------
  // Lowering: Expr imbriquées -> Expr "graphe" (Call.args = Atom[])
  // + Hoisting des lambdas non-capturantes (expr + bloc) en fun globales
  // ------------------------------------------------------------
  function lowerProgram(namedProg) {
    let tempId = 0;
    const freshTemp = () => `$t${++tempId}`;

    let lambdaId = 0;
    const freshLambda = () => `$lambda${++lambdaId}`;
    const hoistedFuns = [];

    function mkTempSet(ctx, name, value) {
      // Top-level: temporaires en setGlobal ; dans fun: temporaires en setLocal
      return (ctx.scope === "global")
        ? { kind: "setGlobal", name, value }
        : { kind: "setLocal", name, value };
    }

    function isAtom(e) {
      return e && (e.type === "literal" || e.type === "var");
    }

    // ----------------------------------------------------------
    // Collecte des variables utilisées (pour détecter la capture)
    // ----------------------------------------------------------
    function collectVarRefs(expr, out) {
      if (!expr) return;

      if (expr.type === "var") {
        out.add(expr.name);
        return;
      }
      if (expr.type === "literal") return;

      if (expr.type === "call") {
        // op peut être string (primitive) ou {type:"var", name}
        if (expr.op && typeof expr.op === "object" && expr.op.type === "var") {
          out.add(expr.op.name);
        }
        for (const a of (expr.args ?? [])) collectVarRefs(a, out);
        return;
      }

      if (expr.type === "lambda" || expr.type === "lambdaBlock") {
        // IMPORTANT: ne pas descendre dans les lambdas (traitées séparément)
        return;
      }

      throw new Error("collectVarRefs: unknown expr " + JSON.stringify(expr));
    }

    function collectVarRefsInCallOp(op, out) {
      if (!op) return;
      if (typeof op === "string") return;
      if (op.type === "var") out.add(op.name);
      else throw new Error("collectVarRefsInCallOp: invalid op " + JSON.stringify(op));
    }

    function collectVarRefsInInstr(ins, out) {
      if (ins.kind === "setLocal" || ins.kind === "setGlobal") {
        collectVarRefs(ins.value, out);
        return;
      }
      if (ins.kind === "ifRet") {
        collectVarRefs(ins.if, out);
        collectVarRefs(ins.then, out);
        return;
      }
      if (ins.kind === "call") {
        collectVarRefsInCallOp(ins.op, out);
        for (const a of (ins.args ?? [])) collectVarRefs(a, out);
        return;
      }
      throw new Error("collectVarRefsInInstr: unknown instruction " + JSON.stringify(ins));
    }

    // ----------------------------------------------------------
    // Lowering
    // ----------------------------------------------------------
    // lowerExpr(ctx, expr, wantAtom) -> { prelude: Instr[], expr: Expr }
    // - wantAtom=true  => renvoie var/literal ; crée un temp si expr est un call
    // - wantAtom=false => renvoie expr (var/lit/call) mais call.args seront des atomes
    function lowerExpr(ctx, expr, wantAtom) {
      if (!expr) throw new Error("lowerExpr: empty expr");

      if (expr.type === "literal" || expr.type === "var") {
        return { prelude: [], expr };
      }

      // Lambdas: expression ou bloc
      if (expr.type === "lambda" || expr.type === "lambdaBlock") {
        const params = expr.params ?? [];
        const code = (expr.type === "lambdaBlock") ? (expr.code ?? []) : [];
        const retExpr = (expr.type === "lambdaBlock") ? expr.ret : expr.body;

        // Interdiction de capture: référence à un local externe non redéfini dans la lambda
        const outerLocals = ctx.locals ? new Set(ctx.locals) : new Set();

        // Locaux propres à la lambda (ombrage autorisé)
        const lambdaLocals = new Set(params);
        if (expr.type === "lambdaBlock") {
          for (const ins of code) {
            if (ins.kind === "setLocal") lambdaLocals.add(ins.name);
          }
        }

        const used = new Set();
        for (const ins of code) collectVarRefsInInstr(ins, used);
        collectVarRefs(retExpr, used);

        for (const name of used) {
          if (outerLocals.has(name) && !lambdaLocals.has(name)) {
            throw new Error(`Lambda capture interdite: '${name}' (utilise un local du scope externe).`);
          }
        }

        // Hoisting en fun globale
        const fname = freshLambda();
        const funStmt = {
          kind: "fun",
          name: fname,
          params,
          code,
          ret: retExpr
        };

        hoistedFuns.push(lowerFun(funStmt));

        // La lambda devient une référence (var) vers la fun générée
        return { prelude: [], expr: v(fname) };
      }

      if (expr.type === "call") {
        // args peuvent être des Expr imbriquées (au parse) => on force des atomes
        const prelude = [];
        const atoms = [];

        for (const a of (expr.args ?? [])) {
          const r = lowerExpr(ctx, a, true); // args doivent devenir des atomes
          prelude.push(...r.prelude);
          if (!isAtom(r.expr)) throw new Error("Expected atom after lowering arg");
          atoms.push(r.expr);
        }

        const callFlat = { type: "call", op: expr.op, args: atoms };

        if (!wantAtom) {
          return { prelude, expr: callFlat };
        }

        // besoin d'un atome => temp
        const t = freshTemp();
        prelude.push(mkTempSet(ctx, t, callFlat));
        return { prelude, expr: v(t) };
      }

      throw new Error("Unknown expr node (expected literal/var/call/lambda/lambdaBlock): " + JSON.stringify(expr));
    }

    function lowerCallStmt(ctx, st) {
      // st.kind === "call" avec args: Expr[] (imbriquées possibles)
      const prelude = [];
      const atoms = [];
      for (const a of (st.args ?? [])) {
        const r = lowerExpr(ctx, a, true);
        prelude.push(...r.prelude);
        atoms.push(r.expr);
      }
      return [
        ...prelude,
        { kind: "call", op: st.op, args: atoms }
      ];
    }

    function lowerInstr(ctx, ins) {
      if (ins.kind === "setLocal" || ins.kind === "setGlobal") {
        const r = lowerExpr(ctx, ins.value, false);
        return [
          ...r.prelude,
          { ...ins, value: r.expr }
        ];
      }

      if (ins.kind === "ifRet") {
        // NOTE: hoisting des temporaires de then avant le test (Expr supposées pures)
        const rc = lowerExpr(ctx, ins.if, false);
        const rt = lowerExpr(ctx, ins.then, false);
        return [
          ...rc.prelude,
          ...rt.prelude,
          { kind: "ifRet", if: rc.expr, then: rt.expr }
        ];
      }

      if (ins.kind === "call") {
        return lowerCallStmt(ctx, ins);
      }

      throw new Error("Unknown instruction kind: " + JSON.stringify(ins));
    }

    function lowerFun(st) {
      // noms locaux visibles dans ce scope (params + setLocal)
      const localNames = new Set(st.params);
      for (const ins of st.code) {
        if (ins.kind === "setLocal") localNames.add(ins.name);
      }

      const ctx = { scope: "local", locals: localNames };

      let code = [];
      for (const ins of st.code) {
        code.push(...lowerInstr(ctx, ins));
      }
      const rr = lowerExpr(ctx, st.ret, false);
      code.push(...rr.prelude);

      return {
        ...st,
        code,
        ret: rr.expr
      };
    }

    const out = [];
    for (const st of namedProg) {
      if (st.kind === "fun") {
        out.push(lowerFun(st));
        continue;
      }
      if (st.kind === "setGlobal") {
        const ctx = { scope: "global", locals: null };
        const r = lowerExpr(ctx, st.value, false);
        out.push(...r.prelude);
        out.push({ ...st, value: r.expr });
        continue;
      }
      if (st.kind === "call") {
        const ctx = { scope: "global", locals: null };
        out.push(...lowerCallStmt(ctx, st));
        continue;
      }
      throw new Error("Unknown statement kind: " + JSON.stringify(st));
    }

    // Les lambdas hoistées (fun $lambdaN) doivent apparaître avant usage
    return [...hoistedFuns, ...out];
  }

  // ------------------------------------------------------------
  // Name resolution (inchangé, mais appliqué après lowering)
  // ------------------------------------------------------------
  function resolveProgram(namedProg0) {
    // 1) lower d'abord => graphe (Call.args = Atom[])
    const namedProg = lowerProgram(namedProg0);

    const globalDeclared = new Set();
    const globalIndex = new Map();
    let nextG = 0;

    function declareGlobal(name) {
      globalDeclared.add(name);
      if (!globalIndex.has(name)) globalIndex.set(name, nextG++);
    }
    function ensureGlobal(name) {
      if (!globalIndex.has(name)) globalIndex.set(name, nextG++);
      return globalIndex.get(name);
    }

    // Pass 0: globals "définis"
    for (const st of namedProg) {
      if (st.kind === "setGlobal") declareGlobal(st.name);
      if (st.kind === "fun") {
        declareGlobal(st.name);
        for (const ins of st.code) {
          if (ins.kind === "setGlobal") declareGlobal(ins.name);
        }
      }
    }

    function resolveAtom(a, locals) {
      if (a.type === "literal") return a;
      if (a.type === "var") {
        if (locals && locals.has(a.name)) return { type: "local", idx: locals.get(a.name) };
        return { type: "global", idx: ensureGlobal(a.name) };
      }
      throw new Error("Invalid atom: " + JSON.stringify(a));
    }

    function resolveOp(op, locals) {
      if (typeof op === "string") return op;
      if (!op || op.type !== "var") throw new Error("Invalid op: " + JSON.stringify(op));
      const name = op.name;

      if (locals && locals.has(name)) return { type: "local", idx: locals.get(name) };
      if (globalDeclared.has(name)) return { type: "global", idx: ensureGlobal(name) };
      return name; // non défini => string (primitive)
    }

    function resolveExpr(e, locals) {
      if (e.type === "literal") return e;

      if (e.type === "var") {
        if (locals && locals.has(e.name)) return { type: "local", idx: locals.get(e.name) };
        return { type: "global", idx: ensureGlobal(e.name) };
      }

      if (e.type === "call") {
        return {
          type: "call",
          op: resolveOp(e.op, locals),
          args: e.args.map(a => resolveAtom(a, locals)),
        };
      }

      if (e.type === "lambda" || e.type === "lambdaBlock") {
        throw new Error("Lambda inattendue après lowering (elle aurait dû être hoistée).");
      }

      throw new Error("Unknown expr: " + JSON.stringify(e));
    }

    const out = [];

    for (const st of namedProg) {
      if (st.kind === "setGlobal") {
        out.push({
          type: "setGlobal",
          var: ensureGlobal(st.name),
          value: resolveExpr(st.value, null),
        });
        continue;
      }

      if (st.kind === "call") {
        out.push({
          type: "call",
          op: resolveOp(st.op, null),
          args: st.args.map(a => resolveAtom(a, null)),
        });
        continue;
      }

      if (st.kind === "fun") {
        const locals = new Map();
        let nextL = 0;

        for (const p of st.params) {
          if (locals.has(p)) throw new Error("Duplicate parameter: " + p);
          locals.set(p, nextL++);
        }

        for (const ins of st.code) {
          if (ins.kind === "setLocal" && !locals.has(ins.name)) {
            locals.set(ins.name, nextL++);
          }
        }

        const code = st.code.map(ins => {
          if (ins.kind === "setLocal") {
            return {
              type: "setLocal",
              var: locals.get(ins.name),
              value: resolveExpr(ins.value, locals),
            };
          }
          if (ins.kind === "setGlobal") {
            return {
              type: "setGlobal",
              var: ensureGlobal(ins.name),
              value: resolveExpr(ins.value, locals),
            };
          }
          if (ins.kind === "call") {
            return {
              type: "call",
              op: resolveOp(ins.op, locals),
              args: ins.args.map(a => resolveAtom(a, locals)),
            };
          }
          if (ins.kind === "ifRet") {
            return {
              type: "ifRet",
              if: resolveExpr(ins.if, locals),
              then: resolveExpr(ins.then, locals),
            };
          }
          throw new Error("Unknown instruction: " + JSON.stringify(ins));
        });

        out.push({
          type: "fun",
          var: ensureGlobal(st.name),
          code,
          ret: resolveExpr(st.ret, locals),
        });
        continue;
      }

      throw new Error("Unknown statement: " + JSON.stringify(st));
    }

    return out;
  }
}

Start
  = _ p:Program _ { return resolveProgram(p); }

Program
  = s:Statement* { return s; }

Statement
  = ICallExpr
  / SetGlobalStmt
  / FunDef

SetGlobalStmt
  = "setGlobal" __ name:Ident _ "=" _ value:Expr _ ";" _
    { return { kind:"setGlobal", name, value }; }

// Fun syntax conservée (signature terminée par ';')
FunDef
  = "fun" __ name:Ident _ "(" _ params:ParamList? _ ")" _ ";" _
      code:Instr* ret:ReturnStmt _
    {
      return { kind:"fun", name, params: params ?? [], code, ret };
    }

ParamList
  = head:Ident tail:(_ "," _ Ident)*
    { return [head].concat(tail.map(x => x[3])); }

Instr
  = SetLocalStmt
  / SetGlobalInFunStmt
  / IfRetStmt
  / ICallExpr

SetLocalStmt
  = "set" __ name:Ident _ "=" _ value:Expr _ ";" _
    { return { kind:"setLocal", name, value }; }

SetGlobalInFunStmt
  = "setGlobal" __ name:Ident _ "=" _ value:Expr _ ";" _
    { return { kind:"setGlobal", name, value }; }

// ifRet: "if ... ret ...;"
IfRetStmt
  = "if" _ cond:Expr _ "ret" _ value:Expr _ ";" _
    { return { kind:"ifRet", if: cond, then: value }; }

ReturnStmt
  = "ret" _ value:Expr _ ";" _
    { return value; }

// ------------------------------------------------------------
// Expr recursive + parenthèses + précédence
// ------------------------------------------------------------
Expr = OrExpr

OrExpr
  = head:AndExpr tail:(_ "||" _ AndExpr)*
    {
      return tail.reduce((acc, t) => ({ type:"call", op:"||", args:[acc, t[3]] }), head);
    }

AndExpr
  = head:EqExpr tail:(_ "&&" _ EqExpr)*
    {
      return tail.reduce((acc, t) => ({ type:"call", op:"&&", args:[acc, t[3]] }), head);
    }

EqExpr
  = head:RelExpr tail:(_ op:("==" / "!=") _ RelExpr)*
    {
      return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head);
    }

RelExpr
  = head:AddExpr tail:(_ op:("<=" / ">=" / "<" / ">") _ AddExpr)*
    {
      return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head);
    }

AddExpr
  = head:MulExpr tail:(_ op:("+" / "-") _ MulExpr)*
    {
      return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head);
    }

MulExpr
  = head:UnaryExpr tail:(_ op:("*" / "/") _ UnaryExpr)*
    {
      return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head);
    }

UnaryExpr
  = "-" _ e:UnaryExpr { return { type:"call", op:"-", args:[lit(0), e] }; }
  / "+" _ e:UnaryExpr { return e; }
  / PrimaryExpr

PrimaryExpr
  = "(" _ e:Expr _ ")" { return e; }
  / LambdaExpr
  / CallNested
  / Atom


// Lambdas non-capturantes:
// - lambda(params) => Expr
// - lambda(params) { Instr* ret Expr; }

LambdaExpr
  = "$" _ "(" _ params:ParamList? _ ")" _ tail:(
        "=>" _ body:Expr
          { return { type:"lambda", params: params ?? [], body }; }

      / "{" _ code:Instr* ret:ReturnStmt _ "}"
          { return { type:"lambdaBlock", params: params ?? [], code, ret }; }
    )
    { return tail; }

// Appels imbriqués: op(expr, expr, ...)
CallNested
  = op:CallOp _ "(" _ args:ExprList? _ ")"
    { return { type:"call", op, args: args ?? [] }; }

ICallExpr
  = "call" _ op:CallOp _ "(" _ args:ExprList? _ ")" _ ";" _
    { return { kind:"call", op, args: args ?? [] }; }

ExprList
  = head:Expr tail:(_ "," _ Expr)*
    { return [head].concat(tail.map(x => x[3])); }

CallOp
  = o:Operator { return o; }
  / id:Ident   { return { type:"var", name: id }; }

Atom
  = Literal
  / VarRef

VarRef
  = name:Ident { return { type:"var", name }; }

// --- Literals ---
Literal
  = BooleanLit
  / NumberLit
  / StringLit

BooleanLit
  = "true"  { return { type:"literal", value:true }; }
  / "false" { return { type:"literal", value:false }; }

NumberLit
  = t:$("-"? [0-9]+ ("." [0-9]+)?) { return { type:"literal", value: parseFloat(t) }; }

StringLit
  = "\"" chars:StrChar* "\"" { return { type:"literal", value: chars.join("") }; }

StrChar
  = "\\\"" { return "\""; }
  / "\\\\" { return "\\"; }
  / "\\n"  { return "\n"; }
  / "\\r"  { return "\r"; }
  / "\\t"  { return "\t"; }
  / !("\"") c:. { return c; }

// --- Tokens ---
Ident
  = $([A-Za-z_$][A-Za-z0-9_$]*)

Operator
  = $("==" / "!=" / "<=" / ">=" / "&&" / "||" / "+" / "-" / "*" / "/" / "<" / ">")

// --- Spacing & comments ---
_
  = (WS / Comment)*

__
  = (WS / Comment)+

WS
  = [ \t\r\n]+

Comment
  = LineComment
  / BlockComment

LineComment
  = "//" (![\\n\\r] .)*

BlockComment
  = "/*" (!"*/" .)* "*/"
