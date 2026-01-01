import * as vm from "./vm"
import { parse }  from "./parser"



const machine = new vm.Machine();


(async ()=> {
    let prog:vm.Prog =await  parse("setGlobal A=10;")
    machine.run(prog)
    document.body.append("execution " + JSON.stringify(machine.globals[0]) );
    prog =await  parse(`setGlobal A = 40;
setGlobal B = 2;

fun f(x, y) {
  set z = x + y;
  ret: z *x;
};
setGlobal R = f(A,B);
`)
    machine.run(prog)
    document.body.append("execution " + JSON.stringify(machine.globals[3]) );
      prog =await  parse(`
fun fact(n) {
  if: n==0 ret:1;
  set m = n - 1;
  set r = fact(m);
  ret: n * r;
};
setGlobal R = fact(4);

`)
    machine.run(prog)
    document.body.append("execution " + JSON.stringify(machine.globals[1]) );
})()