import * as vscode from 'vscode';

export class PaletteViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'bitmagic.paletteView';
    private _view?: vscode.WebviewView;

    public static activate(context: vscode.ExtensionContext)
    {
        const provider = new PaletteViewProvider(context.extensionUri);

        context.subscriptions.push(vscode.window.registerWebviewViewProvider(PaletteViewProvider.viewType, provider));

        return context;
    }

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            // switch (data.type) {
            // 	case 'colorSelected':
            // }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {

        const nonce = this._getNonce();
        const htmlGrid = this._getHtmlGrid();
		const stylePaletteView = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'paletteViewMedia', 'paletteView.css'));

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!--
                Use a content security policy to only allow loading styles from our extension directory,
                and only allow scripts that have a specific nonce.
                (See the 'webview-sample' extension sample for img-src content security policy examples)
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${stylePaletteView}" rel="stylesheet">

            <title>VERA Palette</title>
        </head>
        <body>
        <div class='paletteHolder'>
        <span>Hello</span>
        ${htmlGrid}
        </div>
        </body>
        </html>`;
    }

    private _getHtmlGrid()
    {
        var toReturn = "";
        for(var i = 0; i < 256; i++)
        {
            toReturn += `<div class='paletteEntry palette-${i}>X</div>`;
        }
        return toReturn;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}