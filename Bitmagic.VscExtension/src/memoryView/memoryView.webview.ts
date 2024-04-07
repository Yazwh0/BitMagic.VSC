import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox } from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox()
);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

function main() {
    setVSCodeMessageListener();
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const updateButton = document.getElementById("update") as Button;
    updateButton.addEventListener("click", () => updateMemory());
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case "memoryUpdate":
                updateDisplay(messageData);
                break;
        }
    });
}

function updateMemory() {
    vscode.postMessage({ command: "getMemoryUse" });
}

function updateDisplay(messageData: any) {
    const d = messageData.Display;
    const layer = document.getElementById("main_ram") as HTMLImageElement;

    layer.src = `data:image/bmp;base64,${d}`;
    const checkBox = document.getElementById("automatically_update") as Checkbox;

    if (checkBox.checked) {
        setTimeout(updateMemory, 10);
    }
}
