
import { parse } from "../parser"
import { assertEquals, terminate, log, assertEqualsSnapshot } from "../node_modules/tauri-kargo-tools/src/test"
import { compileProgram, KNOWN_PRIMS_DEFAULT } from "../luxlang-compile"
import { listTypeUnion, Type, TypeChecker, TypeContexte, TypeError, TypeGen, TypePrimitif } from "../luxlang-type"
import { ARRAY_NUMBER, LuxlangTypeChecker, NUMBER, STRING } from "../luxlang-typechecker"
const src1 = "fun f(x,y);ret x+y;"
const src2 = "fun f(ls);ret map(ls,$(a)=>a+1);"
const src3 = "fun f(ls,u);ret map(ls,$(a)=>a+u);"
const src4 = "  fun fact(n);   if n==0 ret 1;  ret n * fact(n-1);"
const src5 = "  fun fact(n);   if n > 0 ret n * fact(n-1);  ret 1;"
const src6 = "  fun list();     ret [1,'ooo'];"
log("starting ...")

interface TestSpec {
    debug?: boolean
    src: string
    typeIn: Type[]
    name: string
}
function logTypeChecker(tc: TypeChecker) {

    for (const v of tc.mapFunSignature.values()) {
        console.log(" idx=" + v.idx)
        for (const s of v.values.entries()) {
            console.log(s[0] + "->" + tc.toString(s[1]))
        }
    }

}
async function runTest(test: TestSpec) {
    if (test.debug) {
        debugger
    }
    let v = await parse(test.src)
    let prims = new Set<string>(KNOWN_PRIMS_DEFAULT)
    prims.add("type")
    prims.add("number")
    prims.add("reduce")
    let p = compileProgram(v, prims)
    let typeChecker = new LuxlangTypeChecker(p)
    let type = typeChecker.computeType(test.typeIn)
    await assertEqualsSnapshot(type, test.name)
    log(`test ${test.name} ok`)

}

let error: any
try {
    let i = 1
    debugger

    await runTest({
        name: "type1",
        src: src1,
        typeIn: [NUMBER, NUMBER]
    })

    await runTest({
        name: "type2",
        src: src2,
        typeIn: [ARRAY_NUMBER]
    })

    await runTest({
        name: "type3",
        src: src3,
        typeIn: [ARRAY_NUMBER, NUMBER]
    })
    await runTest({
        name: "type4",
        src: src4,
        typeIn: [NUMBER]
    })


    await runTest({
        name: "type5",
        src: src5,
        typeIn: [NUMBER]
    })

    await runTest({
        name: "type6",
        src: 'fun list();ret [1,"ooo"];',
        typeIn: []
    })
    await runTest({
        name: "type7",
        src: 'fun list(x,y);ret [x,y,y,x];',
        typeIn: [NUMBER, STRING]
    })
    await runTest({
        name: "type8",
        src: 'fun cmp(x);ret type(x)==number;',
        typeIn: [NUMBER]
    })
    await runTest({
        name: "type9",
        debug: true,
        src: 'fun list(x,y);ret reduce([x,y,y,x],$(e)=> type(e)==number);',
        typeIn: [NUMBER, STRING]
    })


} catch (e) {

    error = e
    console.log(e)
}
assertEquals(error === undefined, true, "error " + error)

terminate()

