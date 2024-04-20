import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, ExtensionContext, commands, debug, WebviewPanelOnDidChangeViewStateEvent } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { Dictionary } from "../utilities/dictionary";
import { messages } from "./common";

export class MemoryView {

    public static currentPanel: MemoryView | undefined;
    private _lastSearchResult: MemoryValueTrackerResponse | undefined; // store this here as the webview can be recycled

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
        this._lastSearchResult = undefined;

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
                    case messages.getMemoryUse:
                        this._updateMemoryUse(webview);
                        return;
                    case messages.search:
                        this._search(webview, message.toFind, message.searchType, message.searchWidth);
                        return;
                    case messages.resetSearch:
                        if (this._lastSearchResult) {
                            this._lastSearchResult.Locations = [];
                        }
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _updateMemoryUse(webview: Webview) {
        debug.activeDebugSession?.customRequest(messages.getMemoryUse).then(i => {
            webview.postMessage({ command: messages.updateMemoryDisplay, payload: JSON.stringify(i) });
        });
    }

    private _search(webview: Webview, toFind: number, searchType: string, searchWidth: string) {
        let current: memoryValue[] = [];
        if (this._lastSearchResult) {
            if (this._lastSearchResult.Locations) {
                current = this._lastSearchResult.Locations;
            }
        }

        debug.activeDebugSession?.customRequest(messages.debuggerSearch,
            {  SearchWidth: searchWidth, ToFind: toFind, SearchType: searchType, Locations: current }
        ).then(i => {
            this._lastSearchResult = i;
            webview.postMessage({
                command: messages.displaySearchResults, payload:
                    JSON.stringify(i)
            });
        });
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
                <title>Layer View</title>
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div class="display_control">
                    <div class="control_holder">
                        <vscode-button appearance="primary" id="update">Update</vscode-button>
                    </div>
                    <div class="control_holder">
                        <vscode-checkbox id="automatically_update">Automatically Update</vscode-checkbox>
                    </div>
                </div>
                <div class="memory_container">
                    <div class="memory">
                        <div>
                            <h4>Main Ram</h4>
                            <img id="main_ram" class="memory_display"/>
                        </div>
                    </div>                
                </div>
                <div class="memory_value_tracker">
                    <div class="search_control_box">
                        <vscode-dropdown id="search_width" class="search_control" >
                            <vscode-option>Byte</vscode-option>
                            <vscode-option>Word</vscode-option>
                        </vscode-dropdown>
                        <vscode-text-field id="value_to_find" class="search_control" placeholder="Start with $ or 0x for hex"">Value To Find</vscode-text-field>
                        <vscode-dropdown disabled id="search_type" class="search_control" >
                            <vscode-option>Equal</vscode-option>
                            <vscode-option>Not Equal</vscode-option>
                            <vscode-option>Less Than</vscode-option>
                            <vscode-option>Greater Than</vscode-option>
                            <vscode-option>Changed</vscode-option>
                            <vscode-option>Not Changed</vscode-option>
                            <vscode-option>Gone Up</vscode-option>
                            <vscode-option>Gone Down</vscode-option>
                        </vscode-dropdown>
                        <vscode-button id="search" class="search_control" >Search</vscode-button>
                        <vscode-button id="reset_search" class="search_control" >Reset</vscode-button>
                    </div>
                    <div class="search_results_container display_control">
                        <vscode-data-grid id="search_results"></vscode-data-grid>
                    </div>
                </div>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}

class MemoryValueTrackerResponse {
    ToFind: number | undefined;
    Locations: memoryValue[] | undefined;
    Stepping: boolean | undefined;
}

class memoryValue {
    Location: number = 0;
    Value: number = 0;
}

