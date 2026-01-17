import { Explorateur} from './explorateur'
import { boot } from "./node_modules/tauri-kargo-tools/src/vue"
import { RobotExplorateur } from './robot-explorateur'
boot(new RobotExplorateur() )