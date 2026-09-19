// The debugger can hit an unhandled exception mid-request for an unrecognised
// memoryReference and never send a DAP response at all - the request then hangs until the
// debug session itself ends (which is what finally rejects it). Race it against a timeout
// so a broken request degrades to an error instead of hanging indefinitely.
export function withTimeout<T>(request: Thenable<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for the debugger.")), ms);
        Promise.resolve(request).then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); }
        );
    });
}
