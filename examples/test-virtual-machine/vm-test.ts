
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
    call clear();
  fun fact(n); 
  if n==0 ret 1;
  ret n * fact(n-1);
  setGlobal R = fact(4);
  call print(R);

setGlobal l=concat(array(1,2),array(-3,4));
call print(l);
fun p(x,y);
if x >  y ret true;
ret false;
call cr();
call print(filter(l,cur(p,2)));
fun f(x,y);
ret x*y;
call cr();
call print(map(l,cur(f,2)));
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