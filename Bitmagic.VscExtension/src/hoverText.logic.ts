// What the debugger's hover evaluates on a line of bmasm: the name under the cursor, or the operand or
// expression around it. A port of the debugger's HoverText (BitMagic.X16Debugger/Hovers/HoverText.cs), so
// VSCode asks for the same text the language server's hover describes; keep the two in step.

export interface HoverExpression {
    /** Column the expression starts at, zero based. */
    start: number;
    /** Column after its end. */
    end: number;
    /** The text to evaluate. */
    expression: string;
}

// directives whose parameters are definitions: [public|private] [type [ptr]] name [=] value
const definitions = new Set(["const", "export", "var", "constvar", "padvar"]);
const typed = new Set(["var", "constvar", "padvar"]);

// directives whose parameters are a list of values
const values = new Set(["byte", "word"]);

const isNameChar = (c: string) => /[A-Za-z0-9_:]/.test(c);
const isSpace = (c: string) => c === " " || c === "\t";

export function findHoverExpression(line: string, column: number): HoverExpression | undefined {
    if (!line || column < 0 || column > line.length)
        return undefined;

    const code = line.substring(0, commentStart(line));

    let start = skip(code, 0);
    if (start >= code.length || column >= code.length && !(column === code.length && column > 0 && isNameChar(code[column - 1])))
        return undefined;

    const label = /^\.([A-Za-z_]\w*):/.exec(code.substring(start));
    if (label) {
        const nameStart = start + 1;
        const nameEnd = nameStart + label[1].length;
        return column >= nameStart - 1 && column <= nameEnd ? { start: nameStart, end: nameEnd, expression: label[1] } : undefined;
    }

    if (code.startsWith(".:", start))
        start = skip(code, start + 2);
    else if (code[start] === ".")
        return inDirective(code, start, column);

    return inInstruction(code, start, column);
}

function inInstruction(code: string, start: number, column: number): HoverExpression | undefined {
    let keywordEnd = start;
    while (keywordEnd < code.length && !isSpace(code[keywordEnd]))
        keywordEnd++;

    let operandStart = skip(code, keywordEnd);

    // step past any operand labels: name: <lo: >hi:
    const operandLabel = /^[<>]?[A-Za-z_]\w*:\s+/;
    for (let match = operandLabel.exec(code.substring(operandStart)); match; match = operandLabel.exec(code.substring(operandStart)))
        operandStart += match[0].length;

    const operandEnd = trimEnd(code, code.length);

    if (column < operandStart || column > operandEnd || operandStart >= operandEnd)
        return undefined;

    const operand = code.substring(operandStart, operandEnd);
    const expression = expressionOf(operand);
    const expressionStart = operandStart + expression.start;

    return nameAt(code, column, expressionStart, expressionStart + expression.text.length) ??
        { start: operandStart, end: operandEnd, expression: operand };
}

function inDirective(code: string, start: number, column: number): HoverExpression | undefined {
    let keywordEnd = start + 1;
    while (keywordEnd < code.length && !isSpace(code[keywordEnd]))
        keywordEnd++;

    const keyword = code.substring(start + 1, keywordEnd).toLowerCase();

    if (column < keywordEnd)
        return undefined;

    if (values.has(keyword)) {
        for (const [itemStart, itemEnd] of items(code, keywordEnd, code.length)) {
            if (column >= itemStart && column <= itemEnd)
                return nameAt(code, column, itemStart, itemEnd) ?? { start: itemStart, end: itemEnd, expression: code.substring(itemStart, itemEnd) };
        }
        return undefined;
    }

    if (!definitions.has(keyword))
        return undefined;

    const all = keyword === "const" ? items(code, keywordEnd, code.length) : [[skip(code, keywordEnd), trimEnd(code, code.length)] as [number, number]];

    for (const [itemStart, itemEnd] of all) {
        if (column < itemStart || column > itemEnd)
            continue;

        let pos = itemStart;
        let [wordStart, wordEnd] = word(code, pos, itemEnd);

        if (code.substring(wordStart, wordEnd) === "public" || code.substring(wordStart, wordEnd) === "private") {
            pos = wordEnd;
            [wordStart, wordEnd] = word(code, pos, itemEnd);
        }

        if (typed.has(keyword)) {
            pos = wordEnd; // the type
            const [ptrStart, ptrEnd] = word(code, pos, itemEnd);
            if (code.substring(ptrStart, ptrEnd) === "ptr")
                pos = ptrEnd;
        }

        const definedStart = skip(code, pos);
        let definedEnd = definedStart;
        while (definedEnd < itemEnd && /\w/.test(code[definedEnd]))
            definedEnd++;

        let valueStart = skip(code, definedEnd);
        if (valueStart < itemEnd && code[valueStart] === "=")
            valueStart = skip(code, valueStart + 1);

        if (column >= definedStart && column <= definedEnd && definedEnd > definedStart)
            return { start: definedStart, end: definedEnd, expression: code.substring(definedStart, definedEnd) };

        if (column < valueStart || valueStart >= itemEnd)
            return undefined;

        return nameAt(code, column, valueStart, itemEnd) ?? { start: valueStart, end: itemEnd, expression: code.substring(valueStart, itemEnd) };
    }

    return undefined;
}

// the value part of an operand, without its addressing mode
function expressionOf(operand: string): { start: number; text: string } {
    if (operand.startsWith("#")) {
        const start = skip(operand, 1);
        return { start, text: operand.substring(start) };
    }

    for (const regex of [/^\((.*)\)\s*,\s*[yY]$/, /^\((.*?)\s*,\s*[xX]\s*\)$/, /^\((.*)\)$/]) {
        const match = regex.exec(operand);
        if (match) {
            const start = skip(operand, 1);
            return { start, text: operand.substring(start, trimEnd(operand, 1 + match[1].length)) };
        }
    }

    const indexed = /^(.*?)\s*,\s*[xXyY]$/.exec(operand);
    if (indexed)
        return { start: 0, text: indexed[1] };

    return { start: 0, text: operand };
}

/**
 * The name at the column, if it's within start..end: letters, digits, '_' and ':', with any ':' at either end
 * left off. Numbers ($ff, %1010, 12) and character literals give no name.
 */
export function nameAt(text: string, column: number, start: number, end: number): HoverExpression | undefined {
    if (column < start || column > end)
        return undefined;

    if (column === end || !isNameChar(text[column])) {
        if (column > start && isNameChar(text[column - 1]))
            column--;
        else
            return undefined;
    }

    let nameStart = column;
    while (nameStart > start && isNameChar(text[nameStart - 1]))
        nameStart--;

    let nameEnd = column + 1;
    while (nameEnd < end && isNameChar(text[nameEnd]))
        nameEnd++;

    while (nameStart < nameEnd && text[nameStart] === ":")
        nameStart++;

    while (nameEnd > nameStart && text[nameEnd - 1] === ":")
        nameEnd--;

    if (nameStart >= nameEnd || !/[A-Za-z_]/.test(text[nameStart]))
        return undefined;

    if (nameStart > 0 && "$%'".includes(text[nameStart - 1]))
        return undefined;

    return { start: nameStart, end: nameEnd, expression: text.substring(nameStart, nameEnd) };
}

// where the comment starts, ignoring a ';' in a string or character literal
function commentStart(line: string): number {
    let quote = "";
    for (let i = 0; i < line.length; i++) {
        const c = line[i];

        if (quote) {
            if (c === quote)
                quote = "";
            continue;
        }

        if (c === '"' || c === "'")
            quote = c;
        else if (c === ";" || c === "/" && line[i + 1] === "/")
            return i;
    }

    return line.length;
}

// the comma separated items in start..end, outside brackets and quotes, trimmed
function items(text: string, start: number, end: number): [number, number][] {
    const result: [number, number][] = [];
    let depth = 0;
    let quote = "";
    let itemStart = start;

    for (let i = start; i <= end; i++) {
        if (i === end || text[i] === "," && depth === 0 && !quote) {
            const s = skip(text, itemStart);
            const e = trimEnd(text, i);
            if (e > s)
                result.push([s, e]);
            itemStart = i + 1;
            continue;
        }

        const c = text[i];
        if (quote) {
            if (c === quote)
                quote = "";
        }
        else if (c === '"' || c === "'")
            quote = c;
        else if (c === "(" || c === "[")
            depth++;
        else if (c === ")" || c === "]")
            depth--;
    }

    return result;
}

function word(text: string, pos: number, end: number): [number, number] {
    const s = skip(text, pos);
    let e = s;
    while (e < end && !isSpace(text[e]) && text[e] !== "=")
        e++;
    return [s, e];
}

function skip(text: string, pos: number): number {
    while (pos < text.length && isSpace(text[pos]))
        pos++;
    return pos;
}

function trimEnd(text: string, end: number): number {
    while (end > 0 && isSpace(text[end - 1]))
        end--;
    return end;
}
