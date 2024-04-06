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
    updateButton.addEventListener("click", () => updateLayers());
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case "layerUpdate":
                updateDisplay(messageData);
                break;
        }
    });
}

function updateLayers() {
    vscode.postMessage({ command: "updateLayers" });
}

function updateDisplay(messageData: any) {
    for (let i = 0; i < 6; i++) {
        const d = messageData.Display[i];
        const layer = document.getElementById(`data_${i}`) as HTMLImageElement;

        layer.src = `data:image/bmp;base64,${d}`;
    }
    const checkBox = document.getElementById("automatically_update") as Checkbox;

    if (checkBox.checked) {
        setTimeout(updateLayers, 10);
    }
}
