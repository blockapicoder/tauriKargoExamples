export interface Global { type: 'global', idx: number }
export interface Local { type: 'local', idx: number }
export type Var = Local | Global
export type Literal = { type: "literal", value: number | string | boolean }
export interface Call<V> {
    type: "call",
    op: V | string
    args: (V | Literal)[]
}
export interface PartialCall<V> {
    type: 'partialCall'
    op: V,
    args: (V | Literal)[]
}

export type Expr<Var> = Var | Call<Var> | Literal | PartialCall<Var>

export interface IfRet { type: 'ifRet', if: Expr<Var>, then: Expr<Var> }
export interface Ret { type: 'ret', value: Expr<Var> }
export interface SetVar { type: 'setLocal' | 'setGlobal', var: number, value: Expr<Var> }
export interface SetVarGlobal { type: 'setGlobal', var: number, value: Expr<Global> }
export interface Fun extends Code { var: number }
export type Prog = (SetVarGlobal | Fun | Call<Global>)[]
export interface Code { type: "fun", code: (SetVar | IfRet | Call<Var>)[], ret: Expr<Var> }






export type Cell = (Code | Literal)
// Adapte/importe tes types existants
// type Fun, Var, Literal, Expr, Set, IfRet, Call, SetGlobal, Global, Prog, etc.

export class Generator {
    constructor(
        public readonly opts?: {
            // opérateurs infixes supportés (2-aires) : tu peux compléter
            infixOps?: Set<string>;
          
        },
    ) { }

    private infixOps(): Set<string> {
        return (
            this.opts?.infixOps ??
            new Set(["+", "*", "-", "/", "==", "===", ">", "<", ">=", "<=", "!=", "&&", "||"])
        );
    }

    generateFun(fun: Fun): string {
        return `globals[${fun.var}] = function (...locals) {
${fun.code.map((i) => this.generateInstrFun(i)).join("\n")};
return ${this.generateExpr(fun.ret)}
}`;
    }

    generateVar(v: Var | Literal): string {
        if (v.type === "global") {
            return `globals[${v.idx}]`;
        }
        if (v.type === "local") {
            return `locals[${v.idx}]`;
        }
        return JSON.stringify(v.value);
    }

    generateExpr(v: Expr<Var>): string {
        if (v.type === "call") {
            return this.generateCall(v);
        }
        if (v.type === "partialCall") {
            return this.generatePartialCall(v)

        }
        return this.generateVar(v as any);
    }

    generateInstrFun(i: SetVar | IfRet | Call<Var>): string {
        if (i.type === "call") {
            return this.generateCall(i);
        }
        if (i.type === "setGlobal") {
            return `globals[${i.var}]=${this.generateExpr(i.value)}`;
        }
        if (i.type === "setLocal") {
            return `locals[${i.var}]=${this.generateExpr(i.value)}`;
        }
        if (i.type === "ifRet") {
            return `if (${this.generateExpr(i.if)}) { return ${this.generateExpr(i.then)} }`;
        }
        // sécurité (au cas où un nouveau type arrive)
        throw new Error("Unknown fun instruction: " + JSON.stringify(i));
    }

    generateInstr(i: SetVarGlobal | Fun | Call<Global>): string {
        if (i.type === "call") {
            return this.generateCall(i as any);
        }
        if (i.type === "setGlobal") {
            return `globals[${i.var}]=${this.generateExpr(i.value as any)}`;
        }
        if (i.type === "fun") {
            return this.generateFun(i as any);
        }
        throw new Error("Unknown top-level instruction: " + JSON.stringify(i));
    }

    generateCall(i: Call<Var>): string {
        if (typeof i.op === "string") {
            // opérateur infixe 2-aire
            if (this.infixOps().has(i.op) && i.args.length === 2) {
                return `${this.generateVar(i.args[0] as any)}${i.op}${this.generateVar(i.args[1] as any)}`;
            }

            // primitive prims["op"](...)
            return `prims[${JSON.stringify(i.op)}](${i.args.map((e) => this.generateVar(e as any)).join(",")})`;
        }

        // appel indirect: (globals[k] / locals[k])(...)
        return `${this.generateVar(i.op as any)}(${i.args.map((e) => this.generateVar(e as any)).join(",")})`;
    }
    generatePartialCall(i: PartialCall<Var>): string {
       
        // appel indirect: (globals[k] / locals[k])(...)
        return `(...args)=>${this.generateVar(i.op as any)}(...[${i.args.map((e) => this.generateVar(e as any)).join(",")}],...args)`;
    }
    generateProg(prog: Prog): string {
        return `(prims) => {
  let globals = [];
${prog.map((i) => this.generateInstr(i as any)).join("\n")};
  return globals;
}`;
    }
}

export function generateProg(prog: Prog) {
    const gen = new Generator();
    return gen.generateProg(prog)
}



