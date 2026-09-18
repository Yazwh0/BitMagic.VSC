// Pure logic for the memory view, kept free of `vscode`/DOM imports so it can be unit tested
// directly under Node (see memoryView.logic.test.ts) without needing the extension host or a
// browser environment. memoryView.ts (host) and memoryView.webview.ts (webview) both import
// from here rather than duplicating or re-deriving this logic inline.

export const bytesPerRow = 16;

export function parseAddress(value: string): number | undefined {
    let v = value.trim();
    if (v === "")
        return undefined;
    if (v.startsWith("$"))
        v = `0x${v.substring(1)}`;
    const parsed = parseInt(v);
    return isNaN(parsed) ? undefined : parsed;
}

// A leading $ or 0x means hex bytes (whitespace between pairs is fine); anything else is a
// literal, case-insensitive text search - deliberately just one input, no separate mode toggle.
export function parseSearchInput(value: string): { bytes: number[]; caseInsensitive: boolean } | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;

    const hexMatch = trimmed.match(/^(?:\$|0x)(.+)$/i);
    if (hexMatch) {
        const cleaned = hexMatch[1].replace(/\s+/g, "");
        if (cleaned.length === 0 || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned))
            return undefined;

        const bytes: number[] = [];
        for (let i = 0; i < cleaned.length; i += 2)
            bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
        return { bytes, caseInsensitive: false };
    }

    return { bytes: Array.from(trimmed).map(c => c.charCodeAt(0) & 0xff), caseInsensitive: true };
}

export interface LoadedBuffer {
    bytes: number[];
    start: number;
    memoryReference: string | undefined;
}

// Whether `targetOffset` (already row-aligned) in `targetMemoryReference` is already covered by
// the currently loaded buffer - i.e. jumping there can just scroll instead of clearing the grid
// and re-fetching. The memoryReference check matters: switching space/bank while landing on an
// address that happens to fall within the *old* buffer's numeric range must still force a real
// reload (regression: without this check, switching space near offset 0 silently kept showing
// the previous space's stale data instead of loading the new one).
export function isAlreadyLoaded(buffer: LoadedBuffer, targetMemoryReference: string, targetOffset: number): boolean {
    return buffer.bytes.length > 0 &&
        buffer.memoryReference === targetMemoryReference &&
        targetOffset >= buffer.start &&
        targetOffset < buffer.start + buffer.bytes.length;
}

export type GrowEdge = "head" | "tail";

export interface TrimResult {
    bytes: number[];
    start: number;
    trimmedRows: number;
}

// Enforces the sliding-window byte cap after growing at `growEdge`, trimming the opposite edge.
// trimmedRows is only ever nonzero when trimming from the head (start moves forward), since
// that's the case a caller needs to compensate scroll position for.
export function trimBuffer(bytes: number[], start: number, growEdge: GrowEdge, maxBytes: number, rowSize: number = bytesPerRow): TrimResult {
    const maxRows = maxBytes / rowSize;
    const currentRows = bytes.length / rowSize;
    if (currentRows <= maxRows)
        return { bytes, start, trimmedRows: 0 };

    const excessRows = currentRows - maxRows;

    if (growEdge === "head")
        return { bytes: bytes.slice(0, bytes.length - excessRows * rowSize), start, trimmedRows: 0 };

    return {
        bytes: bytes.slice(excessRows * rowSize),
        start: start + excessRows * rowSize,
        trimmedRows: excessRows
    };
}
