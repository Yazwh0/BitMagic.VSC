import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox } from "@vscode/webview-ui-toolkit";
import { messages } from "../utilities/messages";

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox()
);

const vscode = acquireVsCodeApi();

// an image has been asked for and not arrived yet, so streaming only ever has one request in flight
let updatePending = false;
let sessionActive = false;

window.addEventListener("load", main);

function main() {
    setVSCodeMessageListener();

    button("pause").addEventListener("click", () => vscode.postMessage({ command: messages.framePause }));
    button("step").addEventListener("click", () => vscode.postMessage({ command: messages.frameStep }));
    button("run").addEventListener("click", () => vscode.postMessage({ command: messages.frameRun }));
    button("update").addEventListener("click", () => requestUpdate());
    autoUpdate().addEventListener("change", () => {
        if (autoUpdate().checked)
            requestUpdate();
    });

    setupBeamTargeting();

    vscode.postMessage({ command: messages.frameControlReady });
}

function button(id: string): Button {
    return document.getElementById(id) as Button;
}

function autoUpdate(): Checkbox {
    return document.getElementById("automatically_update") as Checkbox;
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case messages.frameControlState:
                updateState(messageData);
                break;
            case messages.frameUpdate:
                updatePending = false;
                updateFrame(messageData);
                streamNext();
                break;
            case messages.frameUpdateFailed:
                updatePending = false;
                break;
            case messages.beamTargetState:
                showBeamTarget(messageData);
                break;
        }
    });
}

function requestUpdate() {
    if (updatePending || !sessionActive)
        return;

    updatePending = true;
    vscode.postMessage({ command: messages.updateFrame });
}

function streamNext() {
    if (autoUpdate().checked)
        setTimeout(requestUpdate, 10);
}

function updateState(state: any) {
    sessionActive = state.active;

    button("pause").disabled = !state.active || state.stopped;
    button("step").disabled = !state.active || !state.stopped;
    button("run").disabled = !state.active || !state.stopped;
    button("update").disabled = !state.active;

    // refresh on every stop, and pick streaming back up when a new session starts with the box still ticked.
    // requestUpdate won't start a second request if one's already out, so this can't double up the stream.
    if (state.active && (state.stopped || autoUpdate().checked))
        requestUpdate();
}

const BeamWidth = 800;
const BeamHeight = 525;

// the image is the full 800x525 beam area, scaled if the panel is resized
function beamPosition(event: MouseEvent): { x: number, y: number } {
    const frame = frameImage();
    const x = Math.floor(event.offsetX * BeamWidth / frame.clientWidth);
    const y = Math.floor(event.offsetY * BeamHeight / frame.clientHeight);

    return {
        x: Math.max(0, Math.min(BeamWidth - 1, x)),
        y: Math.max(0, Math.min(BeamHeight - 1, y))
    };
}

function frameImage(): HTMLImageElement {
    return document.getElementById("frame") as HTMLImageElement;
}

function setupBeamTargeting() {
    const frame = frameImage();
    let mouseDown = false;
    let moveQueued: { x: number, y: number } | undefined;

    const sendTarget = (position: { x: number, y: number }) =>
        vscode.postMessage({ command: messages.beamTarget, x: position.x, y: position.y });

    const endTarget = () => {
        if (!mouseDown)
            return;

        mouseDown = false;
        vscode.postMessage({ command: messages.beamTargetEnd });
    };

    frame.addEventListener("mousedown", (event) => {
        if (event.button !== 0 || !sessionActive)
            return;

        event.preventDefault();
        mouseDown = true;
        sendTarget(beamPosition(event));
    });

    frame.addEventListener("mousemove", (event) => {
        const position = beamPosition(event);
        (document.getElementById("mouse_info") as HTMLSpanElement).textContent = `mouse ${position.x}, ${position.y}`;

        if (!mouseDown)
            return;

        // at most one move per animation frame, the extension only acts on the latest anyway
        if (moveQueued === undefined)
            requestAnimationFrame(() => {
                if (moveQueued !== undefined && mouseDown)
                    sendTarget(moveQueued);
                moveQueued = undefined;
            });

        moveQueued = position;
    });

    frame.addEventListener("mouseleave", () => {
        (document.getElementById("mouse_info") as HTMLSpanElement).textContent = "";
        endTarget();
    });

    window.addEventListener("mouseup", () => endTarget());
}

function showBeamTarget(target: { x: number, y: number } | null) {
    const marker = document.getElementById("beam_target") as HTMLDivElement;

    if (!target) {
        marker.hidden = true;
        return;
    }

    const frame = frameImage();
    marker.style.left = `${frame.clientLeft + (target.x + 0.5) * frame.clientWidth / BeamWidth}px`;
    marker.style.top = `${frame.clientTop + (target.y + 0.5) * frame.clientHeight / BeamHeight}px`;
    marker.hidden = false;
}

function updateFrame(messageData: any) {
    const frame = document.getElementById("frame") as HTMLImageElement;
    frame.src = `data:image/png;base64,${messageData.Display}`;

    const info = document.getElementById("frame_info") as HTMLSpanElement;
    info.textContent = `Frame ${messageData.Frame}, beam ${messageData.BeamX}, ${messageData.BeamY}`;
}
