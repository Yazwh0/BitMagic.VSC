import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox } from "@vscode/webview-ui-toolkit";
import { messages } from "../memoryView/common";

provideVSCodeDesignSystem().register(
    vsCodeButton(),
);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

function main() {
    setVSCodeMessageListener();
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const updateButton = document.getElementById("update") as Button;
    updateButton.addEventListener("click", () => getHistory());

    const resetButton = document.getElementById("reset") as Button;
    resetButton.addEventListener("click", () => resetHistory());
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case messages.updateHistory:
                updateDisplay(messageData);
                break;
        }
    });
}

function getHistory() {
    var resultsDiv = document.getElementById("results") as HTMLDivElement;
    resultsDiv.innerHTML = "Loading...";
    vscode.postMessage({ command: messages.getHistory });
}

function resetHistory() {
    var resultsDiv = document.getElementById("results") as HTMLDivElement;
    resultsDiv.innerHTML = "Loading...";
    vscode.postMessage({ command: messages.resetHistory });
}

function getMoreHistory(index: number) {
    document.getElementById('more')?.remove();
    vscode.postMessage({ command: messages.getMoreHistory, index: index });
}

function updateDisplay(messageData: historyResponse) {
    var results = messageData.HistoryItems;

    var resultsDiv = document.getElementById("results") as HTMLDivElement;

    if (!resultsDiv)
        return;

    if (!results) {
        resultsDiv.innerHTML = "Error, no results.";
        return;
    }

    // only clear the div if index is zero, as thats a new request
    if (messageData.Index === 0)
        resultsDiv.innerHTML = "";

    for (var i = 0; i < results?.length; i++) {
        const p = document.createElement("p") as HTMLParagraphElement;
        p.classList.add("history");

        p.append(createSpan("Ram ", "name"))
        p.append(createSpan(`\$${results[i].RamBank?.toString(16).padStart(2, "0")}`, "number"))

        p.append(createSpan(" Rom ", "name"))
        p.append(createSpan(`\$${results[i].RomBank?.toString(16).padStart(2, "0")}`, "number"))

        p.append(createSpan(" PC ", "name"))
        p.append(createSpan(`\$${results[i].Pc?.toString(16).padStart(4, "0")} `, "number"))

        p.append(createSpan(" A ", "name"))
        p.append(createSpan(`\$${results[i].A?.toString(16).padStart(2, "0")}`, "number"))

        p.append(createSpan(" X ", "name"))
        p.append(createSpan(`\$${results[i].X?.toString(16).padStart(2, "0")}`, "number"))

        p.append(createSpan(" Y ", "name"))
        p.append(createSpan(`\$${results[i].Y?.toString(16).padStart(2, "0")}`, "number"))

        p.append(createSpan(" SP ", "name"))
        p.append(createSpan(`\$${results[i].Sp?.toString(16).padStart(2, "0")} `, "number"))

        p.append(createSpan(`${results[i].Flags}`, "string"))
        p.append(createSpan(` -> `, "name"))

        p.append(createLink(`${results[i].OpCode?.padEnd(32, " ")} `, "string", results[i].SourceFile ?? "", results[i].LineNumber ?? 0))

        p.append(createSpan(results[i].RawParameter ?? "", "number"))

        resultsDiv.append(p);

        if (results[i].Proc) {
            const proc = document.createElement("p") as HTMLParagraphElement;
            proc.classList.add("label");
            proc.append(createSpan(results[i].Proc ?? "", "label"))
            resultsDiv.append(proc);
        }
    }

    if (messageData.More)
    {
        const moreButton = document.createElement("vscode-button") as Button;
        const nextIndex = messageData.Index + 1;
        moreButton.addEventListener('click', () => getMoreHistory(nextIndex));
        moreButton.id = "more";
        moreButton.textContent = "More...";
        resultsDiv.append(moreButton);
    }
}

function createSpan(text: string, spanClass: string): HTMLSpanElement {
    const s = document.createElement("span") as HTMLSpanElement;
    s.innerText = text;
    s.classList.add(spanClass);
    return s;
}

function createLink(text: string, spanClass: string, fileName: string, lineNumber: number): HTMLSpanElement {
    const s = document.createElement("span") as HTMLSpanElement;
    s.innerText = text;
    s.classList.add(spanClass);
    const f = fileName;
    const ln = lineNumber;
    if (f) {
        s.classList.add("clickable");
        s.onclick = _ => {
            vscode.postMessage({ command: messages.showFile, fileName: f, lineNumber: ln });
        };
    }
    return s;
}

class historyResponse {
    HistoryItems: historyItem[] | undefined;
    More: boolean = false;
    Index: number = 0;
}

class historyItem {
    Proc: string | undefined;
    OpCode: string | undefined;
    RawParameter: string | undefined;
    RamBank: number | undefined;
    RomBank: number | undefined;
    Pc: number | undefined;
    A: number | undefined;
    X: number | undefined;
    Y: number | undefined;
    Sp: number | undefined;
    Flags: string | undefined;
    SourceFile: string | undefined;
    LineNumber: number | undefined;
}
