
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
export type SubStruct<T> = Ref<T>[]
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
type Union<T extends Model<keyof T>> = { [K in keyof T]: ToStruct<T[K], T> }[keyof T];
type ToStruct<S, Root> =
    S extends readonly ({ ref: keyof Root })[]
    ? { [K in S[number]["ref"]]: ToStruct<Root[K], Root> }[S[number]["ref"]]
    : ({
        [K in RequiredKeys<S>]: JsonTypeToTs<S[K], Root>
    } & {
        [K in OptionalKeys<S>]?: S[K] extends { optional: infer O }
        ? JsonTypeToTs<O, Root>
        : never
    })

export type Model<Keys> = {
    [name: string]: Struct<Keys> | SubStruct<Keys>
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

export interface ActionAvecArgument<T extends Model<keyof T>, In extends keyof T, Out extends keyof T> {
    type: 'actionAvecArgument'
    action: ActionBase<ToType<T, In>, ToType<T, Out>>
    next: Out
}
interface ActionBase<In, Out, T = any> {
    arguments(etat: In, len: number): T[];
    do: (etat: In, a: T) => Out;
}

export interface ActionSansArgument<T extends Model<keyof T>, In extends keyof T, Out extends keyof T> {
    type: 'actionSansArgument'
    action: (etat: ToType<T, In>) => ToType<T, Out>;
    next: Out
}
export type Action<T extends Model<keyof T>, In extends keyof T, Out extends keyof T> = ActionAvecArgument<T, In, Out> | ActionSansArgument<T, In, Out>

export interface Transition<Name> {
    from: Name
    to: Name
    actionName: string

}


export interface Node<Etat, Name> {
    name: Name
    etat: Etat
    children: Step<Etat, Name>[]

}
export interface StepAvecArgument<Etat, Name> {
    type: 'actionAvecArgument'
    arg: any
    actionName: string
    node: Node<Etat, Name>

}
export interface StepSansArgument<Etat, Name> {
    type: 'actionSansArgument'
    actionName: string
    node: Node<Etat, Name>

}
export type Step<Etat, Name> = StepAvecArgument<Etat, Name> | StepSansArgument<Etat, Name>


export class MachineEtat<T extends Model<keyof T>> {
    t: { [name: string]: { [action: string]: Action<T, keyof T, keyof T> } }

    constructor(t: T) {

        this.t = {}
        for (const k in t) {
            this.t[k] = {}
        }

    }
    addActionAvecArgument<A, In extends keyof T, Out extends keyof T>(t: {
        from: In
        to: Out
        actionName: string

    }, args: (etat: ToType<T, In>, n: number) => A[], action: (etat: ToType<T, In>, a: A) => ToType<T, Out>) {
        const a: ActionAvecArgument<T, In, Out> = {
            type: "actionAvecArgument",
            action: {
                arguments: args,
                do: action
            },
            next: t.to
        }
        this.t[t.from as string][t.actionName] = a as any
    }
    addActionSansArgument<A, In extends keyof T, Out extends keyof T>(t: {
        from: In
        to: Out
        actionName: string

    }, action: (etat: ToType<T, In>) => ToType<T, Out>) {
        const a: ActionSansArgument<T, In, Out> = {
            type: "actionSansArgument",
            action: action,
            next: t.to
        }
        this.t[t.from as string][t.actionName] = a as any

    }
    generateStep(etat: Union<T>, from: keyof T, deep: number, len: number): Node<Union<T>, keyof T> {
        const r: Node<Union<T>, keyof T> = {
            children: [],
            etat: etat,
            name: from
        }
        if (deep <= 0) {
            return r
        }
        const e = this.t[from as any]
        const keys = Object.keys(e)
        keys.forEach((key) => {
            const a = e[key]
            if (a.type === "actionAvecArgument") {

                const args = a.action.arguments(etat, len)
                for (const arg of args) {
                    const etatIn = JSON.parse(JSON.stringify(etat))
                    const newEtat = a.action.do(etatIn, arg)
                    r.children.push({
                        type: "actionAvecArgument",
                        actionName: key,
                        arg: arg,
                        node: this.generateStep(newEtat, a.next, deep - 1, len)
                    })
                }


            }
            if (a.type === "actionSansArgument") {
                const etatIn = JSON.parse(JSON.stringify(etat))
                const newEtat = a.action(etatIn)
                r.children.push({
                    type: "actionSansArgument",
                    actionName: key,
                    node: this.generateStep(newEtat, a.next, deep - 1, len)
                })
            }

        })
        return r
    }
}

const me = new MachineEtat({
    "A": { m: "boolean" },
    "U": { a: { ref: "A" } }
})
me.addActionAvecArgument({ actionName: "prendre", from: "A", to: "U" },
    (etat, n): number[] => {
        return [1, 3]
    },
    (etat, a: number) => {
        return { a: etat }

    }

)
