import * as fs from 'fs';
import * as vscode from 'vscode';
import { Uri } from "vscode";
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";
import path = require('path');
import { platform } from 'os';
const decompress = require('decompress');
const decompressTargz = require('decompress-targz');

export default class AutoUpdater {
    private readonly versionUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/version.txt';
    private readonly debuggerUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/BitMagic-TheDebugger';
    private readonly developVersionUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/prerelease/version.txt';
    private readonly developDebuggerUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/prerelease/BitMagic-TheDebugger';
    private readonly settingsDebuggerPath = 'bitMagic.debugger.path';
    private readonly settingsAutoUpdate = 'bitMagic.debugger.autoUpdateDebugger';
    private readonly settingsAlternativeDebugger = 'bitMagic.debugger.alternativePath';
    private readonly settingsUseDevelop = "bitMagic.debugger.developRelease";

    public async CheckForUpdate(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
        try {
            var config = vscode.workspace.getConfiguration();

            var _versionUrl = config.get(this.settingsUseDevelop, false) ? this.developVersionUrl : this.versionUrl;
            var _debuggerUrl = config.get(this.settingsUseDevelop, false) ? this.developDebuggerUrl : this.debuggerUrl;

            var autoUpdate = config.get(this.settingsAutoUpdate, true);

            if (!autoUpdate) {
                output.append('Skipping update check as not enabled.');
                return;
            }

            var debuggerTarget = config.get(this.settingsAlternativeDebugger, '');

            if (debuggerTarget) {
                output.append('Skipping update check as a custom location for the debugger is used.');
                return;
            }

            var localCopy = config.get(this.settingsDebuggerPath, '');

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

            await this.DownloadEmulator(context, output, _debuggerUrl);
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

    private async DownloadEmulator(context: vscode.ExtensionContext, output: vscode.OutputChannel, _debuggerUrl: string) {
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

            fs.mkdirSync(fsPath);

            await decompress(file.fsPath, fsPath, { plugins : [ decompressTargz() ]});
        }
        else
            throw new Error(`Unsupported Platform '${os}', only windows and linux art currently supported.`);

        var config = vscode.workspace.getConfiguration();

        config.update(this.settingsDebuggerPath, fsPath, true);
    }
}