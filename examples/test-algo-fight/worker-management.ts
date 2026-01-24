export function runWorker(code: string) {
    const blob = new Blob([code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    return new Worker(url, { type: "module" });

}