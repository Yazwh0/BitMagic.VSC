import { provideVSCodeDesignSystem, vsCodeButton, Button } from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton());
