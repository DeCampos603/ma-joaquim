# M.A Joaquim Representação · site

Site público de [representacaorj.com](https://representacaorj.com): catálogo das fábricas
representadas (Suryha, SIBB, Coel, Perfiltec), vitrine 3D, folheador dos catálogos e lista de
cotação enviada pelo WhatsApp. Sem preço, sem estoque, sem coleta de dados.

## Como atualizar

```bash
py -3 -X utf8 build.py --publicar     # gera dist/ (falha se sobrar [[PREENCHER]])
py -3 -X utf8 tests/test_build.py     # links, assinatura, preço, códigos repetidos
git add -A && git commit -m "..." && git push
```

O push na `main` roda o GitHub Actions (`.github/workflows/pages.yml`), que gera, testa e publica no GitHub Pages.

## Estrutura

- `dados/` · empresa, contatos e o catálogo de cada marca (JSON)
- `src/` · CSS, JS, imagens, fotos dos produtos e páginas dos folders
- `ferramentas/` · extração dos catálogos em PDF/PPTX das fábricas (os originais ficam fora do repositório)
- `build.py` · gera as páginas estáticas em `dist/`
- `tests/` · verificação do site gerado

Desenvolvido por [Flow Landing](https://ladingflow.netlify.app/?utm_source=repo&utm_medium=readme&utm_campaign=ma-joaquim-representacoes).
