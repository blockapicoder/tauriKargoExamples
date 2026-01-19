import * as peggy from "peggy";
import { RawProgram } from "./luxlang-compile";
let parser: any = undefined



export async function parse(src: string): Promise<RawProgram> {
    if (!parser) {
        const grammarRep = await fetch("./luxlang.peggy");
        const grammar = await grammarRep.text()
        // 2) Compile le parser
         parser = peggy.generate(grammar, { output: "parser" });
    }
    return parser.parse(src) as RawProgram

}
