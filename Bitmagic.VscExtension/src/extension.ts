'use strict';

import * as vscode from 'vscode';
import * as Net from 'net';
import AutoUpdater from './autoUpdater';
import { platform, version } from 'os';
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
import * as fs from 'fs';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as cp from 'child_process';
import getPort from 'get-port';

const bmOutput = vscode.window.createOutputChannel("BitMagic");

var _dni: DotNetInstaller;
var _startOfficialEmulator = false;

let lspClient: LanguageClient;
let serverProcess: cp.ChildProcess;

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
		if (evt.affectsConfiguration(Constants.SettingsUseDevelop)) {
			UpdateBitMagic = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsAutoUpdate)) {
			UpdateBitMagic = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsUseOwnDotnet)) {
			UpdateBitMagic = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsEmulatorVersion)) {
			UpdateOfficialEmulator = true;
			startUpdater = true;
		}

		if (evt.affectsConfiguration(Constants.SettingsDownloadEmulator)) {
			UpdateOfficialEmulator = true;
			startUpdater = true;
		}

		if (startUpdater) {
			setTimeout(() => {
				if (UpdateBitMagic) {
					new AutoUpdater().CheckForUpdate(context, bmOutput, _dni);
					UpdateBitMagic = false;
				}

				if (UpdateOfficialEmulator) {
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

	// boilerplate

	context.subscriptions.push(vscode.commands.registerCommand('boilerplate.createProject', createBoilerplate));


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
	new AutoUpdater().CheckForUpdate(context, bmOutput, _dni).then(async _ => {
		new EmulatorDownloader().CheckEmulator(context, bmOutput);

		// LSP
		await startLsp();
	});
}

async function startLsp() {

	const settingsLocalDebugging = Constants.SettingsLocalDebugger;
	const settingsLspPortNumber = Constants.SettingsDebuggerLspPort;

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'bmasm' }, { scheme: 'file', pattern: '**/project.json' }],
		synchronize: {
			fileEvents: [
				vscode.workspace.createFileSystemWatcher('**/*.bmasm'),
				vscode.workspace.createFileSystemWatcher('**/project.json')
			]
		}
	};

	const config = vscode.workspace.getConfiguration();
	let localDebugging = config.get(settingsLocalDebugging, false);
	let serverOptions: ServerOptions;

	if (localDebugging) {
		const portNumber = config.get(settingsLspPortNumber, 2564);
		const connectionInfo = { port: portNumber, host: 'localhost' };

		serverOptions = () => {
			const socket = Net.connect(connectionInfo);
			const result = {
				reader: socket,
				writer: socket
			};
			bmOutput.appendLine(`Starting debug LSP server.`);
			return Promise.resolve(result);
		};
	}
	else {
		var lspPort = await getPort();
		var dapPort = await getPort();

		let debuggerLocation = BitmagicExecutableFinder.GetExecutable(_dni, [ '--lspport', lspPort.toString(), '--dapport', dapPort.toString()]);

		if (!debuggerLocation || !debuggerLocation.location || !fs.existsSync(debuggerLocation?.location)) {
			bmOutput.appendLine(`File not found: '${debuggerLocation?.location}', LSP server not started.`);
			bmOutput.show();
			return;
		}
		else {
			serverOptions = () => {
				return new Promise((resolve, reject) => {
						bmOutput.appendLine(`Starting debug LSP server: ${debuggerLocation?.location} ${debuggerLocation?.args.join(' ')}`);
					serverProcess = cp.spawn(debuggerLocation?.location, debuggerLocation?.args, { stdio: ['pipe', 'pipe', 'pipe'] });
					const connectionInfo = { port: lspPort, host: 'localhost' };
					setTimeout(() => {
						const socket = Net.connect(connectionInfo);
						const result = {
							reader: socket,
							writer: socket
						};
						return resolve(result);
					}, 1000);
				});
			};
		}
	}

	lspClient = new LanguageClient('bmasm-lsp', 'BMASM Language Server', serverOptions, clientOptions);

	lspClient.start();
}

async function createBoilerplate() {
	const folderUri = await vscode.window.showOpenDialog({
		canSelectFolders: true,
		openLabel: 'Select folder for boilerplate'
	});

	if (!folderUri || folderUri.length === 0) {
		vscode.window.showErrorMessage('No folder selected');
		return;
	}

	const basePath = folderUri[0].fsPath;

	const folders = ['.vscode', 'src', 'bin', 'app'];
	const files = {
		'src/main.bmasm': 'import BM="bm.bmasm";\n\nBM.X16Header();\n\tnop\n\n; your code here\n\n\tstp\n.loop:\n\tjmp -loop\n',
		'project.json': JSON.stringify({
			files: [{ type: "bitmagic", filename: "src/main.bmasm" }],
			outputFolder: "app",
			memoryFillValue: 192,
			windowScale: 2,
			compileOptions: {
				binFolder: "bin",
				displaySegments: true,
				saveGeneratedBmasm: true
			},
			sdCardFiles: []
		}, null, 2),
		'.vscode/launch.json': JSON.stringify({
			version: "0.2.0",
			configurations: [
				{
					type: "bmasm",
					request: "launch",
					name: "Debug Application",
					program: "${workspaceFolder}/project.json",
					stopOnEntry: false,
					debugArgs: [],
					cwd: "${workspaceRoot}"
				}]
		}, null, 2),
		".gitignore": "bin/\napp/\n"
	};

	folders.forEach(folder => {
		fs.mkdirSync(path.join(basePath, folder), { recursive: true });
	});

	for (const [filename, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(basePath, filename), content);
	}

	const uri = vscode.Uri.file(basePath);
	await vscode.commands.executeCommand('vscode.openFolder', uri, true);
}

class BitmagicExecutableFinder {
	private static readonly settingsAlternativeDebugger = Constants.SettingsAlternativeDebugger;
	private static readonly settingsDebugger = Constants.SettingsDebuggerPath;
	private static readonly settingsEmulatorLocation = Constants.SettingsEmulatorLocation;
	private static readonly settingsCustomEmulatorLocation = Constants.SettingsCustomEmulatorLocation;
	private static readonly settingsUseOwnDotnet = Constants.SettingsUseOwnDotnet;

	public static GetExecutable(dni: DotNetInstaller, extraParameters: string[] | undefined): ExecutableLocation | undefined {
		const config = vscode.workspace.getConfiguration();
		const os = platform();

		const exeExtension = os == 'win32' ? 'X16D.exe' : 'X16D';
		var debuggerTarget = config.get(this.settingsAlternativeDebugger, '');

		if (!debuggerTarget)
			debuggerTarget = config.get(this.settingsDebugger, '');

		if (!debuggerTarget.endsWith(path.sep))
			debuggerTarget += path.sep;

		if (debuggerTarget)
			return this.GetExecutableLocation(debuggerTarget + exeExtension, dni, extraParameters);

		debuggerTarget = config.get(this.settingsDebugger, '');

		if (debuggerTarget)
			return this.GetExecutableLocation(debuggerTarget + exeExtension, dni, extraParameters);

		return undefined;
	}

	private static GetExecutableLocation(debuggerLocation: string, dni: DotNetInstaller, extraParameters: string[] | undefined): ExecutableLocation {
		const config = vscode.workspace.getConfiguration();
		const _useOwnDotnet = config.get(this.settingsUseOwnDotnet, false);
		var emulatorLocation = config.get(this.settingsCustomEmulatorLocation, "");

		if (!emulatorLocation) {
			emulatorLocation = config.get(this.settingsEmulatorLocation, "");
		}

		let args: string[] = [];

		if (_useOwnDotnet) {
			args.push(debuggerLocation.replace('.exe', '') + '.dll');
		}

		if (emulatorLocation) {
			args.push(`--officialEmulator`);
			args.push(emulatorLocation)
		}

		if (_startOfficialEmulator) {
			args.push("--runInOfficialEmulator");
			_startOfficialEmulator = false;
		}

		if (extraParameters) {
			args.push(...extraParameters);
		}

		const location = _useOwnDotnet ? dni.Location : debuggerLocation;

		return new ExecutableLocation(location, args);
	}
}

class ExecutableLocation {
	constructor(public readonly location: string, public readonly args: string[]) {
	}
}

class BitMagicDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;
	private readonly settingsLocalDebugging = Constants.SettingsLocalDebugger;
	private readonly settingsPortNumber = Constants.SettingsDebuggerDapPort;
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

		let localDebugging = config.get(this.settingsLocalDebugging, false);

		if (localDebugging) {
			var portNumber = config.get(this.settingsPortNumber, undefined);
			// make VS Code connect to debug server
			if (portNumber)
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

	private GetDebugAdaptor(debuggerLocation: string, config: vscode.WorkspaceConfiguration, dni: DotNetInstaller): vscode.DebugAdapterExecutable {
		const _useOwnDotnet = config.get(this.settingsUseOwnDotnet, false);
		var emulatorLocation = config.get(this.settingsCustomEmulatorLocation, "");

		if (!emulatorLocation) {
			emulatorLocation = config.get(this.settingsEmulatorLocation, "");
		}

		let args: string[] = [];

		if (_useOwnDotnet) {
			args.push(debuggerLocation.replace('.exe', '') + '.dll');
		}

		if (emulatorLocation) {
			args.push(`--officialEmulator`);
			args.push(emulatorLocation)
		}

		if (_startOfficialEmulator) {
			args.push("--runInOfficialEmulator");
			_startOfficialEmulator = false;
		}

		const location = _useOwnDotnet ? dni.Location : debuggerLocation;
		var options = new DapOptions(path.dirname(location));

		bmOutput.appendLine(`Running: ${location} ${args.join(' ')}`);

		return new vscode.DebugAdapterExecutable(location, args, options);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}

class DapOptions implements vscode.DebugAdapterExecutableOptions {
	constructor(cwd: string) {
		this.cwd = cwd;
	}
	cwd?: string;
}

export function deactivate() {
	bmOutput.appendLine("Deactivate");

	if (lspClient)
		lspClient.stop();
	// do nothing.
}
