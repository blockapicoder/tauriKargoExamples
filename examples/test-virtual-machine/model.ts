export interface Global { type: 'global', idx: number }
export interface Local { type: 'local', idx: number }
export type Var = Local | Global
export type Literal = { type: "literal", value: number | string | boolean }
export interface Call<Var> {
    type: "call",
    op: Var | string
    args: (Var | Literal)[]
}
export type Expr<Var> = Var | Call<Var> | Literal

export interface IfRet { type: 'ifRet', if: Expr<Var>, then: Expr<Var> }
export interface Ret { type: 'ret', value: Expr<Var> }
export interface Set { type: 'setLocal' | 'setGlobal', var: number, value: Expr<Var> }
export interface SetGlobal { type: 'setGlobal', var: number, value: Expr<Global> }
export interface Fun extends Code { var: number }
export type Prog = (SetGlobal | Fun | Call<Global>)[]
export interface Code { type: "fun", code: (Set | IfRet | Call<Var>)[], ret: Expr<Var> }






export type Cell = (Code | Literal)
export function generateFun(fun: Fun) {

    return `globals[${fun.var}] = function (...locals) {
        ${fun.code.map((i)=> generateInstrFun(i)).join("\n")};\n
        return ${generateExpr(fun.ret)}
    }`



}
export function generateVar(v: Var | Literal) {
    if (v.type === "global") {
        return `globals[${v.idx}]`
    }
    if (v.type === "local") {
        return `locals[${v.idx}]`
    }
    return JSON.stringify(v.value)

}
export function generateExpr(v: Expr<Var>) {
    if (v.type === "call") {
        return generateCall(v)
    }
    return generateVar(v)
}
export function generateInstrFun(i: Set | IfRet | Call<Var>) {
    if (i.type === "call") {
        return generateCall(i)
    }
    if (i.type === "setGlobal") {
        return `globals[${i.var}]=${generateExpr(i.value)}`
    }
    if (i.type === "setLocal") {
        return `locals[${i.var}]=${generateExpr(i.value)}`
    }
    if (i.type==="ifRet") {
        return `if (${generateExpr(i.if)}) { return ${generateExpr(i.then)} }`
    }

}
export function generateInstr(i: SetGlobal | Fun | Call<Global>) {
    if (i.type === "call") {
        return generateCall(i)
    }
    if (i.type === "setGlobal") {
        return `globals[${i.var}]=${generateExpr(i.value)}`
    }
    if (i.type ==="fun") {
        return generateFun(i)
    }
  

}
export function generateCall(i: Call<Var>) {
    if (typeof i.op === "string") {
        if (["+", "*", "-", "/", "==",">","===","<",">=","<=","!=","&&","!="].includes(i.op)) {
            if (i.args.length === 2) {
                return `${generateVar(i.args[0])}${i.op}${generateVar(i.args[1])}`
            }
        }
        return `prims[${JSON.stringify(i.op)}](${i.args.map((e) => generateVar(e)).join(",")})`
    }
    return `${generateVar(i.op)}(${i.args.map((e) => generateVar(e)).join(",")})`

}
export function generateProg(prog: Prog) {
    return ` ( prims ) => { let globals= []; \n ${prog.map( (i)=> generateInstr(i)).join("\n")}; \n return globals  }`
}



export class Machine {
    globals: Cell[] = []
    constructor() {

    }
    run(prog: Prog) {
        for (const e of prog) {
            if (e.type === "fun") {
                this.globals[e.var] = e
            }
            if (e.type === "setGlobal") {
                this.globals[e.var] = this.execExpr(e.value, [])
            }
            if (e.type === "call") {
                this.execExpr(e, [])
            }

        }

    }
    createCell(value: any): Cell {
        return {
            type: 'literal',
            value: value
        }
    }
    prim(name: string, args: Cell[]): Cell {
        if (name === "print") {
            console.log(JSON.stringify(args))
            return { type: "literal", value: 0 }
        }

        if (args.length === 2) {

            const a = args[0]
            const b = args[1]
            if (a.type === "literal" && b.type === "literal") {
                const va = a.value
                const vb = b.value
                if (typeof va === "number" && typeof vb === "number") {
                    if (name === "+") {
                        return this.createCell(va + vb)
                    }
                    if (name === "*") {
                        return this.createCell(va * vb)
                    }
                    if (name === "-") {
                        return this.createCell(va - vb)
                    }
                    if (name === "/") {
                        return this.createCell(va / vb)
                    }
                    if (name === "==") {
                        return this.createCell(va === vb)
                    }
                }

            }
        }
        throw new Error(" prim error")

    }
    getCell(a: Var | Literal, locals: Cell[]): Cell {
        if (a.type === "global") {
            return this.globals[a.idx]
        }
        if (a.type === "local") {
            return locals[a.idx]
        }
        return { type: "literal", value: a.value }
    }
    execCall(op: Var | string, args: (Var | Literal)[], locals: Cell[]): Cell {
        const cells = args.map((a) => {
            const r = this.getCell(a, locals)
            if (!r) {
                throw new Error("no cell")
            }
            return r;

        })
        if (typeof op === "string") {

            return this.prim(op, cells)
        }
        const cell = this.getCell(op, locals)
        if (cell.type === "fun") {
            return this.execCode(cell, cells)
        }
        throw new Error("not fun")


    }
    isTrue(cell: Cell) {
        if (cell) {
            if (cell.type === "literal") {
                if (cell.value === false) {
                    return false
                }
            }
            return true
        }
        return false
    }
    execExpr<V extends Local | Global>(expr: Expr<V>, locals: Cell[]): Cell {
        if (expr.type === "call") {
            return this.execCall(expr.op, expr.args, locals)
        }
        return this.getCell(expr, locals)

    }
    execCode(code: Code, args: Cell[]): Cell {

        for (let idx = 0; idx < code.code.length; idx++) {
            const i = code.code[idx]
            if (i.type === "setLocal") {
                args[i.var] = this.execExpr(i.value, args)
            }
            if (i.type === "setGlobal") {
                this.globals[i.var] = this.execExpr(i.value, args)
            }
            if (i.type === "call") {
                this.execExpr(i, args)
            }
            if (i.type === "ifRet") {
                const cell = this.execExpr(i.if, args)
                if (this.isTrue(cell)) {
                    return this.execExpr(i.then, args)
                }

            }

        }
        return this.execExpr(code.ret, args)

    }
}


