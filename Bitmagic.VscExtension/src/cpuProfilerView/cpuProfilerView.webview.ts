import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox, vsCodeDataGrid, vsCodeDataGridCell, vsCodeDataGridRow, vsCodeDropdown, Dropdown, vsCodeOption, vsCodeTextField, TextField } from "@vscode/webview-ui-toolkit";
import { messages } from "../memoryView/common";
import { useDraggable } from '@dnd-kit/react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { LineItem, LineType } from "./cpuProfilerLineItem";

// ============================================================================
// STATE & CONFIGURATION
// ============================================================================

let items: Array<LineItem> = [
    new LineItem("true", LineType.BuiltIn, "PC", "", "", ""),
];

let draggedIndex: number | null = null;
let hasChanges = false;

// ============================================================================
// SYSTEM SETUP & INITIALIZATION
// ============================================================================

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox(),
    vsCodeDropdown(),
    vsCodeOption(),
    vsCodeTextField()
);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function main() {
    setVSCodeMessageListener();
    setupUIEventListeners();
    updateItemDisplay();
}

// ============================================================================
// VSCODE MESSAGE HANDLING
// ============================================================================

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case messages.getCpuProfileImage:
                getCpuProfileImage();
                break;
            case messages.updateCpuProfileImage:
                updateCpuProfileDisplay(messageData);
                break;
        }
    });
}

function getCpuProfileImage() {
    var resultsDiv = document.getElementById("cpuprofileimage") as HTMLDivElement;
    resultsDiv.innerHTML = "Loading...";
    vscode.postMessage({ command: messages.getCpuProfileImage });
}

function updateCpuProfileDisplay(messageData: any) {
    const d = messageData.Display;
    const layer = document.getElementById("cpuprofileimage") as HTMLImageElement;

    layer.src = `data:image/bmp;base64,${d}`;
    const checkBox = document.getElementById("automatically_update") as Checkbox;

    if (checkBox.checked) {
        setTimeout(getCpuProfileImage, 10);
    }
}

// ============================================================================
// UI EVENT LISTENER SETUP
// ============================================================================

function setupUIEventListeners() {
    const updateProfileButton = document.getElementById("update_cpuprofile") as Button;
    updateProfileButton.disabled = true;
    updateProfileButton.addEventListener("click", () => {
        vscode.postMessage({ command: messages.updateCpuProfiler, items: items });
        hasChanges = false;
        updateProfileButton.disabled = true;
    });

    const updateButton = document.getElementById("update") as Button;
    updateButton.addEventListener("click", () => {
        vscode.postMessage({ command: messages.getCpuProfileImage });
    });

    const addButton = document.getElementById("add_cpuprofile_item") as Button;
    if (addButton) {
        addButton.addEventListener("click", () => addItem());
    }
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function markAsChanged() {
    hasChanges = true;
    const updateButton = document.getElementById("update_cpuprofile") as Button;
    if (updateButton) {
        updateButton.disabled = false;
    }
}

// ============================================================================
// DISPLAY & RENDERING
// ============================================================================

function updateItemDisplay() {
    const rulesContainer = document.getElementsByClassName("rules_container")[0] as HTMLDivElement;

    rulesContainer.innerHTML = "";
    items.forEach((item, index) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "cpu_profile_item";

        switch (item.lineType) {
            case LineType.BuiltIn:
                itemDiv.innerHTML = `<div class="draggable line_item" draggable="true"></div>
                                     <vscode-text-field class="predicate line_item"></vscode-text-field>
                                     <div class="line_type line_item"></div>
                                     <div class="built_in line_item"></div>`;
                break;
            case LineType.Colour:
                itemDiv.innerHTML = `<div class="draggable line_item" draggable="true"></div>
                                     <vscode-text-field class="predicate line_item"></vscode-text-field>
                                     <div class="line_type line_item"></div>
                                     <div class="colour line_item"></div>`;
                break;
            case LineType.Rgb:
                itemDiv.innerHTML = `<div class="draggable line_item" draggable="true"></div>
                                     <vscode-text-field class="predicate line_item"></vscode-text-field>
                                     <div class="line_type line_item"></div>
                                     <vscode-text-field class="rgb_r line_item"></vscode-text-field>
                                     <vscode-text-field class="rgb_g line_item"></vscode-text-field>
                                     <vscode-text-field class="rgb_b line_item"></vscode-text-field>`;
                break;
        }

        setupItemDragHandling(itemDiv, index);
        setupLineTypeSelector(itemDiv, item);
        setupPredicateField(itemDiv, item);
        setupLineTypeSpecificFields(itemDiv, item);

        const lineDiv = document.createElement("div");
        lineDiv.className = "line_div";
        lineDiv.appendChild(itemDiv);

        setupLineDropZone(lineDiv, index);
        setupRemoveButton(lineDiv, index);

        rulesContainer.appendChild(lineDiv);
    });
}

// ============================================================================
// ITEM FIELD SETUP HELPERS
// ============================================================================

function setupItemDragHandling(itemDiv: HTMLDivElement, index: number) {
    const dragHandle = itemDiv.querySelector(".draggable") as HTMLDivElement;
    dragHandle.addEventListener("dragstart", (e) => {
        draggedIndex = index;
        (e.target as HTMLElement).style.opacity = "0.5";
    });
    dragHandle.addEventListener("dragend", (e) => {
        (e.target as HTMLElement).style.opacity = "1";
    });
}

function setupLineTypeSelector(itemDiv: HTMLDivElement, item: LineItem) {
    const selector = createLineType(item.lineType);
    const lineTypeDiv = itemDiv.querySelector(".line_type") as HTMLDivElement;
    lineTypeDiv.appendChild(selector);

    selector.addEventListener("change", (event: any) => {
        const newLineType = event.target.value;
        item.lineType = parseInt(newLineType);
        markAsChanged();
        updateItemDisplay();
    });
}

function setupPredicateField(itemDiv: HTMLDivElement, item: LineItem) {
    const predicateField = itemDiv.querySelector(".predicate") as TextField;
    predicateField.value = item.predicate;

    predicateField.addEventListener("change", (event: any) => {
        item.predicate = event.target.value;
        markAsChanged();
    });
}

function setupLineTypeSpecificFields(itemDiv: HTMLDivElement, item: LineItem) {
    switch (item.lineType) {
        case LineType.BuiltIn:
            setupBuiltInField(itemDiv, item);
            break;
        case LineType.Colour:
            setupColourField(itemDiv, item);
            break;
        case LineType.Rgb:
            setupRgbFields(itemDiv, item);
            break;
    }
}

function setupBuiltInField(itemDiv: HTMLDivElement, item: LineItem) {
    const builtInSelector = createBuiltInFunction();
    const builtInDiv = itemDiv.querySelector(".built_in") as HTMLDivElement;
    builtInDiv.appendChild(builtInSelector);

    builtInSelector.addEventListener("change", (event: any) => {
        item.definition = event.target.value;
        markAsChanged();
    });
}

function setupColourField(itemDiv: HTMLDivElement, item: LineItem) {
    const colourField = itemDiv.querySelector(".colour") as HTMLDivElement;

    let colourInput = colourField.querySelector("input") as HTMLInputElement;
    if (!colourInput) {
        colourInput = document.createElement("input");
        colourInput.type = "color";
        colourField.appendChild(colourInput);
    }

    // Ensure displayed value matches the model
    colourInput.value = item.definition || "#000000";

    // Update model on both immediate input (picker move) and final change
    const updateColour = (ev: Event) => {
        const target = ev.currentTarget as HTMLInputElement;
        if (!target) return;
        item.definition = target.value;
        markAsChanged();
    };

    colourInput.addEventListener("input", updateColour);
    colourInput.addEventListener("change", updateColour);
}

function setupRgbFields(itemDiv: HTMLDivElement, item: LineItem) {
    const rField = itemDiv.querySelector(".rgb_r") as TextField;
    const gField = itemDiv.querySelector(".rgb_g") as TextField;
    const bField = itemDiv.querySelector(".rgb_b") as TextField;

    rField.value = item.R;
    gField.value = item.G;
    bField.value = item.B;

    rField.addEventListener("change", (event: any) => {
        item.R = event.target.value;
        markAsChanged();
    });
    gField.addEventListener("change", (event: any) => {
        item.G = event.target.value;
        markAsChanged();
    });
    bField.addEventListener("change", (event: any) => {
        item.B = event.target.value;
        markAsChanged();
    });
}

function setupLineDropZone(lineDiv: HTMLDivElement, index: number) {
    lineDiv.addEventListener("dragover", (e) => {
        e.preventDefault();
        lineDiv.style.opacity = "0.7";
    });
    lineDiv.addEventListener("dragleave", (e) => {
        lineDiv.style.opacity = "1";
    });
    lineDiv.addEventListener("drop", (e) => {
        e.preventDefault();
        lineDiv.style.opacity = "1";
        if (draggedIndex !== null && draggedIndex !== index) {
            const draggedItem = items[draggedIndex];
            items.splice(draggedIndex, 1);
            items.splice(index, 0, draggedItem);
            draggedIndex = null;
            markAsChanged();
            updateItemDisplay();
        }
    });
}

function setupRemoveButton(lineDiv: HTMLDivElement, index: number) {
    const removeButton = document.createElement("vscode-button") as Button;
    removeButton.appearance = "secondary";
    removeButton.innerHTML = '🗑️';
    removeButton.setAttribute("aria-label", "Remove item");
    removeButton.setAttribute("title", "Remove item");
    removeButton.addEventListener("click", () => removeItem(index));
    lineDiv.appendChild(removeButton);
}

// ============================================================================
// ITEM MANAGEMENT
// ============================================================================

function addItem() {
    const newItem = new LineItem("", LineType.BuiltIn, "PC", "", "", "");
    items.push(newItem);
    markAsChanged();
    updateItemDisplay();
}

function removeItem(index: number) {
    items.splice(index, 1);
    markAsChanged();
    updateItemDisplay();
}

function getGridItems(): Array<LineItem> {
    return items;
}

// ============================================================================
// HELPER/CREATOR FUNCTIONS
// ============================================================================

function createLineType(lineType: LineType): Dropdown {
    const toReturn = document.createElement("vscode-dropdown") as Dropdown;

    const lineTypeValues = ["Built In", "Colour", "Custom RGB"];

    lineTypeValues.forEach((value, index) => {
        const option = document.createElement("vscode-option") as any;
        option.textContent = value;
        option.value = index.toString();

        if (index === lineType) {
            option.selected = true;
        }

        toReturn.appendChild(option);
    });

    toReturn.value = lineType.toString();

    return toReturn;
}

function createBuiltInFunction(): Dropdown {
    const toReturn = document.createElement("vscode-dropdown") as Dropdown;

    const builtInFunctions = ["PC", "Op Code"];

    builtInFunctions.forEach((value) => {
        const option = document.createElement("vscode-option") as any;
        option.textContent = value;
        option.value = value;
        toReturn.appendChild(option);
    });

    return toReturn;
}
