import { Arg, Call, Cell, Expr, Fun, PartialCall, Prog } from "./luxlang-model"
export interface TypeContexte {
    globals: Type[], locals: Type[]
}


export interface TypeFun {
    type: 'fun'
    code: Fun
}
export interface TypePartialCall {
    type: 'partialCall'
    code: Fun
    args: Type[]
}
export interface TypeGen {
    type: 'typeGen'
    name: string
    args: Type[]
}
export interface TypeAny {
    type: 'any'
}
export interface TypePrimitif {
    type: 'null' | "string" | "number" | "boolean"
}
export interface TypeRef {
    type: 'ref'
    name: string
}
export interface TypeConst {
    type: 'typeConst'
    value: number | string | boolean
}
export interface TypeUnion {
    type: 'typeUnion'
    args: Type[]
}
export interface TypeMeta {
    type: 'typeMeta'
    value: TypeBase
}

export type TypeBase = TypeGen | TypeRef | TypeConst | TypeUnion | TypePartialCall | TypeFun | TypeAny | TypePrimitif
export type Type = TypeBase | TypeMeta
export interface TypeError {
    type: 'error'
}
export function listTypeUnion(type: Type): Type[] {

    const r: Type[] = []
    if (type.type === "typeUnion") {
        for (const t of type.args) {

            r.push(...listTypeUnion(t))

        }
    } else {
        r.push(type)
    }
    return r

}

export abstract class TypeChecker {
    prog: Prog
    currentFun: Set<Fun> = new Set()

    constructor(prog: Prog) {
        this.prog = prog
    }
    computeType(args: Type[]): Type | TypeError {
        const globals: Type[] = this.prog.map((f) => {
            return { type: "fun", code: f }
        })
        return this.computeReturnTypeFun(globals, this.prog[this.prog.length - 1], args)

    }
    computeReturnTypeFun(globals: Type[], f: Fun, args: Type[]): Type | TypeError {
        if (f.numArg !== args.length) {
            return { type: 'error' }
        }
        if (this.currentFun.has(f)) {
            return { type: "typeUnion", args: [] }
        }
        this.currentFun.add(f)
        const r = this.computeReturnTypeFunRec({ globals: globals, locals: [...args] }, f, 0)
        this.currentFun.delete(f)
        return r
    }
    computeReturnTypeFunRec(context: TypeContexte, f: Fun, i: number): Type | TypeError {

        if (i === f.code.length) {
            return this.computeTypeForExpr(context, f.ret)
        }
        const tmpI = f.code[i]
        if (tmpI.type === "setGlobal" || tmpI.type === "setLocal") {
            const tmpType = this.computeTypeForExpr(context, tmpI.value)
            if (tmpType.type === "error") {
                return tmpType
            }
            if (tmpType.type === "typeUnion") {
                const rs: TypeUnion = { type: "typeUnion", args: [] }
                for (const t of listTypeUnion(tmpType)) {
                    const newContext: TypeContexte = { globals: [...context.globals], locals: [...context.locals] }
                    if (tmpI.type === "setGlobal") {
                        newContext.globals[tmpI.var] = t
                    } else {
                        newContext.locals[tmpI.var] = t
                    }
                    const tmpTypeBis = this.computeReturnTypeFunRec(newContext, f, i + 1)
                    if (tmpTypeBis.type === "error") {
                        return tmpTypeBis
                    }
                    rs.args.push(...listTypeUnion(tmpTypeBis))

                }
                return rs;
            }
            if (tmpI.type === "setGlobal") {
                context.globals[tmpI.var] = tmpType
            } else {
                context.locals[tmpI.var] = tmpType
            }
            return this.computeReturnTypeFunRec(context, f, i + 1)
        }
        if (tmpI.type === "ifRet") {
            const tmpType = this.computeTypeForExpr(context, tmpI.if)
            if (tmpType.type === "error") {
                return tmpType
            }
            if (tmpType.type === "typeConst") {
                if (tmpType.value !== false && tmpType.value !== 0) {
                    return this.computeTypeForExpr(context, tmpI.then)
                }
            }
            if (tmpType.type === "boolean" || tmpType.type === "number") {
                const thenType = this.computeTypeForExpr(context, tmpI.then)
                if (thenType.type === "error") {
                    return thenType
                }
                const retType = this.computeReturnTypeFunRec(context, f, i + 1)
                if (retType.type === "error") {
                    return retType
                }
                return { type: "typeUnion", args: [...listTypeUnion(thenType), ...listTypeUnion(retType)] }
            }
            if (tmpType.type === "null") {
                return this.computeReturnTypeFunRec(context, f, i + 1)
            }
        }
        if (tmpI.type === "call") {
            this.computeTypeForCall(context, tmpI)
            return this.computeReturnTypeFunRec(context, f, i + 1)
        }


        return { type: 'error' }
    }
    computeTypeForArg(context: TypeContexte, a: Arg): Type | TypeError {
        if (a.type === "extern") {
            return { type: "ref", name: a.name }
        }
        if (a.type === "global") {
            return context.globals[a.idx] ?? { type: "error" }
        }
        if (a.type === "local") {
            return context.locals[a.idx] ?? { type: "error" }
        }
        if (a.type === "literal")
            return { type: "typeConst", value: a.value }
        return { type: "error" }
    }
    getTypeForCell(context: TypeContexte, cell: Cell): Type | TypeError {
        let tmpType = cell.type === "global" ? context.globals[cell.idx] : context.locals[cell.idx]

        if (!tmpType) {
            return { type: 'error' }
        }
        return tmpType

    }
    computeTypeForCall(context: TypeContexte, expr: Call): Type | TypeError {
        const args: Type[] = []
        for (const e of expr.args) {
            const tmpType = this.computeTypeForArg(context, e)
            if (tmpType.type === "error") {
                return tmpType
            }
            args.push(tmpType)
        }
        if (typeof expr.op === "string") {

            return this.computeReturnRefCall(context, expr.op, args);
        }
        const tmpType = this.getTypeForCell(context, expr.op)
        if (tmpType.type === "typeGen") {
            return this.computeReturnTypeGen(context, tmpType, args)
        }
        if (tmpType.type === "fun") {
            return this.computeReturnTypeFun(context.globals, tmpType.code, args)
        }
        if (tmpType.type === "partialCall") {
            return this.computeReturnTypeFun(context.globals, tmpType.code, [...tmpType.args, ...args])
        }
        return { type: 'error' }
    }

    computeTypeForPartialCall(context: TypeContexte, expr: PartialCall): Type | TypeError {
        const args: Type[] = []
        for (const e of expr.args) {
            const tmpType = this.computeTypeForArg(context, e)
            if (tmpType.type === "error") {
                return tmpType
            }
            args.push(tmpType)
        }
        const tmpType = this.getTypeForCell(context, expr.op)
        if (tmpType.type === "error") {
            return tmpType
        }
        if (tmpType.type === "partialCall") {
            return { type: "partialCall", code: tmpType.code, args: [...tmpType.args, ...args] }
        }
        if (tmpType.type === "fun") {
            return { type: "partialCall", code: tmpType.code, args: args }
        }
        return { type: 'error' }
    }
    computeTypeForExpr(context: TypeContexte, expr: Expr): Type | TypeError {
        if (expr.type === "extern") {
            return { type: "ref", name: expr.name }
        }
        if (expr.type === "call") {
            return this.computeTypeForCall(context, expr)
        }
        if (expr.type === "partialCall") {
            return this.computeTypeForPartialCall(context, expr)
        }
        if (expr.type === "global") {
            return this.getTypeForCell(context, expr)
        }
        if (expr.type === "local") {
            return this.getTypeForCell(context, expr)
        }
        if (expr.type === "literal") {
            return { type: 'typeConst', value: expr.value }
        }

        return { type: 'error' }
    }
    abstract computeReturnTypeGen(context: TypeContexte, f: TypeGen, args: Type[]): Type | TypeError
    abstract computeReturnRefCall(context: TypeContexte, ref: string, args: Type[]): Type | TypeError
}