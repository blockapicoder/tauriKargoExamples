
import { parse } from "../parser"
import { assertEquals, assertEqualsSnapshot, terminate } from "../node_modules/tauri-kargo-tools/src/test"
import { compileProgram } from "../luxlang-compile"
const src1 = "fun f(x,y);ret x+y;"
debugger
let error: any
try {
    const v =await parse(src1)
    await assertEqualsSnapshot(v, "src1")
    const p = compileProgram(v)
    await assertEqualsSnapshot(p,"compileSrc1")
    


} catch (e) {
    debugger
    error = e
}
assertEquals(error === undefined, true, "error")

terminate()

