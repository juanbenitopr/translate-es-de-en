import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

const targetManifests = {
  chrome: "manifest.chrome.json",
  firefox: "manifest.json"
};

const sharedPaths = [
  "assets",
  "background.js",
  "browser-api.js",
  "content-script.js",
  "icons",
  "options.html",
  "options.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "saved.html",
  "saved.js",
  "tesseract-adapter.js"
];

const targetExtraPaths = {
  chrome: ["background.chrome.js"],
  firefox: []
};

const generatedAssetCopies = [
  {
    source: "node_modules/tesseract.js/dist",
    target: "vendor/tesseract"
  },
  {
    source: "node_modules/tesseract.js-core",
    target: "vendor/tesseract-core"
  }
];

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

  for (const asset of generatedAssetCopies) {
    const sourcePath = path.join(rootDir, asset.source);
    const outputPath = path.join(outDir, asset.target);

    if (!existsSync(sourcePath)) {
      throw new Error(`No se ha encontrado ${asset.source} al preparar la build ${target}.`);
    }

    cpSync(sourcePath, outputPath, { recursive: true });
  }

  console.log(`Build lista: dist/${target}`);
}
