import { Breakpoint, Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, ExtensionContext, commands, debug, DebugSession, DebugAdapterTracker, FunctionBreakpoint } from "vscode";
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { messages } from "../utilities/messages";
import { SnapshotList } from "./snapshotList";

interface BeamPosition {
    x: number;
    y: number;
}

// Frame Control: shows the whole 800x525 beam area and steps the emulator a frame at a time.
// Stepping is a vsync() function breakpoint plus the normal debug continue, nothing custom in the debugger.
// Clicking the image runs to that beam position with a one shot beam(x, y) breakpoint, holding the mouse down
// and moving it carries on to wherever it's moved to. Each run starts from the same anchor state, so it's the
// program really running from where it stopped to the mouse.
export class FrameControlView {

    public static currentPanel: FrameControlView | undefined;

    private static readonly VsyncBreakpoint = "vsync()";
    private static readonly BeamWidth = 800;
    private static readonly BeamHeight = 525;
    private static readonly RenderModeKey = "frameControlView.renderMode";
    private static readonly OwnBreakpointsKey = "frameControlView.ownBreakpoints";

    // shown until the first frame arrives, rather than the broken image icon. 1x1 transparent gif.
    private static readonly BlankImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    private static _context: ExtensionContext | undefined;

    // requests that set the session running
    private static readonly RunRequests = ["continue", "next", "stepIn", "stepOut", "stepBack", "reverseContinue"];

    // set by the debug adapter tracker, so it's known even when the view is closed
    private static _stopped = false;
    private static _session: DebugSession | undefined;

    public static activate(context: ExtensionContext) {

        const uri = context.extensionUri;
        FrameControlView._context = context;
        FrameControlView._removeLeftOverBreakpoints(context);

        context.subscriptions.push(
            commands.registerCommand('frameControlView.start', () => {
                const columnToShowIn = window.activeTextEditor
                    ? window.activeTextEditor.viewColumn
                    : undefined;

                if (FrameControlView.currentPanel) {
                    FrameControlView.currentPanel._panel.reveal(columnToShowIn);
                }
                else {
                    const panel = window.createWebviewPanel(
                        'frameControlView',
                        'Frame Control',
                        columnToShowIn || ViewColumn.One,
                        {
                            enableScripts: true,
                            retainContextWhenHidden: true
                        }
                    );

                    FrameControlView.currentPanel = new FrameControlView(panel, uri);
                }
            })
        );

        FrameControlView._registerSessionEvents(context);

        context.subscriptions.push(
            debug.registerDebugAdapterTrackerFactory('bmasm', {
                createDebugAdapterTracker(session: DebugSession): DebugAdapterTracker {
                    return {
                        onWillReceiveMessage(message: any) {
                            if (message.type === 'request' && FrameControlView.RunRequests.includes(message.command)) {
                                // anything but a click run means the next click takes a new anchor
                                if (message.command === 'continue' && FrameControlView._clickContinue)
                                    FrameControlView._clickContinue = false;
                                else
                                    FrameControlView._anchorValid = false;

                                FrameControlView._setStopped(session, false);
                            }
                            else if (message.type === 'request' && message.command === messages.restoreSnapshot)
                                FrameControlView._anchorValid = false;
                            else if (message.type === 'request' && message.command === 'setFunctionBreakpoints') {
                                FrameControlView._functionBreakpointRequests++;
                                FrameControlView._sentFunctionBreakpoints = (message.arguments?.breakpoints ?? []).map((i: any) => FrameControlView._normalise(i.name));
                            }
                        },
                        onDidSendMessage(message: any) {
                            if (message.type === 'event' && message.event === 'stopped') {
                                FrameControlView._setStopped(session, true);
                                FrameControlView.currentPanel?._onStopped();
                            }
                            else if (message.type === 'event' && message.event === 'continued')
                                FrameControlView._setStopped(session, false);
                            else if (message.type === 'response' && message.command === 'setFunctionBreakpoints') {
                                FrameControlView._functionBreakpointRequests = Math.max(0, FrameControlView._functionBreakpointRequests - 1);
                                FrameControlView.currentPanel?._checkBreakpointsSent();
                            }
                        },
                        onWillStopSession() {
                            FrameControlView._session = undefined;
                            FrameControlView._anchorValid = false;
                            FrameControlView._stopped = false;
                            FrameControlView._functionBreakpointRequests = 0;
                            FrameControlView._sentFunctionBreakpoints = [];
                            FrameControlView.currentPanel?._sessionEnded();
                        }
                    };
                }
            })
        );
    }

    // a session that starts and runs sends no stopped/continued events, so the view has to hear about it starting
    private static _registerSessionEvents(context: ExtensionContext) {
        context.subscriptions.push(
            debug.onDidStartDebugSession(session => {
                if (session.type === 'bmasm') {
                    FrameControlView._anchorValid = false;
                    FrameControlView._setStopped(session, false);
                }
            }),
            debug.onDidChangeActiveDebugSession(() => {
                FrameControlView.currentPanel?._stateChanged();
                FrameControlView.currentPanel?._snapshots.refresh();
            }),
            debug.onDidTerminateDebugSession(() => FrameControlView.currentPanel?._stateChanged())
        );
    }

    private static _setStopped(session: DebugSession, stopped: boolean) {
        FrameControlView._session = session;
        FrameControlView._stopped = stopped;
        FrameControlView.currentPanel?._stateChanged();
    }

    private static _normalise(name: string): string {
        return name.replace(/\s/g, '');
    }

    // each click on the image runs from the same place, an anchor the debugger keeps (see beamScrub). It's valid
    // until the session runs for any other reason, then the next click takes a new one from where it's stopped.
    private static _anchorValid = false;
    private static _clickContinue = false; // the next continue request is a click run

    // what vscode has sent to the debugger, so the view knows when a change it made has got there
    private static _functionBreakpointRequests = 0;
    private static _sentFunctionBreakpoints: string[] = [];

    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private readonly _snapshots: SnapshotList;

    // the vsync() breakpoint this view added, if the user already has one that's used instead and left alone
    private _ownVsyncBreakpoint: FunctionBreakpoint | undefined;

    // the one shot beam(x, y) breakpoint from clicking the image, and where it's set to
    private _ownBeamBreakpoint: FunctionBreakpoint | undefined;
    private _ownBeamTarget: BeamPosition | undefined;

    // where the mouse is while it's held down on the image, and where the last click target stopped
    private _dragging = false;
    private _mouseTarget: BeamPosition | undefined;
    private _reachedTarget: BeamPosition | undefined;

    // continue once the debugger has the updated breakpoints, otherwise it could run before they change
    private _continueWhenBreakpointsSent = false;
    private _continueTimeout: NodeJS.Timeout | undefined;

    // a beam breakpoint change is on its way to the debugger, further moves wait for it rather than flood it
    private _beamChangeInFlight = false;

    // the continue on its way is a click run, so it keeps the anchor
    private _clickRun = false;
    // a click run is under way, further moves wait for it to stop so the next run is from the anchor too
    private _clickRunning = false;
    private _clickRunGeneration = 0; // goes up with each click run, so images asked for before it are dropped

    // the audio is muted by this view, see setMute
    private _muted = false;

    private constructor(panel: WebviewPanel, extensionUri: Uri) {
        this._panel = panel;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        this._snapshots = new SnapshotList(this._panel.webview, () => this._activeSession(), () => FrameControlView._stopped);

        this._setWebviewMessageListener(this._panel.webview);
    }

    private dispose() {
        FrameControlView.currentPanel = undefined;

        this._removeOwnVsyncBreakpoint();
        this._removeOwnBeamBreakpoint();
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _setWebviewMessageListener(webview: Webview) {
        webview.onDidReceiveMessage(
            (message: any) => {
                if (this._snapshots.handleMessage(message))
                    return;

                switch (message.command) {
                    case messages.frameControlReady:
                        this._stateChanged();
                        this._snapshots.refresh();
                        return;
                    case messages.frameRenderMode:
                        FrameControlView._context?.workspaceState.update(FrameControlView.RenderModeKey, message.mode);
                        return;
                    case messages.updateFrame:
                        this._updateFrame(message.renderMode);
                        return;
                    case messages.framePause:
                        this._ensureVsyncBreakpoint();
                        return;
                    case messages.frameStep:
                        this._continueAfter(this._ensureVsyncBreakpoint());
                        return;
                    case messages.frameRun:
                        this._mouseTarget = undefined;
                        this._setMute(false); // back to normal
                        const vsyncRemoved = this._removeOwnVsyncBreakpoint();
                        const beamRemoved = this._removeOwnBeamBreakpoint();
                        this._continueAfter(vsyncRemoved || beamRemoved);
                        return;
                    case messages.beamTarget:
                        this._dragging = true;
                        this._mouseTarget = { x: message.x, y: message.y };
                        this._goToBeamTarget();
                        return;
                    case messages.beamTargetEnd:
                        this._dragging = false;
                        return;
                    case messages.frameMute:
                        this._setMute(message.muted);
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    private _activeSession(): DebugSession | undefined {
        const session = debug.activeDebugSession;
        return session?.type === 'bmasm' ? session : undefined;
    }

    private _stateChanged() {
        const session = this._activeSession();

        this._panel.webview.postMessage({
            command: messages.frameControlState,
            payload: JSON.stringify({ active: session !== undefined, stopped: session !== undefined && FrameControlView._stopped })
        }); // the webview asks for a new image on a stop
    }

    private _sessionEnded() {
        this._removeOwnVsyncBreakpoint();
        this._removeOwnBeamBreakpoint();
        this._mouseTarget = undefined;
        this._reachedTarget = undefined;
        this._dragging = false;
        this._clickRunning = false;
        this._muted = false;
        this._clickRun = false;
        this._beamChangeInFlight = false;
        this._snapshots.sessionEnded();
        this._stateChanged();
    }

    // the beam breakpoint is one shot, so whatever stopped the emulator it's done with. if the mouse is
    // still held down and has moved on since, carry on to the new position.
    private _onStopped() {
        this._reachedTarget = this._ownBeamTarget;
        this._clickRunning = false;

        // a target from beamScrub has no breakpoint to remove, the debugger has already cleared it
        if (!this._removeOwnBeamBreakpoint() && this._ownBeamTarget) {
            this._ownBeamTarget = undefined;
            this._postBeamTarget();
        }

        if (this._dragging)
            this._goToBeamTarget();
        else
            this._mouseTarget = undefined;

        this._snapshots.onStopped();
    }

    private _goToBeamTarget() {
        const target = this._mouseTarget;

        if (!target || !this._activeSession())
            return;

        if (this._beamChangeInFlight)
            return; // picked up again when the change in flight has reached the debugger

        if (FrameControlView._stopped) {
            if (FrameControlView._samePosition(target, this._reachedTarget))
                return; // already stopped here, wait for the mouse to move

            this._runFromAnchor(target);
            return;
        }

        if (this._clickRunning)
            return; // each run is from the anchor, so it waits for this one to stop

        // running, so just move the breakpoint
        if (!FrameControlView._samePosition(target, this._ownBeamTarget))
            this._setOwnBeamBreakpoint(target);
    }

    // puts the machine back to the anchor, or takes one if there isn't one yet, then runs to the target
    // the debugger sets the target in the same call, so there's no breakpoint change to wait for before continuing
    private async _runFromAnchor(target: BeamPosition) {
        const session = this._activeSession();
        const x = Math.max(0, Math.min(FrameControlView.BeamWidth - 1, Math.floor(target.x)));
        const y = Math.max(0, Math.min(FrameControlView.BeamHeight - 1, Math.floor(target.y)));
        let scrubbed = false;

        this._beamChangeInFlight = true; // further moves wait for this run to be under way
        this._clickRunning = true; // from here, as the anchor is put back before the run starts
        this._clickRunGeneration++;

        try {
            const response = await session?.customRequest(messages.beamScrub, { Reset: !FrameControlView._anchorValid, X: x, Y: y });
            scrubbed = response?.Success === true;
            if (scrubbed)
                FrameControlView._anchorValid = true;
        }
        catch {
            // run from where it is, with a beam() breakpoint
        }

        this._beamChangeInFlight = false;

        if (!FrameControlView._stopped || this._activeSession() !== session) {
            this._clickRunning = false;
            return;
        }

        if (!this._muted)
            this._setMute(true); // running the same stretch over and over doesn't sound good

        this._clickRun = true;

        if (!scrubbed) {
            this._setOwnBeamBreakpoint(target);
            this._continueAfter(true);
            return;
        }

        this._ownBeamTarget = { x: x, y: y };
        this._postBeamTarget();
        this._continue();
    }

    private static _samePosition(a: BeamPosition | undefined, b: BeamPosition | undefined): boolean {
        return a !== undefined && b !== undefined && a.x === b.x && a.y === b.y;
    }

    private _setOwnBeamBreakpoint(target: BeamPosition) {
        const x = Math.max(0, Math.min(FrameControlView.BeamWidth - 1, Math.floor(target.x)));
        const y = Math.max(0, Math.min(FrameControlView.BeamHeight - 1, Math.floor(target.y)));
        const breakpoint = new FunctionBreakpoint(`beam(${x}, ${y})`);

        if (this._ownBeamBreakpoint)
            debug.removeBreakpoints([this._ownBeamBreakpoint]);

        this._ownBeamBreakpoint = breakpoint;
        this._ownBeamTarget = { x: x, y: y };
        this._beamChangeInFlight = true;
        this._startSentTimeout();
        debug.addBreakpoints([breakpoint]);
        this._saveOwnBreakpoints();

        this._postBeamTarget();
    }

    // returns true if the breakpoints changed
    private _removeOwnBeamBreakpoint(): boolean {
        if (!this._ownBeamBreakpoint)
            return false;

        debug.removeBreakpoints([this._ownBeamBreakpoint]);
        this._ownBeamBreakpoint = undefined;
        this._ownBeamTarget = undefined;
        this._saveOwnBreakpoints();
        this._postBeamTarget();
        return true;
    }

    private _setMute(muted: boolean) {
        this._muted = muted;
        this._activeSession()?.customRequest(messages.setMute, { Muted: muted }).then(undefined, () => { });
        this._panel.webview.postMessage({ command: messages.frameMute, payload: JSON.stringify(muted) });
    }

    private _postBeamTarget() {
        this._panel.webview.postMessage({ command: messages.beamTargetState, payload: JSON.stringify(this._ownBeamTarget ?? null) });
    }

    private _updateFrame(renderMode: string | undefined) {
        const session = this._activeSession();

        // the webview waits on a reply before streaming the next image, so always send one. during a click run the
        // image would be the anchor or part way there, the stop asks for one anyway.
        if (!session || this._clickRunning) {
            this._panel.webview.postMessage({ command: messages.frameUpdateFailed, payload: "{}" });
            return;
        }

        // a click run that started since this was asked for may have put the anchor back before it was answered
        const generation = this._clickRunGeneration;

        session.customRequest(messages.getScreen, { FullFrame: true, RenderMode: renderMode ?? this._renderMode() }).then(
            i => generation === this._clickRunGeneration
                ? this._panel.webview.postMessage({ command: messages.frameUpdate, payload: JSON.stringify(i) })
                : this._panel.webview.postMessage({ command: messages.frameUpdateFailed, payload: "{}" }),
            () => this._panel.webview.postMessage({ command: messages.frameUpdateFailed, payload: "{}" }));
    }

    // what to show when stopped part way through a frame: beam, finishFrame or fromState, kept for the workspace
    private _renderMode(): string {
        return FrameControlView._context?.workspaceState.get<string>(FrameControlView.RenderModeKey) ?? "beam";
    }

    // the saved mode is selected in the html, setting the dropdown from a message can happen before it has its options
    private _renderModeOption(mode: string, text: string): string {
        return `<vscode-option value="${mode}"${mode === this._renderMode() ? " selected" : ""}>${text}</vscode-option>`;
    }

    private static _enabledFunctionBreakpoints(): string[] {
        return debug.breakpoints
            .filter(i => i instanceof FunctionBreakpoint && i.enabled)
            .map(i => FrameControlView._normalise((i as FunctionBreakpoint).functionName));
    }

    private _hasVsyncBreakpoint(): boolean {
        return FrameControlView._enabledFunctionBreakpoints().includes(FrameControlView.VsyncBreakpoint);
    }

    // the breakpoints this view has added, kept for the workspace so any left behind (eg VSCode closed while the view
    // was open, which saves them with the workspace) are removed next time, see _removeLeftOverBreakpoints
    private _saveOwnBreakpoints() {
        const names = [this._ownVsyncBreakpoint, this._ownBeamBreakpoint].filter(i => i !== undefined).map(i => FrameControlView._normalise(i!.functionName));
        FrameControlView._context?.workspaceState.update(FrameControlView.OwnBreakpointsKey, names);
    }

    // VSCode hands the extension the workspace's breakpoints some time after it's activated, so this waits for them.
    // It stops once they've arrived, or a session starts, as any vsync() after that could be the user's own.
    private static _removeLeftOverBreakpoints(context: ExtensionContext) {
        const names = context.workspaceState.get<string[]>(FrameControlView.OwnBreakpointsKey) ?? [];

        if (names.length === 0)
            return;

        const remove = (breakpoints: readonly Breakpoint[]) => {
            const leftOver = breakpoints.filter(i => i instanceof FunctionBreakpoint && names.includes(FrameControlView._normalise(i.functionName)));

            if (leftOver.length !== 0)
                debug.removeBreakpoints(leftOver);
        };

        let done = false;
        const listeners: Disposable[] = [];
        const finish = () => {
            if (done)
                return;

            done = true;
            listeners.forEach(i => i.dispose());
            context.workspaceState.update(FrameControlView.OwnBreakpointsKey, []);
        };

        listeners.push(
            debug.onDidChangeBreakpoints(e => {
                remove(e.added);
                finish();
            }),
            debug.onDidStartDebugSession(() => finish()));

        context.subscriptions.push(...listeners);

        if (debug.breakpoints.length !== 0) {
            remove(debug.breakpoints);
            finish();
        }
    }

    // VSCode may have saved the workspace's breakpoints already, which is why activate checks too
    public static deactivate() {
        FrameControlView.currentPanel?._removeOwnVsyncBreakpoint();
        FrameControlView.currentPanel?._removeOwnBeamBreakpoint();
    }

    // returns true if the breakpoints changed
    private _ensureVsyncBreakpoint(): boolean {
        if (this._hasVsyncBreakpoint())
            return false;

        this._ownVsyncBreakpoint = new FunctionBreakpoint(FrameControlView.VsyncBreakpoint);
        debug.addBreakpoints([this._ownVsyncBreakpoint]);
        this._saveOwnBreakpoints();
        return true;
    }

    // returns true if the breakpoints changed
    private _removeOwnVsyncBreakpoint(): boolean {
        if (!this._ownVsyncBreakpoint)
            return false;

        debug.removeBreakpoints([this._ownVsyncBreakpoint]);
        this._ownVsyncBreakpoint = undefined;
        this._saveOwnBreakpoints();
        return true;
    }

    private _continueAfter(breakpointsChanged: boolean) {
        if (!breakpointsChanged) {
            this._continue();
            return;
        }

        this._continueWhenBreakpointsSent = true;
        this._startSentTimeout();
    }

    private _startSentTimeout() {
        clearTimeout(this._continueTimeout);
        this._continueTimeout = setTimeout(() => this._breakpointsSent(), 1000); // in case the response is never seen
    }

    // vscode can send several requests for one change, so wait until none are outstanding and the last one
    // sent matches the breakpoints as they are now
    private _checkBreakpointsSent() {
        if (FrameControlView._functionBreakpointRequests !== 0)
            return;

        const sent = [...FrameControlView._sentFunctionBreakpoints].sort();
        const current = FrameControlView._enabledFunctionBreakpoints().sort();

        if (sent.length === current.length && sent.every((value, index) => value === current[index]))
            this._breakpointsSent();
    }

    private _breakpointsSent() {
        clearTimeout(this._continueTimeout);
        this._beamChangeInFlight = false;

        if (this._continueWhenBreakpointsSent) {
            this._continueWhenBreakpointsSent = false;
            this._continue();
        }

        // the mouse may have moved on while the change was on its way
        if (this._dragging)
            this._goToBeamTarget();
    }

    private _continue() {
        if (!this._activeSession() || !FrameControlView._stopped)
            return;

        // the tracker sees the continue request too, but not before the next mouse move might want to know
        FrameControlView._stopped = false;
        FrameControlView._clickContinue = this._clickRun;
        this._clickRun = false;
        this._stateChanged();
        commands.executeCommand('workbench.action.debug.continue');
    }

    private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const webviewUri = getUri(webview, extensionUri, ["out", "frameControlView.webview.js"]);
        const nonce = getNonce();
        const styleUri = getUri(webview, extensionUri, ["out", "frameControlView.css"]);
        const codiconsUri = getUri(webview, extensionUri, ["out", "codicon.css"]);

        return /*html*/ `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <title>Frame Control</title>
                <link rel="stylesheet" href="${codiconsUri}">
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div class="frame_container">
                    <img id="frame" class="frame_display" draggable="false" title="Click to run until the beam reaches that point" src="${FrameControlView.BlankImage}"/>
                    <div id="beam_target" class="beam_target" hidden></div>
                </div>
                <div class="frame_status">
                    <span id="frame_info" class="frame_info"></span>
                    <span id="mouse_info" class="frame_info"></span>
                </div>
                <div class="frame_control">
                    <vscode-button appearance="secondary" id="pause" title="Pause at the next vsync" disabled>
                        <span class="codicon codicon-debug-pause"></span>
                    </vscode-button>
                    <vscode-button appearance="secondary" id="step" title="Step one frame" disabled>
                        <span class="codicon codicon-debug-continue"></span>
                    </vscode-button>
                    <vscode-button appearance="secondary" id="run" title="Run" disabled>
                        <span class="codicon codicon-play"></span>
                    </vscode-button>
                    <vscode-button appearance="secondary" id="mute" title="Mute the audio" disabled>
                        <span id="mute_icon" class="codicon codicon-unmute"></span>
                    </vscode-button>
                    <vscode-button appearance="secondary" id="update" title="Update the image" disabled>
                        <span class="codicon codicon-refresh"></span>
                    </vscode-button>
                    <vscode-button appearance="secondary" id="snapshot" title="Take a snapshot" disabled>
                        <span class="codicon codicon-device-camera"></span>
                    </vscode-button>
                    <vscode-dropdown id="render_mode" class="render_mode" title="What to show when stopped part way through a frame">
                        ${this._renderModeOption("beam", "Stop at beam")}
                        ${this._renderModeOption("finishFrame", "Stop at beam, finish the frame")}
                        ${this._renderModeOption("fromState", "Stop at beam, render from state")}
                    </vscode-dropdown>
                    <vscode-checkbox id="automatically_update" class="auto_update">Automatically Update</vscode-checkbox>
                </div>
                <div class="snapshots">
                    <div class="snapshot_header">Snapshots</div>
                    <div class="snapshot_warning">
                        <span class="codicon codicon-warning"></span>
                        <span>Snapshots don't include the SD card or the modem. Restoring won't undo anything written to the SD card, and leaves the modem and any connection as they are.</span>
                    </div>
                    <div id="snapshot_list" class="snapshot_list"></div>
                    <div id="snapshot_empty" class="snapshot_empty">No snapshots yet. Click the camera to take one, then double click a snapshot to go back to it.</div>
                </div>
                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
            </body>
        </html>`;
    }
}
