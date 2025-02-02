import { provideVSCodeDesignSystem, vsCodeButton, Button, vsCodeCheckbox, Checkbox, vsCodeTextField, TextField, vsCodeTextArea, TextArea, vsCodeDataGrid, vsCodeDataGridCell, vsCodeDataGridRow, DataGrid, vsCodeOption, vsCodeDropdown, Dropdown } from "@vscode/webview-ui-toolkit";
import { Dictionary } from "../utilities/dictionary";
import { messages } from "./common";
import { ColumnDefinition, DataGridCell } from "@microsoft/fast-foundation";
import { ViewTemplate } from "@microsoft/fast-element";

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox(),
    vsCodeTextField(),
    vsCodeTextArea(),
    vsCodeDataGrid(),
    vsCodeDataGridCell(),
    vsCodeDataGridRow(),
    vsCodeOption(),
    vsCodeDropdown()
);

const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

let columDefs: ColumnDefinition[] = [];
let rows: Dictionary<RowItem> = new Dictionary<RowItem>();
let newSearch = true;
let columnKey = 0;

function main() {
    setVSCodeMessageListener();

    const updateButton = document.getElementById("update") as Button;
    updateButton.addEventListener("click", () => updateMemory());

    const searchButton = document.getElementById("search") as Button;
    searchButton.addEventListener("click", () => getMemoryValueLocations());

    const resetSearchButton = document.getElementById("reset_search") as Button;
    resetSearchButton.addEventListener("click", () => resetSearch());
}

function updateMemory() {
    vscode.postMessage({ command: "getMemoryUse" });
}

function resetSearch() {
    newSearch = true;
    rows = new Dictionary<RowItem>();
    columDefs = [];

    var resultsGrid = document.getElementById("search_results") as DataGrid;

    resultsGrid.rowsData = [];
    resultsGrid.columnDefinitions = columDefs;

    const searchType = document.getElementById("search_type") as Dropdown;
    searchType.disabled = true;

    const searchWidth = document.getElementById("search_width") as Dropdown;
    searchWidth.disabled = false;

    vscode.postMessage({ command: messages.resetSearch });
}

function getMemoryValueLocations() {

    const searchType = document.getElementById("search_type") as Dropdown;
    let searchtype = searchType.value;

    const searchValue = document.getElementById("value_to_find") as TextField;
    let v = searchValue.value.trim();
    if (v.startsWith("$"))
        v = `0x${v.substring(1)}`;

    let toFind = 0;
    if (v === "") {
        if (newSearch)
            searchtype = "Changed";
    }
    else {
        toFind = parseInt(v);
    }

    const searchWidth = document.getElementById("search_width") as Dropdown;
    const searchwidth = searchWidth.value;

    vscode.postMessage({ command: messages.search, toFind: toFind, searchType: searchtype, searchWidth: searchwidth })
}

function setVSCodeMessageListener() {
    window.addEventListener("message", (event) => {
        const command = event.data.command;
        const messageData = JSON.parse(event.data.payload);

        switch (command) {
            case messages.updateMemoryDisplay:
                updateMemoryDisplay(messageData);
                break;
            case messages.displaySearchResults:
                updateSearchResults(messageData);
                break;
        }
    });
}

function updateMemoryDisplay(messageData: any) {
    const d = messageData.Display;
    const layer = document.getElementById("main_ram") as HTMLImageElement;

    layer.src = `data:image/bmp;base64,${d}`;
    const checkBox = document.getElementById("automatically_update") as Checkbox;

    if (checkBox.checked) {
        setTimeout(updateMemory, 10);
    }
}

function updateSearchResults(messageData: MemoryValueTrackerResponse) {
    const results = messageData.Locations;
    var resultsGrid = document.getElementById("search_results") as DataGrid;

    if (!results) {
        resultsGrid.rowsData = [];
        return;
    }

    const searchWidth = document.getElementById("search_width") as Dropdown;

    if (newSearch) {
        var addressColumn = new columnDefinition("address");
        addressColumn.title = "Address";
        columDefs.push(addressColumn)

        const searchType = document.getElementById("search_type") as Dropdown;
        searchType.disabled = false;
        resultsGrid.gridTemplateColumns = "150px";
        searchWidth.disabled = true;
    }

    const padding = searchWidth.value == "Byte" ? 2 : 4;

    const display: any[] = [];
    const newRows = new Dictionary<RowItem>();
    let header = "";

    switch (messageData.SearchType) {
        case "Equal":
            header = "= $" + messageData.ToFind?.toString(16).padStart(padding, "0") ?? "??";
            break;
        case "Not Equal":
            header = "!= $" + messageData.ToFind?.toString(16).padStart(padding, "0") ?? "??";
            break;
        case "Less Than":
            header = "< $" + messageData.ToFind?.toString(16).padStart(padding, "0") ?? "??";
            break;
        case "Greater Than":
            header = "> $" + messageData.ToFind?.toString(16).padStart(padding, "0") ?? "??";
            break;
        case "Changed":
            header = "Changed"
            break;
        case "Not Changed":
            header = "Not Chgd"
            break;
        case "Gone Up":
            header = "Gone Up"
            break;
        case "Down Down":
            header = "Done Down"
            break;
    }

    const key = `k-${columnKey}`;
    const column: ColumnDefinition = new columnDefinition(key);
    column.title = header;
    columDefs.push(column);
    columnKey++;

    for (let i = 0; i < results.length; i++) {
        var r = results[i].Location;
        var bank = (r & 0xff0000) >> 16;
        var value = r & 0xffff;
        var bank_display = bank.toString(16).padStart(2, "0");
        var value_display = value.toString(16).padStart(4, "0");

        let item: RowItem | undefined;

        const rowKey = `addr:${r}`;
        if (newSearch) {
            item = new RowItem();
            item.location = r;
            item.results["address"] = `\$${bank_display}:${value_display}`;
        }
        else {
            item = rows.tryGet(rowKey);
            if (!item) {
                console.log(`Could not find ${r} in the existing dictionary.`)
                continue;
            }
        }

        if (!item) {
            console.log(`item is null somehow.`)
            continue;
        }

        newRows.add(rowKey, item);

        item.results[key] = `\$${results[i].Value.toString(16).padStart(padding, "0")}`;

        // only show first 100 entries
        if (i < 100)
            display.push(item.results);
        else
            break;
    }

    resultsGrid.gridTemplateColumns += " 80px";
    resultsGrid.rowsData = display;
    resultsGrid.columnDefinitions = columDefs;
    rows = newRows;
    newSearch = false;

    vscode.postMessage({ command: messages.updateRows, rows: newRows.getItems() });
}

class MemoryValueTrackerResponse {
    ToFind: number | undefined;
    SearchType: string | undefined;
    Locations: memoryValue[] | undefined;
    Stepping: boolean | undefined;
}

class memoryValue {
    Location: number = 0;
    Value: number = 0;
}

class RowItem {
    location: number = 0;
    results: any = {};
}

class columnDefinition implements ColumnDefinition {
    columnDataKey: string;
    gridColumn?: string | undefined;
    title?: string | undefined;
    headerCellTemplate?: ViewTemplate<any, any> | undefined;
    headerCellInternalFocusQueue?: boolean | undefined;
    headerCellFocusTargetCallback?: ((cell: DataGridCell) => HTMLElement) | undefined;
    cellTemplate?: ViewTemplate<any, any> | undefined;
    cellInternalFocusQueue?: boolean | undefined;
    cellFocusTargetCallback?: ((cell: DataGridCell) => HTMLElement) | undefined;
    isRowHeader?: boolean | undefined;

    public constructor(key: string) {
        this.columnDataKey = key;
    }
}
