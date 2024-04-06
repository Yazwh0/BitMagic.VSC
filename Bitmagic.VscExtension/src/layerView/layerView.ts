import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, ExtensionContext, commands, debug } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";

export class LayerView {

    public static currentPanel: LayerView | undefined;

    public static activate(context: ExtensionContext) {

        const uri = context.extensionUri;

        context.subscriptions.push(
            commands.registerCommand('layerView.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (LayerView.currentPanel) {
                    LayerView.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'layerView',
                        'Layer View',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true
                        }
                    );

                    LayerView.currentPanel = new LayerView(panel, uri);
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
        LayerView.currentPanel = undefined;

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
                    case "updateLayers":
                        this._updateLayers(webview);
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _updateLayers(webview: Webview) {
        debug.activeDebugSession?.customRequest("getLayers").then(i => {
            webview.postMessage({ command: "layerUpdate", payload: JSON.stringify(i) });
        });
    }
    
    
    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "LayerView.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "LayerView.css"]);

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
                <div class="layer_container">
                    <div class="layer">
                        <div>
                            <h4>Sprite 0</h4>
                            <img id="data_5" class="layer_display"/>
                        </div>
                    </div>
                    <div class="layer">
                        <div>
                            <h4>Layer 0</h4>
                            <img id="data_4" class="layer_display"/>
                        </div>
                    </div>
                    <div class="layer">
                        <div>
                            <h4>Sprite 2</h4>
                            <img id="data_3" class="layer_display"/>
                        </div>
                    </div>
                    <div class="layer">
                        <div>
                            <h4>Layer 1</h4>
                            <img id="data_2" class="layer_display"/>
                        </div>
                    </div>
                    <div class="layer">
                        <div>
                            <h4>Sprite 1</h4>
                            <img id="data_1" class="layer_display"/>
                        </div>
                    </div>
                    <div class="layer">
                        <div>
                            <h4>Background</h4>
                            <img id="data_0" class="layer_display"/>
                        </div>
                    </div>
                </div>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}
