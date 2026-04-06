import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

const targetManifests = {
  chrome: "manifest.chrome.json",
  firefox: "manifest.json"
};

const sharedPaths = [
  "background.js",
  "browser-api.js",
  "content-script.js",
  "icons",
  "options.html",
  "options.js",
  "pdf-viewer.css",
  "pdf-viewer.html",
  "pdf-viewer.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "saved.html",
  "saved.js"
];

const sharedCopyMappings = [
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    to: "vendor/pdfjs/legacy/build/pdf.mjs"
  },
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    to: "vendor/pdfjs/legacy/build/pdf.worker.mjs"
  },
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/legacy/web/pdf_viewer.css"),
    to: "vendor/pdfjs/legacy/web/pdf_viewer.css"
  },
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/legacy/web/pdf_viewer.mjs"),
    to: "vendor/pdfjs/legacy/web/pdf_viewer.mjs"
  },
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/legacy/web/images"),
    to: "vendor/pdfjs/legacy/web/images"
  },
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/standard_fonts"),
    to: "vendor/pdfjs/standard_fonts"
  },
  {
    from: path.join(rootDir, "node_modules/pdfjs-dist/wasm"),
    to: "vendor/pdfjs/wasm"
  }
];

const targetExtraPaths = {
  chrome: ["background.chrome.js"],
  firefox: []
};

const requestedTargets = process.argv.slice(2);
const targetsToBuild = requestedTargets.length
  ? requestedTargets
  : Object.keys(targetManifests);

for (const target of targetsToBuild) {
  if (!targetManifests[target]) {
    throw new Error(`Target de build no soportado: ${target}`);
  }
}

for (const target of targetsToBuild) {
  const outDir = path.join(distDir, target);
  rmSync(outDir, { force: true, recursive: true });
  mkdirSync(outDir, { recursive: true });

  for (const filePath of [...sharedPaths, ...targetExtraPaths[target]]) {
    const sourcePath = path.join(rootDir, filePath);
    const outputPath = path.join(outDir, filePath);

    if (!existsSync(sourcePath)) {
      throw new Error(`No se ha encontrado ${filePath} al preparar la build ${target}.`);
    }

    cpSync(sourcePath, outputPath, { recursive: true });
  }

  cpSync(
    path.join(rootDir, targetManifests[target]),
    path.join(outDir, "manifest.json")
  );

  for (const mapping of sharedCopyMappings) {
    if (!existsSync(mapping.from)) {
      throw new Error(`No se ha encontrado ${mapping.from} al preparar la build ${target}.`);
    }

    const outputPath = path.join(outDir, mapping.to);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    cpSync(mapping.from, outputPath, { recursive: true });
  }

  console.log(`Build lista: dist/${target}`);
}
