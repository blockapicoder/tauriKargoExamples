import * as peggy from "peggy";
import { Prog } from "./model";
let parser: any = undefined



export async function parse(src: string): Promise<Prog> {
    if (!parser) {
        const grammarRep = await fetch("./vm.peggy");
        const grammar = await grammarRep.text()
        // 2) Compile le parser
         parser = peggy.generate(grammar, { output: "parser" });
    }
    return parser.parse(src) as Prog

}
