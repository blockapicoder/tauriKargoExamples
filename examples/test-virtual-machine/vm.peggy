{
  function v(name) { return { type: "var", name }; }
  function lit(value) { return { type: "literal", value }; }

  // ------------------------------------------------------------
  // CONFIG: liste des primitives autorisées (sinon erreur)
  // Ajoute/retire ici selon ton PRIMS runtime.
  // ------------------------------------------------------------
  const KNOWN_PRIMS = new Set([
    "cr","print","clear","cur","deferredCall",
    "array","map","filter","concat",
    "+","-","*","/","==","===","!=","<",">","<=",">=","&&","||"
  ]);

  // ------------------------------------------------------------
  // Lowering: Expr imbriquées -> Expr "graphe" (Call.args = Atom[])
  // + Hoisting des lambdas (expr + bloc) en fun globales
  // + Capture via PartialCall
  // ------------------------------------------------------------
  function lowerProgram(namedProg) {
    let tempId = 0;
    const freshTemp = () => `$t${++tempId}`;

    let lambdaId = 0;
    const freshLambda = () => `$lambda${++lambdaId}`;
    const hoistedFuns = [];

    function mkTempSet(ctx, name, value) {
      return (ctx.scope === "global")
        ? { kind: "setGlobal", name, value }
        : { kind: "setLocal", name, value };
    }

    function isAtom(e) {
      return e && (e.type === "literal" || e.type === "var");
    }

    // ----------------------------------------------------------
    // Collecte des variables utilisées (ordre stable) pour capture
    // IMPORTANT: ne pas descendre dans les lambdas imbriquées
    // ----------------------------------------------------------
    function collectVarRefsOrderedExpr(expr, outArr, seen) {
      if (!expr) return;

      if (expr.type === "var") {
        if (!seen.has(expr.name)) { seen.add(expr.name); outArr.push(expr.name); }
        return;
      }
      if (expr.type === "literal") return;

      if (expr.type === "call") {
        if (expr.op && typeof expr.op === "object" && expr.op.type === "var") {
          const n = expr.op.name;
          if (!seen.has(n)) { seen.add(n); outArr.push(n); }
        }
        for (const a of (expr.args ?? [])) collectVarRefsOrderedExpr(a, outArr, seen);
        return;
      }

      if (expr.type === "partialCall") {
        if (expr.op && expr.op.type === "var") {
          const n = expr.op.name;
          if (!seen.has(n)) { seen.add(n); outArr.push(n); }
        }
        for (const a of (expr.args ?? [])) collectVarRefsOrderedExpr(a, outArr, seen);
        return;
      }

      if (expr.type === "lambda" || expr.type === "lambdaBlock") return;

      throw new Error("collectVarRefsOrderedExpr: unknown expr " + JSON.stringify(expr));
    }

    function collectVarRefsOrderedInstr(ins, outArr, seen) {
      if (ins.kind === "setLocal" || ins.kind === "setGlobal") {
        collectVarRefsOrderedExpr(ins.value, outArr, seen);
        return;
      }
      if (ins.kind === "ifRet") {
        collectVarRefsOrderedExpr(ins.if, outArr, seen);
        collectVarRefsOrderedExpr(ins.then, outArr, seen);
        return;
      }
      if (ins.kind === "call") {
        if (ins.op && typeof ins.op === "object" && ins.op.type === "var") {
          const n = ins.op.name;
          if (!seen.has(n)) { seen.add(n); outArr.push(n); }
        }
        for (const a of (ins.args ?? [])) collectVarRefsOrderedExpr(a, outArr, seen);
        return;
      }
      throw new Error("collectVarRefsOrderedInstr: unknown instruction " + JSON.stringify(ins));
    }

    // ----------------------------------------------------------
    // Lowering
    // ----------------------------------------------------------
    function lowerExpr(ctx, expr, wantAtom) {
      if (!expr) throw new Error("lowerExpr: empty expr");

      if (expr.type === "literal" || expr.type === "var") {
        return { prelude: [], expr };
      }

      if (expr.type === "lambda" || expr.type === "lambdaBlock") {
        const params = expr.params ?? [];
        const code = (expr.type === "lambdaBlock") ? (expr.code ?? []) : [];
        const retExpr = (expr.type === "lambdaBlock") ? expr.ret : expr.body;

        const lambdaLocals = new Set(params);
        if (expr.type === "lambdaBlock") {
          for (const ins of code) if (ins.kind === "setLocal") lambdaLocals.add(ins.name);
        }

        const used = [];
        const seen = new Set();
        for (const ins of code) collectVarRefsOrderedInstr(ins, used, seen);
        collectVarRefsOrderedExpr(retExpr, used, seen);

        const outerLocals = ctx.locals ? new Set(ctx.locals) : new Set();
        const captures = used.filter(n => outerLocals.has(n) && !lambdaLocals.has(n));

        const fname = freshLambda();
        const funStmt = {
          kind: "fun",
          name: fname,
          params: [...captures, ...params],
          code,
          ret: retExpr
        };
        hoistedFuns.push(lowerFun(funStmt));

        let produced;
        if (captures.length === 0) {
          produced = v(fname);
        } else {
          produced = {
            type: "partialCall",
            op: v(fname),
            args: captures.map(n => v(n))
          };
        }

        if (!wantAtom || isAtom(produced)) return { prelude: [], expr: produced };

        const t = freshTemp();
        return { prelude: [mkTempSet(ctx, t, produced)], expr: v(t) };
      }

      if (expr.type === "call") {
        const prelude = [];
        const atoms = [];

        for (const a of (expr.args ?? [])) {
          const r = lowerExpr(ctx, a, true);
          prelude.push(...r.prelude);
          if (!isAtom(r.expr)) throw new Error("Expected atom after lowering arg");
          atoms.push(r.expr);
        }

        const callFlat = { type: "call", op: expr.op, args: atoms };

        if (!wantAtom) return { prelude, expr: callFlat };

        const t = freshTemp();
        prelude.push(mkTempSet(ctx, t, callFlat));
        return { prelude, expr: v(t) };
      }

      if (expr.type === "partialCall") {
        const prelude = [];
        const atoms = [];

        for (const a of (expr.args ?? [])) {
          const r = lowerExpr(ctx, a, true);
          prelude.push(...r.prelude);
          if (!isAtom(r.expr)) throw new Error("Expected atom after lowering partialCall arg");
          atoms.push(r.expr);
        }

        const op = expr.op;
        if (!op || op.type !== "var") throw new Error("partialCall.op must be var at this stage");

        const pcFlat = { type: "partialCall", op, args: atoms };

        if (!wantAtom) return { prelude, expr: pcFlat };

        const t = freshTemp();
        prelude.push(mkTempSet(ctx, t, pcFlat));
        return { prelude, expr: v(t) };
      }

      throw new Error("Unknown expr node (expected literal/var/call/lambda/lambdaBlock/partialCall): " + JSON.stringify(expr));
    }

    function lowerCallStmt(ctx, st) {
      const prelude = [];
      const atoms = [];
      for (const a of (st.args ?? [])) {
        const r = lowerExpr(ctx, a, true);
        prelude.push(...r.prelude);
        if (!isAtom(r.expr)) throw new Error("Expected atom after lowering call-stmt arg");
        atoms.push(r.expr);
      }
      return [...prelude, { kind: "call", op: st.op, args: atoms }];
    }

    function lowerInstr(ctx, ins) {
      if (ins.kind === "setLocal" || ins.kind === "setGlobal") {
        const r = lowerExpr(ctx, ins.value, false);
        return [...r.prelude, { ...ins, value: r.expr }];
      }

      if (ins.kind === "ifRet") {
        const rc = lowerExpr(ctx, ins.if, false);
        const rt = lowerExpr(ctx, ins.then, false);
        return [...rc.prelude, ...rt.prelude, { kind: "ifRet", if: rc.expr, then: rt.expr }];
      }

      if (ins.kind === "call") return lowerCallStmt(ctx, ins);

      throw new Error("Unknown instruction kind: " + JSON.stringify(ins));
    }

    function lowerFun(st) {
      const localNames = new Set(st.params);
      for (const ins of st.code) if (ins.kind === "setLocal") localNames.add(ins.name);

      const ctx = { scope: "local", locals: localNames };

      let code = [];
      for (const ins of st.code) code.push(...lowerInstr(ctx, ins));

      const rr = lowerExpr(ctx, st.ret, false);
      code.push(...rr.prelude);

      return { ...st, code, ret: rr.expr };
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

    return [...hoistedFuns, ...out];
  }

  // ------------------------------------------------------------
  // Name resolution (appliqué après lowering)
  // + support partialCall
  // + ERREUR si ident inconnu (ni local, ni global déclaré, ni primitive connue)
  // ------------------------------------------------------------
  function resolveProgram(namedProg0) {
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
        if (globalDeclared.has(a.name)) return { type: "global", idx: ensureGlobal(a.name) };
        // si ce n'est pas une globale déclarée, c'est une erreur (variable non définie)
        throw new Error(`Undefined variable: '${a.name}'`);
      }
      throw new Error("Invalid atom: " + JSON.stringify(a));
    }

    function resolveVarOnly(a, locals) {
      const r = resolveAtom(a, locals);
      if (r.type === "literal") throw new Error("Expected var, got literal: " + JSON.stringify(a));
      return r;
    }

    function resolveOp(op, locals) {
      if (typeof op === "string") return op;

      if (!op || op.type !== "var") throw new Error("Invalid op: " + JSON.stringify(op));
      const name = op.name;

      if (locals && locals.has(name)) return { type: "local", idx: locals.get(name) };
      if (globalDeclared.has(name)) return { type: "global", idx: ensureGlobal(name) };

      // sinon, on autorise uniquement les primitives connues ; sinon erreur
      if (KNOWN_PRIMS.has(name)) return name;

      throw new Error(`Undefined function/operator: '${name}' (not a local/global and not a known primitive)`);
    }

    function resolveExpr(e, locals) {
      if (e.type === "literal") return e;

      if (e.type === "var") {
        if (locals && locals.has(e.name)) return { type: "local", idx: locals.get(e.name) };
        if (globalDeclared.has(e.name)) return { type: "global", idx: ensureGlobal(e.name) };
        throw new Error(`Undefined variable: '${e.name}'`);
      }

      if (e.type === "call") {
        return {
          type: "call",
          op: resolveOp(e.op, locals),
          args: e.args.map(a => resolveAtom(a, locals)),
        };
      }

      if (e.type === "partialCall") {
        return {
          type: "partialCall",
          op: resolveVarOnly(e.op, locals),
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
        returnErrorIfBadTopCallOp(st.op);
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

    function returnErrorIfBadTopCallOp(op) {
      // no-op: juste pour garder la structure si tu veux des checks spécifiques
      return op;
    }
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
    { return tail.reduce((acc, t) => ({ type:"call", op:"||", args:[acc, t[3]] }), head); }

AndExpr
  = head:EqExpr tail:(_ "&&" _ EqExpr)*
    { return tail.reduce((acc, t) => ({ type:"call", op:"&&", args:[acc, t[3]] }), head); }

EqExpr
  = head:RelExpr tail:(_ op:("==" / "!=") _ RelExpr)*
    { return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head); }

RelExpr
  = head:AddExpr tail:(_ op:("<=" / ">=" / "<" / ">") _ AddExpr)*
    { return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head); }

AddExpr
  = head:MulExpr tail:(_ op:("+" / "-") _ MulExpr)*
    { return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head); }

MulExpr
  = head:UnaryExpr tail:(_ op:("*" / "/") _ UnaryExpr)*
    { return tail.reduce((acc, t) => ({ type:"call", op:t[1], args:[acc, t[3]] }), head); }

UnaryExpr
  = "-" _ e:UnaryExpr { return { type:"call", op:"-", args:[lit(0), e] }; }
  / "+" _ e:UnaryExpr { return e; }
  / PrimaryExpr

PrimaryExpr
  = "(" _ e:Expr _ ")" { return e; }
  / LambdaExpr
  / CallNested
  / Atom

// ------------------------------------------------------------
// Lambdas (expr + bloc) avec capture -> partialCall
// Syntaxe:
//   $(x,y) => expr
//   $(x,y) { ... ret expr; }
// ------------------------------------------------------------
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
