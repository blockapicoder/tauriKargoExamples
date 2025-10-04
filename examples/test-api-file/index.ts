
import * as test from "./test.ts"

(async () => {
    let rep = await fetch("/api/get-config", { method: "POST" })
    const getConfig = await rep.json()
    rep = await fetch("/api/explorer", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        },
        body: JSON.stringify({
            path: getConfig.code
        })
    })
    let explorer = await rep.json()
    test.test("Test explorer ", (t) => {
        t.step("Retourne repertoire avec des éléments", () => {
            test.assertEquals(explorer.content.length > 0, true)
        })

    })

    await fetch("/api/current-directory", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        },
        body: JSON.stringify({
            path: getConfig.code
        })
    })

    await fetch("/api/file/test/test.txt", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        },
        body: 'Text.Test ecriture'
    })
    rep = await fetch("/api/explorer", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        },
        body: JSON.stringify({
            path: getConfig.code + "\\test"
        })

    })

    explorer = await rep.json()

    test.test("Test ecriture fichier et explorer ", (t) => {
        t.step("Retourne repertoire avec un seul fichier", () => {
            test.assertEquals(explorer.content.length === 1, true)
            test.assertEquals(explorer.content[0].name === "test.txt", true)
        })

    })
    rep = await fetch("/api/file/test/test.txt", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        }
    })
    const content = await rep.text()
    test.test("Test lecture fichier  ", (t) => {
        t.step("contenu du fichier egale à  'Text.Test ecriture'", () => {
            test.assertEquals(content === 'Text.Test ecriture', true)
        })

    })
    await fetch("/api/file/test/test.txt", {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',

        }
    })
    rep = await fetch("/api/explorer", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        },
        body: JSON.stringify({
            path: getConfig.code + "\\test"
        })

    })
    explorer = await rep.json()
    test.test("Test supression fichier et explorer ", (t) => {
        t.step("Retourne repertoire vide ", () => {
            test.assertEquals(explorer.content.length === 0, true)

        })

    })


})()