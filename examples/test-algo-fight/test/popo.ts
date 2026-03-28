import { assertEquals, log, terminate, assertEqualsSnapshot } from "../node_modules/tauri-kargo-tools/src/test"

debugger
log("Hello")
await assertEqualsSnapshot({ m: 90 }, "toto")
terminate()