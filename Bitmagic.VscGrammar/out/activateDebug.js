'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateDebug = void 0;
const vscode = require("vscode");
function activateDebug(context, factory) {
    if (!factory) {
        return;
    }
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('bmasm', factory));
}
exports.activateDebug = activateDebug;
//# sourceMappingURL=activateDebug.js.map