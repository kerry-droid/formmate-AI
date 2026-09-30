import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ['manifest.json', 'public/manifest.json'],
  ['src/background/background.js', 'public/src/background/background.js'],
  ['src/content/formDetector.js', 'public/src/content/formDetector.js'],
];

for (const [source, destination] of files) {
  const target = resolve(extensionRoot, destination);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(extensionRoot, source), target);
}
