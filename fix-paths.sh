#!/bin/bash

# Script para corrigir caminhos no index.html para GitHub Pages

DIST_DIR="dist"
INDEX_FILE="$DIST_DIR/index.html"

if [ ! -f "$INDEX_FILE" ]; then
  echo "Erro: $INDEX_FILE não encontrado"
  exit 1
fi

# Substituir caminhos absolutos por relativos
sed -i '' 's|src="/_expo/|src="./_expo/|g' "$INDEX_FILE"
sed -i '' 's|href="/_expo/|href="./_expo/|g' "$INDEX_FILE"

echo "✅ Caminhos corrigidos em $INDEX_FILE"
cat "$INDEX_FILE"
