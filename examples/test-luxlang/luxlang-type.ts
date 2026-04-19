import { Arg, Fun, Prog } from "./luxlang-model"
export interface Contexte {
    globals: Type[], locals: Type[]
}


export interface TypeFun {
    type:'fun'
    code:Fun
}
export interface TypePartialCall {
    type:'partialCall'
    f: TypeFun | TypePartialCall
    args:Type []
}
export interface TypeGen {
    type: 'typeGen'
    name: string
    args: Type[]
}
export interface TypeAny {
    type:'any'
}
export interface TypeNull {
    type:'null'
}

export interface TypeConst {
    type: 'typeConst'
    value: number|string|boolean
}
export interface TypeUnion {
    type: 'typeUnion'
    args: Type[]
}
export  interface TypeMeta {
    type:'typeMeta'
    value:TypeBase
}

export type TypeBase =  TypeGen  | TypeConst | TypeUnion | TypePartialCall | TypeFun | TypeAny | TypeNull
export type Type = TypeBase | TypeMeta
export interface TypeError {
    type:'error'
}

abstract class TypeChecker {
    prog:Prog
  
    constructor( prog:Prog) {
        this.prog = prog
    }
    computeReturnTypeFun(globals:Type[], f:TypeFun , args:Type []):Type|TypeError {
        return  { type:'error'}
    }
    abstract computeReturnTypeGen( f:TypeGen , args:Type []):Type|TypeError
}