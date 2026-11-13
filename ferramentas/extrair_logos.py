"""Separa os logotipos das fábricas a partir do material que elas mesmas distribuem.

Uso: py -3 -X utf8 ferramentas/extrair_logos.py "<pasta SITE M A JOAQUIM>"
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image
from pptx import Presentation

AQUI = Path(__file__).resolve().parent.parent
DEST = AQUI / "src" / "img" / "marcas"


def recorta_alpha(im: Image.Image, ref: tuple[int, int, int], tol: int = 28) -> Image.Image:
    """Torna transparente o fundo liso da cor `ref` e recorta as sobras."""
    im = im.convert("RGBA")
    a = np.array(im).astype(int)
    ref = np.array(ref)
    dist = np.abs(a[..., :3] - ref).sum(-1)
    a[..., 3] = np.where(dist < tol, 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    return out.crop(out.getchannel("A").getbbox())


def main(pasta: Path) -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    # Perfiltec: logotipo em alta na capa do catálogo
    doc = pymupdf.open(pasta / "Catálogo de Produtos — Perfiltec Indústria de Perfis.pdf")
    for inf in doc[0].get_image_info(xrefs=True):
        if inf["width"] > 5000:
            pix = pymupdf.Pixmap(doc, inf["xref"])
            sm = doc.extract_image(inf["xref"]).get("smask")
            if sm:
                pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, sm))
            im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
            im = im.crop(im.getchannel("A").getbbox())
            im.thumbnail((900, 900), Image.LANCZOS)
            im.save(DEST / "perfiltec-negativo.png", optimize=True)
            # versão para fundo claro: o mesmo desenho em grafite
            a = np.array(im)
            a[..., :3] = (29, 39, 51)
            Image.fromarray(a).save(DEST / "perfiltec.png", optimize=True)
    # SIBB: última página do catálogo, logotipo vetorial (só a marca, sem a razão social)
    doc = pymupdf.open(pasta / "Catálogo Digital - NOVEMBRO 2026.pdf")
    pg = doc[-1]
    blocos = [b for b in pg.get_text("dict")["blocks"] if b.get("lines")]
    topo_texto = min(b["bbox"][1] for b in blocos)
    pix = pg.get_pixmap(dpi=300, clip=pymupdf.Rect(0, 60, pg.rect.width, topo_texto - 4))
    im = Image.open(io.BytesIO(pix.tobytes("png")))
    recorta_alpha(im, (255, 255, 255), tol=40).save(DEST / "sibb.png", optimize=True)
    # Suryha: capa do folder de capacitores (logo branco e laranja sobre preto)
    doc = pymupdf.open(pasta / "Folder Capacitores Aberto - v03 (1).pdf")
    pg = doc[0]
    r = pg.rect
    pix = pg.get_pixmap(dpi=300, clip=pymupdf.Rect(r.x0 + r.width * .1, r.y0 + r.height * .08, r.x1 - r.width * .08, r.y0 + r.height * .30))
    im = Image.open(io.BytesIO(pix.tobytes("png")))
    im = im.crop((int(im.width * .12), 0, im.width, int(im.height * .93)))  # tira a faixa laranja da capa
    neg = recorta_alpha(im, (0, 0, 0), tol=70)
    neg.save(DEST / "suryha-negativo.png", optimize=True)
    # versão para fundo claro: o branco do nome vira grafite, o símbolo laranja fica
    a = np.array(neg)
    branco = (a[..., :3].min(-1) > 200) & (a[..., 3] > 0)
    a[branco, :3] = (26, 26, 26)
    Image.fromarray(a).save(DEST / "suryha.png", optimize=True)
    # Coel: logotipo repetido nos slides
    pr = Presentation(pasta / "Portifólio Automação.pptx")
    for s in pr.slides:
        for sh in s.shapes:
            if sh.shape_type == 13 and sh.image.size == (157, 129):
                Image.open(io.BytesIO(sh.image.blob)).save(DEST / "coel-bruto.png")
                break
    for p in sorted(DEST.glob("*.png")):
        print(p.name, Image.open(p).size)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
