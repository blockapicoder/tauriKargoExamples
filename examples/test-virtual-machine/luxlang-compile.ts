// compile.ts

import { Call, Expr, Global, IfRet, Literal, Prog, SetVar, Var } from "./model";

// ============================================================
// 0) AST "brut" (sortie du parseur syntax-only)
// ============================================================

export type RawProgram = RawStatement[];

export type RawStatement = RawSetGlobalStmt | RawFunDef | RawCallStmt;

export interface RawSetGlobalStmt {
    kind: "setGlobal";
    name: string;
    value: RawExpr;
}

export interface RawFunDef {
    kind: "fun";
    name: string;
    params: string[];
    code: RawInstr[];
    ret: RawExpr;
}

export interface RawCallStmt {
    kind: "call";
    op: RawCallOp;
    args: RawExpr[];
}

export type RawInstr =
    | RawSetLocalStmt
    | RawSetGlobalStmt
    | RawIfRetStmt
    | RawCallStmt;

export interface RawSetLocalStmt {
    kind: "setLocal";
    name: string;
    value: RawExpr;
}

export interface RawIfRetStmt {
    kind: "ifRet";
    if: RawExpr;
    then: RawExpr;
}

export type RawCallOp = string | RawVarRef;

export type RawExpr =
    | RawLiteral
    | RawVarRef
    | RawCallExpr
    | RawLambdaExpr
    | RawLambdaBlockExpr;

export interface RawVarRef {
    type: "var";
    name: string;
}

export interface RawLiteral {
    type: "literal";
    value: number | string | boolean;
}

export interface RawCallExpr {
    type: "call";
    op: RawCallOp;
    args: RawExpr[];
}

export interface RawLambdaExpr {
    type: "lambda";
    params: string[];
    body: RawExpr;
}

export interface RawLambdaBlockExpr {
    type: "lambdaBlock";
    params: string[];
    code: RawInstr[];
    ret: RawExpr;
}

// ============================================================
// 1) AST "lowered" (plus de lambdas, args des calls = Atom[])
// ============================================================

type Atom = RawLiteral | RawVarRef;

interface LoweredCallExpr {
    type: "call";
    op: RawCallOp;
    args: Atom[];
}

interface LoweredPartialCallExpr {
    type: "partialCall";
    op: RawVarRef;     // var-only à ce stade
    args: Atom[];      // captures en atoms
}

type LoweredExpr = Atom | LoweredCallExpr | LoweredPartialCallExpr;

type LoweredStmt = LoweredSetGlobalStmt | LoweredFunDef | LoweredCallStmt;

interface LoweredSetGlobalStmt {
    kind: "setGlobal";
    name: string;
    value: LoweredExpr;
}

interface LoweredFunDef {
    kind: "fun";
    name: string;
    params: string[];
    code: LoweredInstr[];
    ret: LoweredExpr;
}

interface LoweredCallStmt {
    kind: "call";
    op: RawCallOp;
    args: Atom[];
}

type LoweredInstr =
    | { kind: "setLocal"; name: string; value: LoweredExpr }
    | { kind: "setGlobal"; name: string; value: LoweredExpr }
    | { kind: "ifRet"; if: LoweredExpr; then: LoweredExpr }
    | { kind: "call"; op: RawCallOp; args: Atom[] };

// ============================================================
// 2) AST final "Prog" (celui que tu donnes)
// ============================================================


// ============================================================
// 3) Config primitives + API compile
// ============================================================

export const KNOWN_PRIMS_DEFAULT = new Set<string>([
    "cr", "print", "clear", "cur", "createArray",
    "array", "map", "filter", "concat",
    "+", "-", "*", "/", "==", "===", "!=", "<", ">", "<=", ">=", "&&", "||"
]);

export function compileProgram(
    raw: RawProgram,
    knownPrims: Set<string> = KNOWN_PRIMS_DEFAULT
): Prog {
    const lowered = lowerProgram(raw);
    return resolveProgram(lowered, knownPrims);
}

// ============================================================
// 4) Lowering + hoisting + capture (exactement comme avant)
// ============================================================

function v(name: string): RawVarRef { return { type: "var", name }; }
function isAtom(e: any): e is Atom {
    return e && (e.type === "literal" || e.type === "var");
}

function lowerProgram(namedProg: RawProgram): LoweredStmt[] {
    let tempId = 0;
    const freshTemp = () => `$t${++tempId}`;

    let lambdaId = 0;
    const freshLambda = () => `$lambda${++lambdaId}`;

    const hoistedFuns: LoweredFunDef[] = [];

    function mkTempSet(ctx: Ctx, name: string, value: LoweredExpr): LoweredInstr {
        return (ctx.scope === "global")
            ? { kind: "setGlobal", name, value }
            : { kind: "setLocal", name, value };
    }

    // Collecte des var refs (ordre stable) pour capture
    // IMPORTANT: ne pas descendre dans les lambdas imbriquées
    function collectVarRefsOrderedExpr(expr: RawExpr, outArr: string[], seen: Set<string>) {
        if (!expr) return;

        if (expr.type === "var") {
            if (!seen.has(expr.name)) { seen.add(expr.name); outArr.push(expr.name); }
            return;
        }
        if (expr.type === "literal") return;

        if (expr.type === "call") {
            if (expr.op && typeof expr.op === "object" && (expr.op as any).type === "var") {
                const n = (expr.op as RawVarRef).name;
                if (!seen.has(n)) { seen.add(n); outArr.push(n); }
            }
            for (const a of (expr.args ?? [])) collectVarRefsOrderedExpr(a, outArr, seen);
            return;
        }

        if (expr.type === "lambda" || expr.type === "lambdaBlock") return;

        throw new Error("collectVarRefsOrderedExpr: unknown expr " + JSON.stringify(expr));
    }

    function collectVarRefsOrderedInstr(ins: RawInstr, outArr: string[], seen: Set<string>) {
        if (ins.kind === "setLocal" || ins.kind === "setGlobal") {
            collectVarRefsOrderedExpr(ins.value, outArr, seen);
            return;
        }
        if (ins.kind === "ifRet") {
            collectVarRefsOrderedExpr(ins.if, outArr, seen);
            collectVarRefsOrderedExpr(ins.then, outArr, seen);
            return;
        }
        if (ins.kind === "call") {
            if (ins.op && typeof ins.op === "object" && (ins.op as any).type === "var") {
                const n = (ins.op as RawVarRef).name;
                if (!seen.has(n)) { seen.add(n); outArr.push(n); }
            }
            for (const a of (ins.args ?? [])) collectVarRefsOrderedExpr(a, outArr, seen);
            return;
        }
        throw new Error("collectVarRefsOrderedInstr: unknown instruction " + JSON.stringify(ins));
    }

    type Ctx = { scope: "global" | "local"; locals: Set<string> | null };

    function lowerExpr(ctx: Ctx, expr: RawExpr, wantAtom: boolean): { prelude: LoweredInstr[]; expr: LoweredExpr } {
        if (!expr) throw new Error("lowerExpr: empty expr");

        if (expr.type === "literal" || expr.type === "var") {
            return { prelude: [], expr };
        }

        // Hoisting des lambdas
        if (expr.type === "lambda" || expr.type === "lambdaBlock") {
            const params = expr.params ?? [];
            const code = (expr.type === "lambdaBlock") ? (expr.code ?? []) : [];
            const retExpr = (expr.type === "lambdaBlock") ? expr.ret : expr.body;

            const lambdaLocals = new Set<string>(params);
            if (expr.type === "lambdaBlock") {
                for (const ins of code) if (ins.kind === "setLocal") lambdaLocals.add(ins.name);
            }

            const used: string[] = [];
            const seen = new Set<string>();
            for (const ins of code) collectVarRefsOrderedInstr(ins, used, seen);
            collectVarRefsOrderedExpr(retExpr, used, seen);

            const outerLocals = ctx.locals ? new Set(ctx.locals) : new Set<string>();
            const captures = used.filter(n => outerLocals.has(n) && !lambdaLocals.has(n));

            const fname = freshLambda();
            const funStmt: RawFunDef = {
                kind: "fun",
                name: fname,
                params: [...captures, ...params],
                code,
                ret: retExpr
            };

            hoistedFuns.push(lowerFun(funStmt));

            let produced: LoweredExpr;
            if (captures.length === 0) {
                produced = v(fname);
            } else {
                produced = {
                    type: "partialCall",
                    op: v(fname),
                    args: captures.map(n => v(n))
                };
            }

            if (!wantAtom || isAtom(produced)) return { prelude: [], expr: produced };

            const t = freshTemp();
            return { prelude: [mkTempSet(ctx, t, produced)], expr: v(t) };
        }

        if (expr.type === "call") {
            const prelude: LoweredInstr[] = [];
            const atoms: Atom[] = [];

            for (const a of (expr.args ?? [])) {
                const r = lowerExpr(ctx, a, true);
                prelude.push(...r.prelude);
                if (!isAtom(r.expr)) throw new Error("Expected atom after lowering arg");
                atoms.push(r.expr);
            }

            const callFlat: LoweredCallExpr = { type: "call", op: expr.op, args: atoms };

            if (!wantAtom) return { prelude, expr: callFlat };

            const t = freshTemp();
            prelude.push(mkTempSet(ctx, t, callFlat));
            return { prelude, expr: v(t) };
        }

        throw new Error(
            "Unknown expr node (expected literal/var/call/lambda/lambdaBlock): " + JSON.stringify(expr)
        );
    }

    function lowerCallStmt(ctx: Ctx, st: RawCallStmt): LoweredInstr[] {
        const prelude: LoweredInstr[] = [];
        const atoms: Atom[] = [];
        for (const a of (st.args ?? [])) {
            const r = lowerExpr(ctx, a, true);
            prelude.push(...r.prelude);
            if (!isAtom(r.expr)) throw new Error("Expected atom after lowering call-stmt arg");
            atoms.push(r.expr);
        }
        return [...prelude, { kind: "call", op: st.op, args: atoms }];
    }

    function lowerInstr(ctx: Ctx, ins: RawInstr): LoweredInstr[] {
        if (ins.kind === "setLocal" || ins.kind === "setGlobal") {
            const r = lowerExpr(ctx, ins.value, false);
            return [...r.prelude, { ...ins, value: r.expr }];
        }

        if (ins.kind === "ifRet") {
            const rc = lowerExpr(ctx, ins.if, false);
            const rt = lowerExpr(ctx, ins.then, false);
            return [...rc.prelude, ...rt.prelude, { kind: "ifRet", if: rc.expr, then: rt.expr }];
        }

        if (ins.kind === "call") return lowerCallStmt(ctx, ins);

        throw new Error("Unknown instruction kind: " + JSON.stringify(ins));
    }

    function lowerFun(st: RawFunDef): LoweredFunDef {
        const localNames = new Set<string>(st.params);
        for (const ins of st.code) if (ins.kind === "setLocal") localNames.add(ins.name);

        const ctx: Ctx = { scope: "local", locals: localNames };

        let code: LoweredInstr[] = [];
        for (const ins of st.code) code.push(...lowerInstr(ctx, ins));

        const rr = lowerExpr(ctx, st.ret, false);
        code.push(...rr.prelude);

        return { ...st, code, ret: rr.expr };
    }

    const out: LoweredStmt[] = [];

    for (const st of namedProg) {
        if (st.kind === "fun") {
            out.push(lowerFun(st));
            continue;
        }
        if (st.kind === "setGlobal") {
            const ctx: Ctx = { scope: "global", locals: null };
            const r = lowerExpr(ctx, st.value, false);
            out.push(...(r.prelude as any)); // prelude = LoweredInstr[]
            out.push({ kind: "setGlobal", name: st.name, value: r.expr });
            continue;
        }
        if (st.kind === "call") {
            const ctx: Ctx = { scope: "global", locals: null };
            out.push(...(lowerCallStmt(ctx, st) as any));
            continue;
        }
        throw new Error("Unknown statement kind: " + JSON.stringify(st));
    }

    return [...hoistedFuns, ...out];
}

// ============================================================
// 5) Name resolution + vérifs sémantiques (après lowering)
// ============================================================

function resolveProgram(lowered: LoweredStmt[], knownPrims: Set<string>): Prog {
    const globalDeclared = new Set<string>();
    const globalIndex = new Map<string, number>();
    let nextG = 0;

    function declareGlobal(name: string) {
        globalDeclared.add(name);
        if (!globalIndex.has(name)) globalIndex.set(name, nextG++);
    }

    function ensureGlobal(name: string): number {
        if (!globalIndex.has(name)) globalIndex.set(name, nextG++);
        return globalIndex.get(name)!;
    }

    // Pass 0: globals "définis"
    for (const st of lowered) {
        if (st.kind === "setGlobal") declareGlobal(st.name);
        if (st.kind === "fun") {
            declareGlobal(st.name);
            for (const ins of st.code) {
                if (ins.kind === "setGlobal") declareGlobal(ins.name);
            }
        }
    }

    function resolveAtom(a: Atom, locals: Map<string, number> | null): Literal | Var {
        if (a.type === "literal") return a;
        if (a.type === "var") {
            if (knownPrims.has(a.name)) {
                return { type: "extern", name: a.name }
            }
            if (locals && locals.has(a.name)) return { type: "local", idx: locals.get(a.name)! };
            if (globalDeclared.has(a.name)) return { type: "global", idx: ensureGlobal(a.name) };
            throw new Error(`Undefined variable: '${a.name}'`);
        }
        throw new Error("Invalid atom: " + JSON.stringify(a));
    }

    function resolveVarOnly(a: RawVarRef, locals: Map<string, number> | null): Var {
        const r = resolveAtom(a, locals);
        if ((r as any).type === "literal") throw new Error("Expected var, got literal: " + JSON.stringify(a));
        return r as Var;
    }

    function resolveOp(op: RawCallOp, locals: Map<string, number> | null): string | Var {
        if (typeof op === "string") return op;

        if (!op || op.type !== "var") throw new Error("Invalid op: " + JSON.stringify(op));
        const name = op.name;

        if (locals && locals.has(name)) return { type: "local", idx: locals.get(name)! };
        if (globalDeclared.has(name)) return { type: "global", idx: ensureGlobal(name) };

        if (knownPrims.has(name)) return name;

        throw new Error(
            `Undefined function/operator: '${name}' (not a local/global and not a known primitive)`
        );
    }

    function resolveExpr(e: LoweredExpr, locals: Map<string, number> | null): Expr<any> {
        if (e.type === "literal") return e;

        if (e.type === "var") {
            if (locals && locals.has(e.name)) return { type: "local", idx: locals.get(e.name)! };
            if (globalDeclared.has(e.name)) return { type: "global", idx: ensureGlobal(e.name) };
            throw new Error(`Undefined variable: '${e.name}'`);
        }

        if (e.type === "call") {
            return {
                type: "call",
                op: resolveOp(e.op, locals),
                args: e.args.map(a => resolveAtom(a, locals)),
            };
        }

        if (e.type === "partialCall") {
            return {
                type: "partialCall",
                op: resolveVarOnly(e.op, locals),
                args: e.args.map(a => resolveAtom(a, locals)),
            };
        }

        throw new Error("Unknown expr: " + JSON.stringify(e));
    }

    const out: Prog = [];

    for (const st of lowered) {
        if (st.kind === "setGlobal") {
            out.push({
                type: "setGlobal",
                var: ensureGlobal(st.name),
                value: resolveExpr(st.value, null) as Expr<Global>,
            });
            continue;
        }

        if (st.kind === "call") {
            out.push({
                type: "call",
                op: resolveOp(st.op, null) as any,
                args: st.args.map(a => resolveAtom(a, null)) as any,
            });
            continue;
        }

        if (st.kind === "fun") {
            const locals = new Map<string, number>();
            let nextL = 0;

            for (const p of st.params) {
                if (locals.has(p)) throw new Error("Duplicate parameter: " + p);
                locals.set(p, nextL++);
            }

            for (const ins of st.code) {
                if (ins.kind === "setLocal" && !locals.has(ins.name)) {
                    locals.set(ins.name, nextL++);
                }
            }

            const code = st.code.map(ins => {
                if (ins.kind === "setLocal") {
                    return {
                        type: "setLocal",
                        var: locals.get(ins.name)!,
                        value: resolveExpr(ins.value, locals),
                    } as SetVar;
                }
                if (ins.kind === "setGlobal") {
                    return {
                        type: "setGlobal",
                        var: ensureGlobal(ins.name),
                        value: resolveExpr(ins.value, locals),
                    } as SetVar;
                }
                if (ins.kind === "call") {
                    return {
                        type: "call",
                        op: resolveOp(ins.op, locals) as any,
                        args: ins.args.map(a => resolveAtom(a, locals)) as any,
                    } as Call<Var>;
                }
                if (ins.kind === "ifRet") {
                    return {
                        type: "ifRet",
                        if: resolveExpr(ins.if, locals),
                        then: resolveExpr(ins.then, locals),
                    } as IfRet;
                }
                throw new Error("Unknown instruction: " + JSON.stringify(ins));
            });

            out.push({
                type: "fun",
                var: ensureGlobal(st.name),
                code,
                ret: resolveExpr(st.ret, locals) as Expr<Var>,
            });
            continue;
        }

        throw new Error("Unknown statement: " + JSON.stringify(st));
    }

    return out;
}
