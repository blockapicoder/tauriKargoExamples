export interface Cell { type: 'global' | 'local', idx: number }
export interface Extern { type: 'extern', name: string }

export type Var = Cell | Extern
export type Arg = Var | Literal
export type Literal = { type: "literal", value: number | string | boolean }
export interface Call {
    type: "call",
    op: Cell | string
    args: Arg[]
}
export interface PartialCall {
    type: 'partialCall'
    op: Cell,
    args: Arg[]
}

export type Expr = Arg | PartialCall | Call

export interface IfRet { type: 'ifRet', if: Expr, then: Expr }

export interface SetVar { type: 'setLocal' | 'setGlobal', var: number, value: Expr }

export interface Fun { code: (SetVar | IfRet | Call)[], ret: Expr   }
export type Prog = (Fun)[]





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

    generateFun(fun: Fun,idx:number): string {
        
        return `globals[${idx}] = function (...locals) {
${fun.code.map((i) => this.generateInstrFun(i)).join("\n")};
return ${this.generateExpr(fun.ret)}
}`;
    }

    generateVar(v: Arg): string {
        if (v.type === "global") {
            return `globals[${v.idx}]`;
        }
        if (v.type === "local") {
            return `locals[${v.idx}]`;
        }
        if (v.type === "extern") {
            return `prims[${JSON.stringify(v.name)}]`
        }
        if (v.type === "literal") { return JSON.stringify(v.value); }
        throw new Error("generateVar")

    }

    generateExpr(v: Expr): string {
        if (v.type === "call") {
            return this.generateCall(v);
        }
        if (v.type === "partialCall") {
            return this.generatePartialCall(v)

        }
        return this.generateVar(v);
    }

    generateInstrFun(i: SetVar | IfRet | Call): string {
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

    generateInstr(f: Fun ,idx:number): string {
      
            return this.generateFun(f,idx);
      
       
    }

    generateCall(i: Call): string {
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
    generatePartialCall(i: PartialCall): string {

        // appel indirect: (globals[k] / locals[k])(...)
        return `(...args)=>${this.generateVar(i.op as any)}(...[${i.args.map((e) => this.generateVar(e as any)).join(",")}],...args)`;
    }
    generateProg(prog: Prog): string {
        const entry = prog.length - 1;
        return `(prims) => {
  let globals = [];
${prog.map((f,i) => this.generateInstr(f,i)).join("\n")};
  return globals[${entry}];
}`;
    }
}

export function generateProg(prog: Prog) {
    const gen = new Generator();
    return gen.generateProg(prog)
}



