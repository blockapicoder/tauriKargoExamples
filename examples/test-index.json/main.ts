(async  () => { 
const doc= await fetch("./index.json")
const val = await doc.json()
document.body.append(val.message)

})()