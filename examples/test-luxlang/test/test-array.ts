import { assertEquals, assertEqualsSnapshot, terminate } from "../node_modules/tauri-kargo-tools/src/test"

type MaFonction<T> = ((x: number) => T) & {
    values: T[]
}

function toArrayFunction<T>(args: any[]): MaFonction<T> {
    const r = (i: number) => { return args[i] }
    const f: MaFonction<T> = Object.assign(r, { values: args })
    return f

}
const values = toArrayFunction([1,2,5,6])
assertEquals(values(0),values.values[0]," array function get value ")
const v= 666
values.values[0] = v
assertEquals(values(0),v," array function set value ")
terminate()