import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export class GeneratedFileDocumentProvider implements vscode.TextDocumentContentProvider {
    private lspClient: LanguageClient;
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(client: LanguageClient) {
        this.lspClient = client;

        this.generatedFileChanges = this.generatedFileChanges.bind(this);
        this.lspClient.onNotification('bitmagic/generatedchange', this.generatedFileChanges);
    }

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
            console.log("Fetching : " + uri.toString());

            var result = await this.lspClient.sendRequest<PreviewResult>("bitmagic/preview", { Filename: uri.path });

        return result.content.join('\n');
    }

    private generatedFileChanges(params: GeneratedFileChangesParameters) {
        for (const filename of params.filenames) {
            const uri = vscode.Uri.parse(`bitmagic:/generated/${filename}`);
            console.log("Firing Update on : " + uri.toString());
            this._onDidChange.fire(uri);
        }
    }
}

class PreviewResult {
    content: string[] = [];
}

class GeneratedFileChangesParameters {
    filenames: string[] = [];
}
