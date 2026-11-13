"""Extrai os produtos do portfólio Coel (PPTX) para o catálogo do site.

Slides de produto: título "MODELO | TIPO" ou "Modelo X – tipo", texto técnico e a
maior imagem do slide. O slide 7 é uma grade de controladores com o nome embaixo.

Uso: py -3 -X utf8 ferramentas/extrair_coel.py <pptx>
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

from PIL import Image
from pptx import Presentation

AQUI = Path(__file__).resolve().parent.parent
DEST_IMG = AQUI / "src" / "catalogo" / "coel"
DEST_JSON = AQUI / "dados" / "catalogo-coel.json"
LADO = 480
PIC = 13


def salvar(blob: bytes, slug: str) -> str:
    im = Image.open(io.BytesIO(blob)).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((LADO, LADO), Image.LANCZOS)
    fundo = Image.new("RGBA", im.size, (255, 255, 255, 255))
    fundo.alpha_composite(im)
    fundo.convert("RGB").save(DEST_IMG / f"{slug}.webp", quality=84, method=6)
    return f"catalogo/coel/{slug}.webp"


# Folder "Controladores para refrigeração 2026": texto lido do PDF; foto pelo xref da página.
# (código, tipo, aplicação, especificações, página, xref da foto)
REFRIGERACAO = [
    ("B05 + P03", "Controlador modular (módulo + display)", "Cervejeiros",
     ["4 saídas: compressor, degelo, ventilador e iluminação ou auxiliar", "Bivolt automático", "Teclado touch e buzina",
      "Display e módulo vendidos separadamente", "Compatível com Coel Online"], 2, 7),
    ("TLB30S", "Controlador de temperatura", "Cervejeiros",
     ["4 saídas: compressor, degelo, ventilador e iluminação ou auxiliar", "Bivolt automático", "Teclado touch e buzina",
      "Opcional: teclas de atalho para 4 setpoints", "Kit completo para instalação"], 3, 26),
    ("TLJ29", "Controlador para tanque de leite · caixa retangular", "Tanques de leite",
     ["2 saídas: compressor e agitador", "Monitor de tensão", "Sensor NTC com ponta de inox (1 sonda inclusa)"], 4, 43),
    ("KLJ29", "Controlador para tanque de leite · caixa circular", "Tanques de leite",
     ["2 saídas: compressor e agitador", "Monitor de tensão", "Sensor NTC com ponta de inox (1 sonda inclusa)"], 4, 43),
    ("ET1", "Termostato digital · 1 saída", "Resfriados e congelados",
     ["Botão knob", "Comunicação NFC", "Monitor de tensão integrado", "Conectores Faston 6,3 mm", "Montagem horizontal ou vertical"], 5, 73),
    ("ET3", "Termostato digital · 3 saídas", "Resfriados e congelados",
     ["Botão knob", "Comunicação NFC", "Monitor de tensão integrado", "Entrada digital configurável", "Montagem horizontal ou vertical"], 5, 73),
    ("TLY25", "Controlador de temperatura", "Sorvetes e congelados",
     ["4 saídas: compressor, degelo, ventilador e iluminação ou alarme", "Bivolt automático",
      "Opcional: relógio em tempo real para degelo", "Degelo avançado (dreno)"], 7, 101),
    ("E34B", "Controlador de temperatura · compatível com Coel Online", "Sorvetes e congelados",
     ["4 saídas: compressor, degelo, ventilador e iluminação ou alarme", "Opcional: Wi-Fi (Coel Online)",
      "Opcional: relógio em tempo real para degelo"], 7, 103),
    ("Z31", "Controlador de temperatura · 1 saída", "Resfriados",
     ["Alimentação 100 a 240 Vca ou 12 a 24 Vca/Vcc", "Opcionais: buzina e teclado touch", "Degelo por parada do compressor"], 8, 118),
    ("E31", "Controlador de temperatura · 1 saída", "Resfriados",
     ["Alimentação 127 ou 220 Vca", "Terminais faston ou extraível", "Moldura preta ou branca"], 8, 114),
    ("Y39", "Controlador de temperatura · 3 saídas", "Congelados",
     ["Saídas para compressor, degelo e ventilador", "2 sondas inclusas", "Opcionais: buzina e teclado touch",
      "Degelo elétrico, gás quente ou dinâmico"], 9, 128),
    ("E33", "Controlador de temperatura · 3 saídas", "Congelados",
     ["Saídas para compressor, degelo e ventilador", "2 sondas inclusas", "Terminais faston ou extraível",
      "Alimentação 127 ou 220 Vca"], 9, 126),
    ("AEGM", "Temporizador analógico multiescala", "Painéis e automação",
     ["Escalas de 1 s a 60 min, selecionáveis no frontal", "Função retardo ou pulso na energização"], 10, 156),
    ("BVF1", "Monitor de falta de fase", "Redes trifásicas", ["Instalação em redes de 208 a 480 Vca"], 10, 162),
    ("BVS1", "Monitor de falta e sequência de fase", "Redes trifásicas", ["Instalação em redes de 208 a 480 Vca"], 10, 160),
    ("BWT-40 REC", "Interruptor horário para painel", "Painéis e automação",
     ["40 programações (20 liga + 20 desliga)", "Até 2 saídas a relé", "Bateria recarregável"], 10, 154),
    ("RTST20", "Interruptor horário", "Painéis e automação",
     ["1 saída a relé de 16 A", "20 programações (10 liga + 10 desliga)", "Bateria recarregável"], 10, 152),
    ("RTDF", "Temporizador para degelo", "Refrigeração",
     ["1 saída reversível a relé de 16 A", "Intervalo entre degelos de até 12 h", "Duração de até 60 min"], 10, 166),
    ("KLZ10", "Controlador para refrigeração · 1 saída", "Chopeiras", ["Saída para compressor", "Muito usado em chopeiras"], 10, 158),
]


def folder_refrigeracao(pdf: Path) -> list[dict]:
    import pymupdf
    doc = pymupdf.open(pdf)
    out = []
    for cod, tipo, aplic, spec, _pag, xref in REFRIGERACAO:
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        sm = doc.extract_image(xref).get("smask")
        if sm:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, sm))
        slug = re.sub(r"[^a-z0-9]+", "-", cod.lower()).strip("-")
        out.append({"codigo": cod, "tipo": tipo, "secao": "Controladores para refrigeração", "linha": aplic,
                    "spec": spec, "img": salvar(pix.tobytes("png"), slug)})
    return out


def main(pptx: Path) -> None:
    DEST_IMG.mkdir(parents=True, exist_ok=True)
    pr = Presentation(pptx)
    itens = []
    secao = ""
    for n, s in enumerate(pr.slides, 1):
        textos = [sh for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
        fotos = [sh for sh in s.shapes if sh.shape_type == PIC and sh.image.content_type in ("image/png", "image/jpeg")]
        if len(textos) == 1 and not fotos:  # slide divisor de seção
            secao = textos[0].text_frame.text.strip()
            continue
        titulo = next((t.text_frame.text.strip() for t in textos
                       if re.match(r"^(Modelo\s+\w+|[A-Z0-9]{2,6}\s+\|)", t.text_frame.text.strip())), None)
        if titulo:
            m = re.match(r"^Modelo\s+(\w+)\s+[–-]\s+(.+)$", titulo.replace("\n", " "))
            codigo, tipo = (m.group(1), m.group(2)) if m else [p.strip() for p in titulo.split("|", 1)]
            tipo = tipo.strip().capitalize() if tipo.isupper() else tipo.strip()
            corpo = [t.text_frame.text for t in textos if t.text_frame.text.strip() not in (titulo,)
                     and "Lançament" not in t.text_frame.text]
            spec = [l.strip(" ;.") for c in corpo for l in re.split(r"[\n\x0b]", c) if l.strip()]
            foto = max(fotos, key=lambda f: f.width * f.height)
            if "VF" in codigo or "Inversor" in tipo:
                sec = "Inversores de frequência"
            elif "Relé" in tipo:
                sec = "Relés"
            else:
                sec = "Controladores de temperatura e processo"
            itens.append({"codigo": codigo, "tipo": tipo, "secao": sec, "linha": "Coel",
                          "spec": spec[:8], "img": salvar(foto.image.blob, codigo.lower()), "pagina": n})
        # O slide 7 ("Evolução") mostra os modelos antigos (K48E, K49E, TLK48, TLK49) ao lado
        # dos novos. Os antigos não entram no catálogo: não há confirmação de que ainda são vendidos.
    itens += folder_refrigeracao(pptx.parent / "Folder refrigeração 2026.pdf")
    DEST_JSON.write_text(json.dumps({"marca": "coel", "fonte": [pptx.name, "Folder refrigeração 2026.pdf"], "itens": itens},
                                    ensure_ascii=False, indent=1), encoding="utf-8")
    for i in itens:
        print(i["codigo"], "|", i["tipo"], "|", i["secao"], "|", len(i["spec"]))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
