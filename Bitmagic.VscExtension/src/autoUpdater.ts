import * as fs from 'fs';
import * as vscode from 'vscode';
import { Uri } from "vscode";
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";
import path = require('path');

export default class AutoUpdater {
    private readonly versionUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/version.txt';
    private readonly debuggerUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/BitMagic-TheDebugger.zip';
    private readonly settingsDebuggerPath = 'bitMagic.debugger.path';
    private readonly settingsAutoUpdate = 'bitMagic.debugger.autoUpdateDebugger';
	private readonly settingsAlternativeDebugger = 'bitMagic.debugger.alternativePath';

    public async CheckForUpdate(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
        try {
            var config = vscode.workspace.getConfiguration();

            var autoUpdate = config.get(this.settingsAutoUpdate, true);

            if (!autoUpdate) {
                output.append('Skipping update check as not enabled.');
                return;
            }

            var debuggerTarget = config.get(this.settingsAlternativeDebugger, '');

            if (debuggerTarget)
            {
                output.append('Skipping update check as a custom location for the debugger is used.');
                return;
            }

            var localCopy = config.get(this.settingsDebuggerPath, '');

            if (localCopy) {
                output.append('Checking for update... ');
                const versionFileName = 'version.txt';

                const fileDownloader: FileDownloader = await getApi();

                const file: Uri = await fileDownloader.downloadFile(Uri.parse(this.versionUrl), versionFileName, context);

                if (file === undefined) {
                    output.appendLine("Error.");
                }

                const downloadedVersionFile = file.fsPath;
                const liveVersion = fs.readFileSync(downloadedVersionFile, { encoding: 'utf8' });
                const localVersion = fs.readFileSync(path.join(localCopy, 'version.txt'), { encoding: 'utf8' });

                await fileDownloader.deleteItem(downloadedVersionFile, context)
                output.appendLine('Done.');

                if (liveVersion === localVersion) {
                    output.appendLine("No update required.");
                    return;
                }

                output.appendLine('New version found!');
                output.show();
                output.append('Deleting old version... ');
                fs.rmSync(localCopy, { recursive: true, force: true });
                output.appendLine('Done.');
            }

            await this.DownloadEmulator(context, output);
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

    private async DownloadEmulator(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
        const fileDownloader: FileDownloader = await getApi();

        output.append('Downloading new version... ');
        const file: Uri = await fileDownloader.downloadFile(Uri.parse(this.debuggerUrl), 'X16D', context, undefined, undefined, { shouldUnzip: true });

        if (file === undefined) {
            output.appendLine("Error.");
            output.show();
            return;
        }

        output.appendLine('Done.');

        var config = vscode.workspace.getConfiguration();

        config.update(this.settingsDebuggerPath, file.fsPath, true);
    }
}
