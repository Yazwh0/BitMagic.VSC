import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, ExtensionContext, commands } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";

export class ActionReplay {

    public static currentPanel: ActionReplay | undefined;

    public static activate(context: ExtensionContext) {

        const uri = context.extensionUri;

        context.subscriptions.push(
            commands.registerCommand('actionReplay.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (ActionReplay.currentPanel) {
                    ActionReplay.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'actionReplay',
                        'Action Replay',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true
                        }
                    );

                    ActionReplay.currentPanel = new ActionReplay(panel, uri);
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
        ActionReplay.currentPanel = undefined;

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
                const text = message.text;

                switch (command) {
                    case "hello":
                        // Code that should run in response to the hello message command
                        window.showInformationMessage(text);
                        return;
                    // Add more switch case statements here as more webview message commands
                    // are created within the webview context (i.e. inside src/webview/main.ts)
                }
            },
            undefined,
            this._disposables
        );
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "actionReplay.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "actionReplay.css"]);

        return /*html*/ `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <title>Action Replay</title>
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div>
                    <span>Layer 0</span>
                    <img id="layer_0" class="layer_display"/>
                </div>
                <vscode-button appearance="primary">Update</vscode-button>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}
