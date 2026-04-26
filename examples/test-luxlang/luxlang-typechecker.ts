import { listTypeUnion, Type, TypeChecker, TypeContexte, TypeError, TypeGen, TypePrimitif } from "./luxlang-type"
export const NUMBER: TypePrimitif = { type: "number" }
export const BOOLEAN: TypePrimitif = { type: "boolean" }
export const STRING: TypePrimitif = { type: "string" }
export function arrayOf(type: Type): TypeGen {
    return { type: "typeGen", name: "Array", args: [type] }
}
export const ARRAY_NUMBER: TypeGen = arrayOf(NUMBER)
function getArrayTypeElement(type: Type): Type | TypeError {
    if (type.type !== "typeGen") {
        return { type: "error" }
    }
    if (type.name !== "Array") {
        return { type: "error" }
    }
    if (type.args.length !== 1) {
        return { type: "error" }
    }
    return type.args[0]

}
function isNumber(t: Type): boolean {
    if (t.type === "number") {
        return true
    }
    if (t.type === "typeConst") {
        return typeof t.value === "number"
    }
    return false
}
function isString(t: Type): boolean {
    if (t.type === "string") {
        return true
    }
    if (t.type === "typeConst") {
        return typeof t.value === "string"
    }
    return false
}
export class LuxlangTypeChecker extends TypeChecker {
    computeReturnTypeGen(ctx: TypeContexte, f: TypeGen, args: Type[]): Type | TypeError {
        throw new Error("Method not implemented.")
    }
    getActionTypeForReduce(t: Type | TypeError): "add" | "nop" | "error" {
        if (t.type === "error") {
            return "error"
        }
        if (t.type === "typeConst") {
            if (this.toBooleanValue(t)) {
                return "add"
            }
            return "nop"
        }
        if (t.type === "number" || t.type == "string" || t.type === "boolean") {
            return "add"
        }
        if (t.type !== "null") {
            return "error"
        }
        return "nop"

    }
    typeCompare(t1: Type, t2: Type): boolean | undefined {
        if (t1.type === "typeMeta") {
            if (isNumber(t1.value)) {
                if (t2.type === "ref") {
                    return t2.name === "number"
                }
            }
            if (isString(t1.value)) {
                if (t2.type === "ref") {
                    return t2.name === "string"
                }
            }

        }
        if (t1.type === "ref" && t2.type === "ref") {
            return t1.name === t2.name
        }
        return undefined
    }
    simpleTypeUnion(types: Type[]): Type {
        const lsType: Type[] = []
        const lsString: string[] = []
        for (let arg of types) {
            for (let ft of listTypeUnion(arg)) {
                const tmpString = this.toString(ft)
                if (!lsString.includes(tmpString)) {
                    lsString.push(tmpString)
                    lsType.push(ft)
                }
            }
        }
        if (lsType.length === 1) {
            return (lsType[0])
        }
        return ({ type: "typeUnion", args: lsType })
    }
    computeReturnRefCall(ctx: TypeContexte, ref: string, args: Type[]): Type | TypeError {
        if (["+", "*", "-"].includes(ref)) {
            if (args.length !== 2) {
                return { type: "error" }
            }
            if (isNumber(args[0]) && isNumber(args[1])) {
                return NUMBER
            }
            return { type: "error" }
        }
        if ([">", "<", "<=", ">="].includes(ref)) {
            if (args.length !== 2) {
                return { type: "error" }
            }
            if (isNumber(args[0]) && isNumber(args[1])) {
                return BOOLEAN
            }
            return { type: "error" }
        }
        if (["=="].includes(ref)) {

            if (args.length !== 2) {
                return { type: "error" }
            }
            let cmp = this.typeCompare(args[0], args[1])
            if (cmp !== undefined) {
                return { type: "typeConst", value: cmp }
            }
            cmp = this.typeCompare(args[1], args[0])
            if (cmp !== undefined) {
                return { type: "typeConst", value: cmp }
            }
            return BOOLEAN
        }
        if (ref === "map") {
            if (args.length !== 2) {
                return { type: "error" }
            }
            const typeElement = getArrayTypeElement(args[0])
            if (typeElement.type === "error") {
                return typeElement
            }
            let computeType: undefined | ((t: Type) => Type | TypeError)
            const arg1 = args[1]
            if (arg1.type == "partialCall") {
                computeType = (t: Type) => this.computeReturnTypeFun(ctx.globals, arg1.code, [...arg1.args, t])
            }
            if (arg1.type == "fun") {
                computeType = (t: Type) => this.computeReturnTypeFun(ctx.globals, arg1.code, [t])
            }
            if (computeType) {
                const t = computeType(typeElement)
                if (t.type !== "error") {
                    return { type: "typeGen", name: "Array", args: [t] }
                }
                return t
            }

        }
        if (ref === "[]") {
            return arrayOf(this.simpleTypeUnion(args))
        }
        if (ref === "reduce") {
            if (args.length !== 2) {
                return { type: "error" }
            }
            const typeElement = getArrayTypeElement(args[0])
            if (typeElement.type === "error") {
                return typeElement
            }
            const lstType = listTypeUnion(typeElement)
            const lstTypeResult: Type[] = []
            let computeType: undefined | ((t: Type) => Type | TypeError)
            const arg1 = args[1]
            if (arg1.type == "partialCall") {
                computeType = (t: Type) => this.computeReturnTypeFun(ctx.globals, arg1.code, [...arg1.args, t])
            }
            if (arg1.type == "fun") {
                computeType = (t: Type) => this.computeReturnTypeFun(ctx.globals, arg1.code, [t])
            }
            if (computeType) {
                for (let tmpType of lstType) {
                    let t = computeType(tmpType)
                    let action = this.getActionTypeForReduce(t)
                    if (action === "add") {
                        lstTypeResult.push(tmpType)
                    }
                    if (action === "error") {
                        return { type: "error" }
                    }
                }
            }

            return arrayOf(this.simpleTypeUnion(lstTypeResult))

        }
        if (ref === "type") {
            if (args.length !== 1) {
                return { type: "error" }
            }
            if (args[0].type === "typeMeta") {
                return { type: "error" }
            }
            return { type: "typeMeta", value: args[0] }
        }
        return { type: "error" }
    }


}