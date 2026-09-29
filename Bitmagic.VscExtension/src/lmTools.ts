import * as vscode from "vscode";
import { messages } from "./utilities/messages";
import { withTimeout } from "./utilities/withTimeout";

// Same rationale as memoryView.ts's own guard: `activeDebugSession?.customRequest(...)`
// would otherwise silently short-circuit the whole chain, leaving a tool invocation
// hanging with no indication anything went wrong.
function requireActiveSession(): vscode.DebugSession | vscode.LanguageModelToolResult {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart("No active BitMagic debug session. Start one in VSCode first.")
        ]);
    }
    return session;
}

function jsonResult(value: unknown): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(value))]);
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

function errorResult(prefix: string, err: any): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`${prefix}: ${err?.message ?? err}`)
    ]);
}

class GetSpritesTool implements vscode.LanguageModelTool<object> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        try {
            const reply = await withTimeout(session.customRequest(messages.spriteView, { command: messages.getSprites }), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to read sprite state", err);
        }
    }
}

class GetLayersTool implements vscode.LanguageModelTool<object> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        try {
            const reply = await withTimeout(session.customRequest("getLayers"), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to read layer state", err);
        }
    }
}

class GetPaletteTool implements vscode.LanguageModelTool<object> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        try {
            const reply = await withTimeout(session.customRequest("bm_palette"), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to read palette", err);
        }
    }
}

class GetCpuHistoryTool implements vscode.LanguageModelTool<object> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        try {
            const reply = await withTimeout(session.customRequest(messages.getHistory, { Message: "getall" }), 5000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to read CPU history", err);
        }
    }
}

class GetMemoryUseTool implements vscode.LanguageModelTool<object> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        try {
            const reply = await withTimeout(session.customRequest(messages.getMemoryUse), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to read memory use overview", err);
        }
    }
}

interface ReadMemoryParams {
    memoryReference: string;
    offset: number;
    count: number;
}

class ReadMemoryTool implements vscode.LanguageModelTool<ReadMemoryParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<ReadMemoryParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { memoryReference, offset, count } = options.input;

        try {
            const reply: any = await withTimeout(session.customRequest(messages.readMemory, { memoryReference, offset, count }), 3000);
            const raw = reply?.data ? Buffer.from(reply.data, "base64") : Buffer.alloc(0);
            return jsonResult({
                ...reply,
                bytesHex: raw.toString("hex"),
                bytes: Array.from(raw)
            });
        } catch (err) {
            return errorResult(`Failed to read memory at "${memoryReference}"`, err);
        }
    }
}

interface WriteMemoryParams {
    memoryReference: string;
    offset: number;
    bytes: number[];
}

class WriteMemoryTool implements vscode.LanguageModelTool<WriteMemoryParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<WriteMemoryParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { memoryReference, offset, bytes } = options.input;

        // Reject rather than mask out-of-range values, so a bad value isn't silently written as something else.
        const badIndex = bytes.findIndex(b => !Number.isInteger(b) || b < 0 || b > 255);
        if (badIndex >= 0)
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`bytes[${badIndex}] is ${bytes[badIndex]}, but every value must be a byte (0-255).`)
            ]);

        // DAP writeMemory takes base64; callers pass a plain number[].
        const data = Buffer.from(bytes).toString("base64");

        try {
            const reply = await withTimeout(session.customRequest(messages.writeMemory, { memoryReference, offset, data }), 3000);
            return jsonResult({ written: bytes.length, ...(reply as object ?? {}) });
        } catch (err) {
            return errorResult(`Failed to write memory at "${memoryReference}"`, err);
        }
    }
}

interface SearchMemoryParams {
    memoryReference: string;
    pattern: number[];
    caseInsensitive?: boolean;
    maxResults?: number;
}

class SearchMemoryTool implements vscode.LanguageModelTool<SearchMemoryParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<SearchMemoryParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { memoryReference, pattern, caseInsensitive, maxResults } = options.input;
        const data = Buffer.from(pattern.map(b => b & 0xff)).toString("base64");

        try {
            const reply = await withTimeout(session.customRequest(messages.searchMemory, {
                MemoryReference: memoryReference,
                Pattern: data,
                CaseInsensitive: !!caseInsensitive,
                MaxResults: maxResults ?? 500
            }), 5000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Memory search failed", err);
        }
    }
}

class GetExceptionInfoTool implements vscode.LanguageModelTool<object> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        try {
            const reply = await withTimeout(session.customRequest(messages.exceptionInfo, { threadId: 1 }), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to read exception info", err);
        }
    }
}

interface FindMemoryValueParams {
    toFind: number;
    searchType: string;
    searchWidth: string;
    locations?: { Location: number; Value: number }[];
}

class FindMemoryValueTool implements vscode.LanguageModelTool<FindMemoryValueParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<FindMemoryValueParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { toFind, searchType, searchWidth, locations } = options.input;

        try {
            // A fresh scan (no locations passed) walks every RAM bank and can take up to a
            // minute regardless of value/searchType - see this tool's modelDescription.
            const reply = await withTimeout(session.customRequest(messages.debuggerSearch, {
                SearchWidth: searchWidth,
                ToFind: toFind,
                SearchType: searchType,
                Locations: locations ?? []
            }), 90000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Memory value scan failed", err);
        }
    }
}

interface SendKeyParams {
    key: string;
    down: boolean;
}

class SendKeyTool implements vscode.LanguageModelTool<SendKeyParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<SendKeyParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { key, down } = options.input;

        try {
            const reply = await withTimeout(session.customRequest(messages.keyboardInput, { Key: key, Down: down }), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult(`Failed to send key "${key}"`, err);
        }
    }
}

interface SendMouseParams {
    deltaX?: number;
    deltaY?: number;
    left?: boolean;
    right?: boolean;
    middle?: boolean;
}

class SendMouseTool implements vscode.LanguageModelTool<SendMouseParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<SendMouseParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { deltaX, deltaY, left, right, middle } = options.input;

        try {
            const reply = await withTimeout(session.customRequest(messages.mouseInput, {
                DeltaX: deltaX ?? 0,
                DeltaY: deltaY ?? 0,
                Left: !!left,
                Right: !!right,
                Middle: !!middle
            }), 3000);
            return jsonResult(reply);
        } catch (err) {
            return errorResult("Failed to send mouse input", err);
        }
    }
}

interface GetVariablesParams {
    scopeName?: string;
    frameId?: number;
    maxDepth?: number;
}

// Same defaults as X16M's get_variables: hardware scopes like VERA are wide as well as deep,
// so a shallow default depth plus a hard line cap keeps one call from being enormous.
const defaultVariablesDepth = 3;
const maxVariableLines = 300;

class GetVariablesTool implements vscode.LanguageModelTool<GetVariablesParams> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<GetVariablesParams>): Promise<vscode.LanguageModelToolResult> {
        const session = requireActiveSession();
        if (session instanceof vscode.LanguageModelToolResult) return session;

        const { scopeName, frameId, maxDepth } = options.input;

        try {
            const scopesReply: any = await withTimeout(session.customRequest("scopes", { frameId: frameId ?? 0 }), 3000);
            const scopes: any[] = scopesReply?.scopes ?? [];
            const names = scopes.map(s => s.name).join(", ");

            if (!scopeName)
                return textResult(`Available scopes: ${names}`);

            const scope = scopes.find(s => s.name?.toLowerCase() === scopeName.toLowerCase());
            if (!scope)
                return textResult(`No scope named '${scopeName}'. Available scopes: ${names}`);

            const lines: string[] = [];
            const complete = scope.variablesReference
                ? await appendVariableTree(session, scope.variablesReference, 0, maxDepth ?? defaultVariablesDepth, lines)
                : true;

            if (lines.length === 0)
                return textResult(`${scope.name}: (empty)`);

            if (!complete)
                lines.push(`... truncated at ${maxVariableLines} lines. Narrow down with a smaller maxDepth.`);

            return textResult(lines.join("\n"));
        } catch (err) {
            return errorResult(`Failed to read variables${scopeName ? ` in "${scopeName}"` : ""}`, err);
        }
    }
}

// Returns false if it stopped early because maxVariableLines was hit.
async function appendVariableTree(session: vscode.DebugSession, variablesReference: number, depth: number, maxDepth: number, lines: string[]): Promise<boolean> {
    const reply: any = await withTimeout(session.customRequest("variables", { variablesReference }), 3000);
    const indent = "  ".repeat(depth);

    for (const v of reply?.variables ?? []) {
        if (lines.length >= maxVariableLines)
            return false;

        // X16D puts a symbol's address in type, e.g. "byte ($0810)" - the same text the
        // Variables pane shows - so keep it rather than just the value.
        const type = v.type ? `: ${v.type}` : "";
        const memory = v.memoryReference ? ` [memoryReference: ${v.memoryReference}]` : "";
        lines.push(`${indent}${v.name}${type} = ${v.value}${memory}`);

        if (v.variablesReference && depth < maxDepth) {
            if (!await appendVariableTree(session, v.variablesReference, depth + 1, maxDepth, lines))
                return false;
        }
    }

    return true;
}

export function registerLmTools(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.lm.registerTool("bitmagic_getSprites", new GetSpritesTool()),
        vscode.lm.registerTool("bitmagic_getLayers", new GetLayersTool()),
        vscode.lm.registerTool("bitmagic_getPalette", new GetPaletteTool()),
        vscode.lm.registerTool("bitmagic_getCpuHistory", new GetCpuHistoryTool()),
        vscode.lm.registerTool("bitmagic_getMemoryUse", new GetMemoryUseTool()),
        vscode.lm.registerTool("bitmagic_readMemory", new ReadMemoryTool()),
        vscode.lm.registerTool("bitmagic_writeMemory", new WriteMemoryTool()),
        vscode.lm.registerTool("bitmagic_searchMemory", new SearchMemoryTool()),
        vscode.lm.registerTool("bitmagic_getExceptionInfo", new GetExceptionInfoTool()),
        vscode.lm.registerTool("bitmagic_findMemoryValue", new FindMemoryValueTool()),
        vscode.lm.registerTool("bitmagic_sendKey", new SendKeyTool()),
        vscode.lm.registerTool("bitmagic_sendMouse", new SendMouseTool()),
        vscode.lm.registerTool("bitmagic_getVariables", new GetVariablesTool())
    );
}
