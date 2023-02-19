/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const configuration = vscode.workspace.getConfiguration('bmasm-debug');
const bmasmOutput = vscode.window.createOutputChannel("bmasm");
function activate(context) {
    bmasmOutput.appendLine("Activated!");
    //context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new DebugAdapterExecutableFactory()));
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new MockDebugAdapterServerDescriptorFactory()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.getProgramName', config => {
        return vscode.window.showInputBox({
            placeHolder: "Please enter the name of a markdown file in the workspace folder",
            value: "main.bmasm"
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.debugEditorContents', (resource) => {
        let targetResource = resource;
        if (!targetResource && vscode.window.activeTextEditor) {
            targetResource = vscode.window.activeTextEditor.document.uri;
        }
        if (targetResource) {
            vscode.debug.startDebugging(undefined, {
                type: 'bmasm',
                name: 'Debug File',
                request: 'launch',
                program: targetResource.fsPath,
                stopOnEntry: true
            });
        }
    }), vscode.commands.registerCommand('extension.bmasm-debug.runEditorContents', (resource) => {
        let targetResource = resource;
        if (!targetResource && vscode.window.activeTextEditor) {
            targetResource = vscode.window.activeTextEditor.document.uri;
        }
        if (targetResource) {
            vscode.debug.startDebugging(undefined, {
                type: 'bmasm',
                name: 'Run File',
                request: 'launch',
                program: targetResource.fsPath
            }, { noDebug: true });
        }
    }));
    //context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.configureExceptions', () => configureExceptions()));
    // context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.startSession', config => startSession(config)));
    // context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.attachToDebugger', config => attachSession(config)));
}
exports.activate = activate;
class DebugAdapterExecutableFactory {
    // The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
    // Since the code implements the default behavior, it is absolutely not necessary and we show it here only for educational purpose.
    createDebugAdapterDescriptor(_session, executable) {
        // param "executable" contains the executable optionally specified in the package.json (if any)
        // use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)
        if (!executable) {
            bmasmOutput.appendLine("Executable is not set");
            bmasmOutput.show();
            throw new Error("Executable is not set");
        }
        bmasmOutput.appendLine(`Creating Debug Adaptor Descriptor: ${executable.command} ${executable.args.join(' ')}`);
        // make VS Code launch the DA executable
        return executable;
    }
}
class MockDebugAdapterServerDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer(2563);
    }
    dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
function deactivate() {
    bmasmOutput.appendLine("Deactivate");
    // do nothing.
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map