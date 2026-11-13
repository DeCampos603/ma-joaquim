"""Extrai foto e código de cada peça do catálogo SIBB (PDF com texto) para o catálogo do site.

Cada peça do PDF é uma imagem embutida com o código logo abaixo. O script casa
código e imagem pela posição na página, descarta fundos, cabeçalhos e o selo
"Indisponível" (o site não mostra estoque) e grava WebP + JSON.

Uso: py -3 -X utf8 ferramentas/extrair_sibb.py <pdf>
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
DEST_IMG = AQUI / "src" / "catalogo" / "sibb"
DEST_JSON = AQUI / "dados" / "catalogo-sibb.json"
LADO = 360  # px do maior lado da miniatura

SECOES = {
    "LANÇAMENTOS": "Lançamentos", "LAVA E SECA": "Lava e seca", "CAPACITORES": "Capacitores",
    "AR CONDICIONADO": "Ar-condicionado", "TURBINAS": "Turbinas", "LINHA DE CORREIAS": "Correias",
    "REFRIGERAÇÃO": "Refrigeração", "MICRO-ONDAS": "Micro-ondas",
}
# Prefixo do código -> tipo de peça. Só os que o sumário do catálogo confirma página a página.
TIPOS = {
    "SET": "Eixo tripé", "SGU": "Guarnição", "SVA": "Válvula", "STR": "Trava de porta",
    "SRE": "Retentor", "SAM": "Amortecedor", "SEL": "Eletrobomba", "SMA": "Mangueira",
    "SCF": "Cabo de força", "SRO": "Rolamento", "SCA": "Capacitor", "STU": "Turbina",
    "SCT": "Correia", "SMM": "Magnetron", "SPM": "Prato de micro-ondas", "WF": "Filtro de água",
    "SMV": "Motor ventilador", "STG": "Termostato",
}
CODIGO = re.compile(r"^(?:[A-Z]{1,4}-?[A-Z0-9][A-Za-z0-9,+./\-]*|\d{8})(?:\s*\(?\d{2,3}V\)?)?(?:\s|$|\()")
DOIS = re.compile(r"\b[A-Z]{2,4}-[A-Z0-9][A-Z0-9,+.\-]*")
# Itens com nome próprio no catálogo (sem código no padrão SXX-): bombas de dreno Siccom e kits.
# (nome na página, nome no site, seção)
NOMEADOS = [
    ("ECO FLOWATCH", "Bomba de dreno Siccom Eco Flowatch"), ("Mini FLOWATCH 2", "Bomba de dreno Siccom Mini Flowatch 2"),
    ("MAXI ECO FLOWATCH", "Bomba de dreno Siccom Maxi Eco Flowatch"), ("BOMBA DE DRENO PARA", "Bomba de dreno Siccom para cassete"),
    ("FLOWITA SILENCE", "Bomba de dreno Siccom Flowita Silence"), ("FLOWATCH SILENCE", "Bomba de dreno Siccom Flowatch Silence"),
    ("FLOWATCH VISION 4", "Bomba de dreno Siccom Flowatch Vision 4"), ("FLOWITA", "Bomba de dreno Siccom Flowita"),
    ("Bomba de Condensado", "Bomba de condensado Ecotank 2.5"),
]
NOMES_CODIGO = {"SMF-2300A-U": "Kit manifold com 3 mangueiras de 90 cm", "QD-U02B": "Kit placa universal", "QD-UO2B": "Kit placa universal",
                "SVC-00035-U": "Tubo de cobre 1/4\" · 10 cm"}


def eh_codigo(t: str) -> bool:
    """Código de peça: 1ª palavra com dígito, 5+ caracteres, sem ser lista de gases nem embalagem."""
    tok = t.split()[0] if t.split() else ""
    return (bool(CODIGO.match(t)) and bool(re.search(r"\d", tok)) and len(tok) >= 5
            and not tok.startswith(("R12/", "PCTE", "KIT")))


def tipo_de(codigo: str, secao: str) -> str:
    pref = re.split(r"[-\s]", codigo)[0]
    return TIPOS.get(pref, f"Peça de {secao.lower()}")


def main(pdf: Path) -> None:
    DEST_IMG.mkdir(parents=True, exist_ok=True)
    DEST_JSON.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf)
    itens, vistos = [], set()
    for pn, pg in enumerate(doc):
        linhas = []
        for b in pg.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                t = "".join(s["text"] for s in ln["spans"]).strip()
                if not t:
                    continue
                if len(DOIS.findall(t)) > 1:  # dois códigos de colunas vizinhas na mesma linha
                    for s in ln["spans"]:
                        if s["text"].strip():
                            linhas.append((pymupdf.Rect(s["bbox"]), s["text"].strip()))
                else:
                    linhas.append((pymupdf.Rect(ln["bbox"]), t))
        topo = [t for r, t in linhas if r.y1 < 45]
        secao = next((SECOES[t] for t in topo if t in SECOES), None)
        if not secao:
            continue
        sub = next((t for r, t in linhas if r.y1 < 45 and t not in SECOES), "")
        imagens = []
        for inf in pg.get_image_info(xrefs=True):
            r = pymupdf.Rect(inf["bbox"])
            w, h = inf["width"], inf["height"]
            if r.width > 300 or r.y1 < 50:  # fundo da página e cabeçalho
                continue
            if w / max(h, 1) > 2.6 or w * h < 120 * 120:  # selos e etiquetas
                continue
            imagens.append((r, inf["xref"]))
        # A imagem tem margem transparente e às vezes passa por cima do código: casa pelo
        # centro da imagem logo acima do texto, e cada imagem serve a um código só.
        pares = []
        for r_txt, t in linhas:
            if r_txt.y1 < 45 or r_txt.y0 > 805 or not eh_codigo(t) or t.startswith("E-mail"):
                continue
            cx = (r_txt.x0 + r_txt.x1) / 2
            for r, x in imagens:
                icx, icy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
                dy, dx = r_txt.y0 - icy, abs(icx - cx)
                if 0 < dy < 150 and dx < 75:
                    pares.append((dy + 2 * dx, t, x, (pn, round(r_txt.y0 / 25), r_txt.x0)))
        usados_img, usados_txt = set(), set()
        escolhidos = []
        for _, t, xref, ordem in sorted(pares, key=lambda p: p[0]):
            if xref in usados_img or t in usados_txt:
                continue
            usados_img.add(xref); usados_txt.add(t)
            escolhidos.append((t, xref, ordem))
        # 2ª passada: código sem par pega a imagem livre mais perto (acima ou à esquerda)
        for r_txt, t in linhas:
            if t in usados_txt or r_txt.y1 < 45 or r_txt.y0 > 805 or not eh_codigo(t) or t.startswith("E-mail"):
                continue
            cx, cy = (r_txt.x0 + r_txt.x1) / 2, (r_txt.y0 + r_txt.y1) / 2
            melhor = None
            for r, x in imagens:
                icx, icy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
                acima = -25 < r_txt.y0 - icy < 230 and abs(icx - cx) < 110
                esquerda = abs(icy - cy) < 90 and -35 <= r_txt.x0 - r.x1 < 140 and icx < r_txt.x0
                if acima or esquerda:
                    d = abs(icy - cy) + abs(icx - cx) + (400 if x in usados_img else 0)
                    if melhor is None or d < melhor[0]:
                        melhor = (d, x)
            if melhor:
                usados_txt.add(t); usados_img.add(melhor[1])
                escolhidos.append((t, melhor[1], (pn, round(r_txt.y0 / 25), r_txt.x0)))
        for t, xref, ordem in escolhidos:
            codigo = re.sub(r"\s+", " ", t).strip()
            slug = re.sub(r"[^A-Za-z0-9]+", "-", codigo).strip("-").lower()
            if slug in vistos:
                continue
            vistos.add(slug)
            pix = pymupdf.Pixmap(doc, xref)
            if pix.alpha or pix.n > 3:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            im.thumbnail((LADO, LADO), Image.LANCZOS)
            im.save(DEST_IMG / f"{slug}.webp", quality=82, method=6)
            itens.append({
                "codigo": codigo, "tipo": NOMES_CODIGO.get(codigo.split(" ")[0], tipo_de(codigo, secao)), "secao": secao,
                "linha": sub.title() if sub else "", "img": f"catalogo/sibb/{slug}.webp",
                "pagina": pn + 1, "_ordem": ordem,
            })
        # produtos com nome próprio (bombas Siccom): nome, especificações abaixo e a foto livre mais perto
        ancoras = [(r, t) for r, t in linhas if any(t.strip() == a for a, _ in NOMEADOS)]
        for r, t in ancoras:
            nome = dict(NOMEADOS)[t]
            spec, y = [], r.y1
            for rr, tt in sorted([x for x in linhas if abs(x[0].x0 - r.x0) < 14 and x[0].y0 > r.y0], key=lambda x: x[0].y0):
                if rr.y0 - y > 40 or any(tt == a for a, _ in NOMEADOS):
                    break
                if tt.upper() not in ("CASSETE", "SILENCE") and not tt.startswith("2.5"):
                    spec.append(tt.replace(" I/h", " l/h").replace("I/h", " l/h").replace("  ", " "))
                y = rr.y1
            cx, cy = r.x0, r.y0 + 30
            livres = [(abs((ri.x0 + ri.x1) / 2 - cx) + abs((ri.y0 + ri.y1) / 2 - cy), x) for ri, x in imagens
                      if x not in usados_img and abs((ri.y0 + ri.y1) / 2 - cy) < 120 and ri.x1 <= r.x0 + 20]
            if not livres:
                continue
            xref = min(livres)[1]
            usados_img.add(xref)
            slug = re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-")
            pix = pymupdf.Pixmap(doc, xref)
            if pix.alpha or pix.n > 3:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            im.thumbnail((LADO, LADO), Image.LANCZOS)
            im.save(DEST_IMG / f"{slug}.webp", quality=82, method=6)
            itens.append({"codigo": "", "tipo": nome, "secao": secao, "linha": "Bombas de dreno Siccom",
                          "spec": spec[:5], "img": f"catalogo/sibb/{slug}.webp", "pagina": pn + 1,
                          "_ordem": (pn, round(r.y0 / 25), r.x0)})
    # ordem de leitura do catálogo: página, linha, coluna
    itens.sort(key=lambda i: i.pop("_ordem"))
    DEST_JSON.write_text(json.dumps({"marca": "sibb", "fonte": pdf.name, "itens": itens},
                                    ensure_ascii=False, indent=1), encoding="utf-8")
    por = {}
    for i in itens:
        por[i["secao"]] = por.get(i["secao"], 0) + 1
    print(len(itens), "itens", por)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
