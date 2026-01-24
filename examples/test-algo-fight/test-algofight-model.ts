 import { DataModel } from "./node_modules/tauri-kargo-tools/src/schema/base"
 import  { model } from "./algofight-model"

 const dm = new DataModel(model)
 const pos = dm.createValue("Position", {type:"Position",x:45 ,y:78})
 

 //const drone = dm.createValue("Energie", {  })
 console.log("running..")