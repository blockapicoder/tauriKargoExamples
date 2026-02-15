import { Arg } from "./luxlang-model"
export interface Contexte {
    globals: Type[], locals: Type[]
}
export interface TypeAtom {
    type: 'typeAtom'
    name: string
}
export interface TypeGen {
    type: 'typeGen'
    name: string
    args: Type[]
}
export interface TypeFunc {
    type: 'typeFunc'
    ret: Type
    args: Type[]
}
export interface TypeConst {
    type: 'typeConst'
    value: any
}
export interface TypeUnion {
    type: 'typeUnion'
    args: Type[]
}

export interface TypeInferer {
    type: 'typeInferer'
    f: (ctx: Contexte, args: Arg[]) => Type
}
export interface TypeTest {
    type: 'typeTest'
    then: (ctx: Contexte, args: Arg[]) => boolean
    else: (ctx: Contexte, args: Arg[]) => boolean
}
export type Type = TypeAtom | TypeGen | TypeFunc | TypeConst | TypeUnion | TypeInferer | TypeTest