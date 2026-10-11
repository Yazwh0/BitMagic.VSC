import { describe, expect, it } from "vitest";
import { findHoverExpression } from "./hoverText.logic";

// '¦' marks the cursor, which is on the character after it. The same cases as the debugger's HoverTextTests.
function find(line: string) {
    const column = line.indexOf("¦");
    return findHoverExpression(line.replace("¦", ""), column);
}

describe("findHoverExpression", () => {
    it.each([
        // on a name: the name
        ["    jsr ¦BSOUT", "BSOUT"],
        ["    jsr BSOUT¦", "BSOUT"],
        ["    lda #¦VALUE", "VALUE"],
        ["    sta ¦lines,x", "lines"],
        ["    lda (¦ptr),y", "ptr"],
        ["    lda (¦ptr,x)", "ptr"],
        ["    jmp (¦vector)", "vector"],
        ["    lda <¦buffer", "buffer"],
        ["    adc #¦COUNT+1", "COUNT"],
        ["    lda text:line_¦count", "text:line_count"],
        ["    lda source: <lo: >hi: ¦table, x", "table"],
        [".: lda ¦value", "value"],
        ["    lda ¦value ; a ; comment", "value"],
        // elsewhere in the operand: the whole operand
        ["    lda ¦#VALUE", "#VALUE"],
        ["    adc #COUNT+¦1", "#COUNT+1"],
        ["    sta lines, ¦Y", "lines, Y"],
        ["    lda #$¦ff", "#$ff"],
        ["    lda #'¦A'", "#'A'"],
        ["    lda source: ¦$ffff, x", "$ffff, x"],
        ["    lda #';'¦+1", "#';'+1"],
        // labels and directives
        [".¦loop:", "loop"],
        [".const ¦width 40", "width"],
        [".const height=25, cells=width*¦height", "height"],
        [".const height=25, cells=width *¦ height", "width * height"],
        [".export feed_high feed:sample ¦+ 1", "feed:sample + 1"],
        [".constvar byte ptr ¦vera_ctrl $9f25", "vera_ctrl"],
        [".constvar public ushort score base ¦+ 2", "base + 2"],
        [".word $1234, label, label ¦+ 2", "label + 2"],
        [".byte $00, <¦table, >table", "table"],
    ])("%s", (line, expected) => {
        expect(find(line)?.expression).toBe(expected);
    });

    it.each([
        "    ¦lda #VALUE",
        "    rts¦ ",
        "    lda value ; ¦comment",
        "   ¦ ",
        "    .const ¦public X 1",
        "    .¦proc foo",
        "    .proc ¦foo",
    ])("nothing for %s", (line) => {
        expect(find(line)).toBeUndefined();
    });

    it("gives the range of the name", () => {
        expect(find("    sta ¦lines,x")).toEqual({ start: 8, end: 13, expression: "lines" });
    });

    it("gives the range of the operand", () => {
        expect(find("    adc #COUNT+¦1")).toEqual({ start: 8, end: 16, expression: "#COUNT+1" });
    });
});
