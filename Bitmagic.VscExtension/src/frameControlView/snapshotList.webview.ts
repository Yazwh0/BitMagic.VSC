import { Button } from "@vscode/webview-ui-toolkit";
import { messages } from "../utilities/messages";

// the snapshot list part of the Frame Control webview, see snapshotList.ts for the extension side

interface SnapshotInfo {
    Id: number;
    Name: string;
    Created: string;
    Frame: number;
    BeamX: number;
    BeamY: number;
    Thumbnail: string;
}

let postMessage: (message: any) => void = () => { };
let sessionActive = false;

export function setupSnapshots(post: (message: any) => void) {
    postMessage = post;

    (document.getElementById("snapshot") as Button).addEventListener("click", () => postMessage({ command: messages.snapshotTake }));
}

export function setSnapshotsActive(active: boolean) {
    sessionActive = active;
    (document.getElementById("snapshot") as Button).disabled = !active;

    document.getElementById("snapshot_list")?.classList.toggle("disabled", !active);
}

export function showSnapshots(snapshots: SnapshotInfo[]) {
    const list = document.getElementById("snapshot_list") as HTMLDivElement;
    list.replaceChildren(...[...snapshots].reverse().map(i => snapshotRow(i))); // newest first

    (document.getElementById("snapshot_empty") as HTMLDivElement).hidden = snapshots.length !== 0;
}

function snapshotRow(snapshot: SnapshotInfo): HTMLElement {
    const row = document.createElement("div");
    row.className = "snapshot_row";
    row.title = "Double click to go back to this snapshot";
    row.addEventListener("dblclick", (event) => {
        if ((event.target as HTMLElement).closest("vscode-button"))
            return; // double clicking rename or delete isn't a restore

        if (sessionActive)
            postMessage({ command: messages.snapshotRestore, id: snapshot.Id });
    });

    const thumbnail = document.createElement("img");
    thumbnail.className = "snapshot_thumbnail";
    thumbnail.draggable = false;
    thumbnail.src = `data:image/png;base64,${snapshot.Thumbnail}`;

    const text = document.createElement("div");
    text.className = "snapshot_text";

    const name = document.createElement("div");
    name.className = "snapshot_name";
    name.textContent = `#${snapshot.Id} ${snapshot.Name}`;

    const detail = document.createElement("div");
    detail.className = "snapshot_detail";
    detail.textContent = `${snapshot.Created}, frame ${snapshot.Frame}, beam ${snapshot.BeamX}, ${snapshot.BeamY}`;

    text.append(name, detail);

    row.append(thumbnail, text,
        iconButton("edit", "Rename", () => postMessage({ command: messages.snapshotRename, id: snapshot.Id })),
        iconButton("trash", "Delete", () => postMessage({ command: messages.snapshotDelete, id: snapshot.Id })));

    return row;
}

function iconButton(icon: string, title: string, onClick: () => void): HTMLElement {
    const button = document.createElement("vscode-button") as Button;
    button.setAttribute("appearance", "icon");
    button.title = title;

    const span = document.createElement("span");
    span.className = `codicon codicon-${icon}`;
    button.append(span);

    button.addEventListener("click", (event) => {
        event.stopPropagation(); // not a restore
        onClick();
    });

    return button;
}
