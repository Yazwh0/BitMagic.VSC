/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const autoUpdater_1 = require("./autoUpdater");
const bmOutput = vscode.window.createOutputChannel("BitMagic");
function activate(context) {
    bmOutput.appendLine("Activated!");
    //context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new DebugAdapterExecutableFactory()));
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new MockDebugAdapterServerDescriptorFactory()));
    context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.getProgramName', config => {
        return vscode.window.showInputBox({
            placeHolder: "Please enter the name of a file which can be debugged in the workspace folder. Eg main.bmasm, or project.json",
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
    new autoUpdater_1.default().CheckForUpdate(context, bmOutput);
}
exports.activate = activate;
class DebugAdapterExecutableFactory {
    // The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
    // Since the code implements the default behavior, it is absolutely not necessary and we show it here only for educational purpose.
    createDebugAdapterDescriptor(_session, executable) {
        // param "executable" contains the executable optionally specified in the package.json (if any)
        // use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)
        if (!executable) {
            bmOutput.appendLine("Executable is not set");
            bmOutput.show();
            throw new Error("Executable is not set");
        }
        bmOutput.appendLine(`Creating Debug Adaptor Descriptor: ${executable.command} ${executable.args.join(' ')}`);
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
    bmOutput.appendLine("Deactivate");
    // do nothing.
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map