import { api, Element } from "./api.ts";
let visibles = [];
let n = 0;
let count = 5;
while (true) {
  await api.tourner(90);
  let i = count;
  while (i > 0) {
    visibles = await api.avancer(20);
    await prendre(visibles);
    i--;
  }
  n++;
  if (n == 3) {
    n = 0;
    count = count + 2;
  }
}

async function prendre(visibles: Element[]) {
  for (let j = 0; j < visibles.length; j++) {
    let a = visibles[j].angle;
    let d = visibles[j].dist;
    await api.tourner(a);
    let tmpVisibles = await api.avancer(d);
    await prendre(tmpVisibles);
    await api.tourner(180);
    await api.avancer(d);
    await api.tourner(180 - a);
  }
}
