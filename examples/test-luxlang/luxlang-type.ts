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
export interface FunSignature {
    idx: number
    values: Map<string, TypeUnion>
}
export interface TypeError {
    type: 'error'
}
export const computeTypeFail = "computeTypeFail"
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
export function removeTypeUnion(t: Type) {
    if (t.type === "typeUnion") {
        if (t.args.length === 1) {
            return removeTypeUnion(t.args[0])
        }
    }
    return t
}
export abstract class TypeChecker {
    prog: Prog
    currentFun: Set<Fun> = new Set()

    listFun: Fun[] = []
    listConst: (string | number | boolean)[] = []
    mapFunSignature: Map<Fun, FunSignature> = new Map()


    constructor(prog: Prog) {
        this.prog = prog
    }
    toBooleanValue( type:TypeConst):boolean {
        if (typeof type.value ==="boolean") {
            return type.value
        }
        if (typeof type.value ==="string") {
            return type.value !== ""
        }
        return type.value !== 0
    }
    toString(type: Type): string {
        if (type.type === "typeConst") {
            let idx = this.listConst.findIndex((v) => v === type.value)
            if (idx < 0) {
                idx = this.listConst.length
                this.listConst.push(type.value)

            }
            return `%${idx}`
        }
        if (type.type === "typeUnion") {
            return type.args.map((t) => this.toString(t)).join("|")
        }
        if (type.type === "typeGen") {
            return `${type.name}(${type.args.map((t) => this.toString(t)).join(",")})`
        }
        if (type.type === "ref") {
            return `#${type.name}`
        }
        if (type.type === "fun") {
            let fs = this.getFunSignature(type.code)
            return `$${fs.idx}`
        }
        if (type.type === "typeMeta") {
            return `{${this.toString(type.value)}}`
        }
        if (type.type === "partialCall") {
            let fs = this.getFunSignature(type.code)
            return `$${fs.idx}(${type.args.map((t) => this.toString(t)).join(",")})`
        }
        return type.type
    }
    computeType(args: Type[]): Type | TypeError {
        const globals: Type[] = this.prog.map((f) => {
            return { type: "fun", code: f }
        })
        return this.computeReturnTypeFun(globals, this.prog[this.prog.length - 1], args)

    }
    getFunSignature(f: Fun): FunSignature {
        let fs = this.mapFunSignature.get(f)
        if (!fs) {
            fs = { idx: this.listFun.length, values: new Map() }
            this.listFun.push(f)
            this.mapFunSignature.set(f, fs)
        }
        return fs
    }
    addFunSignature(f: Fun, keyArgType: string, type: Type) {
        let fs = this.getFunSignature(f)
        let typeUnion = fs.values.get(keyArgType)
        if (typeUnion) {
            const tmp = this.toString(type)
            if (typeUnion.args.map(t => this.toString(t)).includes(tmp)) {

                return typeUnion
            }
            typeUnion.args.push(type)
        } else {
            typeUnion = { type: "typeUnion", args: [type] }
            fs.values.set(keyArgType, typeUnion)

        }
    }
    computeReturnTypeFun(globals: Type[], f: Fun, args: Type[]): Type | TypeError {
        if (f.numArg !== args.length) {
            return { type: 'error' }
        }
        const keyArgType = args.map((t) => this.toString(t)).join(",")
        if (this.currentFun.has(f)) {
            const fs = this.mapFunSignature.get(f)
            //this.currentFun.delete(f)
            if (fs) {
                const r = fs.values.get(keyArgType)
                if (r) {
                    return r
                }
            }

            throw computeTypeFail
        }
        this.currentFun.add(f)
        const r = this.computeReturnTypeFunRec({ globals: globals, locals: [...args] }, f, keyArgType, 0)
        if (!r) {
            this.currentFun.delete(f)
            return { type: "error" }
        }
        let fs = this.getFunSignature(f)
        let typeUnion = fs.values.get(keyArgType)!

        this.currentFun.delete(f)

        return removeTypeUnion(typeUnion)
    }
    computeReturnTypeFunRec(context: TypeContexte, f: Fun, keyArgType: string, i: number): boolean {

        if (i === f.code.length) {
            const tmpType = this.computeTypeForExpr(context, f.ret)
            if (tmpType.type === "error") {
                return false
            }
            this.addFunSignature(f, keyArgType, tmpType)
            return true
        }
        const tmpI = f.code[i]
        if (tmpI.type === "setGlobal" || tmpI.type === "setLocal") {
            const tmpType = this.computeTypeForExpr(context, tmpI.value)
            if (tmpType.type === "error") {
                return false
            }
            if (tmpType.type === "typeUnion") {

                for (const t of listTypeUnion(tmpType)) {
                    const newContext: TypeContexte = { globals: [...context.globals], locals: [...context.locals] }
                    if (tmpI.type === "setGlobal") {
                        newContext.globals[tmpI.var] = t
                    } else {
                        newContext.locals[tmpI.var] = t
                    }
                    const tmpTypeBis = this.computeReturnTypeFunRec(newContext, f, keyArgType, i + 1)
                    if (!tmpTypeBis) {
                        return false
                    }


                }
                return true;
            }
            if (tmpI.type === "setGlobal") {
                context.globals[tmpI.var] = tmpType
            } else {
                context.locals[tmpI.var] = tmpType
            }
            return this.computeReturnTypeFunRec(context, f, keyArgType, i + 1)
        }
        if (tmpI.type === "ifRet") {
            const tmpTypeIf = this.computeTypeForExpr(context, tmpI.if)
            if (tmpTypeIf.type === "error") {
                return false
            }
            if (tmpTypeIf.type === "null") {
                return this.computeReturnTypeFunRec(context, f, keyArgType, i + 1)
            }
            let tmpTypeThen: Type | TypeError = { type: "error" }
            let callComputeReturnTypeFunRec = true
            const tmpSet = new Set(this.currentFun)
            try {

                tmpTypeThen = this.computeTypeForExpr(context, tmpI.then)

            } catch (e) {
                if (e === computeTypeFail) {
                    this.currentFun = tmpSet
                    const retType = this.computeReturnTypeFunRec(context, f, keyArgType, i + 1)
                    if (!retType) {
                        return false
                    }
                    callComputeReturnTypeFunRec = false
                    tmpTypeThen = this.computeTypeForExpr(context, tmpI.then)
                }

            }
            if (tmpTypeIf.type === "typeConst") {
                if (tmpTypeIf.value !== false && tmpTypeIf.value !== 0) {

                    if (tmpTypeThen.type === "error") {
                        return false
                    }

                    this.addFunSignature(f, keyArgType, tmpTypeThen)
                    return true
                }
            }
            if (tmpTypeIf.type === "boolean" || tmpTypeIf.type === "number") {


                if (tmpTypeThen.type === "error") {
                    return false
                }
                this.addFunSignature(f, keyArgType, tmpTypeThen)
                if (callComputeReturnTypeFunRec) {
                    const retType = this.computeReturnTypeFunRec(context, f, keyArgType, i + 1)
                    if (!retType) {
                        return retType
                    }
                }
                return true
            }

        }
        if (tmpI.type === "call") {
            this.computeTypeForCall(context, tmpI)
            return this.computeReturnTypeFunRec(context, f, keyArgType, i + 1)
        }


        return false
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