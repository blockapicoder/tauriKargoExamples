import  { TauriKargoClient , createClient } from './node_modules/tauri-kargo-tools/src/api'

const api = createClient()
const config = await api.getConfig()
await api.setCurrentDirectory( {  path:config.code})
const r = await api.run({  executableName:"node" , arguments:["--inspect","server.js"]})
let started = false
while(!started) {
    const log = await api.runStatus({ id: r.id!})
    started = log.stdout.includes("Serveur disponible sur http://localhost:3000")


}
window.location.href ="http://localhost:3000/"