import { Disposable, commands, ExtensionContext, window, WebviewPanel, ViewColumn, Webview, Uri, debug } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { messages } from "../memoryView/common";

export class SpriteView {
    public static currentPanel: SpriteView | undefined;

    public static activate(context: ExtensionContext) {
        const uri = context.extensionUri;

        context.subscriptions.push(
            commands.registerCommand('spriteView.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (SpriteView.currentPanel) {
                    SpriteView.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'spriteView',
                        'Sprite Viewer',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );

                    SpriteView.currentPanel = new SpriteView(panel, uri);
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
        SpriteView.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // From the webview.
    private _setWebviewMessageListener(webview: Webview) {
        webview.onDidReceiveMessage(
            (message: any) => {
                const command = message.command;

                switch (command) {
                    case messages.getSprites:
                        this._getSprites(webview);
                        return;
                    case messages.setSpriteHighlight:
                        this._setDebugColours();
                        return;
                    case messages.resetSpriteHighlight:
                        this._resetDebugColours();
                        return;

                    // case messages.search:
                    //     this._search(webview, message.toFind, message.searchType, message.searchWidth);
                    //     return;
                    // case messages.resetSearch:
                    //     if (this._lastSearchResult) {
                    //         this._lastSearchResult.Locations = [];
                    //     }
                    //     return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _getSprites(webview: Webview)
    {
        debug.activeDebugSession?.customRequest(messages.spriteView, { command: messages.getSprites}).then(i => {
            webview.postMessage({ command: messages.getSprites, payload: JSON.stringify(i) });
        });
    }

    private _setDebugColours()
    {
        debug.activeDebugSession?.customRequest(messages.spriteView, { command: messages.setSpriteHighlight, DebugSpriteColours: this.defaultColours });
    }

    private _resetDebugColours()
    {
        const colours: number[] = [128];

        for(var i = 0; i < 128; i++)
            colours[i] = 0;

        debug.activeDebugSession?.customRequest(messages.spriteView, { command: messages.setSpriteHighlight, DebugSpriteColours: colours });
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "spriteView.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "spriteView.css"]);

        let spriteDivs = "";

        for(let i = 0; i < 128; i++)
        {
            spriteDivs += /*html*/
            `<div class='sprite' id='sprite_${i}'>
                <h4 id='header_${i}'>${i}</h4>
                <div class='sprite_img_container'>
                    <span class='img_container'>
                        <img id='sprite_img_${i}'></img>
                    </span>
                </div>
                <vscode-data-grid>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Address</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='address_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">X</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='x_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Y</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='y_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Width</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='width_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Height</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='height_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Mode</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='mode_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Depth</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='depth_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">H-Flip</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='hflip_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">V-Flip</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='vflip_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Pal Ofs</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='palletteoffset_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                    <vscode-data-grid-row>
                        <vscode-data-grid-cell grid-column="1" cell-type="columnheader">Col Mask</vscode-data-grid-cell>
                        <vscode-data-grid-cell grid-column="2" id='collisionmask_${i}'></vscode-data-grid-cell>
                    </vscode-data-grid-row>
                </vscode-data-grid>
            </div>`;
        }

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
                            <vscode-checkbox id="highlight_sprites">Highlight Sprites</vscode-checkbox>
                        </div>
                    </div>
                    <div class="sprites">${spriteDivs}</div>
                    <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
                </body>
            </html>`;
    }

    private defaultColours = [
        0x800000FF,
        0x80000CFF,
        0x800018FF,
        0x800024FF,
        0x800030FF,
        0x80003CFF,
        0x800048FF,
        0x800054FF,
        0x800060FF,
        0x80006CFF,
        0x800078FF,
        0x800084FF,
        0x800090FF,
        0x80009CFF,
        0x8000A8FF,
        0x8000B4FF,
        0x8000C0FF,
        0x8000CCFF,
        0x8000D8FF,
        0x8000E4FF,
        0x8000F0FF,
        0x8000FFFF,
        0x8000FFF3,
        0x8000FFE7,
        0x8000FFDB,
        0x8000FFCF,
        0x8000FFC3,
        0x8000FFB7,
        0x8000FFAB,
        0x8000FF9F,
        0x8000FF93,
        0x8000FF87,
        0x8000FF7B,
        0x8000FF6F,
        0x8000FF63,
        0x8000FF57,
        0x8000FF4B,
        0x8000FF3F,
        0x8000FF33,
        0x8000FF27,
        0x8000FF1B,
        0x8000FF0F,
        0x8000FF00,
        0x800CFF00,
        0x8018FF00,
        0x8024FF00,
        0x8030FF00,
        0x803CFF00,
        0x8048FF00,
        0x8054FF00,
        0x8060FF00,
        0x806CFF00,
        0x8078FF00,
        0x8084FF00,
        0x8090FF00,
        0x809CFF00,
        0x80A8FF00,
        0x80B4FF00,
        0x80C0FF00,
        0x80CCFF00,
        0x80D8FF00,
        0x80E4FF00,
        0x80F0FF00,
        0x80FFFF00,
        0x80FFF300,
        0x80FFE700,
        0x80FFDB00,
        0x80FFCF00,
        0x80FFC300,
        0x80FFB700,
        0x80FFAB00,
        0x80FF9F00,
        0x80FF9300,
        0x80FF8700,
        0x80FF7B00,
        0x80FF6F00,
        0x80FF6300,
        0x80FF5700,
        0x80FF4B00,
        0x80FF3F00,
        0x80FF3300,
        0x80FF2700,
        0x80FF1B00,
        0x80FF0F00,
        0x80FF0300,
        0x80FF0000,
        0x80FF000C,
        0x80FF0018,
        0x80FF0024,
        0x80FF0030,
        0x80FF003C,
        0x80FF0048,
        0x80FF0054,
        0x80FF0060,
        0x80FF006C,
        0x80FF0078,
        0x80FF0084,
        0x80FF0090,
        0x80FF009C,
        0x80FF00A8,
        0x80FF00B4,
        0x80FF00C0,
        0x80FF00CC,
        0x80FF00D8,
        0x80FF00E4,
        0x80FF00F0,
        0x80FF00FF,
        0x80F300FF,
        0x80E700FF,
        0x80DB00FF,
        0x80CF00FF,
        0x80C300FF,
        0x80B700FF,
        0x80AB00FF,
        0x809F00FF,
        0x809300FF,
        0x808700FF,
        0x807B00FF,
        0x806F00FF,
        0x806300FF,
        0x805700FF,
        0x804B00FF,
        0x803F00FF,
        0x803300FF,
        0x802700FF,
        0x801B00FF,
        0x800F00FF,
        0x800200FF] as const;
}
