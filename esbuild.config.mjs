import esbuild from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const production = process.argv[2] === "production";
const watch = process.argv[2] === "development" || process.argv[2] === "dev";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "fs", "path", "child_process", "crypto", "util"],
  format: "cjs",
  target: "es2022",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js",
  define: {
    "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development")
  }
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
  if (production) {
    const output = await readFile("main.js", "utf8");
    await writeFile("main.js", output.replace(/[ \t]+$/gm, ""), "utf8");
  }
  console.log("Build complete: main.js");
}
