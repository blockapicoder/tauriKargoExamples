
import * as test from "./node_modules/tauri-kargo-tools/dist/test.ts"
import * as api from "./node_modules/tauri-kargo-tools/dist/api.ts"

(async () => {
    let rep = await fetch("/api/get-config", { method: "POST" })
    const getConfig = await rep.json()
    const client = api.createClient()

    let explorer = await client.explorer({ path: getConfig.code })
    test.test("Test explorer ", (t) => {
        t.step("Retourne repertoire avec des éléments", () => {
            test.assertEquals(explorer.type === "directory" && explorer.content.length > 0, true)
        })

    })
    await client.setCurrentDirectory({     path: getConfig.code})
    await client.writeFileText("test/test.txt", 'Text.Test ecriture')
    explorer = await client.explorer({
        path: getConfig.code + "\\test"
    })

    test.test("Test ecriture fichier et explorer ", (t) => {
        t.step("Retourne repertoire avec un seul fichier", () => {
            test.assertEquals(explorer.type === "directory" && explorer.content.length === 1, true)
            test.assertEquals(explorer.type === "directory" && explorer.content[0].type !== "directory" && explorer.content[0].name === "test.txt", true)
        })

    })

    const content = await client.readFileText("test/test.txt")
    test.test("Test lecture fichier  ", (t) => {
        t.step("contenu du fichier egale à  'Text.Test ecriture'", () => {
            test.assertEquals(content === 'Text.Test ecriture', true)
        })

    })
    await  client.deleteFile("test/test.txt")
    explorer = await client.explorer({
        path: getConfig.code + "\\test"
    })
    test.test("Test supression fichier et explorer ", (t) => {
        t.step("Retourne repertoire vide ", () => {
            test.assertEquals(explorer.type === "directory" && explorer.content.length === 0, true)

        })

    })


})()