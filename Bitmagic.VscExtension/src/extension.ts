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
import { VisualiserTree } from './visualiserTree';
import { PaletteViewProvider } from './paletteViewProvider';


const bmOutput = vscode.window.createOutputChannel("BitMagic");

export function activate(context: vscode.ExtensionContext) {
	bmOutput.appendLine("BitMagic Activated!");

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new BitMagicDebugAdapterServerDescriptorFactory()));

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

	vscode.window.registerTreeDataProvider('x16-visualiser', new VisualiserTree())
	vscode.commands.registerCommand('x16-visualiser.view_bitmap', (i) => {
		vscode.window.showInformationMessage("Bitmap!");
	})
	vscode.commands.registerCommand('x16-visualiser.view_tilemap', (i) => {
		vscode.window.showInformationMessage("Tilemap!");
	})
	vscode.commands.registerCommand('x16-visualiser.view_tiles', (i) => {
		vscode.window.showInformationMessage("Tiles!");
	})
	vscode.commands.registerCommand('x16-visualiser.view_sprites', (i) => {
		vscode.window.showInformationMessage("Sprites!");
	})
	vscode.commands.registerCommand('x16-visualiser.view_palette', (i) => {
		vscode.debug.activeDebugSession?.customRequest("bm_palette").then(i => {

		});
		vscode.window.showInformationMessage("Palette!");
	})

	PaletteViewProvider.activate(context);

	/// for debugging:
	// vscode.debug.registerDebugAdapterTrackerFactory('*', {
	// 	createDebugAdapterTracker(session: vscode.DebugSession) {
	// 		return {
	// 			onWillReceiveMessage: m => console.log(`> ${JSON.stringify(m, undefined, 2)}`),
	// 			onDidSendMessage: m => console.log(`< ${JSON.stringify(m, undefined, 2)}`)
	// 		};
	// 	}
	// });

	//context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.configureExceptions', () => configureExceptions()));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.startSession', config => startSession(config)));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.attachToDebugger', config => attachSession(config)));

	new AutoUpdater().CheckForUpdate(context, bmOutput);
}

class BitMagicDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;
	private readonly settingsPortNumber = 'bitMagic.debugger.port';
	private readonly settingsDisablePlatformCheck = 'bitMagic.debugger.disablePlatformCheck';
	private readonly settingsAlternativeDebugger = 'bitMagic.debugger.alternativePath';
	private readonly settingsDebugger = 'bitMagic.debugger.path';

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		var config = vscode.workspace.getConfiguration();
		const disablePlatformCheck = config.get(this.settingsDisablePlatformCheck, false);
		const os = platform();

		if (!disablePlatformCheck) {
			if (os != 'win32' && os != 'linux') {
				bmOutput.appendLine(`Unsupported Platform '${os}', only windows and linux are currently supported.`);
				bmOutput.show();
				throw new Error(`Unsupported Platform '${os}', only windows and linux art currently supported.`);
			}
		}

		var portNumber = config.get(this.settingsPortNumber, undefined);

		if (portNumber) {
			// make VS Code connect to debug server
			return new vscode.DebugAdapterServer(portNumber);
		}

		if (executable)  // overridden somewhere?
			return executable;

		const exeExtension = os == 'win32' ? '\\X16D.exe' : '/X16D';
		var debuggerTarget = config.get(this.settingsAlternativeDebugger, '');

		if (debuggerTarget)
			return new vscode.DebugAdapterExecutable(debuggerTarget + exeExtension);

		debuggerTarget = config.get(this.settingsDebugger, '');

		if (debuggerTarget)
			return new vscode.DebugAdapterExecutable(debuggerTarget + exeExtension);

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
