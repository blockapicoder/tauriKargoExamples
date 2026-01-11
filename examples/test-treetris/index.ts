
export type Couleur = "rouge"|"bleue"|"vert"|"noir"|"jaune"|"orange"|"blanc"|"rose"|"violet"|"marron"|"gris"

export interface Arbre {
    couleur:Couleur,
    enfants: Arbre [] 
}

export function base( arbre: Arbre ):Couleur [] {
    if (arbre.enfants.length === 0) {
        return [ arbre.couleur]
    }
    return arbre.enfants.flatMap((e)=>base(e))
}
export type Base = Couleur []
export interface Regle {
    couleur:Couleur
    base:Couleur []
}
export function regles(arbre:Arbre ): Regle [] {
    if (arbre.enfants.length === 0) {
        return []
    }
    const regle:Regle = { couleur:arbre.couleur , base: arbre.enfants.map( (e)=>e.couleur)}
    return [...arbre.enfants.flatMap((e)=>regles(e)),regle]

}
export function indexOfBase( e:Base , base:Base):number [] {
    let r:number [] =[]
    for(let i=0;i< base.length;i++) {
        let ok = true
        for(let j=0;j < e.length ; j++ ) {
            if (i+j >= base.length) {
                return r
            }
            if (e[j] !== base[i+j]) {
                ok= false;
                break;
            }
        }
        if (ok) {
            r.push(i)
        }
    }
    return r
}
export function transform( regle:Regle , base:Base , idx:number ) : Base  {
    if ((idx+regle.base.length)>= base.length ) {
        return base
    }
    for(let i=0;i< regle.base.length;i++) {
        if (base[idx+i] !== regle.base[i]) {
            return base
        }
    }

    return [ ...base.slice(0,idx-1), regle.couleur,... base.slice(idx+regle.base.length) ]

}
const b:Base = ["jaune","bleue","gris","bleue","gris","vert","bleue","gris","bleue","gris"]
const rgl:Regle ={base:["gris","bleue","gris"] ,couleur:"bleue" }
console.log(b)
console.log( transform(rgl,b, 2))
console.log(indexOfBase(rgl.base,b))