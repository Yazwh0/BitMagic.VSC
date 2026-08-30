// Ambient declaration for the VS Code webview bootstrap global.
// VS Code injects acquireVsCodeApi() into the webview host at runtime; this makes it
// known to the compiler/editor without depending on @types/vscode-webview being installed.
// Keep this file import/export-free so it stays an ambient script (global scope).

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};
