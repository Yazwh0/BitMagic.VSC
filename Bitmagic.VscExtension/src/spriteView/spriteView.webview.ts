import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox, vsCodeTextField, TextField, vsCodeDataGrid, DataGridCell, vsCodeDataGridRow, vsCodeDataGridCell } from "@vscode/webview-ui-toolkit";
import { messages } from "../memoryView/common";

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox(),
    vsCodeTextField(),
    vsCodeDataGrid(),
    vsCodeDataGridRow(),
    vsCodeDataGridCell()
);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

function main() {
    setVSCodeMessageListener();
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const updateButton = document.getElementById("update") as Button;
    updateButton.addEventListener("click", () => updateSprites());

    const highlightCheckbox = document.getElementById("highlight_sprites") as Checkbox;
    highlightCheckbox.addEventListener("change", e => updateHighlight(e));
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case messages.getSprites:
                updateDisplay(messageData);
                break;
        }
    });
}

function updateSprites() {
    vscode.postMessage({ command: messages.getSprites });
}

function updateHighlight(e: Event)
{
    const highlightCheckbox = document.getElementById("highlight_sprites") as Checkbox;

    if (highlightCheckbox.checked)
    {
        vscode.postMessage({ command: messages.setSpriteHighlight });
    }
    else
    {
        vscode.postMessage({ command: messages.resetSpriteHighlight });
    }
}

function updateDisplay(messageData: any) {

    const checkBox = document.getElementById("automatically_update") as Checkbox;

    for(let i = 0; i < 128; i++)
    {
        const sprite = messageData.Sprites[i];
        const img = document.getElementById(`sprite_img_${i}`) as HTMLImageElement;
        img.src = `data:image/bmp;base64,${sprite.Display}`

        setSpriteValue(i, "address", "0x" + sprite.Address.toString(16));
        setSpriteValue(i, "x", sprite.X);
        setSpriteValue(i, "y", sprite.Y);
        setSpriteValue(i, "width", sprite.Width);
        setSpriteValue(i, "height", sprite.Height);
        setSpriteValue(i, "depth", sprite.Depth);
        setSpriteValue(i, "mode", sprite.Mode);
        setSpriteValue(i, "hflip", sprite.HFlip);
        setSpriteValue(i, "vflip", sprite.VFlip);
        setSpriteValue(i, "palletteoffset", sprite.PalletteOffset);
        setSpriteValue(i, "collisionmask", sprite.CollisionMask);

        const header = document.getElementById(`header_${i}`) as TextField;
        header.textContent = `${i} : ${sprite.Depth === 0 ? 'Inactive' : 'Active'}`;
    }

    if (checkBox.checked) {
        setTimeout(updateSprites, 10);
    }
}

function setSpriteValue(index: number, name: string, display: string)
{
    const element = document.getElementById(`${name}_${index}`) as DataGridCell ;
    element.textContent = display;
}
