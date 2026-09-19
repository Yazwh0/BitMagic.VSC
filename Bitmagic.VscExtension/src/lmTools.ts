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
        const data = Buffer.from(bytes.map(b => b & 0xff)).toString("base64");

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

export function registerLmTools(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.lm.registerTool("bitmagic_getSprites", new GetSpritesTool()),
        vscode.lm.registerTool("bitmagic_getLayers", new GetLayersTool()),
        vscode.lm.registerTool("bitmagic_getPalette", new GetPaletteTool()),
        vscode.lm.registerTool("bitmagic_getCpuHistory", new GetCpuHistoryTool()),
        vscode.lm.registerTool("bitmagic_getMemoryUse", new GetMemoryUseTool()),
        vscode.lm.registerTool("bitmagic_readMemory", new ReadMemoryTool()),
        vscode.lm.registerTool("bitmagic_writeMemory", new WriteMemoryTool()),
        vscode.lm.registerTool("bitmagic_searchMemory", new SearchMemoryTool())
    );
}
