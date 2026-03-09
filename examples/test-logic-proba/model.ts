

interface Value {
    type: 'value'
    values: Set<number>
    index: number
}
interface GenValue {
    type: 'gen'
    index: number
    f: (data: number[], pos: number) => boolean
}

interface Logic {
    type: 'and' | 'or'
    operations: Expression[]
}
interface Not {
    type: 'not',
    value: Expression
}


type Expression = Logic | Value | Not | GenValue
function evaluate(expression: Expression, idx: number, data: number[]): boolean {
    if (expression.type === "value") {
        const t = idx + expression.index
        if (t >= 0 && t < data.length) {
            return expression.values.has(data[t])
        }
        throw new Error()
    }
    if (expression.type === "gen") {
        const t = idx + expression.index
        if (t >= 0 && t < data.length) {
            return expression.f(data, t)
        }
        throw new Error()
    }
    if (expression.type === "and") {
        for (const e of expression.operations) {
            if (!evaluate(e, idx, data)) {
                return false
            }
        }
        return true
    }
    if (expression.type === "or") {
        for (const e of expression.operations) {
            if (evaluate(e, idx, data)) {
                return true
            }
        }
        return false
    }
    if (expression.type === "not") {
        return !evaluate(expression.value, idx, data)
    }

    throw new Error()
}
interface Event {
    if: Expression
    then: Expression
}
function isTokenPrediction(e: Event): boolean {
    if (e.then.type === "value") {
        return e.then.index > 0
    }
    return false
}
interface ProbaResult {
    countIf: number
    countTotal: number
    proba: number
}
function proba(event: Event, data: number[]): ProbaResult {
    let countTotal = 0
    let countIf = 0
    for (let idx = 0; idx < data.length; idx++) {
        try {
            const valueIf = evaluate(event.if, idx, data)
            const valueThen = evaluate(event.then, idx, data)
            if (valueIf) {
                countIf++
                if (valueThen) {
                    countTotal++;
                }
            }

        } catch (e) {

        }
    }
    if (countIf > 0) {
        return { proba: countTotal / countIf, countIf: countIf, countTotal: countTotal }
    }
    throw new Error()


}