{
  /*
    AST "nommé" (intermédiaire)
      VarRef:   { type:"var", name }
      Literal:  { type:"literal", value }
      Call:     { type:"call", op: string | VarRef, args: Atom[] }
      If:       { type:"ifThenElse", if: Expr, then: Expr, else: Expr }

    Résolution finale (cible VM)
      Global: { type:"global", idx }
      Local:  { type:"local", idx }
      Call.op: Var | string
      Call.args: (Var | Literal)[]
  */

  function v(name) { return { type: "var", name }; }
  function lit(value) { return { type: "literal", value }; }

  // ---- Name resolution ----
  function resolveProgram(namedProg) {
    // globals "définis" (setGlobal / fun / setGlobal dans fun) => sert au choix op var vs string
    const globalDeclared = new Set();

    // indices globaux effectifs (inclut aussi les globals référencés)
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

    // Pass 0: déclarer les globals "définis" dans l'ordre d'apparition
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
      if (typeof op === "string") return op; // opérateur/primitive => string
      if (!op || op.type !== "var") throw new Error("Invalid op: " + JSON.stringify(op));
      const name = op.name;

      // local défini => Var
      if (locals && locals.has(name)) return { type: "local", idx: locals.get(name) };

      // global "défini" (setGlobal/fun) => Var
      if (globalDeclared.has(name)) return { type: "global", idx: ensureGlobal(name) };

      // sinon: garder le nom (primitive) => string
      return name;
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

    // Pass 1: produire le Prog cible
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
        out.push( {
          type: "call",
          op: resolveOp(st.op, null),
          args: st.args.map(a => resolveAtom(a, null)),
        });
          continue;
      }

      if (st.kind === "fun") {
        // locals: params puis set(...) (setLocal) dans l'ordre
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
  = 
  ICallExpr
  / SetGlobalStmt
  / FunDef
  


// --- Top-level setGlobal ---
SetGlobalStmt
  = "setGlobal" __ name:Ident _ "=" _ value:Expr _ ";" _
    { return { kind:"setGlobal", name, value }; }

// --- Fun definition ---
FunDef
  = "fun" __ name:Ident _ "(" _ params:ParamList? _ ")"  _";"_ 
      code:Instr* ret:ReturnStmt
   _
    {
      return { kind:"fun", name, params: params ?? [], code, ret };
    }

ParamList
  = head:Ident tail:(_ "," _ Ident)*
    { return [head].concat(tail.map(x => x[3])); }

// --- Instructions in fun ---
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
  =   "if" _ cond:Expr _ "ret" _ value:Expr _ ";" _
    { return { kind:"ifRet", if: cond, then: value }; }

ReturnStmt
  = "ret" _ value:Expr _ ";" _
    { return value; }





// Expr is NOT recursive by design (no E op E), only:
// - Infix: Atom OP Atom
// - Call:  op(Atom,...)
// - Atom:  Var | Literal
Expr
  = InfixExpr
  / CallExpr
  / Atom

InfixExpr
  = a:Atom _ op:Operator _ b:Atom
    { return { type:"call", op, args:[a,b] }; }

CallExpr
  = op:CallOp _ "(" _ args:ArgList? _ ")"
    { return { type:"call", op, args: args ?? [] }; }
ICallExpr
  ="call" _ op:CallOp _ "(" _ args:ArgList? _ ")" _ ";" _
    { return { kind:"call", op, args: args ?? [] }; }
CallOp
  = o:Operator { return o; }
  / id:Ident   { return { type:"var", name: id }; }

ArgList
  = head:Atom tail:(_ "," _ Atom)*
    { return [head].concat(tail.map(x => x[3])); }

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
  = $([A-Za-z_][A-Za-z0-9_]*)

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
