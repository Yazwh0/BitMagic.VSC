/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as Net from 'net';
import * as nls from 'vscode-nls';
import { DebugProtocol } from '@vscode/debugprotocol';
import AutoUpdater from './autoUpdater';
import { platform } from 'os';


const bmOutput = vscode.window.createOutputChannel("BitMagic");

export function activate(context: vscode.ExtensionContext) {
	bmOutput.appendLine("BitMagic Activated!");

	//context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new DebugAdapterExecutableFactory()));
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new NetworkDebugAdapterServerDescriptorFactory()));

	context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the name of a file which can be debugged in the workspace folder. Eg main.bmasm, or project.json",
			value: "main.bmasm"
		});
	}));

	context.subscriptions.push(

		vscode.commands.registerCommand('extension.bmasm-debug.debugEditorContents', (resource: vscode.Uri) => {
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
		}),

		vscode.commands.registerCommand('extension.bmasm-debug.runEditorContents', (resource: vscode.Uri) => {
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
				},
					{ noDebug: true }
				);
			}
		})
	);

	//context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.configureExceptions', () => configureExceptions()));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.startSession', config => startSession(config)));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.attachToDebugger', config => attachSession(config)));

	new AutoUpdater().CheckForUpdate(context, bmOutput);
}

class DebugAdapterExecutableFactory implements vscode.DebugAdapterDescriptorFactory {

	// The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
	// Since the code implements the default behavior, it is absolutely not necessary and we show it here only for educational purpose.

	createDebugAdapterDescriptor(_session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
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

class NetworkDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;
	private readonly settingsPortNumber = 'bitMagic.debugger.port';
	private readonly settingsDisablePlatformCheck = 'bitMagic.debugger.disablePlatformCheck';
	private readonly settingsAlternativeDebugger = 'bitMagic.debugger.alternativePath';
	private readonly settingsDebugger = 'bitMagic.debugger.path';

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		var config = vscode.workspace.getConfiguration();
		const disablePlatformCheck = config.get(this.settingsDisablePlatformCheck, false);

		// We can only test windows platforms, so anything else is a user issue.
		if (!disablePlatformCheck) {
			const os = platform();

			if (os != 'win32') {
				bmOutput.appendLine(`Unsupported Platform '${os}', only windows is currently supported.`);
				bmOutput.show();
				throw new Error(`Unsupported Platform '${os}', only windows is currently supported.`);
			}
		}

		var portNumber = config.get(this.settingsPortNumber, undefined);

		if (portNumber) {
			// make VS Code connect to debug server
			return new vscode.DebugAdapterServer(portNumber);
		}

		if (executable)  // overridden somewhere?
			return executable;

		var debuggerTarget = config.get(this.settingsAlternativeDebugger, '');

		if (debuggerTarget)
			return new vscode.DebugAdapterExecutable(debuggerTarget + "/X16D.exe");

		debuggerTarget = config.get(this.settingsDebugger, '');

		if (debuggerTarget)
			return new vscode.DebugAdapterExecutable(debuggerTarget + "/X16D.exe");

		bmOutput.appendLine('Cannot find debugger. Please check settings.');
		bmOutput.show();
		return undefined;
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}


export function deactivate() {

	bmOutput.appendLine("Deactivate");
	// do nothing.
}
