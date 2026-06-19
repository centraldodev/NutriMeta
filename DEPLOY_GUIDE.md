# Configuração do GitHub Pages para NutriMeta

## ✅ Configurações Realizadas

1. **app.json** - Adicionado suporte para build web
2. **package.json** - Adicionado script `build:web`
3. **.nojekyll** - Criado para GitHub Pages não processar como Jekyll
4. **.github/workflows/deploy-web.yml** - Workflow automático para deploy
5. **public/index.html** - HTML de entrada para a web

## 🚀 Próximos Passos

### 1. Fazer Push do Código para o GitHub

```bash
git add .
git commit -m "feat: configurar build web e GitHub Pages"
git push origin main
```

### 2. Configurar GitHub Pages no Repositório

1. Vá para **Settings → Pages** do seu repositório
2. Em "Build and deployment":
   - **Source**: Selecione `GitHub Actions`
3. Salve as configurações

### 3. O Deploy Será Automático

- A cada push na branch `main`, o workflow será acionado
- O app será buildado e deployado no GitHub Pages
- Você pode acompanhar em **Actions** → **Deploy Web to GitHub Pages**

### 4. Acessar a App

Sua app estará disponível em:
```
https://<seu-usuario>.github.io/<seu-repositorio>/
```

## ❓ Troubleshooting

Se tiver erro 400 ainda:

1. **Verificar logs do workflow**: 
   - Vá em Actions → Deploy Web to GitHub Pages
   - Clique no último workflow
   - Verifique se há erros no build ou deploy

2. **Problemas comuns**:
   - ❌ Branch errada: Certifique-se que o código está em `main`
   - ❌ Falta permissões: GitHub Actions precisa de permissão para escrever em Pages
   - ❌ Erro de build: Verifique se todas as dependências estão instaladas

3. **Testar build localmente**:
   ```bash
   npm run build:web
   ```

## 📝 Notas Importantes

- O build pode levar 2-3 minutos na primeira vez
- Se tiver problemas com o Firebase na web, configure as variáveis de ambiente corretamente
- O arquivo `.nojekyll` instrui o GitHub Pages a servir os arquivos como estão

---

Após fazer push, acompanhe o deployment na aba **Actions** do seu repositório! 🎉
