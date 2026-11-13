"""Renderiza as páginas dos catálogos em PDF como WebP para o folheador 3D do site.

Uso: py -3 -X utf8 ferramentas/renderizar_folhas.py "<pasta SITE M A JOAQUIM>"
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pymupdf
from PIL import Image

AQUI = Path(__file__).resolve().parent.parent
DEST = AQUI / "src" / "folhas"
ALTURA = 1400  # px da maior dimensão

DOCS = {
    "sibb": [("catalogo-2026-11", "Catálogo de produtos · novembro 2026", "Catálogo Digital - NOVEMBRO 2026.pdf")],
    "suryha": [
        ("linha-2026", "Linha de produtos 2026", "Folder Suryha 2026 (1).pdf"),
        ("capacitores", "Linha de capacitores 2025/26", "Folder Capacitores Aberto - v03 (1).pdf"),
        ("automotivo", "Linha automotiva", "Folder Suryha 2025 - Automotivo.pdf"),
    ],
    "perfiltec": [("climatizacao-2026", "Catálogo Climatização 2026", "Catalogo-Climatizacao-2026-PT.pdf"),
                  ("catalogo-online", "Catálogo online (impressão)", "Catálogo de Produtos — Perfiltec Indústria de Perfis.pdf")],
    "coel": [("refrigeracao-2026", "Controladores para refrigeração 2026", "Folder refrigeração 2026.pdf")],
}


def main(pasta: Path) -> None:
    indice = {}
    for marca, docs in DOCS.items():
        indice[marca] = []
        for slug, titulo, arquivo in docs:
            dest = DEST / marca / slug
            dest.mkdir(parents=True, exist_ok=True)
            doc = pymupdf.open(pasta / arquivo)
            paginas = []
            for i, pg in enumerate(doc, 1):
                escala = ALTURA / max(pg.rect.width, pg.rect.height)
                pix = pg.get_pixmap(matrix=pymupdf.Matrix(escala, escala))
                im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                nome = f"{i:02d}.webp"
                im.save(dest / nome, quality=72, method=6)
                paginas.append({"src": f"folhas/{marca}/{slug}/{nome}", "w": im.width, "h": im.height})
            indice[marca].append({"slug": slug, "titulo": titulo, "paginas": paginas})
            print(marca, slug, len(paginas))
    (AQUI / "dados" / "folhas.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
