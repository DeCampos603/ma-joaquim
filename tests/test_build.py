"""Verificações do site gerado (rodar depois de build.py).

  py -3 -X utf8 tests/test_build.py
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent
DIST = AQUI / "dist"
erros: list[str] = []

paginas = list(DIST.rglob("*.html"))
if len(paginas) < 6:
    erros.append(f"esperava 6 páginas, achei {len(paginas)}")

refs = 0
for h in paginas:
    t = h.read_text(encoding="utf-8")
    alvos = [m.group(1) for m in re.finditer(r'(?:src|href|data-img)="([^"#?]+)', t)]
    for m in re.finditer(r"data-docs='([^']+)'", t):
        alvos += [p["src"] for d in json.loads(html.unescape(m.group(1))) for p in d["paginas"]]
    for u in alvos:
        if u.startswith(("http", "mailto", "data:", "/")) or u.endswith("/"):
            continue
        refs += 1
        if not (h.parent / urllib.parse.unquote(u)).resolve().exists():
            erros.append(f"{h.relative_to(DIST)}: referência quebrada {u}")
    if re.search(r"\[\[(PREENCHER|CONFIRMAR)", t):
        erros.append(f"{h.relative_to(DIST)}: pendência [[...]] no HTML")
    if "fl-credito" not in t:
        erros.append(f"{h.relative_to(DIST)}: sem assinatura Flow Landing no rodapé")
    cred = re.search(r'<div class="fl-credito-wrap">.*?</div>', t, re.S)
    if cred and "wa.me" in cred.group(0):
        erros.append(f"{h.relative_to(DIST)}: link wa.me dentro da assinatura")
    for m in re.finditer(r'href="(https://wa\.me/[^"]+)"', t):
        if not re.match(r"https://wa\.me/55\d{10,11}(\?text=)?", html.unescape(m.group(1))):
            erros.append(f"{h.relative_to(DIST)}: link de WhatsApp malformado {m.group(1)[:60]}")
    if re.search(r"R\$\s?\d|\bestoque:\s*\d|\bsaldo:\s*\d", t, re.I):
        erros.append(f"{h.relative_to(DIST)}: parece mostrar preço ou estoque")

# catálogo: códigos únicos por marca e contagem mínima por fonte
for marca, minimo in {"sibb": 490, "suryha": 250, "perfiltec": 34, "coel": 27}.items():
    itens = json.loads((AQUI / "dados" / f"catalogo-{marca}.json").read_text(encoding="utf-8"))["itens"]
    cods = [i["codigo"] for i in itens if i["codigo"]]
    if len(itens) < minimo:
        erros.append(f"{marca}: {len(itens)} itens, esperava >= {minimo}")
    dup = {c for c in cods if cods.count(c) > 1}
    if dup:
        erros.append(f"{marca}: códigos repetidos {sorted(dup)[:5]}")

print(f"{len(paginas)} páginas, {refs} referências locais verificadas")
for e in erros:
    print("ERRO", e)
sys.exit(1 if erros else 0)
