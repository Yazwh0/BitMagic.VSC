import { Webview, window, commands, DebugSession } from "vscode";
import { messages } from "../utilities/messages";

interface SnapshotInfo {
    Id: number;
    Name: string;
    Created: string;
    Frame: number;
    BeamX: number;
    BeamY: number;
    Thumbnail: string;
}

interface SnapshotResponse {
    Success: boolean;
    Error?: string;
    Snapshot?: SnapshotInfo;
    ModemActive?: boolean;
}

// The snapshot list in the Frame Control view. The snapshots themselves are held by the debugger for the session,
// this keeps a copy of the list for the webview. Restoring while running pauses first with the normal debug pause,
// then restores on the stop.
export class SnapshotList {

    private _snapshots: SnapshotInfo[] = [];

    // restore this once the pause has stopped the emulator
    private _pendingRestore: number | undefined;

    constructor(
        private readonly _webview: Webview,
        private readonly _activeSession: () => DebugSession | undefined,
        private readonly _isStopped: () => boolean) {
    }

    // returns true if the message was for the list
    public handleMessage(message: any): boolean {
        switch (message.command) {
            case messages.snapshotTake:
                this._take();
                return true;
            case messages.snapshotRestore:
                this._restore(message.id);
                return true;
            case messages.snapshotRename:
                this._rename(message.id);
                return true;
            case messages.snapshotDelete:
                this._delete(message.id);
                return true;
        }

        return false;
    }

    // the list is only fetched when the session might have changed, after that it's kept up to date here
    public refresh() {
        const session = this._activeSession();

        if (!session) {
            this._snapshots = [];
            this._post();
            return;
        }

        session.customRequest(messages.getSnapshots, {}).then(
            (i: any) => {
                this._snapshots = i?.Snapshots ?? [];
                this._post();
            },
            () => {
                this._snapshots = [];
                this._post();
            });
    }

    public sessionEnded() {
        this._pendingRestore = undefined;
        this._snapshots = [];
        this._post();
    }

    public onStopped() {
        const id = this._pendingRestore;
        this._pendingRestore = undefined;

        if (id !== undefined)
            this._restore(id);
    }

    private _take() {
        const session = this._activeSession();

        if (!session)
            return;

        session.customRequest(messages.takeSnapshot, {}).then(
            (i: SnapshotResponse) => {
                if (!i.Success || !i.Snapshot) {
                    window.showErrorMessage(`Snapshot failed. ${i.Error ?? ""}`);
                    return;
                }

                this._snapshots.push(i.Snapshot);
                this._post();
            },
            (e: any) => window.showErrorMessage(`Snapshot failed. ${e?.message ?? ""}`));
    }

    private _restore(id: number) {
        const session = this._activeSession();

        if (!session)
            return;

        if (!this._isStopped()) {
            this._pendingRestore = id;
            commands.executeCommand('workbench.action.debug.pause');
            return;
        }

        session.customRequest(messages.restoreSnapshot, { Id: id }).then(
            (i: SnapshotResponse) => {
                if (!i.Success) {
                    window.showErrorMessage(`Couldn't restore the snapshot. ${i.Error ?? ""}`);
                    return;
                }

                if (i.ModemActive)
                    window.showWarningMessage("The modem isn't part of the snapshot, so it and any connection it has were left as they were and may not match the restored program.");
            },
            (e: any) => window.showErrorMessage(`Couldn't restore the snapshot. ${e?.message ?? ""}`));
    }

    private async _rename(id: number) {
        const session = this._activeSession();
        const snapshot = this._snapshots.find(i => i.Id === id);

        if (!session || !snapshot)
            return;

        const name = await window.showInputBox({ prompt: `Name for snapshot #${id}`, value: snapshot.Name });

        if (name === undefined || name.trim() === "")
            return;

        session.customRequest(messages.renameSnapshot, { Id: id, Name: name.trim() }).then(
            (i: SnapshotResponse) => {
                if (!i.Success)
                    return;

                snapshot.Name = name.trim();
                this._post();
            });
    }

    private _delete(id: number) {
        const session = this._activeSession();

        if (!session)
            return;

        session.customRequest(messages.deleteSnapshot, { Id: id }).then(
            (i: SnapshotResponse) => {
                if (!i.Success)
                    return;

                this._snapshots = this._snapshots.filter(s => s.Id !== id);
                this._post();
            });
    }

    private _post() {
        this._webview.postMessage({ command: messages.snapshotList, payload: JSON.stringify(this._snapshots) });
    }
}
