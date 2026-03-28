import { assertEquals, log} from "../node_modules/tauri-kargo-tools/src/test"

log("Hello world from test2")
assertEquals(4,4,"4 = 4")
log("un test faux")
assertEquals("f","f"," a est egale a a")
assertEquals(4,5,"4 = 4")