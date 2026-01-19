{
  // Helpers purement syntaxiques (construction AST)
  function v(name) { return { type: "var", name }; }
  function lit(value) { return { type: "literal", value }; }
}

Start
  = _ p:Program _ { return p; }

Program
  = s:Statement* { return s; }

Statement
  = ICallExpr
  / SetGlobalStmt
  / FunDef

SetGlobalStmt
  = "setGlobal" __ name:Ident _ "=" _ value:Expr _ ";" _
    { return { kind:"setGlobal", name, value }; }

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
// Expr recursive + parenthèses + précédence (syntaxe only)
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
// Lambdas (expr + bloc) : purement syntaxe
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
  = "//" (![ \n\r ] .)*

BlockComment
  = "/*" (!"*/" .)* "*/"
