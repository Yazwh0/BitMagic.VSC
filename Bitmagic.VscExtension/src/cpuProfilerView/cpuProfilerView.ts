import { Disposable, ExtensionContext, Uri, window, ViewColumn, Webview, WebviewPanel, commands, debug, StatusBarAlignment, workspace, Position, Selection, Range, TextDocumentShowOptions } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { messages } from "../memoryView/common";


export class CpuProfilerView {
    public static currentPanel: CpuProfilerView | undefined;

    public static activate(context: ExtensionContext) {
        const uri = context.extensionUri;

        context.subscriptions.push(
            commands.registerCommand('cpuProfilerView.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (CpuProfilerView.currentPanel) {
                    CpuProfilerView.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'cpuProfilerView',
                        'CPU Profiler View',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );

                    CpuProfilerView.currentPanel = new CpuProfilerView(panel, uri);
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
        CpuProfilerView.currentPanel = undefined;

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
                    case messages.getCpuProfileImage:
                        this._getCpuProfileImage(webview);
                        return;
                    case messages.updateCpuProfiler:
                        this._updateCpuProfiler(webview, message);
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _getCpuProfileImage(webview: Webview) {
        debug.activeDebugSession?.customRequest(messages.getCpuProfile, { Message: messages.getCpuProfileImage })
            .then(i => {
                webview.postMessage({
                    command: messages.updateCpuProfileImage, payload:
                        JSON.stringify(i)
                });
            });
    }

    private _updateCpuProfiler(webview: Webview, message: any) {
        debug.activeDebugSession?.customRequest(messages.getCpuProfile, { Message: messages.getCpuProfileImage, items: message.items })
            .then(i => {
                webview.postMessage({
                    command: messages.updateCpuProfileImage, payload:
                        JSON.stringify(i)
                });
            });
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "cpuProfilerView.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "cpuProfilerView.css"]);

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
                        <vscode-button appearance="primary" id="update">Fetch CPU Profile</vscode-button>
                    </div>
                    <div class="control_holder">
                        <vscode-checkbox id="automatically_update">Automatically Update</vscode-checkbox>
                    </div>
                </div>
                <div class="cpuprofile_container">
                    <div class="cpuprofileimage">
                        <div>
                            <h4>CPU Use</h4>
                            <img id="cpuprofileimage" class="cpuprofile_display"/>
                        </div>
                    </div>
                </div>
                <div>
                    <h4>CPU Profile Settings</h4>
                </div>
                <div class="display_control">
                    <div class="control_holder">
                        <vscode-button appearance="primary" id="add_cpuprofile_item">Add</vscode-button>
                        <vscode-button appearance="primary" id="update_cpuprofile">Update</vscode-button>
                    </div>
                </div>
                <div class="rules_container">
                </div>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}
