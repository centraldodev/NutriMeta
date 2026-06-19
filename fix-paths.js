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

fs.writeFileSync(indexPath, html, 'utf-8');

// Copiar fonts.css para dist
const fontsCssSource = path.join(__dirname, 'public', 'fonts.css');
const fontsCssDest = path.join(__dirname, 'dist', 'fonts.css');

if (fs.existsSync(fontsCssSource)) {
  fs.copyFileSync(fontsCssSource, fontsCssDest);
  console.log('✅ Arquivo fonts.css copiado para dist/');
}

// Garante que GitHub Pages sirva pastas como _expo e paths com node_modules sem Jekyll.
fs.writeFileSync(path.join(__dirname, 'dist', '.nojekyll'), '', 'utf-8');

console.log('✅ Caminhos corrigidos em dist/index.html');
