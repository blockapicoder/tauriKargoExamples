
import * as vm from "./model"
import { parse } from "./parser"
import * as cm from "./codemirror-module"
const machine = new vm.Machine();
function print(src: any) {
    if (typeof src === "string") {
        const pre = document.createElement("pre")
        pre.innerText = src
        document.body.appendChild(pre)
    } else {
        document.body.append("execution " + JSON.stringify(src));
    }
    document.body.appendChild(document.createElement("br"))

}

(async () => {
    let prog: vm.Prog = await parse("setGlobal A=10;")
    machine.run(prog)
    print(machine.globals[0]);
    prog = await parse(`setGlobal A = 40;
setGlobal B = 2;

fun f(x, y) ;
  set z = x + y;
  ret z *x;

setGlobal R = f(A,B);
`)
    machine.run(prog)
    print(machine.globals[3]);
    prog = await parse(`
  fun fact(n); 
  if n==0 ret 1;
  set m = n - 1;
  set r = fact(m);
  ret n * r;
  setGlobal R = fact(4);
  call print(R);
`)
    machine.run(prog)
    print(machine.globals[1]);
    const PRIMS = {
        print: print
    }
    const js = vm.generateProg(prog)
    print(js)
    const run = eval(js)

    print(run(PRIMS))
    print(!!cm.CodeMirror)

})()