
import { parse } from "../parser"
import { assertEquals, assertEqualsSnapshot, terminate, log } from "../node_modules/tauri-kargo-tools/src/test"
import { compileProgram } from "../luxlang-compile"
const src1 = "fun f(x,y);ret x+y;"
const src2 = "fun fact(n);if n==0 ret 1; ret n*fact(n-1);"

let error: any
try {
    let i = 1
    for (const src of [src1, src2]) {

        const v = await parse(src)
        await assertEqualsSnapshot(v, `src${i}`)
        const p = compileProgram(v)
        await assertEqualsSnapshot(p, `compileSrc${i}`)
        log(`test ${i}`)
        i++
    }



} catch (e) {

    error = e
}
assertEquals(error === undefined, true, "error")

terminate()

