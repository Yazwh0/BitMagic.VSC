"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const vscode = require("vscode");
const vscode_1 = require("vscode");
const vscode_file_downloader_api_1 = require("@microsoft/vscode-file-downloader-api");
const path = require("path");
class AutoUpdater {
    constructor() {
        this.versionUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/version.txt';
        this.debuggerUrl = 'https://github.com/Yazwh0/BitMagic/releases/download/latest/BitMagic-TheDebugger.zip';
        this.settingsDebuggerPath = 'bitMagic.debugger.path';
    }
    async CheckForUpdate(context, output) {
        try {
            var config = vscode.workspace.getConfiguration();
            var localCopy = config.get(this.settingsDebuggerPath, '');
            if (localCopy) {
                output.append('Checking for update... ');
                const versionFileName = 'version.txt';
                const fileDownloader = await (0, vscode_file_downloader_api_1.getApi)();
                const file = await fileDownloader.downloadFile(vscode_1.Uri.parse(this.versionUrl), versionFileName, context);
                if (file === undefined) {
                    output.appendLine("Error.");
                }
                const downloadedVersionFile = file.fsPath;
                const liveVersion = fs.readFileSync(downloadedVersionFile, { encoding: 'utf8' });
                const localVersion = fs.readFileSync(path.join(localCopy, 'version.txt'), { encoding: 'utf8' });
                await fileDownloader.deleteItem(downloadedVersionFile, context);
                output.appendLine('Done.');
                if (liveVersion === localVersion) {
                    output.appendLine("No update required.");
                    return;
                }
                output.appendLine('New version found!');
                output.append('Deleting old version... ');
                fs.rmSync(localCopy, { recursive: true, force: true });
                output.appendLine('Done.');
            }
            await this.DownloadEmulator(context, output);
        }
        catch (e) {
            output.appendLine('');
            if (e instanceof Error)
                output.appendLine(e.message);
            else
                output.appendLine('Unknown error in CheckForUpdate():');
            output.appendLine(JSON.stringify(e));
        }
    }
    async DownloadEmulator(context, output) {
        const fileDownloader = await (0, vscode_file_downloader_api_1.getApi)();
        output.append('Downloading new version... ');
        const file = await fileDownloader.downloadFile(vscode_1.Uri.parse(this.debuggerUrl), 'X16D', context, undefined, undefined, { shouldUnzip: true });
        if (file === undefined) {
            output.appendLine("Error.");
            return;
        }
        output.appendLine('Done.');
        var config = vscode.workspace.getConfiguration();
        config.update(this.settingsDebuggerPath, file.fsPath, true);
    }
}
exports.default = AutoUpdater;
//# sourceMappingURL=autoUpdater.js.map