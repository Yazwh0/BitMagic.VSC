export class messages
{
    public static search = "search";
    public static resetSearch = "resetSearch";
    public static updateRows = "updateRows";
    public static updateMemoryDisplay = "memoryUpdate";
    public static displaySearchResults = "memoryValueLocations";
    public static updateHistory = "history";
    public static showFile = "showFile";
    public static fetchAllComplete = "fetchAllComplete";

    public static debuggerSearch = "getMemoryValueLocations";   // DEBUGGER
    public static getMemoryUse = "getMemoryUse";                // DEBUGGER
    public static getHistory = "getHistory";                    // DEBUGGER
    public static getAllHistory = "getAllHistory";                    // DEBUGGER
    public static getMoreHistory = "getMoreHistory";                    // DEBUGGER
    public static resetHistory = "resetHistory";                    // DEBUGGER

    public static spriteView = "spriteView";
    public static getSprites = "getSprites";                    // DEBUGGER
    public static setSpriteHighlight = "setDebugColours";
    public static resetSpriteHighlight = "resetDebugColours";

    public static getCpuProfile = "getCpuProfile";
    public static getCpuProfileImage = "getCpuProfileImage";
    public static updateCpuProfileImage = "updateCpuProfileImage";
    public static updateCpuProfiler = "updateCpuProfiler";

    public static readMemory = "readMemory";                    // DEBUGGER (standard DAP)
    public static writeMemory = "writeMemory";                  // DEBUGGER (standard DAP)
    public static readMemoryPage = "readMemoryPage";
    public static memoryPageUpdate = "memoryPageUpdate";
    public static writeMemoryByte = "writeMemoryByte";

    public static searchMemory = "searchMemory";                 // DEBUGGER (custom)
    public static openSearch = "openSearch";
    public static searchResults = "searchResults";

    public static keyboardInput = "keyboardInput";               // DEBUGGER (custom)
    public static mouseInput = "mouseInput";                     // DEBUGGER (custom)
    public static exceptionInfo = "exceptionInfo";                // DEBUGGER (standard DAP)
}
