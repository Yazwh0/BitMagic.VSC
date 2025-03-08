'use strict';

import * as vscode from 'vscode';
import * as Net from 'net';
import AutoUpdater from './autoUpdater';
import { platform } from 'os';
import BitMagicDebugAdaptorTrackerFactory from './debugTracker';
import DotNetInstaller from './dotnetinstaller';
import EmulatorDownloader from './emulatorDownloader';
import path = require('path');
import Constants from './constants';
import { LayerView } from './layerView/layerView';
import { provideVSCodeDesignSystem, vsCodeButton } from "@vscode/webview-ui-toolkit";
import { MemoryView } from './memoryView/memoryView';
import { HistoryView } from './historyView/historyView';
import { SpriteView } from './spriteView/spriteView';

const bmOutput = vscode.window.createOutputChannel("BitMagic");

var _dni: DotNetInstaller;
var _startOfficialEmulator = false;

export function activate(context: vscode.ExtensionContext) {
	bmOutput.appendLine("BitMagic Activated!");

	//provideVSCodeDesignSystem().register(vsCodeButton());

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', new BitMagicDebugAdapterServerDescriptorFactory()));

	context.subscriptions.push(vscode.commands.registerCommand('extension.bmasm-debug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the name of a file which can be debugged in the workspace folder. Eg main.bmasm, or project.json",
			value: "main.bmasm"
		});
	}));

	context.subscriptions.push(

		// vscode.commands.registerCommand('extension.bmasm-debug.debugEditorContents', (resource: vscode.Uri) => {
		// 	let targetResource = resource;

		// 	_startOfficialEmulator = false;

		// 	if (!targetResource && vscode.window.activeTextEditor) {
		// 		targetResource = vscode.window.activeTextEditor.document.uri;
		// 	}

		// 	if (targetResource) {
		// 		vscode.debug.startDebugging(undefined, {
		// 			type: 'bmasm',
		// 			name: 'Debug File',
		// 			request: 'launch',
		// 			program: targetResource.fsPath,
		// 			stopOnEntry: true
		// 		});
		// 	}
		// }),

		// vscode.commands.registerCommand('extension.bmasm-debug.runEditorContents', (resource: vscode.Uri) => {
		// 	let targetResource = resource;

		// 	_startOfficialEmulator = false;

		// 	if (!targetResource && vscode.window.activeTextEditor) {
		// 		targetResource = vscode.window.activeTextEditor.document.uri;
		// 	}

		// 	if (targetResource) {
		// 		vscode.debug.startDebugging(undefined, {
		// 			type: 'bmasm',
		// 			name: 'Run File',
		// 			request: 'launch',
		// 			program: targetResource.fsPath
		// 		},
		// 			{ noDebug: true }
		// 		);
		// 	}
		// }),

		vscode.commands.registerCommand('extension.bmasm-debug.runInOfficialEmulator', (resource: vscode.Uri) => {
			_startOfficialEmulator = true;
			vscode.commands.executeCommand('workbench.action.debug.start')
		})
	);

	let UpdateBitMagic = false;
	let UpdateOfficialEmulator = false;

	vscode.workspace.onDidChangeConfiguration(evt => {
		var startUpdater = false;
		if (evt.affectsConfiguration(Constants.SettingsUseDevelop))
		{
			UpdateBitMagic = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsAutoUpdate))
		{
			UpdateBitMagic = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsUseOwnDotnet))
		{
			UpdateBitMagic = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsEmulatorVersion))
		{
			UpdateOfficialEmulator = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsDownloadEmulator))
		{
			UpdateOfficialEmulator = true;
			startUpdater = true;
		}

		if (startUpdater)
		{
			setTimeout(() => {
				if (UpdateBitMagic)
				{
					new AutoUpdater().CheckForUpdate(context, bmOutput, _dni);
					UpdateBitMagic = false;
				}

				if (UpdateOfficialEmulator)
				{
					new EmulatorDownloader().CheckEmulator(context, bmOutput);
					UpdateOfficialEmulator = false;
				}
			}, 5000); // 5 second debounce
		}
	});

	// Debug tracker for compilation errors
	vscode.debug.registerDebugAdapterTrackerFactory('bmasm', new BitMagicDebugAdaptorTrackerFactory(bmOutput));

	// Action Replay
	LayerView.activate(context);
	MemoryView.activate(context);
	HistoryView.activate(context);
	SpriteView.activate(context);

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
	private readonly settingsPortNumber = Constants.SettingsDebuggerPort;
	private readonly settingsDisablePlatformCheck = Constants.SettingsDisablePlatformCheck;
	private readonly settingsAlternativeDebugger = Constants.SettingsAlternativeDebugger;
	private readonly settingsDebugger = Constants.SettingsDebuggerPath;
	private readonly settingsUseOwnDotnet = Constants.SettingsUseOwnDotnet;

    private readonly settingsEmulatorLocation = Constants.SettingsEmulatorLocation;
    private readonly settingsCustomEmulatorLocation = Constants.SettingsCustomEmulatorLocation;

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

		if (_startOfficialEmulator)
		{
			args.push("--runInOfficialEmulator");
			_startOfficialEmulator = false;
		}

		const location = _useOwnDotnet ? dni.Location : debuggerLocation;
		var options =  new DapOptions( path.dirname(location) );

		bmOutput.appendLine(`Running: ${location} ${args.join(' ')}`);

		return new vscode.DebugAdapterExecutable(location, args, options);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}

class DapOptions implements vscode.DebugAdapterExecutableOptions
{
	constructor(cwd:string)
	{
		this.cwd = cwd;
	}
	cwd?: string;
}

export function deactivate() {
	bmOutput.appendLine("Deactivate");
	// do nothing.
}
