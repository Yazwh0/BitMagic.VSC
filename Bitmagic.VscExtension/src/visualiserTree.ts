import * as vscode from 'vscode';

export class VisualiserTree implements vscode.TreeDataProvider<X16Object>
{
	private _onDidChangeTreeData: vscode.EventEmitter<X16Object | undefined | void> = new vscode.EventEmitter<X16Object | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<X16Object | undefined | void> = this._onDidChangeTreeData.event;

    private items = [
        new X16Object("Bitmap", vscode.TreeItemCollapsibleState.None, { command : "x16-visualiser.view_bitmap", title: "" }),
        new X16Object("Tile Map", vscode.TreeItemCollapsibleState.None, { command : "x16-visualiser.view_tilemap", title: "" }),
        new X16Object("Tiles", vscode.TreeItemCollapsibleState.None, { command : "x16-visualiser.view_tiles", title: "" }),
        new X16Object("Sprites", vscode.TreeItemCollapsibleState.None, { command : "x16-visualiser.view_sprites", title: "" }),
        new X16Object("Palette", vscode.TreeItemCollapsibleState.None,{ command : "x16-visualiser.view_palette", title: "" })
    ];

    constructor()
    {
    }

    getTreeItem(element: X16Object): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: X16Object | undefined): vscode.ProviderResult<X16Object[]> {
        return this.items;
    }
}

export class X16Object extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    )
    {
        super(label, collapsibleState);
    }
}
