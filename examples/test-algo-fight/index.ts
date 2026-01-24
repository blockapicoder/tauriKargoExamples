import { Explorateur } from './explorateur'
import { boot } from "./node_modules/tauri-kargo-tools/src/vue"
import { RobotExplorateur } from './robot-explorateur'
import { WorkerTest } from './worker-ui-test'
boot(new RobotExplorateur())
//boot(new WorkerTest())