export interface Const {
  const: string | number
}

export interface ArrayOf<T> {
  arrayOf: JsonType<T>
}

export interface MapOf<T> {
  mapOf: JsonType<T>
}

export interface Ref<T> {
  ref: T
}

export interface Enum {
  enum: readonly (string | number)[]
}

export type Struct<T> = {
  [name: string]: { optional: JsonType<T> } | JsonType<T>
}
export type SubStruct<T> = Ref<T> []
export type ToEnum<T> =
  T extends readonly (string | number)[]
    ? T[number]
    : never

export type JsonType<T> =
  | Const
  | ArrayOf<T>
  | MapOf<T>
  | Ref<T>
  | "string"
  | "number"
  | "boolean"
  | Enum

type JsonTypeToTs<T, Root> =
  T extends "string" ? string :
  T extends "number" ? number :
  T extends "boolean" ? boolean :
  T extends { const: infer C } ? C :
  T extends { enum: infer E } ? ToEnum<E> :
  T extends { arrayOf: infer A } ? JsonTypeToTs<A, Root>[] :
  T extends { mapOf: infer M } ? Record<string, JsonTypeToTs<M, Root>> :
  T extends { union: infer U extends readonly any[] } ? JsonTypeToTs<U[number], Root> :
  T extends { ref: infer R extends keyof Root } ? ToStruct<Root[R], Root> :
  never

type OptionalKeys<S> = {
  [K in keyof S]: S[K] extends { optional: any } ? K : never
}[keyof S]

type RequiredKeys<S> = Exclude<keyof S, OptionalKeys<S>>


type ToStruct<S, Root> =
  S extends readonly ({ref:keyof Root})[]
    ? { [K in S[number]["ref"]]: ToStruct<Root[K], Root> }[S[number]["ref"]]
    : ({
        [K in RequiredKeys<S>]: JsonTypeToTs<S[K], Root>
      } & {
        [K in OptionalKeys<S>]?: S[K] extends { optional: infer O }
          ? JsonTypeToTs<O, Root>
          : never
      })

export type Model<Keys> = {
  [name: string]: Struct<Keys> |SubStruct<Keys>
}

export type ToType<
  T extends Model<keyof T>,
  M extends keyof T
> = ToStruct<T[M], T>

export class Builder<T extends Model<keyof T>> {
  mdl: T

  constructor(mdl: T) {
    this.mdl = mdl
  }

  create<M extends keyof T>(type: M, value: ToType<T, M>): ToType<T, M> {
    return value
  }
}

const builder = new Builder({
  User: {
    nom: "string",
    p: "number",
    sexe: { enum: ["M", "F"] },
    u: { ref: "U" }
  },
  Group: {
    users: { arrayOf: { ref: "User" } }
  },
  A: {
    type: { const: "A" }
  },
  B: {
    type: { const: "B" }
  },
  U: [{ref:"A"}, {ref:"B"}]
} as const)

type U = ToType<typeof builder.mdl, "U">
const u:U = { type: "A" } 

const user = builder.create("User", {
  nom: "ll",
  p: 1,
  sexe: "F",
  u: { type: "B" }
})