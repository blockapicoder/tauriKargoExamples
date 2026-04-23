
import { parse } from "../parser"
import { assertEquals, terminate, log } from "../node_modules/tauri-kargo-tools/src/test"
import { compileProgram } from "../luxlang-compile"
import { Type, TypeChecker, TypeContexte, TypeError, TypeGen, TypePrimitif } from "../luxlang-type"
const src1 = "fun f(x,y);ret x+y;"
const src2 = "fun f(ls);ret map(ls,$(a)=>a+1);"
const src3 = "fun f(ls,u);ret map(ls,$(a)=>a+u);"
log("starting ...")
const NUMBER: TypePrimitif = { type: "number" }
const ARRAY_NUMBER: TypeGen = { type: "typeGen", name: "Array", args: [NUMBER] }
function isNumber( t:Type):boolean {
    if (t.type ==="number") {
        return true
    }
    if (t.type ==="typeConst") {
        return typeof t.value ==="number"
    }
    return false
}
class TestTypeChecker extends TypeChecker {
    computeReturnTypeGen(ctx: TypeContexte, f: TypeGen, args: Type[]): Type | TypeError {
        throw new Error("Method not implemented.")
    }
    computeReturnRefCall(ctx: TypeContexte, ref: string, args: Type[]): Type | TypeError {
        if (ref === "+") {
            if (args.length > 2) {
                return { type: "error" }
            }
            if (isNumber(args[0]) && isNumber(args[1])) {
                return NUMBER
            }
        }
        if (ref === "map") {
            if (args.length > 2) {
                return { type: "error" }
            }
            if (args[0].type !== "typeGen") {
                return { type: "error" }
            }
            if (args[0].name !== "Array") {
                return { type: "error" }
            }
            if (args[1].type == "partialCall") {
                if (args[1].code.numArg !== args[1].args.length + 1) {
                    return { type: "error" }
                }
                const t = this.computeReturnTypeFun(ctx.globals, args[1].code, [...args[1].args, args[0].args[0]])
                if (t.type !== "error") {
                    return { type: "typeGen", name: "Array", args: [t] }
                }
                return t
            }
            if (args[1].type === "fun") {
                const t = this.computeReturnTypeFun(ctx.globals, args[1].code, [args[0].args[0]])
                if (t.type !== "error") {
                    return { type: "typeGen", name: "Array", args: [t] }
                }
                return t
            }
        }
        return { type: "error" }
    }


}



let error: any
try {
    let i = 1


    let v = await parse(src1)
    let p = compileProgram(v)
    let typeChecker = new TestTypeChecker(p)
    let type = typeChecker.computeType([NUMBER, NUMBER])
    assertEquals(type, NUMBER, src1)
    log(`test 1`)

    v = await parse(src2)
    p = compileProgram(v)
    typeChecker = new TestTypeChecker(p)
  
    type = typeChecker.computeType([ARRAY_NUMBER])
    assertEquals(type, ARRAY_NUMBER, src2)
    log(`test 2`)

    v = await parse(src3)
    p = compileProgram(v)
    typeChecker = new TestTypeChecker(p)
    
    type = typeChecker.computeType([ARRAY_NUMBER,NUMBER])
    assertEquals(type, ARRAY_NUMBER, src3)
    log(`test 3`)


} catch (e) {

    error = e
}
assertEquals(error === undefined, true, "error")

terminate()

