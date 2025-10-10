import { computeMatrixDist, dist } from "./compute";
import { Features } from "./compute";
import { WebgpuProcess } from "./webgpu-prediction";


const features: Features = new Features(2, 2)
features.addFeature([1, 3], [2, -7])
features.addFeature([10, 2], [12, 3])
features.addFeature([-5, 2], [4, 1])
const webgpu = new WebgpuProcess(features.asFeaturesBuffer())
await webgpu.initWebgpu()
const r = await webgpu.createMatriceNorme(true)
if (r) {
    console.log(Array.from(r))
    console.log(computeMatrixDist(features.features).matDist!.reduce((old, n) => [...old, ...n], []));

}
//const l = [[10,2],[1,3],[-5,2]]
const l = [[-5, 2], [10, 2], [1, 3]]
const bufferVector = webgpu.features.createBufferVectorInput(3)
l.forEach((v) => {
    bufferVector.addVector(v)
})

const r2 = await webgpu.createVecteurNorme(true, bufferVector)

if (r2) {
    console.log(Array.from(r2))
    l.forEach((p) => {
        console.log(features.features.map((f) => dist(f.e, p)))
    })

    //  console.log(computeMatrixDist(features.features).matDist.reduce(( old,n)=> [...old,...n],[]));

}
const r3 = await webgpu.createMatricePoid(true)
if (r3) {
    const array = Array.from(r3)
    for (let k = 0; k < webgpu.features.dimS; k++) {
        for (let i = 0; i < webgpu.nombreDeCalcul; i++) {
            let value = 0
            let somme_w=0
            for (let j = 0; j < features.features.length; j++) {
                const w = array[j * webgpu.nombreDeCalcul + i]
                value = value + w* features.features[j].s[k]
                somme_w = somme_w +w
            }
            console.log(l[i], "=", value/somme_w)

        }
    }
}

const r4 = await webgpu.createResultat()
console.log(Array.from(r4))
const r5 = await webgpu.compute(bufferVector)
console.log(Array.from(r5).map( (v,idx)=> {
    return v
}))