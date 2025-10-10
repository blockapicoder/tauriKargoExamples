interface Enfant {
    poid: number
    prediction: Prediction
}

interface Prediction {
    mot: string
    enfants?: Enfant[]

}
const p: Prediction = {
    mot: 'toto',
    enfants: [{
        poid: 1,
        prediction: {
            mot: "titi"
        }
    },
    {
        poid: 1000,
        prediction: {
            mot: "lulu"
        }
    },
    {
        poid: 1000,
        prediction: {

            mot: "juju"
        }
    }]
}