import * as fs from 'fs';
import * as vscode from 'vscode';
import { Uri } from "vscode";
import { platform } from 'os';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

export default class EmulatorDownloader
{
    private readonly downloadUrl = 'https://github.com/X16Community/x16-emulator/releases/download/'
    private readonly settingsDownloadEmulator = 'bitMagic.officialEmulator.downloadOfficialEmulator';
    private readonly settingsEmulatorLocation = 'bitMagic.officialEmulator.officialEmulatorLocation';
    private readonly settingsEmulatorVersion = 'bitMagic.officialEmulator.version';
    private readonly settingsCustomEmulatorLocation = 'bitMagic.officialEmulator.customOfficialEmulatorLocation';

    public async CheckEmulator(context: vscode.ExtensionContext, output: vscode.OutputChannel)
    {
        var config = vscode.workspace.getConfiguration();

        const _downloadEmulator = config.get(this.settingsDownloadEmulator, true);

        if (!_downloadEmulator)
            return;

        const _customEmulatorLocation = config.get(this.settingsCustomEmulatorLocation);

        if (_customEmulatorLocation)
            return;

        const _emulatorVersion  = config.get(this.settingsEmulatorVersion, '').toLocaleLowerCase();

        if (_emulatorVersion === '')
        {
            output.appendLine("Skipping downloading the official emulator as no version is set.");
            return;
        }
    
        var emulatorLocation = config.get(this.settingsEmulatorLocation, '');

        if (emulatorLocation.endsWith(_emulatorVersion))
            return;

        const os = platform();

        output.append(`Downloading the Official Emulator ${_emulatorVersion}... `);
        
        const fileDownloader: FileDownloader = await getApi();

        if (os == 'win32')
        {
            var url = `${this.downloadUrl}${_emulatorVersion}/x16emu_win64-${_emulatorVersion}.zip`;
            
            const file: Uri = await fileDownloader.downloadFile(Uri.parse(url), _emulatorVersion, context, undefined, undefined, { shouldUnzip: true });

            if (file === undefined) {
                output.appendLine("Error.");
                output.show();
                return;
            }    
            output.appendLine('Done.');

            emulatorLocation = file.fsPath;
        }
        else if (os == 'linux')
        {
            var url = `${this.downloadUrl}${_emulatorVersion}/x16emu_linux-x86_64-${_emulatorVersion}.zip`;
            const file: Uri = await fileDownloader.downloadFile(Uri.parse(url), _emulatorVersion, context, undefined, undefined, { shouldUnzip: true });

            if (file === undefined) {
                output.appendLine("Error.");
                output.show();
                return;
            }    
            output.appendLine('Done.');

            emulatorLocation = file.fsPath;
        }
        else
            throw new Error(`Unsupported Platform '${os}', only windows and linux are currently supported.`);

        config.update(this.settingsEmulatorLocation, emulatorLocation, true);
    }
}