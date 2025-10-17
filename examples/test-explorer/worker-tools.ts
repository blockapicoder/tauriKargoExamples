

// Union discriminée { type; args }
export type Gen<T> = {
    [K in keyof T]:
    T[K] extends (...args: infer P) => any
    ? {operation: K; args: P;}
    : never
}[keyof T];

// util pour le type de retour d'une clé K dans T
type RetOf<T, K extends keyof T> =
    T[K] extends (...args: any[]) => infer R ? R : never;


// Ne transforme QUE les fonctions : les propriétés non-fonctions restent inchangées.
export type PromisifyMethods<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K];
};

// Variante si tu veux *exclure* complètement les membres non-fonctions :
export type MethodsOnly<T> = {
    [K in keyof T as T[K] extends (...args: any) => any ? K : never]: T[K];
};

export type PromisifyOnlyMethods<T> = {
    [K in keyof MethodsOnly<T>]: MethodsOnly<T>[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

export function createPromisedProxy<T extends object>(

): PromisifyMethods<T> {
    const handler: ProxyHandler<T> = {
        get(origTarget, prop, receiver) {
            const value = Reflect.get(origTarget, prop, receiver);


            return (...args: unknown[]) => {
                const methodName = String(prop);

                const invoke = async () => {
                    let tmpResolve: (e: any) => void = (e) => {};
                    const p = new Promise<any>((resove) => {
                        tmpResolve = resove;
                    });
                    if (self.onmessage) {
                        throw new Error();
                    }
                    self.onmessage = (m) => {
                        tmpResolve(m.data);
                        self.onmessage = null;
                    };
                    self.postMessage({operation: methodName, args: args});
                    return p;
                };

                // Retourne TOUJOURS une Promise
                return Promise.resolve().then(invoke);
            };
        },

    };

    return new Proxy( {}, handler) as unknown as PromisifyMethods<T>;
}


export class Client<T> {
    async call<K extends keyof T>(
        op: K, ...e: Extract<Gen<T>, {operation: K;}>["args"]
    ): Promise<RetOf<T, K>> {
        let tmpResolve: (e: RetOf<T, K>) => void = (e) => {};
        const p = new Promise<RetOf<T, K>>((resove) => {
            tmpResolve = resove;
        });
        if (self.onmessage) {
            throw new Error();
        }
        self.onmessage = (m) => {
            tmpResolve(m.data);
            self.onmessage = null;
        };
        self.postMessage({operation: op, args: e});
        return p;
    }
}
class Server<T extends {[name: string]: (...args: any[]) => any;}>  {
    impl: T;
    constructor(impl: T) {
        this.impl = impl;
    }

    use(worker: Worker) {
        worker.addEventListener("message", (m) => {
            const q: Gen<T> = m.data;
            worker.postMessage(this.call(q));
        });
    }
    call(q: Gen<T>): RetOf<T, typeof q["operation"]> {
        return this.impl[q.operation](...q.args);

    }
}
interface O {
    m(s: string): string;
}

class Impl implements O {
    m(s: string): string {
        throw new Error('Method not implemented.');
    }

}

export type Inter<T> = {
    [K in keyof T]:
    T[K] extends (...args: infer P) => any
    ? T[K] : never};

const t: Inter<Impl> = new Impl();
new Server(t);
