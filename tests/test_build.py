"""Verificações do site gerado (rodar depois de build.py).

  py -3 -X utf8 tests/test_build.py
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent
DIST = AQUI / "dist"
erros: list[str] = []

paginas = list(DIST.rglob("*.html"))
if len(paginas) < 13:
    erros.append(f"esperava 13 páginas (home, 4 marcas, equivalencias, cliente, painel, sobre, contato, termos, privacidade, 404), achei {len(paginas)}")
EMP = json.loads((AQUI / "dados" / "empresa.json").read_text(encoding="utf-8"))
MED = json.loads((AQUI / "dados" / "medicao.json").read_text(encoding="utf-8"))
MEDE = any(MED.get(k) for k in ("ga4Id", "adsId", "gtmId"))

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
    if ("googletagmanager" in t or "analytics.js" in t) and not MEDE:
        erros.append(f"{h.relative_to(DIST)}: carrega Google sem ID em dados/medicao.json")
    if 'href="/favicon.ico"' not in t:
        erros.append(f"{h.relative_to(DIST)}: sem favicon real")
    if h.name == "404.html" or h.parent.name == "painel":
        if "noindex" not in t:
            erros.append(f"{h.relative_to(DIST)} sem noindex")
        continue
    # páginas indexáveis: JSON-LD válido, versão Markdown e contatos atuais
    blocos = re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S)
    if len(blocos) != 1:
        erros.append(f"{h.relative_to(DIST)}: esperava 1 bloco JSON-LD, achei {len(blocos)}")
    else:
        try:
            tipos = {n["@type"] for n in json.loads(blocos[0])["@graph"]}
            for tp in ("WebSite", "Organization"):
                if tp not in tipos:
                    erros.append(f"{h.relative_to(DIST)}: JSON-LD sem {tp}")
        except (ValueError, KeyError) as ex:
            erros.append(f"{h.relative_to(DIST)}: JSON-LD inválido ({ex})")
    if not (h.parent / "index.md").exists() or 'type="text/markdown"' not in t:
        erros.append(f"{h.relative_to(DIST)}: sem versão Markdown")
    for c in EMP["contatos"]:
        if h.parent == DIST and c["telefone"] not in t:
            erros.append(f"home sem o telefone de {c['nome']}")

# arquivos para buscadores, agentes de IA e Área do Cliente
for arq in ("robots.txt", "sitemap.xml", "llms.txt", "catalogo.json", "conversor-oem.json", "dados/indice-busca.json",
            "img/logo-ma-joaquim.png", "favicon.ico", "favicon.svg", "favicon-48.png",
            "favicon-192.png", "apple-touch-icon.png", "site.webmanifest", "CNAME", "js/webmcp.js",
            "css/cliente.css", "vendor/supabase.js", "js/fichaXlsx.js", "js/supabaseSite.js",
            "js/cliente.js", "js/painel.js", "modelos/ficha-cadastro-ma-joaquim.xlsx"):
    if not (DIST / arq).exists():
        erros.append(f"falta {arq}")

# validações específicas de SEO (equivalências OEM, home leve, schema Organization)
eq_html = (DIST / "equivalencias" / "index.html")
if not eq_html.exists():
    erros.append("falta equivalencias/index.html")
else:
    eq_txt = eq_html.read_text(encoding="utf-8")
    for cod_oem in ("DC64-01827A", "MT-512E"):
        if cod_oem not in eq_txt:
            erros.append(f"equivalencias/index.html sem código esperado {cod_oem}")
home_html = (DIST / "index.html")
if home_html.exists():
    home_txt = home_html.read_text(encoding="utf-8")
    if len(home_txt.encode("utf-8")) >= 70 * 1024:
        erros.append(f"dist/index.html muito pesado ({len(home_txt.encode('utf-8')) // 1024} KB >= 70 KB)")
    ld_home = re.search(r'<script type="application/ld\+json">(.*?)</script>', home_txt, re.S)
    if ld_home:
        org = next((n for n in json.loads(ld_home.group(1))["@graph"] if n.get("@type") == "Organization"), {})
        if not org.get("alternateName"):
            erros.append("JSON-LD Organization sem alternateName")
        logo_url = org.get("logo", {}).get("url", "") if isinstance(org.get("logo"), dict) else str(org.get("logo", ""))
        if "logo-ma-joaquim.png" not in logo_url:
            erros.append(f"JSON-LD Organization.logo não aponta para logo-ma-joaquim.png ({logo_url})")
robots = (DIST / "robots.txt").read_text(encoding="utf-8")
if "Content-Signal:" not in robots or "Sitemap: https://" not in robots:
    erros.append("robots.txt sem Content-Signal ou Sitemap")
locs = re.findall(r"<loc>([^<]+)</loc>", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
indexaveis = [h for h in paginas if not (h.name == "404.html" or h.parent.name == "painel")]
if len(locs) != len(indexaveis):
    erros.append(f"sitemap com {len(locs)} URLs, esperava {len(indexaveis)}")
llms = (DIST / "llms.txt").read_text(encoding="utf-8")
if not llms.startswith("# ") or "index.md" not in llms or "catalogo.json" not in llms:
    erros.append("llms.txt incompleto")
cat = json.loads((DIST / "catalogo.json").read_text(encoding="utf-8"))
if cat["total"] != len(cat["itens"]) or cat["total"] < 800:
    erros.append(f"catalogo.json com {cat['total']} itens")
for p in [*DIST.rglob("*.md"), DIST / "llms.txt", DIST / "catalogo.json", AQUI / "dados" / "conversor-oem.json"]:
    if p.exists() and re.search(r"R\$\s?\d|\bestoque:\s*\d|\bsaldo:\s*\d", p.read_text(encoding="utf-8"), re.I):
        erros.append(f"{p.name}: parece mostrar preço ou estoque")

# validação do modelo oficial .xlsx (sem depender de openpyxl no CI)
arq_xlsx = DIST / "modelos" / "ficha-cadastro-ma-joaquim.xlsx"
if arq_xlsx.exists():
    with zipfile.ZipFile(arq_xlsx, "r") as zf:
        nomes_zip = set(zf.namelist())
        for proibido in ("xl/worksheets/sheet2.xml", "xl/sharedStrings.xml"):
            if proibido in nomes_zip:
                erros.append(f"{arq_xlsx.relative_to(DIST)}: contém arquivo proibido {proibido}")
        if "xl/worksheets/sheet1.xml" not in nomes_zip:
            erros.append(f"{arq_xlsx.relative_to(DIST)}: falta xl/worksheets/sheet1.xml")
        else:
            info_s1 = zf.getinfo("xl/worksheets/sheet1.xml")
            if info_s1.compress_type != zipfile.ZIP_STORED:
                erros.append(f"{arq_xlsx.relative_to(DIST)}: sheet1.xml deve usar ZIP_STORED para edição no navegador")
            s1_txt = zf.read("xl/worksheets/sheet1.xml").decode("utf-8", errors="ignore")
            if "{{RAZAO_SOCIAL}}" not in s1_txt:
                erros.append(f"{arq_xlsx.relative_to(DIST)}: marcador {{{{RAZAO_SOCIAL}}}} ausente em sheet1.xml")
        tudo_xml = b"".join(zf.read(n) for n in nomes_zip if n.endswith(".xml")).decode("utf-8", errors="ignore")
        for vazamento in ("Plan4", "Eletropeças", "Dicosul"):
            if vazamento.lower() in tudo_xml.lower():
                erros.append(f"{arq_xlsx.relative_to(DIST)}: resíduo de terceiros '{vazamento}' detectado")

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
