const fs = require('fs');
const path = require('path');

// Corrigir caminhos no index.html para GitHub Pages
const indexPath = path.join(__dirname, 'dist', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('Erro: dist/index.html não encontrado');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf-8');

// Substituir caminhos absolutos por relativos
html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
html = html.replace(/href="\/_expo\//g, 'href="./_expo/');
html = html.replace(/src="\/assets\//g, 'src="./assets/');
html = html.replace(/href="\/assets\//g, 'href="./assets/');

fs.writeFileSync(indexPath, html, 'utf-8');

function walkFiles(dir, matcher, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, matcher, files);
    } else if (matcher(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Expo gera referencias absolutas para assets no bundle web. Em GitHub Pages,
// /assets aponta para a raiz do dominio, entao os caminhos precisam ser relativos.
const jsFiles = walkFiles(path.join(__dirname, 'dist', '_expo'), (file) => file.endsWith('.js'));
for (const jsPath of jsFiles) {
  let js = fs.readFileSync(jsPath, 'utf-8');
  js = js
    .replace(/"\/assets\//g, '"./assets/')
    .replace(/'\/assets\//g, "'./assets/")
    .replace(/`\/assets\//g, '`./assets/');
  fs.writeFileSync(jsPath, js, 'utf-8');
}

// Copiar fonts.css para dist
const fontsCssSource = path.join(__dirname, 'public', 'fonts.css');
const fontsCssDest = path.join(__dirname, 'dist', 'fonts.css');

if (fs.existsSync(fontsCssSource)) {
  fs.copyFileSync(fontsCssSource, fontsCssDest);
  console.log('✅ Arquivo fonts.css copiado para dist/');
}

// Copiar tambem as fontes sem hash usadas pelo fonts.css. O Expo exporta fontes
// com hash, mas nosso CSS estatico aponta para os nomes reais dos arquivos.
const vectorFontsSource = path.join(
  __dirname,
  'node_modules',
  '@expo',
  'vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts'
);
const vectorFontsDest = path.join(
  __dirname,
  'dist',
  'assets',
  'node_modules',
  '@expo',
  'vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts'
);

if (fs.existsSync(vectorFontsSource)) {
  fs.mkdirSync(vectorFontsDest, { recursive: true });
  for (const fontFile of fs.readdirSync(vectorFontsSource).filter((file) => file.endsWith('.ttf'))) {
    fs.copyFileSync(path.join(vectorFontsSource, fontFile), path.join(vectorFontsDest, fontFile));
  }
  console.log('✅ Fontes do vector-icons copiadas para dist/assets/');
}

// Garante que GitHub Pages sirva pastas como _expo e paths com node_modules sem Jekyll.
fs.writeFileSync(path.join(__dirname, 'dist', '.nojekyll'), '', 'utf-8');

console.log('✅ Caminhos corrigidos em dist/index.html');
