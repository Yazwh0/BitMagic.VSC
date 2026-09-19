import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, ExtensionContext, commands, debug } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { messages } from "../utilities/messages";
import { parseSearchInput } from "./memoryView.logic";
import { withTimeout } from "../utilities/withTimeout";

export class MemoryView {

    public static currentPanel: MemoryView | undefined;

    public static activate(context: ExtensionContext) {

        const uri = context.extensionUri;

        context.subscriptions.push(
            commands.registerCommand('memoryView.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (MemoryView.currentPanel) {
                    MemoryView.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'memoryView',
                        'Memory View',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );

                    MemoryView.currentPanel = new MemoryView(panel, uri);
                }
            })
        );
    }

    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];

    private constructor(panel: WebviewPanel, extensionUri: Uri) {
        this._panel = panel;

        this._panel.onDidDispose(() => { this.dispose(), null, this, this._disposables });

        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        this._setWebviewMessageListener(this._panel.webview);
    }

    private dispose() {
        MemoryView.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _setWebviewMessageListener(webview: Webview) {
        webview.onDidReceiveMessage(
            (message: any) => {
                const command = message.command;

                switch (command) {
                    case messages.readMemoryPage:
                        this._readPage(webview, message.memoryReference, message.offset, message.count, message.intent);
                        return;
                    case messages.writeMemoryByte:
                        this._writeByte(webview, message.memoryReference, message.offset, message.value, message.refreshOffset, message.refreshCount);
                        return;
                    case messages.openSearch:
                        this._openSearch(webview, message.memoryReference, message.pattern);
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _readPage(webview: Webview, memoryReference: string, offset: number, count: number, intent: string) {
        const session = debug.activeDebugSession;
        if (!session) {
            // debug.activeDebugSession?.customRequest(...).then(...) would otherwise
            // silently short-circuit the whole chain, including .then() - leaving the
            // webview waiting forever with no indication anything went wrong.
            webview.postMessage({
                command: messages.memoryPageUpdate,
                payload: JSON.stringify({ memoryReference, offset, intent, error: true, reason: "No active debug session." })
            });
            return;
        }

        withTimeout(session.customRequest(messages.readMemory, { memoryReference, offset, count }), 3000)
            .then(i => {
                webview.postMessage({
                    command: messages.memoryPageUpdate,
                    payload: JSON.stringify({ memoryReference, offset, intent, ...i })
                });
            }, err => {
                window.showErrorMessage(`Failed to read memory: ${err.message ?? err}`);
                // Still tell the webview so it can drop its in-flight flags - otherwise a
                // failed read (e.g. a memory space the running debugger doesn't support)
                // permanently blocks further scrolling/refreshing.
                webview.postMessage({
                    command: messages.memoryPageUpdate,
                    payload: JSON.stringify({ memoryReference, offset, intent, error: true, reason: `Could not read "${memoryReference}" from the debugger.` })
                });
            });
    }

    private _writeByte(webview: Webview, memoryReference: string, offset: number, value: number, refreshOffset: number, refreshCount: number) {
        const session = debug.activeDebugSession;
        if (!session) {
            window.showErrorMessage("No active debug session.");
            return;
        }

        const data = Buffer.from([value & 0xff]).toString('base64');

        withTimeout(session.customRequest(messages.writeMemory, { memoryReference, offset, data }), 3000)
            .then(() => {
                // Re-read just the edited row rather than trust an optimistic update,
                // so a partially-failed write can't leave the display out of sync.
                this._readPage(webview, memoryReference, refreshOffset, refreshCount, "writeRefresh");
            }, err => {
                window.showErrorMessage(`Failed to write memory: ${err.message ?? err}`);
            });
    }

    private async _openSearch(webview: Webview, memoryReference: string, pattern: string) {
        const parsed = parseSearchInput(pattern);
        if (!parsed) {
            webview.postMessage({ command: messages.searchResults, matches: [], error: true, reason: "Could not parse the search pattern." });
            return;
        }

        const session = debug.activeDebugSession;
        if (!session) {
            webview.postMessage({ command: messages.searchResults, matches: [], error: true, reason: "No active debug session." });
            return;
        }

        const data = Buffer.from(parsed.bytes).toString('base64');

        try {
            const response: any = await withTimeout(session.customRequest(messages.searchMemory, {
                MemoryReference: memoryReference,
                Pattern: data,
                CaseInsensitive: parsed.caseInsensitive,
                MaxResults: 500
            }), 5000);

            webview.postMessage({
                command: messages.searchResults,
                matches: response?.Matches ?? [],
                truncated: !!response?.Truncated,
                patternLength: parsed.bytes.length
            });
        }
        catch (err: any) {
            webview.postMessage({ command: messages.searchResults, matches: [], error: true, reason: `Search failed: ${err.message ?? err}` });
        }
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "memoryView.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "memoryView.css"]);

        return /*html*/ `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <title>Memory View</title>
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div class="sticky_header">
                <div class="display_control">
                    <div class="control_holder">
                        <vscode-dropdown id="space">
                            <vscode-option value="main">Main RAM</vscode-option>
                            <vscode-option value="vram">VRAM</vscode-option>
                            <vscode-option value="rambank">RAM Bank</vscode-option>
                            <vscode-option value="rombank">ROM Bank</vscode-option>
                            <vscode-option value="sdcard">SD Card</vscode-option>
                            <vscode-option value="nvram">NVRAM</vscode-option>
                        </vscode-dropdown>
                    </div>
                    <div class="control_holder inline_field">
                        <label for="bank">Bank</label>
                        <vscode-text-field id="bank" placeholder="0" disabled></vscode-text-field>
                    </div>
                    <div class="control_holder inline_field">
                        <label for="address">Go to address</label>
                        <vscode-text-field id="address" placeholder="Start with $ or 0x for hex"></vscode-text-field>
                    </div>
                    <div class="control_holder">
                        <vscode-button id="go">Go</vscode-button>
                        <vscode-button appearance="primary" id="refresh">Refresh</vscode-button>
                        <vscode-button id="search">Find...</vscode-button>
                    </div>
                    <div class="control_holder">
                        <vscode-checkbox id="auto_refresh">Auto Refresh</vscode-checkbox>
                    </div>
                </div>
                <div id="find_bar" class="find_bar hidden">
                    <input type="text" id="find_input" class="find_input" placeholder="Find (text, or hex bytes with $ / 0x)" />
                    <span id="find_count" class="find_count">No results</span>
                    <button id="find_prev" class="find_nav" title="Previous match (Shift+Enter)">&#9650;</button>
                    <button id="find_next" class="find_nav" title="Next match (Enter)">&#9660;</button>
                    <button id="find_close" class="find_nav" title="Close (Escape)">&times;</button>
                </div>
                </div>
                <div class="memory_dump_container">
                    <div id="memory_dump" class="memory_dump"></div>
                </div>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}
