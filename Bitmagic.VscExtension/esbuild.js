const { build } = require("esbuild");
const { copy } = require("esbuild-plugin-copy");
const { watch } = require("fs");

//@ts-check
/** @typedef {import('esbuild').BuildOptions} BuildOptions **/

/** @type BuildOptions */
const baseConfig = {
    bundle: true,
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
};

// Config for extension source code (to be run in a Node-based context)
/** @type BuildOptions */
const extensionConfig = {
    ...baseConfig,
    platform: "node",
    mainFields: ["module", "main"],
    format: "cjs",
    entryPoints: ["./src/extension.ts"],
    outfile: "./out/extension.js",
    external: ["vscode"],
};

// Config for webview source code (to be run in a web-based context)
/** @type BuildOptions */
const layerViewWebviewConfig = {
    ...baseConfig,
    target: "es2020",
    format: "esm",
    entryPoints: [
        "./src/layerView/layerView.webview.ts"
    ],
    outdir: "./out/",
    plugins: [
        // Copy webview css files to `out` directory unaltered
        copy({
            resolveFrom: "cwd",
            assets: {
                from: [
                    "./src/layerView/layerView.css",
                ],
                to: ["./out"],
            },
        }),
    ],
};

const historyViewWebviewConfig = {
    ...baseConfig,
    target: "es2020",
    format: "esm",
    entryPoints: [
        "./src/historyView/historyView.webview.ts"
    ],
    outdir: "./out/",
    plugins: [
        // Copy webview css files to `out` directory unaltered
        copy({
            resolveFrom: "cwd",
            assets: {
                from: [
                    "./src/historyView/historyView.css",
                ],
                to: ["./out"],
            },
        }),
    ],
};

const memoryViewWebviewConfig = {
    ...baseConfig,
    target: "es2020",
    format: "esm",
    entryPoints: [
        "./src/memoryView/memoryView.webview.ts"
    ],
    outdir: "./out/",
    plugins: [
        // Copy webview css files to `out` directory unaltered
        copy({
            resolveFrom: "cwd",
            assets: {
                from: [
                    "./src/memoryView/memoryView.css",
                ],
                to: ["./out"],
            },
        }),
    ],
};

const spriteViewWebviewConfig = {
    ...baseConfig,
    target: "es2020",
    format: "esm",
    entryPoints: [
        "./src/spriteView/spriteView.webview.ts"
    ],
    outdir: "./out/",
    plugins: [
        // Copy webview css files to `out` directory unaltered
        copy({
            resolveFrom: "cwd",
            assets: {
                from: [
                    "./src/spriteView/spriteView.css",
                ],
                to: ["./out"],
            },
        }),
    ],
};

// This watch config adheres to the conventions of the esbuild-problem-matchers
// extension (https://github.com/connor4312/esbuild-problem-matchers#esbuild-via-js)
/** @type BuildOptions */
const watchConfig = {
    watch: {
        onRebuild(error, result) {
            console.log("[watch] build started");
            if (error) {
                error.errors.forEach((error) =>
                    console.error(
                        `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`
                    )
                );
            } else {
                console.log("[watch] build finished");
            }
        },
    },
};

// Build script
(async () => {
    const args = process.argv.slice(2);
    try {
        if (args.includes("--watch")) {
            // Build and watch extension and webview code
            console.log("[watch] build started");
            await build({
                ...extensionConfig,
                ...watchConfig,
            });
            await build({
                ...layerViewWebviewConfig,
                ...watchConfig,
            });
            await build({
                ...memoryViewWebviewConfig,
                ...watchConfig,
            });
            await build({
                ...historyViewWebviewConfig,
                ...watchConfig,
            });
            await build({
                ...spriteViewWebviewConfig,
                ...watchConfig,
            });
            console.log("[watch] build finished");
        } else {
            // Build extension and webview code
            await build(extensionConfig);
            await build(layerViewWebviewConfig);
            await build(memoryViewWebviewConfig);
            await build(historyViewWebviewConfig);
            await build(spriteViewWebviewConfig);
            console.log("build complete");
        }
    } catch (err) {
        if (err instanceof Error) {
            process.stderr.write(`Error: ${err.message}\n`);
        } else {
            process.stderr.write(`Unknown error: ${String(err)}\n`);
        }

        process.exit(1);
    }
})();
