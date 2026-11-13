"""Catálogo Perfiltec para o site.

Fonte principal: "Catalogo-Climatizacao-2026-PT.pdf" (edição ago/2026: SKU por cor,
múltiplo de venda, linha SPLITEC FIT). O catálogo anterior (impressão do
catalogo.perfiltec.com) só completa o que não estiver no novo.

Uso: py -3 -X utf8 ferramentas/extrair_perfiltec.py "<pasta SITE M A JOAQUIM>"
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image

AQUI = Path(__file__).resolve().parent.parent
DEST_IMG = AQUI / "src" / "catalogo" / "perfiltec"
DEST_JSON = AQUI / "dados" / "catalogo-perfiltec.json"
NOVO = "Catalogo-Climatizacao-2026-PT.pdf"
ANTIGO = "Catálogo de Produtos — Perfiltec Indústria de Perfis.pdf"
COD = re.compile(r"^[A-Z]{3,7}\d{2,4}$")
SKU = re.compile(r"^\d{8}$")
LINHAS = {3: "Linha 60 mm · splits até 12.000 BTUs", 4: "Linha 80 mm · splits acima de 12.000 BTUs",
          5: "Linha 30 mm · dreno"}


def salva(doc: pymupdf.Document, xref: int, nome: str) -> str:
    pix = pymupdf.Pixmap(doc, xref)
    if pix.n - pix.alpha > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    sm = doc.extract_image(xref).get("smask")
    if sm:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, sm))
    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    bb = im.getchannel("A").getbbox()
    if bb:
        im = im.crop(bb)
    im.thumbnail((520, 520), Image.LANCZOS)
    im.save(DEST_IMG / f"{nome}.webp", quality=86, method=6)
    return f"catalogo/perfiltec/{nome}.webp"


def linhas_da_pagina(pg: pymupdf.Page) -> list[tuple[pymupdf.Rect, str]]:
    out = []
    for b in pg.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"]).strip()
            if t:
                out.append((pymupdf.Rect(ln["bbox"]), t))
    return out


def do_novo(pasta: Path) -> list[dict]:
    doc = pymupdf.open(pasta / NOVO)
    itens = []
    # página 2: lançamento SPLITEC FIT (kits sem código curto, só SKU)
    fit = None
    for inf in doc[1].get_image_info(xrefs=True):
        if inf["xref"] == 63:
            fit = salva(doc, 63, "splitec-fit")
            break
    itens += [
        {"codigo": "FIT60", "tipo": "Canaleta SPLITEC FIT 60 · kit base + tampa", "secao": "SPLITEC FIT (lançamento)",
         "linha": "Split residencial até 12.000 BTUs · barra 2 m · clique FastFit · PVC virgem com proteção UV",
         "sku": "Branca 11020005 · Preta 11020006", "multiplo": "Caixa com 6 conjuntos de 2 m", "img": fit or ""},
        {"codigo": "FIT80", "tipo": "Canaleta SPLITEC FIT 80 · kit base + tampa", "secao": "SPLITEC FIT (lançamento)",
         "linha": "Split acima de 12.000 BTUs · barra 2 m · clique FastFit · PVC virgem com proteção UV",
         "sku": "Branca 11020007 · Preta 11020008", "multiplo": "Caixa com 4 conjuntos de 2 m", "img": fit or ""},
        {"codigo": "CLIPE-FIT60", "tipo": "Clipe FastFit FIT 60 (reposição)", "secao": "SPLITEC FIT (lançamento)",
         "linha": "Trava a tampa na base", "sku": "11021049", "multiplo": "", "img": ""},
        {"codigo": "CLIPE-FIT80", "tipo": "Clipe FastFit FIT 80 (reposição)", "secao": "SPLITEC FIT (lançamento)",
         "linha": "Trava a tampa na base", "sku": "11021050", "multiplo": "", "img": ""},
    ]
    for pn in (3, 4, 5):
        pg = doc[pn - 1]
        lns = linhas_da_pagina(pg)
        imgs = [(pymupdf.Rect(i["bbox"]), i["xref"]) for i in pg.get_image_info(xrefs=True) if i["xref"] and i["width"] >= 600]
        for r, t in lns:
            if r.y0 < 130 or not COD.match(t):
                continue
            col = sorted([(rr, tt) for rr, tt in lns if abs(rr.x0 - r.x0) < 12 and rr.y0 > r.y0 and rr.y0 - r.y0 < 80],
                         key=lambda x: x[0].y0)
            nome, material, mult = [], [], ""
            for rr, tt in col:
                if tt.startswith("Múltiplo"):
                    mult = tt.replace("Múltiplo:", "").strip()
                    break
                if SKU.match(tt) or tt.upper().startswith(("BRANCA", "PRETA", "SKU")):
                    continue
                if material or re.search(r"\b(ABS|PVC)\b", tt) or "modificador" in tt:
                    material.append(tt)
                else:
                    nome.append(tt)
            # SKUs: rótulo (BRANCA/PRETA/SKU) e o número logo abaixo, na mesma coluna do cartão
            rot = [(rr, tt) for rr, tt in lns if r.x0 - 12 < rr.x0 < r.x0 + 120 and 0 < rr.y0 - r.y0 < 70
                   and tt.upper().startswith(("BRANCA", "PRETA", "SKU"))]
            skus = []
            for rr, tt in sorted(rot, key=lambda x: x[0].x0):
                num = min(((abs(n.y0 - rr.y1) + abs(n.x0 - rr.x0) * .3, nt) for n, nt in lns
                           if SKU.match(nt) and 0 <= n.y0 - rr.y0 < 14 and abs(n.x0 - rr.x0) < 16), default=(0, ""))[1]
                if num:
                    skus.append(num if tt.upper() == "SKU" else f"{tt.title()} {num}")
            cands = [(ri.width * ri.height, xr) for ri, xr in imgs
                     if ri.y1 <= r.y0 + 2 and r.y0 - ri.y1 < 40 and r.x0 - 20 < (ri.x0 + ri.x1) / 2 < r.x0 + 130]
            img = salva(doc, max(cands)[1], t.lower()) if cands else ""
            itens.append({"codigo": t, "tipo": " ".join(nome).replace("Canaleta PDR60 · tradicional", "Canaleta tradicional"),
                          "secao": LINHAS[pn], "linha": " ".join(material), "sku": " · ".join(skus),
                          "multiplo": mult, "img": img})
    return itens


def do_antigo(pasta: Path, ja: set[str], sem_foto: set[str]) -> tuple[list[dict], dict[str, str]]:
    """Itens do catálogo anterior que não aparecem no novo (com foto e SKU de lá),
    e a foto antiga dos itens do catálogo novo que vieram sem foto."""
    doc = pymupdf.open(pasta / ANTIGO)
    out, fotos = [], {}
    for pn, pg in enumerate(doc):
        lns = linhas_da_pagina(pg)
        imgs = [(pymupdf.Rect(i["bbox"]), i["xref"]) for i in pg.get_image_info(xrefs=True)
                if i["width"] >= 900 and pymupdf.Rect(i["bbox"]).width < 300]
        for r, t in lns:
            if COD.match(t) and t in sem_foto and t not in fotos:
                c = [(r.y0 - (ri.y0 + ri.y1) / 2, xr) for ri, xr in imgs
                     if 0 < r.y0 - (ri.y0 + ri.y1) / 2 < 140 and abs((ri.x0 + ri.x1) / 2 - (r.x0 + 75)) < 90]
                if c:
                    fotos[t] = salva(doc, min(c)[1], t.lower())
            if not COD.match(t) or t in ja or any(o["codigo"] == t for o in out):
                continue
            col = sorted([(rr, tt) for rr, tt in lns if abs(rr.x0 - r.x0) < 6 and rr.y0 > r.y0], key=lambda x: x[0].y0)
            if len(col) < 2:
                continue
            cands = [(r.y0 - (ri.y0 + ri.y1) / 2, xr) for ri, xr in imgs
                     if 0 < r.y0 - (ri.y0 + ri.y1) / 2 < 140 and abs((ri.x0 + ri.x1) / 2 - (r.x0 + 75)) < 90]
            sku = next((tt for rr, tt in col if SKU.match(tt) and rr.y0 - r.y0 < 170), "")
            out.append({"codigo": t, "tipo": col[0][1], "secao": "Outros acessórios", "linha": col[1][1],
                        "sku": sku, "multiplo": "", "img": salva(doc, min(cands)[1], t.lower()) if cands else ""})
    for i in out:  # nome que quebrou em duas linhas no PDF antigo
        if i["codigo"] == "FDR60":
            i["tipo"], i["linha"] = "Duto flexível para canaletas 60 e 80 mm", "PVC branco"
    return out, fotos


def main(pasta: Path) -> None:
    DEST_IMG.mkdir(parents=True, exist_ok=True)
    for f in DEST_IMG.glob("*.webp"):
        f.unlink()
    novos = do_novo(pasta)
    antigos, fotos = do_antigo(pasta, {i["codigo"] for i in novos}, {i["codigo"] for i in novos if not i["img"]})
    for i in novos:
        i["img"] = i["img"] or fotos.get(i["codigo"], "")
        i["tipo"] = re.sub(r"^Canaleta PDR\d+ · tradicional$", "Canaleta tradicional", i["tipo"])
        i["sku"] = re.sub(r"Branca · (\d) M", r"Branca \1 m", i["sku"])
    itens = novos + antigos
    DEST_JSON.write_text(json.dumps({"marca": "perfiltec", "fonte": [NOVO, ANTIGO], "itens": itens},
                                    ensure_ascii=False, indent=1), encoding="utf-8")
    for i in itens:
        print(i["codigo"], "|", i["tipo"], "|", i["secao"][:14], "|", i["linha"][:30], "|", i["sku"], "|", i["multiplo"], "|", bool(i["img"]))
    print(len(novos), "do catálogo novo +", len(antigos), "só no antigo =", len(itens))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
