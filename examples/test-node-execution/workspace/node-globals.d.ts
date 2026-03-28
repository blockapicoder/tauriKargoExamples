/// <reference types="node" />

declare var exports: Record<string, unknown>;
declare var module: { exports: unknown };
declare var __filename: string;
declare var __dirname: string;
declare var process: any;

declare function require<T = any>(id: string): T;
