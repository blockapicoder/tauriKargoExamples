{
  function v(name) { return { type: "var", name }; }
  function lit(value) { return { type: "literal", value }; }

  // ------------------------------------------------------------
  // Lowering: Expr imbriquées -> Expr "graphe" (Call.args = Atom[])
  // ------------------------------------------------------------
  function lowerProgram(namedProg) {
    let tempId = 0;
    const freshTemp = () => `$t${++tempId}`;

    function mkTempSet(ctx, name, value) {
      // Top-level: temporaires en setGlobal ; dans fun: temporaires en setLocal
      return (ctx.scope === "global")
        ? { kind: "setGlobal", name, value }
        : { kind: "setLocal", name, value };
    }

    function isAtom(e) {
      return e && (e.type === "literal" || e.type === "var");
    }

    // lowerExpr(ctx, expr, wantAtom) -> { prelude: Instr[], expr: Expr }
    // - wantAtom=true  => renvoie var/literal ; crée un temp si expr est un call
    // - wantAtom=false => renvoie expr (var/lit/call) mais call.args seront des atomes
    function lowerExpr(ctx, expr, wantAtom) {
      if (!expr) throw new Error("lowerExpr: empty expr");
      if (expr.type === "literal" || expr.type === "var") {
        return { prelude: [], expr };
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

      throw new Error("Unknown expr node (expected literal/var/call): " + JSON.stringify(expr));
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
        // NOTE: on "hoiste" les temporaires de then avant le test.
        // Cela suppose que les Expr sont pures (pas d'effets). Si tu veux préserver
        // strictement l'évaluation conditionnelle pour des Expr à effets, il faut
        // une transformation plus lourde (helper fun/thunk).
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
      const ctx = { scope: "local" };
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
        const ctx = { scope: "global" };
        const r = lowerExpr(ctx, st.value, false);
        out.push(...r.prelude);
        out.push({ ...st, value: r.expr });
        continue;
      }
      if (st.kind === "call") {
        const ctx = { scope: "global" };
        out.push(...lowerCallStmt(ctx, st));
        continue;
      }
      throw new Error("Unknown statement kind: " + JSON.stringify(st));
    }
    return out;
  }

  // ------------------------------------------------------------
  // Name resolution (inchangé, mais appliqué après lowering)
  // ------------------------------------------------------------
  function resolveProgram(namedProg0) {
    // 1) on "lower" d'abord pour obtenir un graphe (Call.args = Atom[])
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

// Fun syntax conservée telle que dans ton fichier (signature terminée par ';')
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

// ifRet: on garde tes mots-clés ("if ... ret ...;")
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
  / CallNested
  / Atom

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
