import * as vscode from 'vscode';
import { DebugAdapterTracker, DebugAdapterTrackerFactory, DebugSession, ProviderResult } from "vscode";

export default class BitMagicDebugAdaptorTrackerFactory implements DebugAdapterTrackerFactory
{    
    private readonly _output: vscode.OutputChannel;

    constructor (output: vscode.OutputChannel)
    {
        this._output = output;
    }

    createDebugAdapterTracker(session: DebugSession): ProviderResult<DebugAdapterTracker> {
        return new BitMagicDebugAdaptorTracker(this._output);
    }
}

export class BitMagicDebugAdaptorTracker implements DebugAdapterTracker
{
    private readonly _output: vscode.OutputChannel;
    private readonly _toSet: [uri: vscode.Uri, diagnostics: vscode.Diagnostic[]][];
    private static _diagnostics: vscode.DiagnosticCollection;

    constructor(output: vscode.OutputChannel)
    {
        this._output = output;
        this._toSet = new Array();
        BitMagicDebugAdaptorTracker._diagnostics ??= vscode.languages.createDiagnosticCollection('bmasm');
    }

    onDidSendMessage(message: any)
    {
        if (message.type === 'event' && message.event === 'output' && message.body.category === 'stderr' && message.body.severity === 'error')
        {
            const body = message.body;
            if (body.output.startsWith('ERROR:'))
            {
                //this._output.appendLine(`MESSAGE: ${JSON.stringify(message, undefined, 2)}`);
                const r = new vscode.Range(body.line -1, 0, body.line -1, 10000);
                const diagnostic = new vscode.Diagnostic(r, body.output.trim(), vscode.DiagnosticSeverity.Error);

                const uri = vscode.Uri.file(body.source.path);
                var done = false;
                for(var i = 0; i < this._toSet.length; i++)
                {
                    if (this._toSet[i][0] == uri)
                    {
                        this._toSet[i][1].push(diagnostic)
                        done = true;
                        break;
                    }
                }

                if(!done)
                {
                    this._toSet.push([uri, [diagnostic]]);
                }
            }
        }
    }

    onWillStartSession(): void {
        BitMagicDebugAdaptorTracker._diagnostics.clear();
    }

    onWillStopSession(): void {
        BitMagicDebugAdaptorTracker._diagnostics.set(this._toSet);
    }
}
