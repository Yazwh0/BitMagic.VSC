'use strict';

import * as vscode from 'vscode';
import * as Net from 'net';
import * as nls from 'vscode-nls';
import { DebugProtocol } from '@vscode/debugprotocol';
import AutoUpdater from './autoUpdater';
import { platform } from 'os';
import { VisualiserTree } from './visualiserTree';
import { PaletteViewProvider } from './paletteViewProvider';
import BitMagicDebugAdaptorTrackerFactory from './debugTracker';
import DotNetInstaller from './dotnetinstaller';
import EmulatorDownloader from './emulatorDownloader';
import path = require('path');

const bmOutput = vscode.window.createOutputChannel("BitMagic");

var _dni: DotNetInstaller;

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

	// Debug tracker for compilation errors
	vscode.debug.registerDebugAdapterTrackerFactory('bmasm', new BitMagicDebugAdaptorTrackerFactory(bmOutput));

	// Visualiser
	// vscode.window.registerTreeDataProvider('x16-visualiser', new VisualiserTree())
	// vscode.commands.registerCommand('x16-visualiser.view_bitmap', (i) => {
	// 	vscode.window.showInformationMessage("Bitmap!");
	// })
	// vscode.commands.registerCommand('x16-visualiser.view_tilemap', (i) => {
	// 	vscode.window.showInformationMessage("Tilemap!");
	// })
	// vscode.commands.registerCommand('x16-visualiser.view_tiles', (i) => {
	// 	vscode.window.showInformationMessage("Tiles!");
	// })
	// vscode.commands.registerCommand('x16-visualiser.view_sprites', (i) => {
	// 	vscode.window.showInformationMessage("Sprites!");
	// })
	// vscode.commands.registerCommand('x16-visualiser.view_palette', (i) => {
	// 	vscode.debug.activeDebugSession?.customRequest("bm_palette").then(i => {

	// 	});
	// 	vscode.window.showInformationMessage("Palette!");
	// })

	// PaletteViewProvider.activate(context);

	_dni = new DotNetInstaller();
	// first check that we have the framework installed
	new AutoUpdater().CheckForUpdate(context, bmOutput, _dni).then(_ => {
		new EmulatorDownloader().CheckEmulator(context, bmOutput);
	});	
}

class BitMagicDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;
	private readonly settingsPortNumber = 'bitMagic.debugger.port';
	private readonly settingsDisablePlatformCheck = 'bitMagic.debugger.disablePlatformCheck';
	private readonly settingsAlternativeDebugger = 'bitMagic.debugger.alternativePath';
	private readonly settingsDebugger = 'bitMagic.debugger.path';
	private readonly settingsUseOwnDotnet = "bitMagic.debugger.useOwnDotnet";

    private readonly settingsEmulatorLocation = 'bitMagic.officialEmulator.officialEmulatorLocation';
    private readonly settingsCustomEmulatorLocation = 'bitMagic.officialEmulator.customOfficialEmulatorLocation';

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		const config = vscode.workspace.getConfiguration();
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

		const exeExtension = os == 'win32' ? 'X16D.exe' : 'X16D';
		var debuggerTarget = config.get(this.settingsAlternativeDebugger, '');

		if (!debuggerTarget)
			debuggerTarget = config.get(this.settingsDebugger, '');

		if (!debuggerTarget.endsWith(path.sep))
			debuggerTarget += path.sep;

		if (debuggerTarget)
			return this.GetDebugAdaptor(debuggerTarget + exeExtension, config, _dni);

		debuggerTarget = config.get(this.settingsDebugger, '');

		if (debuggerTarget)
			return this.GetDebugAdaptor(debuggerTarget + exeExtension, config, _dni);

		bmOutput.appendLine('Cannot find debugger. Please check settings.');
		bmOutput.show();
		return undefined;
	}

	private GetDebugAdaptor(debuggerLocation: string, config: vscode.WorkspaceConfiguration, dni: DotNetInstaller) : vscode.DebugAdapterExecutable
	{
		const _useOwnDotnet = config.get(this.settingsUseOwnDotnet, false);
		var emulatorLocation = config.get(this.settingsCustomEmulatorLocation, "");

		if (!emulatorLocation)
		{
			emulatorLocation = config.get(this.settingsEmulatorLocation, "");
		}

		let args: string[] = [];

		if (_useOwnDotnet)
		{
			args.push(debuggerLocation.replace('.exe', '') + '.dll');
		}

		if (emulatorLocation)
		{
			args.push(`--officialEmulator`);
			args.push(emulatorLocation)
		}

		if (_useOwnDotnet)
			return new vscode.DebugAdapterExecutable(dni.Location, args);

		return new vscode.DebugAdapterExecutable(debuggerLocation, args);
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
