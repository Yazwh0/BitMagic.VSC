import { Disposable, ExtensionContext, Uri, window, ViewColumn, Webview, WebviewPanel, commands, debug, StatusBarAlignment, workspace, Position, Selection, Range, TextDocumentShowOptions } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { messages } from "../memoryView/common";

export class HistoryView {
    public static currentPanel: HistoryView | undefined;
    private index: number = 0;

    public static activate(context: ExtensionContext) {
        const uri = context.extensionUri;

        context.subscriptions.push(
            commands.registerCommand('historyView.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (HistoryView.currentPanel) {
                    HistoryView.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'historyView',
                        'History View',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );

                    HistoryView.currentPanel = new HistoryView(panel, uri);
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
        HistoryView.currentPanel = undefined;

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
                    case messages.getHistory:
                        this._getHistory(webview, 0);
                        return;
                    case messages.resetHistory:
                        this._resetHistory(webview);
                        return;
                    case messages.showFile:
                        this._showFile(message.fileName, message.lineNumber);
                        return;
                    case messages.getMoreHistory:
                        this._getHistory(webview, message.index);
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _showFile(fileName: string, lineNumber: number) {
        const p = new Position(lineNumber - 1, 0);

        var o = new ShowOptions();
        o.selection = new Selection(p, p);
        workspace.openTextDocument(Uri.file(fileName)).then(d => {
            window.showTextDocument(d, o);
            // .then(e => {
            //     e.selections = [new Selection(p, p)];
            //     const r = new Range(p, p);
            //     e.revealRange(r);
            // });
        });
    }

    private _getHistory(webview: Webview, index: number) {
        this.index = 0;
        debug.activeDebugSession?.customRequest(messages.getHistory, { Message: "history", Index: index })
        .then(i => {
            webview.postMessage({
                command: messages.updateHistory, payload:
                    JSON.stringify(i)
            });
        });
    }

    private _resetHistory(webview: Webview) {
        debug.activeDebugSession?.customRequest(messages.getHistory, { Message: "reset" })
        .then(i => {
            webview.postMessage({
                command: messages.updateHistory, payload:
                    JSON.stringify(i)
            });
        });
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "historyView.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "historyView.css"]);

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
                        <vscode-button appearance="primary" id="update">Fetch History</vscode-button>
                        <vscode-button appearance="primary" id="reset">Reset</vscode-button>
                    </div>
                </div>
                <div class="history_results_container">
                    <div id="results"></div>
                </div>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}

class ShowOptions implements TextDocumentShowOptions
{
    viewColumn?: ViewColumn;
    preserveFocus?: boolean;
    preview?: boolean;
    selection?: Range;
}
