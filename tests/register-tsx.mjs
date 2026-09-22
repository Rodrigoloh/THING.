// Small test loader using the already-installed TypeScript compiler.
// No browser mocks or production module replacements.
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/link") return nextResolve("next/link.js", context);
    if (specifier === "next/navigation") return nextResolve("next/navigation.js", context);
    let candidate;
    if (specifier.startsWith("@/")) candidate = resolvePath(root, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(resolvePath(root, "src")).href)) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate) {
      const path = [candidate, candidate + ".ts", candidate + ".tsx"].find((file) => /\.tsx?$/.test(file) && existsSync(file));
      if (path) return { url: pathToFileURL(path).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url) && !url.includes("node_modules")) {
      const result = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      });
      return { format: "module", source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
