declare interface CommonJsExports {
  [key: string]: any;
}

declare var exports: CommonJsExports;
declare var module: { exports: any };
declare var __filename: string;
declare var __dirname: string;
declare var process: {
  cwd(): string;
  env: Record<string, string | undefined>;
  argv: string[];
  platform: string;
};

declare module 'fs' {
  interface Stats {
    size: number;
    mtimeMs: number;
    isFile(): boolean;
    isDirectory(): boolean;
  }

  interface MkdirOptions {
    recursive?: boolean;
  }

  interface RmOptions {
    recursive?: boolean;
    force?: boolean;
  }

  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string, encoding?: 'utf8'): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: MkdirOptions): string | undefined;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): Stats;
  export function rmSync(path: string, options?: RmOptions): void;
}

declare module 'path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, suffix?: string): string;
  export function extname(path: string): string;
}

declare module 'os' {
  export function platform(): string;
  export function homedir(): string;
  export function tmpdir(): string;
}

interface NodeRequireMap {
  fs: typeof import('fs');
  'node:fs': typeof import('fs');
  path: typeof import('path');
  'node:path': typeof import('path');
  os: typeof import('os');
  'node:os': typeof import('os');
}

declare function require<K extends keyof NodeRequireMap>(id: K): NodeRequireMap[K];
declare function require(id: string): any;
