import { describe, expect, it } from "vitest";
import { bytesPerRow, isAlreadyLoaded, parseAddress, parseSearchInput, trimBuffer } from "./memoryView.logic";

describe("parseAddress", () => {
    it("parses a plain decimal address", () => {
        expect(parseAddress("2080")).toBe(2080);
    });

    it("parses a $-prefixed hex address", () => {
        expect(parseAddress("$0810")).toBe(0x0810);
    });

    it("parses a 0x-prefixed hex address", () => {
        expect(parseAddress("0x0810")).toBe(0x0810);
    });

    it("trims surrounding whitespace", () => {
        expect(parseAddress("  $0810  ")).toBe(0x0810);
    });

    it("rejects an empty string", () => {
        expect(parseAddress("")).toBeUndefined();
        expect(parseAddress("   ")).toBeUndefined();
    });

    it("rejects unparseable input", () => {
        expect(parseAddress("not an address")).toBeUndefined();
    });
});

describe("parseSearchInput", () => {
    it("treats plain text as a case-insensitive byte pattern", () => {
        const result = parseSearchInput("AUTO");
        expect(result).toEqual({ bytes: [0x41, 0x55, 0x54, 0x4f], caseInsensitive: true });
    });

    it("parses $-prefixed hex bytes as case-sensitive", () => {
        const result = parseSearchInput("$DEADBEEF");
        expect(result).toEqual({ bytes: [0xde, 0xad, 0xbe, 0xef], caseInsensitive: false });
    });

    it("parses 0x-prefixed hex bytes with spaces between pairs", () => {
        const result = parseSearchInput("0xDE AD BE EF");
        expect(result).toEqual({ bytes: [0xde, 0xad, 0xbe, 0xef], caseInsensitive: false });
    });

    it("rejects odd-length hex", () => {
        expect(parseSearchInput("$ABC")).toBeUndefined();
    });

    it("rejects non-hex characters after a hex prefix", () => {
        expect(parseSearchInput("$ZZ")).toBeUndefined();
    });

    it("rejects an empty pattern", () => {
        expect(parseSearchInput("")).toBeUndefined();
        expect(parseSearchInput("   ")).toBeUndefined();
    });
});

describe("isAlreadyLoaded", () => {
    it("is true when the offset falls within the loaded buffer for the same reference", () => {
        const buffer = { bytes: new Array(256).fill(0), start: 0x1000, memoryReference: "main" };
        expect(isAlreadyLoaded(buffer, "main", 0x1000)).toBe(true);
        expect(isAlreadyLoaded(buffer, "main", 0x10f0)).toBe(true);
    });

    it("is false when the offset falls outside the loaded range", () => {
        const buffer = { bytes: new Array(256).fill(0), start: 0x1000, memoryReference: "main" };
        expect(isAlreadyLoaded(buffer, "main", 0x0ff0)).toBe(false);
        expect(isAlreadyLoaded(buffer, "main", 0x1100)).toBe(false);
    });

    it("is false when the buffer is empty, regardless of range", () => {
        const buffer = { bytes: [] as number[], start: 0, memoryReference: "main" };
        expect(isAlreadyLoaded(buffer, "main", 0)).toBe(false);
    });

    // Regression: switching memory space/bank while landing on an address that numerically
    // falls within the *previous* space's loaded range must still force a reload - the two
    // spaces' bytes at that offset have nothing to do with each other.
    it("is false when the memory reference differs, even if the offset is numerically in range", () => {
        const buffer = { bytes: new Array(256).fill(0), start: 0, memoryReference: "main" };
        expect(isAlreadyLoaded(buffer, "vram", 0)).toBe(false);
        expect(isAlreadyLoaded(buffer, "rambank_0", 0)).toBe(false);
    });
});

describe("trimBuffer", () => {
    const rowBytes = (rows: number) => new Array(rows * bytesPerRow).fill(0);

    it("does nothing when under the cap", () => {
        const bytes = rowBytes(4);
        const result = trimBuffer(bytes, 0x1000, "tail", 256);
        expect(result).toEqual({ bytes, start: 0x1000, trimmedRows: 0 });
    });

    it("trims from the tail when grown at the head, leaving start unchanged", () => {
        const bytes = rowBytes(20); // 320 bytes, over a 256-byte (16-row) cap
        const result = trimBuffer(bytes, 0x1000, "head", 256);
        expect(result.bytes.length).toBe(256);
        expect(result.start).toBe(0x1000);
        expect(result.trimmedRows).toBe(0);
    });

    it("trims from the head when grown at the tail, advancing start and reporting trimmed rows", () => {
        const bytes = rowBytes(20); // 320 bytes, 4 rows over a 256-byte (16-row) cap
        const result = trimBuffer(bytes, 0x1000, "tail", 256);
        expect(result.bytes.length).toBe(256);
        expect(result.trimmedRows).toBe(4);
        expect(result.start).toBe(0x1000 + 4 * bytesPerRow);
    });
});
