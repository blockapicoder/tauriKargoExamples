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



