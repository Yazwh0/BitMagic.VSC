import * as fs from 'fs';
import * as vscode from 'vscode';
import { Uri } from "vscode";
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";
import path = require('path');
import { platform } from 'os';
import DotNetInstaller from './dotnetinstaller';
import Constants from './constants';
const decompress = require('decompress');
const decompressTargz = require('decompress-targz');

export default class AutoUpdater {
    private readonly versionUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/version.txt';
    private readonly debuggerUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/BitMagic-TheDebugger';
    private readonly developVersionUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/prerelease/version.txt';
    private readonly developDebuggerUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/prerelease/BitMagic-TheDebugger';

    public async CheckForUpdate(context: vscode.ExtensionContext, output: vscode.OutputChannel, dni: DotNetInstaller) {
        try {
            var config = vscode.workspace.getConfiguration();

            const _useOwnDotnet = config.get(Constants.SettingsUseOwnDotnet, false);

            if (_useOwnDotnet)
            {
                await dni.CheckDotnet(context, output);
            }

            const _versionUrl = config.get(Constants.SettingsUseDevelop, false) ? this.developVersionUrl : this.versionUrl;
            const _debuggerUrl = config.get(Constants.SettingsUseDevelop, false) ? this.developDebuggerUrl : this.debuggerUrl;

            var autoUpdate = config.get(Constants.SettingsAutoUpdate, true);

            if (!autoUpdate) {
                output.append('Skipping update check as not enabled.');
                return;
            }

            var debuggerTarget = config.get(Constants.SettingsAlternativeDebugger, '');

            if (debuggerTarget) {
                output.append('Skipping update check as a custom location for the debugger is used.');
                return;
            }

            var localCopy = config.get(Constants.SettingsDebuggerPath, '');

            if (localCopy) {
                output.append('Checking for update... ');
                const versionFileName = 'version.txt';

                const fileDownloader: FileDownloader = await getApi();

                const file: Uri = await fileDownloader.downloadFile(Uri.parse(_versionUrl), versionFileName, context);

                if (file === undefined) {
                    output.appendLine("Error.");
                }

                const downloadedVersionFile = file.fsPath;

                let liveVersion = fs.readFileSync(downloadedVersionFile, { encoding: 'utf8' });

                let localVersion = '';
                if (fs.existsSync(path.join(localCopy, 'version.txt')))
                    localVersion = fs.readFileSync(path.join(localCopy, 'version.txt'), { encoding: 'utf8' });

                await fileDownloader.deleteItem(downloadedVersionFile, context)
                output.appendLine('Done.');

                liveVersion = liveVersion.trim();
                localVersion = localVersion.trim();

                if (localVersion !== "")
                {
                    output.appendLine(`Current version ${localVersion.substring(0, 8)}.`);
                }

                if (liveVersion === localVersion) {
                    output.appendLine("No update required.");
                    return;
                }

                output.appendLine(`New version ${liveVersion.substring(0, 8)} found!`);
                output.show();
                output.append('Deleting old version... ');
                fs.rmSync(localCopy, { recursive: true, force: true });
                output.appendLine('Done.');
            }

            await this.DownloadEmulator(context, output, _debuggerUrl, _useOwnDotnet, dni);
        }
        catch (e: unknown) {
            output.appendLine('');
            if (e instanceof Error)
                output.appendLine(e.message);
            else {
                output.appendLine('Unknown error in CheckForUpdate():');
                output.appendLine(JSON.stringify(e));
            }
            output.show();
        }
    }

    private async DownloadEmulator(context: vscode.ExtensionContext, output: vscode.OutputChannel, _debuggerUrl: string, useOwnDotnet: boolean, dni: DotNetInstaller) {
        const fileDownloader: FileDownloader = await getApi();

        output.append('Downloading new version... ');

        const os = platform();

        var fsPath = '';

        if (os == 'win32') {
            var url = _debuggerUrl + '.Windows.zip'
            const file: Uri = await fileDownloader.downloadFile(Uri.parse(url), 'X16D', context, undefined, undefined, { shouldUnzip: true });

            if (file === undefined) {
                output.appendLine("Error.");
                output.show();
                return;
            }    
            output.appendLine('Done.');

            fsPath = file.fsPath;
        }
        else if (os == 'linux') {
            var url = _debuggerUrl + '.Linux.tar.gz'
            const file: Uri = await fileDownloader.downloadFile(Uri.parse(url), 'BitMagic-TheDebugger.Linux.tar.gz', context, undefined, undefined, { shouldUnzip: false });

            if (file === undefined) {
                output.appendLine("Error.");
                output.show();
                return;
            }    
            output.appendLine('Done.');

            fsPath = path.dirname(file.fsPath);
            fsPath = fsPath + path.sep + 'X16D';

            if (fs.existsSync(fsPath))
            {
                output.append('Cleaning up old version... ');
                fs.rmSync(fsPath, { recursive: true, force: true });
                output.appendLine('Done.');
            }

            fs.mkdirSync(fsPath);

            output.append('Decompressing... ');
            await decompress(file.fsPath, fsPath, { plugins : [ decompressTargz() ]});
            output.appendLine('Done.');

            if(useOwnDotnet)
            {
                await dni.CheckLinuxDependencies(context, output, fsPath + path.sep + 'X16D.dll', dni.Location);
            }
        }
        else
            throw new Error(`Unsupported Platform '${os}', only windows and linux are currently supported.`);

        var config = vscode.workspace.getConfiguration();

        config.update(Constants.SettingsDebuggerPath, fsPath, true);
    }
}