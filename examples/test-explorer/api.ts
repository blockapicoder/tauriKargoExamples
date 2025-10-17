import * as wt from "./worker-tools.ts";
export interface ElementBase {
  x: number;
  y: number;
  collected: boolean;
}
export interface Element extends ElementBase {
  dist: number;
  angle: number;
  id: number;
}
export interface Api {
  avancer: (dist: number) => Element[];
  tourner: (angle: number) => Element[];
}

export const api = wt.createPromisedProxy<Api>();
