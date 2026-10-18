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
            const localDebugger = config.get(Constants.SettingsLocalDebugger, false);

            if (localDebugger)
            {
                output.appendLine('Skipping update check as the local debugger is set.');
                output.show();
                return;
            }

            const _useOwnDotnet = config.get(Constants.SettingsUseOwnDotnet, false);

            if (_useOwnDotnet)
            {
                await dni.CheckDotnet(context, output);
            }

            const _versionUrl = config.get(Constants.SettingsUseDevelop, false) ? this.developVersionUrl : this.versionUrl;
            const _debuggerUrl = config.get(Constants.SettingsUseDevelop, false) ? this.developDebuggerUrl : this.debuggerUrl;

            var autoUpdate = config.get(Constants.SettingsAutoUpdate, true);

            if (!autoUpdate) {
                output.appendLine('Skipping update check as not enabled.');
                return;
            }

            var debuggerTarget = config.get(Constants.SettingsAlternativeDebugger, '');

            if (debuggerTarget) {
                output.appendLine('Skipping update check as a custom location for the debugger is used.');
                return;
            }

            var localCopy = config.get(Constants.SettingsDebuggerPath, '');
            var backup = '';

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

                backup = this.MoveAside(localCopy, output);
                if (backup === '')
                    return;
            }

            let downloaded = false;
            try {
                downloaded = await this.DownloadEmulator(context, output, _debuggerUrl, _useOwnDotnet, dni);
            }
            finally {
                if (backup !== '')
                    this.FinishUpdate(localCopy, backup, downloaded, output);
            }
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

    // Renames the existing install out of the way rather than deleting it in place. On Windows a
    // directory rename fails as a whole if any file inside is open (eg a running X16D.exe and its
    // loaded dlls), so this either moves everything or nothing - never leaving a half deleted install.
    // Returns the backup path, or '' if the install is in use and the update should be skipped.
    private MoveAside(localCopy: string, output: vscode.OutputChannel): string {
        const backup = localCopy + '.old';

        // Left over from a previous update whose cleanup failed.
        if (fs.existsSync(backup)) {
            try {
                fs.rmSync(backup, { recursive: true, force: true });
            }
            catch {
                output.appendLine(`Could not remove '${backup}', update skipped. Close any running debug sessions and restart VSCode.`);
                this.WarnUpdateBlocked();
                return '';
            }
        }

        if (!fs.existsSync(localCopy))
            return backup;

        output.append('Moving old version aside... ');
        try {
            fs.renameSync(localCopy, backup);
        }
        catch (e: unknown) {
            output.appendLine('Failed.');
            output.appendLine(`The debugger is in use (${e instanceof Error ? e.message : e}), update skipped. Close any running debug sessions and restart VSCode.`);
            this.WarnUpdateBlocked();
            return '';
        }
        output.appendLine('Done.');

        return backup;
    }

    private WarnUpdateBlocked() {
        vscode.window.showWarningMessage('Update detected, but could not be applied probably because of other open sessions.');
    }

    // Removes the backup if the new version was installed, otherwise puts the old version back.
    private FinishUpdate(localCopy: string, backup: string, downloaded: boolean, output: vscode.OutputChannel) {
        if (!fs.existsSync(backup))
            return;

        try {
            if (downloaded) {
                output.append('Deleting old version... ');
                fs.rmSync(backup, { recursive: true, force: true });
            }
            else {
                output.append('Download failed, restoring old version... ');
                fs.rmSync(localCopy, { recursive: true, force: true });
                fs.renameSync(backup, localCopy);
            }
            output.appendLine('Done.');
        }
        catch (e: unknown) {
            // Not fatal: a stale backup is cleared on the next update.
            output.appendLine('Failed.');
            output.appendLine(e instanceof Error ? e.message : JSON.stringify(e));
        }
    }

    private async DownloadEmulator(context: vscode.ExtensionContext, output: vscode.OutputChannel, _debuggerUrl: string, useOwnDotnet: boolean, dni: DotNetInstaller): Promise<boolean> {
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
                return false;
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
                return false;
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

        return true;
    }
}
