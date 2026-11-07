// Copies the M PLUS Rounded 1c web font (Latin + Japanese) from node_modules
// into src/fonts so the game renders Japanese text on every system.
const fs = require('fs');
const path = require('path');
const pkg = path.join(__dirname, '..', 'node_modules', '@fontsource', 'm-plus-rounded-1c');
const outDir = path.join(__dirname, '..', 'src', 'fonts');
const filesOut = path.join(outDir, 'files');
fs.mkdirSync(filesOut, { recursive: true });
let css = '/* M PLUS Rounded 1c - SIL Open Font License 1.1 (via @fontsource) */\n';
for (const w of ['400', '700', '800']) {
  let src = fs.readFileSync(path.join(pkg, `${w}.css`), 'utf8');
  // keep only woff2 sources
  src = src.replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '');
  src.replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (_, f) => {
    fs.copyFileSync(path.join(pkg, 'files', f), path.join(filesOut, f));
    return _;
  });
  css += src + '\n';
}
fs.writeFileSync(path.join(outDir, 'fonts.css'), css);
const lic = path.join(pkg, 'LICENSE');
if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(outDir, 'OFL-LICENSE.txt'));
console.log('fonts copied:', fs.readdirSync(filesOut).length, 'files');
