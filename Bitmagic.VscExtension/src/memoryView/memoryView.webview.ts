import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox, vsCodeTextField, TextField, vsCodeDropdown, Dropdown, vsCodeOption } from "@vscode/webview-ui-toolkit";
import { messages } from "../utilities/messages";
import { bytesPerRow, parseAddress, isAlreadyLoaded, trimBuffer } from "./memoryView.logic";

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox(),
    vsCodeTextField(),
    vsCodeDropdown(),
    vsCodeOption()
);

const vscode = acquireVsCodeApi();

const chunkSize = 256;           // bytes fetched per scroll-triggered request (16 rows)
const maxBufferBytes = 4096;     // sliding-window cap; the far edge is trimmed once exceeded
const scrollThresholdRows = 4;   // start fetching this many rows before hitting a loaded edge

let bufferStart = 0;
let bufferBytes: number[] = [];
let bufferMemoryReference: string | undefined;
let reachedEnd = false;
let loadingBefore = false;
let loadingAfter = false;

let searchMatches: number[] = [];
let searchMatchIndex = -1;
let searchPatternLength = 0;
let searchDebounceTimer: number | undefined;

// True whenever an editByte/editAsciiChar input is open and not yet committed/reverted. The
// write's server round-trip (see the "writeRefresh" case) must not force a re-render while this
// is true, or it would destroy whatever's currently being typed into.
let editingInputActive = false;

window.addEventListener("load", main);

function main() {
    setVSCodeMessageListener();

    const spaceDropdown = document.getElementById("space") as Dropdown;
    spaceDropdown.addEventListener("change", () => {
        updateBankEnabled();
        jumpTo(0);
    });

    const bankField = document.getElementById("bank") as TextField;
    bankField.addEventListener("change", () => jumpTo(0));

    const addressField = document.getElementById("address") as TextField;
    const goButton = document.getElementById("go") as Button;
    const go = () => {
        const parsed = parseAddress(addressField.value);
        if (parsed !== undefined)
            jumpTo(parsed);
    };
    const updateGoEnabled = () => {
        goButton.disabled = parseAddress(addressField.value) === undefined;
    };
    goButton.addEventListener("click", go);
    addressField.addEventListener("input", updateGoEnabled);
    addressField.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !goButton.disabled)
            go();
    });
    updateGoEnabled();

    const refreshButton = document.getElementById("refresh") as Button;
    refreshButton.addEventListener("click", () => refresh());

    const searchButton = document.getElementById("search") as Button;
    searchButton.addEventListener("click", () => openFindBar());

    setupFindBar();

    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onScroll);

    window.addEventListener("keydown", (e) => {
        if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)
            return;

        if (e.key.toLowerCase() === "g") {
            e.preventDefault();
            const field = document.getElementById("address") as unknown as HTMLInputElement;
            field.focus();
            field.select();
        }
        else if (e.key.toLowerCase() === "f") {
            e.preventDefault();
            openFindBar();
        }
    });

    updateBankEnabled();
    jumpTo(0);
}

function setupFindBar() {
    const input = document.getElementById("find_input") as HTMLInputElement;
    const prevButton = document.getElementById("find_prev") as HTMLButtonElement;
    const nextButton = document.getElementById("find_next") as HTMLButtonElement;
    const closeButton = document.getElementById("find_close") as HTMLButtonElement;

    input.addEventListener("input", scheduleSearch);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey)
                goToPreviousMatch();
            else
                goToNextMatch();
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            closeFindBar();
        }
    });

    prevButton.addEventListener("click", goToPreviousMatch);
    nextButton.addEventListener("click", goToNextMatch);
    closeButton.addEventListener("click", closeFindBar);
}

function openFindBar() {
    const bar = document.getElementById("find_bar") as HTMLDivElement;
    bar.classList.remove("hidden");

    const input = document.getElementById("find_input") as HTMLInputElement;
    input.focus();
    input.select();

    if (input.value)
        runSearch();
}

function closeFindBar() {
    const bar = document.getElementById("find_bar") as HTMLDivElement;
    bar.classList.add("hidden");

    searchMatches = [];
    searchMatchIndex = -1;
    searchPatternLength = 0;
    renderGrid();
}

function scheduleSearch() {
    if (searchDebounceTimer !== undefined)
        window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(runSearch, 250);
}

function runSearch() {
    const input = document.getElementById("find_input") as HTMLInputElement;
    const pattern = input.value.trim();
    const countEl = document.getElementById("find_count") as HTMLSpanElement;

    searchMatches = [];
    searchMatchIndex = -1;
    searchPatternLength = 0;
    renderGrid();

    if (pattern.length === 0) {
        countEl.textContent = "No results";
        return;
    }

    countEl.textContent = "Searching...";
    vscode.postMessage({ command: messages.openSearch, memoryReference: currentMemoryReference(), pattern });
}

function goToNextMatch() {
    if (searchMatches.length === 0)
        return;
    searchMatchIndex = (searchMatchIndex + 1) % searchMatches.length;
    updateFindCount();
    jumpTo(searchMatches[searchMatchIndex]);
}

function goToPreviousMatch() {
    if (searchMatches.length === 0)
        return;
    searchMatchIndex = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    updateFindCount();
    jumpTo(searchMatches[searchMatchIndex]);
}

function updateFindCount() {
    const countEl = document.getElementById("find_count") as HTMLSpanElement;
    if (searchMatches.length === 0)
        countEl.textContent = "No results";
    else
        countEl.textContent = `${searchMatchIndex + 1} of ${searchMatches.length}`;
}

function handleSearchResults(data: any) {
    const countEl = document.getElementById("find_count") as HTMLSpanElement;

    if (data.error) {
        searchMatches = [];
        searchMatchIndex = -1;
        searchPatternLength = 0;
        countEl.textContent = data.reason ?? "Search failed";
        renderGrid();
        return;
    }

    searchMatches = data.matches ?? [];
    searchMatchIndex = searchMatches.length > 0 ? 0 : -1;
    searchPatternLength = data.patternLength ?? 0;

    if (searchMatches.length === 0) {
        countEl.textContent = "No results";
        renderGrid();
        return;
    }

    countEl.textContent = `1 of ${searchMatches.length}${data.truncated ? "+" : ""}`;
    jumpTo(searchMatches[0]);
}

function updateBankEnabled() {
    const spaceDropdown = document.getElementById("space") as Dropdown;
    const bankField = document.getElementById("bank") as TextField;
    bankField.disabled = spaceDropdown.value !== "rambank" && spaceDropdown.value !== "rombank";
}

function currentSpace(): string {
    const spaceDropdown = document.getElementById("space") as Dropdown;
    return spaceDropdown.value;
}

function currentMemoryReference(): string {
    const space = currentSpace();
    if (space === "rambank" || space === "rombank") {
        const bankField = document.getElementById("bank") as TextField;
        const bank = parseInt(bankField.value.trim()) || 0;
        return `${space}_${bank}`;
    }
    return space;
}

function isWritableSpace(space: string): boolean {
    return space === "main" || space === "vram" || space === "sdcard" || space === "nvram";
}

function requestRead(offset: number, count: number, intent: string) {
    vscode.postMessage({
        command: messages.readMemoryPage,
        memoryReference: currentMemoryReference(),
        offset,
        count,
        intent
    });
}

function jumpTo(address: number) {
    const rowAligned = Math.max(0, address) - (Math.max(0, address) % bytesPerRow);
    const memoryReference = currentMemoryReference();

    // Already loaded - scroll it into view instead of clearing the grid and re-fetching, which
    // would otherwise blank the page (and flash the scrollbar away) for an identical result -
    // e.g. re-running a search that still has the same single match.
    if (isAlreadyLoaded({ bytes: bufferBytes, start: bufferStart, memoryReference: bufferMemoryReference }, memoryReference, rowAligned)) {
        scrollRowIntoView(rowAligned);
        // Re-render even though the data hasn't changed - the current-match highlight may have
        // moved (e.g. stepping to a different match that's already within the loaded window).
        renderGrid();
        return;
    }

    bufferStart = rowAligned;
    bufferBytes = [];
    bufferMemoryReference = memoryReference;
    reachedEnd = false;
    loadingBefore = false;
    loadingAfter = false;

    // Deliberately don't touch the DOM or scroll position here - the old content stays on
    // screen until the "init" response actually arrives and renderGrid() swaps it in atomically,
    // rather than blanking the page (and flashing the scrollbar away) for however long the
    // fetch takes.
    requestRead(rowAligned, chunkSize * 2, "init");
}

function scrollRowIntoView(rowAligned: number) {
    const rowHeight = getRowHeight();
    if (!rowHeight)
        return;

    const rowTop = ((rowAligned - bufferStart) / bytesPerRow) * rowHeight;
    const rowBottom = rowTop + rowHeight;

    if (rowTop < window.scrollY)
        window.scrollTo(0, rowTop);
    else if (rowBottom > window.scrollY + window.innerHeight)
        window.scrollTo(0, rowBottom - window.innerHeight);
    // else already fully visible - nothing to do
}

function refresh() {
    if (bufferBytes.length === 0) {
        jumpTo(bufferStart);
        return;
    }

    const rowHeight = getRowHeight();
    if (!rowHeight) {
        requestRead(bufferStart, bufferBytes.length, "refresh");
        return;
    }

    const totalRows = bufferBytes.length / bytesPerRow;
    const firstVisibleRow = Math.max(0, Math.floor(window.scrollY / rowHeight));
    const lastVisibleRow = Math.min(totalRows - 1, Math.ceil((window.scrollY + window.innerHeight) / rowHeight));

    const offset = bufferStart + firstVisibleRow * bytesPerRow;
    const count = (lastVisibleRow - firstVisibleRow + 1) * bytesPerRow;

    requestRead(offset, count, "refresh");
}

function onScroll() {
    const rowHeight = getRowHeight();
    if (!rowHeight)
        return;

    const scrollTop = window.scrollY;
    const documentHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;

    const rowsFromTop = scrollTop / rowHeight;
    if (!loadingBefore && bufferStart > 0 && rowsFromTop < scrollThresholdRows) {
        loadingBefore = true;
        const fetchCount = Math.min(chunkSize, bufferStart);
        requestRead(bufferStart - fetchCount, fetchCount, "prepend");
    }

    const rowsFromBottom = (documentHeight - scrollTop - viewportHeight) / rowHeight;
    if (!loadingAfter && !reachedEnd && rowsFromBottom < scrollThresholdRows) {
        loadingAfter = true;
        requestRead(bufferStart + bufferBytes.length, chunkSize, "append");
    }
}

// Enforces the sliding-window size cap after growing at `growEdge`, trimming the opposite
// edge. Returns the number of rows trimmed from the head, for scroll-position compensation.
function enforceBufferLimit(growEdge: "head" | "tail"): number {
    const result = trimBuffer(bufferBytes, bufferStart, growEdge, maxBufferBytes);
    bufferBytes = result.bytes;
    bufferStart = result.start;
    return result.trimmedRows;
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;

        switch (command) {
            case messages.memoryPageUpdate:
                updateMemoryDisplay(JSON.parse(event.data.payload));
                break;
            case messages.searchResults:
                handleSearchResults(event.data);
                break;
        }
    });
}

function updateMemoryDisplay(messageData: any) {
    // Ignore stale responses for a space/bank the user has since navigated away from.
    if (messageData.memoryReference !== currentMemoryReference())
        return;

    if (messageData.error) {
        // Drop the in-flight flags so a failed read (e.g. a memory space the running
        // debugger doesn't support) doesn't permanently block further scrolling/refreshing.
        loadingBefore = false;
        loadingAfter = false;
        if (messageData.intent === "init" || messageData.intent === "refresh") {
            reachedEnd = true;
            if (bufferBytes.length === 0)
                renderMessage(`Could not read "${messageData.memoryReference}" from the debugger.`);
        }
        return;
    }

    const bytes = decodeBase64Bytes(messageData.data ?? "");
    const unreadableBytes = messageData.unreadableBytes ?? 0;

    switch (messageData.intent) {
        case "init":
            bufferStart = messageData.offset;
            bufferBytes = bytes;
            reachedEnd = unreadableBytes > 0;
            renderGrid();
            // Scroll after the swap, not before - jumpTo() deliberately left the old content
            // and scroll position alone until now, so this is the first point where moving to
            // the top of the newly loaded page actually corresponds to what's on screen.
            window.scrollTo(0, 0);
            break;

        case "prepend": {
            const addedRows = bytes.length / bytesPerRow;
            bufferBytes = bytes.concat(bufferBytes);
            bufferStart = messageData.offset;
            enforceBufferLimit("head");
            renderGrid();
            const rowHeight = getRowHeight();
            if (rowHeight)
                window.scrollBy(0, addedRows * rowHeight);
            loadingBefore = false;
            break;
        }

        case "append": {
            bufferBytes = bufferBytes.concat(bytes);
            if (unreadableBytes > 0)
                reachedEnd = true;
            const removedRows = enforceBufferLimit("tail");
            renderGrid();
            if (removedRows > 0) {
                const rowHeight = getRowHeight();
                if (rowHeight)
                    window.scrollBy(0, -removedRows * rowHeight);
            }
            loadingAfter = false;
            break;
        }

        case "refresh": {
            // Only the visible rows were requested - patch them in place rather than
            // replacing the whole loaded window.
            const startIndex = messageData.offset - bufferStart;
            for (let i = 0; i < bytes.length; i++) {
                if (startIndex + i >= 0 && startIndex + i < bufferBytes.length)
                    bufferBytes[startIndex + i] = bytes[i];
            }
            renderGrid();

            const autoRefresh = document.getElementById("auto_refresh") as Checkbox;
            if (autoRefresh.checked) {
                setTimeout(refresh, 10);
            }
            break;
        }

        case "writeRefresh": {
            // Editing no longer waits on this response to navigate (see commit() in
            // editByte/editAsciiChar) - it's purely a correctness check now. Only apply it if
            // nothing is actively being typed into right now: this confirmation can arrive well
            // after the user has already moved on to editing a different (or the same) cell,
            // and forcing a render here would blow away that in-progress, uncommitted input.
            const startIndex = messageData.offset - bufferStart;
            for (let i = 0; i < bytes.length; i++) {
                if (startIndex + i >= 0 && startIndex + i < bufferBytes.length)
                    bufferBytes[startIndex + i] = bytes[i];
            }
            if (!editingInputActive) {
                renderGrid();
            }
            break;
        }
    }

    // Re-run the same check a real scroll event would - covers both "too short to overflow the
    // viewport yet" (no scroll event will ever fire to trigger the checks in onScroll) and
    // "already at the top/bottom of the loaded window" (e.g. right after jumping to a search
    // match: scrollTo(0,0) below doesn't fire a "scroll" event if we're already at 0, so without
    // this, scrolling up wouldn't load anything until some other scroll happened first).
    if (messageData.intent !== "writeRefresh") {
        onScroll();
    }
}

function renderMessage(text: string) {
    const container = document.getElementById("memory_dump") as HTMLDivElement;

    const message = document.createElement("p");
    message.className = "memory_message";
    message.textContent = text;

    // Build off-DOM and swap in one go, rather than clearing then appending as two separate
    // operations - the latter has a visible empty-container moment on every redraw.
    container.replaceChildren(message);
}

function getRowHeight(): number {
    const firstRow = document.querySelector("#memory_dump table.memory_table tr") as HTMLTableRowElement | null;
    return firstRow ? firstRow.getBoundingClientRect().height : 0;
}

function decodeBase64Bytes(base64: string): number[] {
    const binary = atob(base64);
    const bytes: number[] = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function renderGrid() {
    const container = document.getElementById("memory_dump") as HTMLDivElement;
    const writable = isWritableSpace(currentSpace());

    // Only worth checking matches that could fall within what's actually being rendered.
    const highlighted = new Set<number>();
    const currentMatchStart = searchMatchIndex >= 0 ? searchMatches[searchMatchIndex] : -1;
    if (searchPatternLength > 0) {
        for (const matchStart of searchMatches) {
            if (matchStart + searchPatternLength <= bufferStart || matchStart >= bufferStart + bufferBytes.length)
                continue;
            for (let k = 0; k < searchPatternLength; k++)
                highlighted.add(matchStart + k);
        }
    }

    const table = document.createElement("table");
    table.className = "memory_table";

    for (let row = 0; row * bytesPerRow < bufferBytes.length; row++) {
        const tr = document.createElement("tr");

        const addressCell = document.createElement("td");
        addressCell.className = "address";
        addressCell.textContent = `${(bufferStart + row * bytesPerRow).toString(16).padStart(4, "0")}:`;
        tr.appendChild(addressCell);

        const asciiCell = document.createElement("td");
        asciiCell.className = "ascii";

        for (let col = 0; col < bytesPerRow; col++) {
            const index = row * bytesPerRow + col;
            const byteCell = document.createElement("td");
            byteCell.className = "byte";
            const asciiChar = document.createElement("span");

            if (index < bufferBytes.length) {
                const value = bufferBytes[index];
                const offset = bufferStart + index;
                byteCell.textContent = value.toString(16).padStart(2, "0");

                const printable = value >= 0x20 && value <= 0x7e;
                asciiChar.textContent = printable ? String.fromCharCode(value) : ".";
                if (!printable)
                    asciiChar.classList.add("nonprintable");

                if (value === 0) {
                    byteCell.classList.add("zero");
                    asciiChar.classList.add("zero");
                }

                if (highlighted.has(offset)) {
                    const cls = offset >= currentMatchStart && offset < currentMatchStart + searchPatternLength ? "match_current" : "match";
                    byteCell.classList.add(cls);
                    asciiChar.classList.add(cls);
                }

                if (writable) {
                    byteCell.classList.add("editable");
                    byteCell.dataset.offset = String(offset);
                    byteCell.addEventListener("click", () => editByte(byteCell, offset, value));

                    asciiChar.classList.add("editable");
                    asciiChar.dataset.offset = String(offset);
                    asciiChar.addEventListener("click", () => editAsciiChar(asciiChar, offset, value));
                }
            }
            else {
                asciiChar.textContent = " ";
            }

            tr.appendChild(byteCell);
            asciiCell.appendChild(asciiChar);
        }

        tr.appendChild(asciiCell);

        table.appendChild(tr);
    }

    // Build off-DOM and swap in one go, rather than clearing then appending as two separate
    // operations - the latter has a visible empty-container moment on every redraw (and this
    // runs on every refresh tick during auto-refresh, not just full re-fetches).
    container.replaceChildren(table);
}

// Fire-and-forget persist - navigation no longer waits on this (see commit() in
// editByte/editAsciiChar), so this is purely "tell the debugger", not "drive the UI".
function writeByte(offset: number, value: number) {
    const rowOffset = offset - (offset % bytesPerRow);
    vscode.postMessage({
        command: messages.writeMemoryByte,
        memoryReference: currentMemoryReference(),
        offset,
        value,
        refreshOffset: rowOffset,
        refreshCount: bytesPerRow
    });
}

// Continues an edit chain immediately (synchronously, right after a renderGrid()) - lets
// someone type a run of hex pairs or ASCII characters, or arrow between cells, without ever
// waiting on a server round-trip in between.
function continueEditing(offset: number, mode: "hex" | "ascii") {
    if (offset < bufferStart || offset >= bufferStart + bufferBytes.length)
        return;

    const value = bufferBytes[offset - bufferStart];
    const selector = `[data-offset="${offset}"]`;
    const cell = document.querySelector(mode === "hex" ? `td.byte${selector}` : `span${selector}`);
    if (!cell)
        return;

    if (mode === "hex")
        editByte(cell as HTMLTableCellElement, offset, value);
    else
        editAsciiChar(cell as HTMLSpanElement, offset, value);
}

// Shared by editByte/editAsciiChar's commit(): applies a validated byte value optimistically
// (so the grid and any navigation reflect it immediately, without waiting on the write's server
// round-trip), persists it, then re-renders and optionally continues editing at nextOffset - all
// synchronously, so a run of arrow-key presses or typed characters never lands in a gap with no
// focused input (which would otherwise let the keys fall through to the browser's own scrolling).
function commitByte(offset: number, value: number, mode: "hex" | "ascii", nextOffset?: number) {
    editingInputActive = false;

    const index = offset - bufferStart;
    if (index >= 0 && index < bufferBytes.length)
        bufferBytes[index] = value;
    writeByte(offset, value);

    renderGrid();

    if (nextOffset !== undefined)
        continueEditing(nextOffset, mode);
}

// Shared by editByte/editAsciiChar's commit() for the "nothing valid to save" case: still exits
// or navigates, just without writing anything.
function discardByte(mode: "hex" | "ascii", nextOffset?: number) {
    editingInputActive = false;
    renderGrid();

    if (nextOffset !== undefined)
        continueEditing(nextOffset, mode);
}

function editByte(cell: HTMLTableCellElement, offset: number, value: number) {
    editingInputActive = true;
    cell.textContent = "";
    // opacity on the cell dims its whole subtree, including the input we're about to add -
    // there's no way to boost opacity back up from a child, so drop it for the duration of the
    // edit (renderGrid() naturally restores it on commit/discard since it rebuilds from scratch).
    cell.classList.remove("zero");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "byte_input";
    input.maxLength = 2;
    input.value = value.toString(16).padStart(2, "0");

    // Enter/Escape both just leave edit mode - Enter commits (or discards if invalid), Escape
    // always discards. Arrow keys navigate: they commit a valid value on the way past (like a
    // spreadsheet), but if there's nothing valid to save they still just move rather than
    // discarding the cell's actual value.
    const commit = (nextOffset?: number) => {
        const parsed = parseInt(input.value, 16);
        if (isNaN(parsed) || parsed < 0 || parsed > 0xff)
            discardByte("hex", nextOffset);
        else
            commitByte(offset, parsed, "hex", nextOffset);
    };

    // Auto-commit and move on once a full byte's worth of hex digits is typed - lets someone
    // type "01020304" straight through instead of clicking each byte and pressing Enter.
    input.addEventListener("input", () => {
        if (/^[0-9a-fA-F]{2}$/.test(input.value))
            commit(offset + 1);
    });

    input.addEventListener("keydown", (e) => {
        switch (e.key) {
            case "Enter":
                e.preventDefault();
                commit();
                break;
            case "Escape":
                e.preventDefault();
                discardByte("hex");
                break;
            case "ArrowLeft":
                e.preventDefault();
                commit(offset - 1);
                break;
            case "ArrowRight":
                e.preventDefault();
                commit(offset + 1);
                break;
            case "ArrowUp":
                e.preventDefault();
                commit(offset - bytesPerRow);
                break;
            case "ArrowDown":
                e.preventDefault();
                commit(offset + bytesPerRow);
                break;
        }
    });

    input.addEventListener("blur", () => {
        // commit()/discardByte() both clear editingInputActive synchronously before this could
        // fire (removing the input from the DOM triggers blur) - only a genuine loss of focus
        // without either (e.g. clicking outside the grid entirely) should still revert.
        if (editingInputActive)
            discardByte("hex");
    });

    cell.appendChild(input);
    input.focus();
    input.select();
}

function editAsciiChar(cell: HTMLSpanElement, offset: number, value: number) {
    editingInputActive = true;
    cell.textContent = "";
    // See editByte - opacity on the cell would otherwise dim the input we're about to add too.
    cell.classList.remove("nonprintable", "zero");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ascii_input";
    input.maxLength = 1;
    const printable = value >= 0x20 && value <= 0x7e;
    input.value = printable ? String.fromCharCode(value) : "";

    // See editByte's commit() for the Enter/Escape-exit vs. arrow-navigate rationale.
    const commit = (nextOffset?: number) => {
        if (input.value.length === 1)
            commitByte(offset, input.value.charCodeAt(0) & 0xff, "ascii", nextOffset);
        else
            discardByte("ascii", nextOffset);
    };

    // A single character fills a maxLength=1 field immediately - commit and advance to the
    // next byte so a run of characters can be typed straight through.
    input.addEventListener("input", () => {
        if (input.value.length >= 1)
            commit(offset + 1);
    });

    input.addEventListener("keydown", (e) => {
        switch (e.key) {
            case "Enter":
                e.preventDefault();
                commit();
                break;
            case "Escape":
                e.preventDefault();
                discardByte("ascii");
                break;
            case "ArrowLeft":
                e.preventDefault();
                commit(offset - 1);
                break;
            case "ArrowRight":
                e.preventDefault();
                commit(offset + 1);
                break;
            case "ArrowUp":
                e.preventDefault();
                commit(offset - bytesPerRow);
                break;
            case "ArrowDown":
                e.preventDefault();
                commit(offset + bytesPerRow);
                break;
        }
    });

    input.addEventListener("blur", () => {
        if (editingInputActive)
            discardByte("ascii");
    });

    cell.appendChild(input);
    input.focus();
    input.select();
}
