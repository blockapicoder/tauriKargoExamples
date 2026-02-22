

interface Value {
    type:'value'
    value:string
}
interface Logic {
    type:'and'|'or'
    values:Elt []
}

type Elt = Value | Logic