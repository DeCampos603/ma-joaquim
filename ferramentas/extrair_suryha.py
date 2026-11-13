"""Catálogo da Suryha a partir dos folders (PDFs só imagem) com OCR do Windows.

Etapas:
 1. renderiza cada página em alta (zoom 6) e corta em blocos de 2400 px;
 2. roda o OCR nativo do Windows (ferramentas/ocr_windows.ps1, pt-BR), com cache;
 3. acha cada "cód. 80150.xxx" (e outras famílias de 8 dígitos), pega o nome
    em maiúsculas logo abaixo (ou acima, quando são variantes de um mesmo
    produto) e liga à foto recortada mais próxima no PDF;
 4. corrige erros típicos do OCR com o vocabulário do próprio folder e com
    a tabela CORRECOES (conferida à mão).

Uso: py -3 -X utf8 ferramentas/extrair_suryha.py "<pasta SITE M A JOAQUIM>" <pasta_cache>
"""
from __future__ import annotations

import difflib
import io
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
AQUI = Path(__file__).resolve().parent.parent
DEST_IMG = AQUI / "src" / "catalogo" / "suryha"
DEST_JSON = AQUI / "dados" / "catalogo-suryha.json"
ZOOM, TILE, SOBRA = 6, 2400, 300

DOCS = [  # (tag, arquivo, seção padrão)
    ("f26", "Folder Suryha 2026 (1).pdf", "Linha 2026"),
    ("aut", "Folder Suryha 2025 - Automotivo.pdf", "Automotivo"),
]
COD = re.compile(r"c[óo]d\.?:?\s*([0-9][0-9.,\s]{7,11}[0-9])", re.I)
SO_COD = re.compile(r"^\s*(?:c[óo]d\.?:?\s*)?(\d{5}[.,]?\d{3})\b")

# Conferido à mão contra o folder: erros que o OCR comete e o vocabulário não resolve.
CORRECOES = {
    "MACARICO": "MAÇARICO", "AUTOMATICO": "AUTOMÁTICO", "VACUO": "VÁCUO", "TERMOMETRO": "TERMÔMETRO",
    "MANOMETRO": "MANÔMETRO", "ALUMINIO": "ALUMÍNIO", "NITROGENIO": "NITROGÊNIO", "VALVULA": "VÁLVULA",
    "SERVICO": "SERVIÇO", "ELETRONICO": "ELETRÔNICO", "CONEXAO": "CONEXÃO", "PRESSAO": "PRESSÃO",
    "AMPERIMETRO": "AMPERÍMETRO", "VACUOMETRO": "VACUÔMETRO", "PORCA": "PORCA", "UNIAO": "UNIÃO",
}


def ocr(pasta: Path, cache: Path) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    js = cache / "ocr.json"
    if js.exists():
        return json.loads(js.read_text(encoding="utf-8-sig"))
    tiles = cache / "tiles"
    tiles.mkdir(exist_ok=True)
    for tag, arq, _ in DOCS:
        doc = pymupdf.open(pasta / arq)
        for i, pg in enumerate(doc, 1):
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM))
            im = Image.open(io.BytesIO(pix.tobytes("png")))
            for y in range(0, max(1, im.height - SOBRA), TILE - SOBRA):
                for x in range(0, max(1, im.width - SOBRA), TILE - SOBRA):
                    im.crop((x, y, min(x + TILE, im.width), min(y + TILE, im.height))).save(tiles / f"{tag}-{i:02d}__{x}_{y}.png")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                    str(Path(__file__).with_name("ocr_windows.ps1")), str(tiles), str(js)], check=True)
    return json.loads(js.read_text(encoding="utf-8-sig"))


def linhas_por_pagina(dados: dict) -> dict[str, list[dict]]:
    """Junta os blocos em coordenadas da página e tira duplicatas da sobreposição."""
    pags: dict[str, list[dict]] = {}
    for nome, linhas in dados.items():
        pag, off = nome.rsplit(".", 1)[0].split("__")
        if pag.split("-")[0] not in {t for t, _, _ in DOCS}:
            continue
        ox, oy = map(int, off.split("_"))
        lst = pags.setdefault(pag, [])
        for l in linhas or []:
            ps = l["p"] if isinstance(l["p"], list) else [l["p"]]
            x0 = min(p["x"] for p in ps) + ox; y0 = min(p["y"] for p in ps) + oy
            x1 = max(p["x"] + p["w"] for p in ps) + ox; y1 = max(p["y"] + p["h"] for p in ps) + oy
            if any(abs(o["x0"] - x0) < 25 and abs(o["y0"] - y0) < 25 and o["t"] == l["t"] for o in lst):
                continue
            lst.append({"t": l["t"].strip(), "x0": x0, "y0": y0, "x1": x1, "y1": y1, "h": y1 - y0})
    for lst in pags.values():
        lst.sort(key=lambda r: (r["y0"], r["x0"]))
    return pags


def norm_cod(s: str) -> str | None:
    d = re.sub(r"\D", "", s)
    if len(d) != 8:
        return None
    return f"{d[:5]}.{d[5:]}"


def vocabulario(pags: dict) -> Counter:
    c = Counter()
    for lst in pags.values():
        for r in lst:
            for w in re.findall(r"[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}", r["t"]):
                c[w] += 1
    return c


def corrige(texto: str, voc: Counter) -> str:
    """Só troca palavras da lista CORRECOES. Correção por semelhança foi testada e
    removida: trocava PENTE por ENGATE e ESPELHO por SELO."""
    t = re.sub(r"[A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]{4,}", lambda m: CORRECOES.get(m.group(0).upper(), m.group(0)), texto)
    return re.sub(r"\s+", " ", t).strip(" .-|")


# Conferido à mão nos recortes do folder (13/11/2026): nome e detalhe valem sobre o OCR.
REVISADO = {
    "80155.036": ("Bomba de vácuo 5CFM a bateria", ""),
    "80155.037": ("Bomba de vácuo 7CFM duplo estágio a bateria", ""),
    "80150.202": ("Recolhedora recicladora 1HP", "Com separador de óleo"),
    "80150.112": ("Recolhedora recicladora 3/4HP", "Com separador de óleo"),
    "80150.175": ("Recolhedora recicladora 1/2HP", "Com separador de óleo"),
    "80150.215": ("Manifold R22/R134A com mangueira 150 cm", "2 engates para R134A e maleta premium"),
    "80150.119": ("Conjunto de mangueiras 200 cm", "R22 | R404 | R134"),
    "80150.001": ("Manifold com mangueiras 90 cm com maleta", "R22 | R134 | R404"),
    "80150.030": ("Manifold com mangueiras 90 cm", "R22 | R134 | R404"),
    "80150.033": ("Manifold com mangueiras 90 cm", "R410A | R32"),
    "80150.035": ("Manifold com mangueiras 90 cm com maleta premium", "R410A | R32"),
    "80150.111": ("Manifold com mangueiras 90 cm", "R600 | R290"),
    "80150.002": ("Manômetro alta", "R22/404/134"), "80150.003": ("Manômetro baixa", "R22/404/134"),
    "80150.054": ("Manômetro alta", "R410/R32"), "80150.055": ("Manômetro baixa", "R410/R32"),
    "80150.106": ("Manifold 1 via baixa", "R22, R134a, R404, R410"),
    "80150.107": ("Manifold 1 via alta", "R22, R134a, R404, R410"),
    "80150.110": ("Reparo para mangueiras manifold", "6 vedações e 3 acionadores"),
    "80150.011": ("Engate rápido alta", ""), "80150.012": ("Engate rápido baixa", ""),
    "80150.051": ("Engate rápido ajustável alta", ""), "80150.052": ("Engate rápido ajustável baixa", ""),
    "80150.251": ("Engate rápido ajustável R1234YF alta", ""), "80150.252": ("Engate rápido ajustável R1234YF baixa", ""),
    "80150.043": ("Pente para aletas", 'Medidas 8", 9", 10", 12", 14" e 15"'),
    "80150.019": ("Espelho de inspeção", ""),
    "80150.108": ("Escareador tipo copo", "Para tubos de cobre"),
    "80150.016": ("Bico maçarico automático", "Com propulsor metálico"),
    "80150.081": ("Bico maçarico automático Turbotoch", ""),
    "80150.067": ("Bico maçarico automático com extensão", ""),
    "80150.199": ("Furadeira de impacto a bateria", "21V | motor sem escovas"),
    "80150.200": ("Parafusadeira a bateria", "12V"),
    "80150.185": ("Saco coletor de pó", "Para broca até 65 mm"),
    "80150.230": ("Kit garrafa injetora de alumínio", "Para fluidos 141B, limpeza de ar"),
    "80150.235": ("Adaptador multiportas", "3X8M x 3/8M x 1/4F"),
    "80150.236": ("Adaptador multiportas", "3X8M x 3/8M x 3/8F"),
    "80150.233": ("Válvula otimizadora com removedor de núcleo", '1/4"'),
    "80150.234": ("Válvula otimizadora com removedor de núcleo", '5/16"'),
    "80150.237": ("Válvula otimizadora com removedor de núcleo", '1/4" e 5/16" com adaptador 3/8" premium'),
    "80001.001": ("Cortina de ar", "900 mm | 220V"), "80001.002": ("Cortina de ar", "1.200 mm | 220V"),
    "80001.003": ("Cortina de ar", "1.500 mm | 220V"),
    "80150.092": ("Flangeador de mesa ajustável", '3/16" a 5/8"'),
    "80150.013": ("Flangeador", '3/16" a 5/8"'),
    "80150.177": ("Endireitador de tubos", '1/4"'), "80150.178": ("Endireitador de tubos", '3/8"'),
    "80150.179": ("Endireitador de tubos", '1/2"'),
    "80150.109": ("Válvula perfuradora de tubos", '1/8" a 5/16"'),
    "80150.170": ("Válvula acionadora schrader", '1/4" | azul'),
    "80150.171": ("Válvula acionadora schrader", '5/16" | vermelho'),
    "80150.010": ("Chave catraca 4 bitolas", '1/4", 3/8", 3/16" e 5/16" | quadrada'),
    "80150.027": ("Escala flangeadora", '1/4", 5/16", 3/8", 1/2" e 5/8"'),
    "80150.026": ("Alargador com cortador e rebarbador", '3/8" 1/2" 5/8" 3/4" 7/8" 1" 1-1/8"'),
    "80150.025": ("Curvador de tubos 180º", '1/4", 5/16", 3/8"'),
    "80170.014": ("Filtro secador", '1/4" a 3/16"'),
    "80170.028": ('Filtro secador 1/4" a 3/16"', "Com rabicho 10G"),
    "80170.022": ("Válvula de serviço para condensadora", '1/2"'),
    "80170.024": ("Válvula de serviço para condensadora", '7/8"'),
    "80170.031": ("Válvula de serviço para condensadora com base", '3/8"'),
    "80150.091": ("Válvula de serviço", '1/4" | 70 mm'),
    "80152.006": ("Chave de fenda", "5 x 150 mm | ponta imantada"),
    "80152.008": ("Chave de fenda", "6 x 100 mm | ponta imantada"),
    "80152.010": ("Chave de fenda", "8 x 150 mm | ponta imantada"),
    "80152.007": ("Chave de fenda cruzada", "5 x 150 mm | ponta imantada"),
    "80152.009": ("Chave de fenda cruzada", "6 x 100 mm | ponta imantada"),
    "80152.011": ("Chave de fenda cruzada", "8 x 150 mm | ponta imantada"),
    "80152.004": ("Chave ajustável", '8"'), "80152.005": ("Chave ajustável", '10"'),
    "80150.241": ("Lanterna 2 em 1 UV e luz branca", "Recarregável"),
    "80150.229": ("Kit válvulas otimizadoras R134A", "Com adaptador para mangueira de vácuo automotiva"),
    "80150.231": ("Caixa anel O-ring ar-condicionado automotivo", ""),
    "80150.248": ('Manifold ON/OFF mangueira 1/4" 150 cm', "Maleta premium | R22, R134A, R407C | manípulos metálicos"),
    "80150.249": ('Manifold Inverter mangueira 5/16" 150 cm', "Maleta premium | R410A, R32, R454B | manípulos metálicos"),
    "80150.196": ("Flangeador excêntrico com limitador de torque", '1/4" a 3/4" | parafusadeira'),
    "80150.224": ("Caixa de ferramenta 4 em 1", "Com rodas"),
    "80150.183": ("Conjunto de mangueiras 150 cm premium", "R22 | R134 | R404"),
    "80150.184": ("Conjunto de mangueiras 150 cm premium", "R410"),
    "80150.095": ('Mangueira para vácuo 3/8" 1,8 m', ""),
    "80150.242": ("Regulador controlador de nitrogênio", "Purga/fluxo para brasagem"),
    "80150.243": ("Alicate amperímetro True-RMS", ""),
    "80150.204": ("Manifold digital 2 vias com bluetooth premium", ""),
    "80150.186": ("Mangueira para nitrogênio", '8 m | 1/4" SAE com registro bola 1/4"'),
    "80150.214": ("Mangueira para nitrogênio", '16 m | 1/4" SAE com registro bola 1/4"'),
    "80150.217": ("Mola interna curvadora de tubos", '3/8"'),
    "80150.219": ("Mola interna curvadora de tubos", '5/8"'),
    "80150.250": ("Alça de transporte", "Para bombas de vácuo"),
    "80160.001": ("Ventilador exaustor axial 220V", "300 mm"), "80160.002": ("Ventilador exaustor axial 220V", "350 mm"),
    "80160.003": ("Ventilador exaustor axial 220V", "400 mm"), "80160.004": ("Ventilador exaustor axial 220V", "450 mm"),
    "80160.005": ("Ventilador exaustor axial 220V", "500 mm"),
    "80156.001": ("Óleo lubrificante VG 46", "500 ml"),
    "80150.004": ("Conjunto de mangueiras 90 cm", "R22 | R404 | R134"),
    "80150.034": ("Conjunto de mangueiras 90 cm", "R410"),
    "80150.037": ("Conjunto de mangueiras 150 cm", "R22 | R404 | R134"),
    "80150.120": ("Conjunto de mangueiras 150 cm", "R410"),
    "80151.105": ("Capacitor de arranque alta potência", "SPP6"),
    "80150.044": ("Alicate de lacre esférico", ""),
    "80150.151": ("Alicate amperímetro True-RMS", ""),
}
# Fotos conferidas na folha de prova: ("x", xref do folder 2026), ("c", código cuja foto vale) ou None (sem foto certa).
FOTO = {
    "80150.004": ("c", "80150.120"), "80150.034": ("c", "80150.120"), "80150.037": ("c", "80150.120"),
    "80150.033": ("c", "80150.030"), "80150.107": ("c", "80150.106"),
    "80150.226": ("x", 287), "80150.204": ("x", 287),
    "80150.248": ("c", "80150.035"), "80150.249": ("c", "80150.035"),
    "80150.212": None, "80150.250": None, "80155.039": None,
    "80155.037": ("c", "80155.036"),
    "80155.033": ("c", "80155.031"), "80155.034": ("c", "80155.031"), "80155.035": ("c", "80155.031"), "80155.038": ("c", "80155.031"),
    "80150.049": None, "80150.193": None, "80150.091": None, "80150.170": None, "80150.171": None,
    "80170.008": ("c", "80170.006"), "80170.009": ("c", "80170.006"), "80170.029": ("c", "80170.006"),
    "80170.012": ("c", "80170.010"), "80170.013": ("c", "80170.010"), "80170.030": ("c", "80170.010"),
    "80150.023": ("c", "80150.021"), "80150.024": ("c", "80150.021"), "80150.041": ("c", "80150.039"),
    "80150.026": None, "80150.118": None, "80150.179": ("c", "80150.177"), "80150.224": None,
    "80152.001": ("x", 247), "80152.002": ("x", 247), "80152.003": ("x", 247), "80150.038": None,
    "80152.009": ("c", "80152.006"), "80152.011": ("c", "80152.006"),
    "80001.001": ("x", 53), "80001.002": ("x", 53), "80001.003": ("x", 53),
}
# Folder "Linha de Capacitores 2025/26": a tabela é imagem e o OCR erra os valores (lê UF como 1JF).
# Transcrita à mão e conferida linha a linha contra a imagem ampliada em 13/11/2026.
# (código, descrição, altura cm, diâmetro cm)
CAPACITORES = [
    ("80.151.023", "Capacitor permanente 3UF 380V", "5,5", "4"), ("80.151.024", "Capacitor permanente 4UF 380V", "5,5", "4"),
    ("80.151.025", "Capacitor permanente 5UF 380V", "5,5", "4"), ("80.151.026", "Capacitor permanente 6UF 380V", "5,5", "4"),
    ("80.151.028", "Capacitor permanente 8UF 380V", "5,5", "4"), ("80.151.029", "Capacitor permanente 10UF 380V", "6,5", "4"),
    ("80.151.030", "Capacitor permanente 12UF 380V", "6,5", "4"), ("80.151.031", "Capacitor permanente 15UF 380V", "7,6", "4"),
    ("80.151.033", "Capacitor permanente 20UF 380V", "7,6", "4"), ("80.151.034", "Capacitor permanente 25UF 380V", "7,6", "4,5"),
    ("80.151.035", "Capacitor permanente 30UF 380V", "8,6", "4,5"), ("80.151.036", "Capacitor permanente 35UF 380V", "8,6", "5"),
    ("80.151.037", "Capacitor permanente 40UF 380V", "8,5", "5"), ("80.151.038", "Capacitor permanente 45UF 380V", "10", "5"),
    ("80.151.039", "Capacitor permanente 50UF 380V", "10", "5"), ("80.151.040", "Capacitor permanente 55UF 380V", "10", "5"),
    ("80.151.041", "Capacitor permanente 60UF 380V", "11", "5"), ("80.151.050", "Capacitor permanente 30+3UF 380V", "9,5", "5"),
    ("80.151.064", "Capacitor permanente 40+3UF 380V", "10,5", "5"), ("80.151.065", "Capacitor permanente 40+5UF 380V", "10,5", "5"),
    ("80.151.078", "Capacitor de partida 216 259UF 250V", "8,6", "4,6"), ("80.151.080", "Capacitor de partida 270 324UF 250V", "8,5", "4,5"),
    ("80.151.082", "Capacitor de partida 340 408UF 250V", "8,6", "4,6"), ("80.151.090", "Capacitor de partida 216 259UF 127V", "7", "3,6"),
    ("80.151.092", "Capacitor de partida 270 324UF 127V", "8,6", "3,6"), ("80.151.094", "Capacitor de partida 340 408UF 127V", "8,6", "3,6"),
    ("80.151.098", "Capacitor permanente 15UF 440V", "7,6", "4"), ("80.151.099", "Capacitor permanente 20UF 440V", "7,6", "4,5"),
    ("80.151.100", "Capacitor permanente 25UF 440V", "8,5", "4,5"), ("80.151.101", "Capacitor permanente 35UF 440V", "8,5", "5"),
    ("80.151.102", "Capacitor permanente 40UF 440V", "10", "5"), ("80.151.103", "Capacitor permanente 45UF 440V", "10", "5"),
    ("80.151.104", "Capacitor permanente 50UF 440V", "11", "5"), ("80.151.105", "Capacitor de arranque alta potência SPP6", "13,2", "4,6"),
    ("80.151.108", "Capacitor permanente 30UF 440V", "8,5", "5"), ("80.151.113", "Capacitor permanente 30+3UF 440V", "9,5", "5"),
    ("80.151.116", "Capacitor permanente 35+3UF 440V", "11", "5"), ("80.151.125", "Capacitor de partida 540 648UF 127V", "7", "3,6"),
    ("80.151.126", "Capacitor de arranque 1UF 450V quadrado", "2,3", "3,7"), ("80.151.127", "Capacitor de arranque 1.5UF 450V quadrado", "2,3", "3,7"),
    ("80.151.128", "Capacitor de arranque 2UF 450V quadrado", "2,4", "3,6"), ("80.151.129", "Capacitor de arranque 2.5UF 450V quadrado", "2,6", "3,7"),
    ("80.151.130", "Capacitor de arranque 3UF 450V quadrado", "3", "3,9"), ("80.151.133", "Capacitor permanente 25+1.5UF 440V", "9,5", "5"),
    ("80.151.135", "Capacitor permanente 25+2.5UF 440V", "9,5", "5"), ("80.151.137", "Capacitor permanente 35+1.5UF 440V", "10,5", "5"),
    ("80.151.138", "Capacitor permanente 35+2.5UF 440V", "10,5", "5"), ("80.151.154", "Capacitor permanente 50+2.5UF 440V", "12,5", "5"),
    ("80.151.156", "Capacitor permanente 55UF 440V", "10,9", "5"), ("80.151.157", "Capacitor permanente 60UF 440V", "12,5", "5"),
    ("80.151.158", "Capacitor de partida 88 108UF 250V", "8,5", "3,6"), ("80.151.167", "Capacitor permanente 25+1.5UF 380V", "8,5", "5"),
    ("80.151.172", "Multiplicador para placa universal split Hi Wall 1/2 e 1/3", "5,2", "3"),
    ("80.151.198", "Capacitor permanente 30+1,5UF 440V", "9,6", "5"), ("80.151.199", "Capacitor permanente 10UF 440V", "6,5", "4"),
    ("80.151.200", "Capacitor permanente 6UF 440V", "5,5", "4"), ("80.151.201", "Capacitor permanente 5UF 440V", "5,5", "4"),
    ("80.151.203", "Capacitor permanente 60+2,5UF 440V", "13", "5,5"), ("80.151.204", "Capacitor de arranque 3,5UF 450V quadrado", "3", "3,8"),
    ("80.151.205", "Capacitor de arranque 4UF 450V quadrado", "3", "4,7"), ("80.151.206", "Capacitor de arranque 5UF 450V quadrado", "2,9", "3,8"),
    ("80.151.208", "Capacitor de lavadora 15UF 250V simples", "6,8", "3,5"), ("80.151.209", "Capacitor de lavadora 25UF 250V simples", "7", "3,5"),
    ("80.151.210", "Capacitor de lavadora 30UF 250V simples", "7,2", "3,8"), ("80.151.211", "Capacitor de lavadora 35UF 250V simples", "7,3", "3,8"),
    ("80.151.212", "Capacitor de lavadora 40UF 250V simples", "7,3", "4"), ("80.151.213", "Capacitor de lavadora 45UF 250V simples", "8,2", "4,2"),
    ("80.151.214", "Capacitor de lavadora 50UF 250V simples", "8,2", "4,2"), ("80.151.215", "Capacitor de lavadora 60UF 250V simples", "9,2", "4,2"),
    ("80.151.216", "Capacitor de micro-ondas 0,75UF 2100V", "6,1", "5,3"), ("80.151.217", "Capacitor de micro-ondas 0,85UF 2100V", "6,6", "5,3"),
    ("80.151.218", "Capacitor de micro-ondas 0,90UF 2100V", "6,6", "5,3"),
]
# foto do folder de capacitores por tipo (xref no PDF); arranque quadrado não tem foto no folder
FOTO_CAP = {"permanente": 29, "partida": 31, "lavadora": 46, "micro-ondas": 50}


def capacitores(pasta: Path, fotos_folder: dict[str, str]) -> list[dict]:
    doc = pymupdf.open(pasta / "Folder Capacitores Aberto - v03 (1).pdf")
    salvas: dict[int, str] = {}
    for tipo, xref in FOTO_CAP.items():
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        sm = doc.extract_image(xref).get("smask")
        if sm:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, sm))
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
        bb = im.getchannel("A").getbbox()
        im = im.crop(bb) if bb else im
        im.thumbnail((520, 520), Image.LANCZOS)
        im.save(DEST_IMG / f"cap-{xref}.webp", quality=84, method=6)
        salvas[xref] = f"catalogo/suryha/cap-{xref}.webp"
    out = []
    for cod, desc, alt, diam in CAPACITORES:
        tipo = next((t for t in FOTO_CAP if t in desc.lower()), None)
        img = salvas[FOTO_CAP[tipo]] if tipo else ""
        if cod == "80.151.105":
            img = fotos_folder.get("80151.105", "")
        if cod == "80.151.172":
            img = fotos_folder.get("80151.172", "")
        out.append({"codigo": cod, "tipo": desc, "linha": f"Altura {alt} cm · diâmetro {diam} cm",
                    "secao": "Capacitores" if "Multiplicador" not in desc else "Eletrônica e controle", "img": img})
    return out


# Códigos que o OCR leu mas o parser não ligou a um bloco: entram com a foto do item irmão.
ADICIONAIS = {
    "80001.002": "80001.001", "80001.003": "80001.001", "80150.178": "80150.177", "80150.170": "80150.171",
    "80150.204": "80150.226", "80150.214": "80150.186", "80150.217": "80150.216", "80150.219": "80150.216",
    "80150.250": "80155.033", "80160.001": "", "80160.002": "", "80160.003": "", "80160.004": "", "80160.005": "",
    "80170.022": "80170.021", "80170.024": "80170.023", "80170.031": "80170.025",
}


GASES = {"R4IOA": "R410A", "R4IO": "R410", "R41OA": "R410A", "R410": "R410", "RI34A": "R134A", "RI34": "R134",
         "R134": "R134", "R4O4": "R404", "R404": "R404", "R4O7C": "R407C", "R6OO": "R600", "R29O": "R290", "R22": "R22",
         "R32": "R32", "R454B": "R454B", "R1234YF": "R1234YF", "R134A": "R134A", "R404A": "R404A"}
SIGLAS = {"UV", "LED", "G3", "SAE", "NTC", "CFM", "HP", "MM", "KG", "PT", "II", "XML", "T", "U"}


def limpa(t: str) -> str:
    """Desfaz os erros sistemáticos do OCR em medidas, gases e separadores."""
    if not t:
        return t
    t = t.replace("Hl WALL", "HI WALL").replace("Hl ", "HI ")
    # gases: R4IOA, ri34, r4o4... e o separador "|" que o OCR lê como 1 ou i
    def gas(m: re.Match) -> str:
        g = m.group(0).upper().replace(" ", "")
        return GASES.get(g, GASES.get(g.replace("I", "1").replace("O", "0"), g.replace("I", "1").replace("O", "0")))
    t = re.sub(r"\b[Rr][0-9IiOo]{2,4}[A-Za-z]?\b", gas, t)
    t = re.sub(r"(R\d{2,4}[A-Z]?)\s+[1iI|]\s+(?=R\d)", r"\1 / ", t)
    t = re.sub(r"(R\d{2,4}[A-Z]?)\s+[1iI|]\s+(?=R\d)", r"\1 / ", t)
    # polegadas: 1/411 -> 1/4", 3/81 -> 3/8", 3/1 611 -> 3/16", 5/1 6" -> 5/16"
    t = re.sub(r"(\d)/1\s?6(?:11|1|\")?", r'\1/16"', t)
    t = re.sub(r"\b(\d)/(\d)(?:11|1|\")(?=[\s,.;|]|$)", r'\1/\2"', t)
    t = re.sub(r"\b(\d)/(\d)\s+(?=[a-zA-Z|]|$)", r'\1/\2" ', t)
    t = re.sub(r'(\d)/(\d)"(\d)', r'\1/\2" \3', t)
    t = t.replace(' 1 a ', ' a ').replace(" A ", " a ")
    t = re.sub(r"(\d)\s*([\"])\s*(\d)", r"\1\2 \3", t)
    t = re.sub(r"\s+[1iI]\s+(?=\d)", " · ", t)  # "900MM i 1.200MM"
    return re.sub(r"\s+", " ", t).strip(" |·-")


def caixa_frase(t: str) -> str:
    """Primeira letra maiúscula; siglas, gases e medidas em maiúsculas."""
    pal = t.split(" ")
    out = []
    for i, p in enumerate(pal):
        base = re.sub(r"[^\wÀ-ú]", "", p)
        if re.match(r"^R\d", base.upper()) or base.upper() in SIGLAS or re.search(r"\d", base):
            out.append(p.lower() if re.search(r"\d+(mm|cm|m|kg|ml|pç)$", base.lower()) else p.upper())
        else:
            out.append(p.lower())
    s = " ".join(out)
    return s[:1].upper() + s[1:]


SECOES = [  # (seção, palavras do nome) — a primeira que bater vence
    ("Automotivo", ["automotiv", "r1234yf", "r134a com", "selo do compressor"]),
    ("Manifolds e mangueiras", ["manifold", "mangueira", "manômetro", "engate"]),
    ("Vácuo e recolhimento", ["bomba de vácuo", "vacuômetro", "recolhedora", "alça de transporte", "óleo lubrificante"]),
    ("Brasagem e nitrogênio", ["maçarico", "nitrogênio", "cilindro", "garrafa", "base acionadora"]),
    ("Medição e detecção", ["termômetro", "amperímetro", "multímetro", "detector", "lanterna", "espelho"]),
    ("Válvulas e conexões", ["porca", "união", "válvula de serviço", "filtro secador", "válvula otimizadora",
                             "válvula acionadora", "adaptador multiportas", "kit válvulas"]),
    ("Ferramentas para tubos", ["flangead", "cortador", "curvador", "alargador", "mola", "escareador", "rebarbador",
                                "endireitador", "pente", "escala", "catraca", "lacre", "perfuradora", "linha para"]),
    ("Ferramentas manuais e elétricas", ["chave", "alicate", "caixa de ferramenta", "parafusadeira", "furadeira", "saco coletor", "mochila", "guincho"]),
    ("Eletrônica e controle", ["placa", "controle remoto", "multiplicador", "capacitor"]),
    ("Válvulas e conexões", ["válvula", "filtro", "adaptador", "reparo"]),
    ("Ventilação", ["cortina", "ventilador"]),
    ("Limpeza", ["pistola", "limpeza"]),
]
ORDEM_SECOES = [s for s, _ in SECOES] + ["Capacitores"]


def secao_de(nome: str, padrao: str) -> str:
    n = nome.lower()
    for sec, chaves in SECOES:
        if any(c in n for c in chaves):
            return sec
    return padrao


def eh_nome(r: dict) -> bool:
    letras = re.sub(r"[^A-Za-zÁ-ú]", "", r["t"])
    return len(letras) >= 3 and sum(ch.isupper() for ch in letras) / len(letras) > .7 and not COD.search(r["t"])


def extrai_itens(pags: dict, voc: Counter) -> list[dict]:
    itens = []
    for pag, lst in sorted(pags.items()):
        codigos = [r for r in lst if COD.search(r["t"]) or SO_COD.match(r["t"])]
        for r in codigos:
            m = COD.search(r["t"]) or SO_COD.match(r["t"])
            cod = norm_cod(m.group(1))
            if not cod:
                continue
            resto = r["t"][m.end():].strip()
            col = [o for o in lst if abs(o["x0"] - r["x0"]) < 90 and o is not r]
            # nome logo abaixo do código
            nome, det, y = [], [], r["y1"]
            for o in sorted([o for o in col if o["y0"] > r["y0"]], key=lambda o: o["y0"]):
                if o["y0"] - y > max(110, r["h"] * 3.2) or o in codigos:
                    break
                (nome if eh_nome(o) and not det else det).append(o["t"])
                y = o["y1"]
            if not nome:  # variante: o nome está acima, compartilhado
                acima = sorted([o for o in col if o["y1"] <= r["y0"] + 5 and r["y0"] - o["y1"] < 420 and o not in codigos],
                               key=lambda o: -o["y0"])
                bloco = []
                for o in acima:
                    if eh_nome(o):
                        bloco.insert(0, o["t"])
                    elif bloco:
                        break
                nome = bloco
                if resto:
                    det.insert(0, resto)
            nome_txt = corrige(" ".join(nome), voc)
            det_txt = corrige(" ".join(det[:3]), voc) if det else (resto or "")
            if not nome_txt:
                continue
            det_txt = re.sub(r"\s*c[óo]d\.?:?\s*$", "", limpa(det_txt), flags=re.I)
            itens.append({"codigo": cod, "tipo": caixa_frase(limpa(nome_txt)),
                          "linha": det_txt, "_pag": pag, "_x": (r["x0"] + r["x1"]) / 2, "_y": r["y0"]})
    return itens


def fotos(pasta: Path) -> dict[str, list[dict]]:
    """Recortes de produto embutidos (com transparência), em coordenadas da página renderizada."""
    out: dict[str, list[dict]] = {}
    for tag, arq, _ in DOCS:
        doc = pymupdf.open(pasta / arq)
        for i, pg in enumerate(doc, 1):
            lst = out.setdefault(f"{tag}-{i:02d}", [])
            for inf in pg.get_image_info(xrefs=True):
                x = inf["xref"]
                if not x or inf["width"] < 60:
                    continue
                b = pymupdf.Rect(inf["bbox"]) * ZOOM
                if b.width > pg.rect.width * ZOOM * .8:  # fundo
                    continue
                lst.append({"xref": x, "doc": tag, "b": b})
    return out


def salva_foto(pasta: Path, tag: str, xref: int) -> str | None:
    arq = dict((t, a) for t, a, _ in DOCS)[tag]
    doc = pymupdf.open(pasta / arq)
    try:
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        sm = doc.extract_image(xref).get("smask")
        if sm:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, sm))
    except Exception:
        return None
    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    bb = im.getchannel("A").getbbox()
    if bb:
        im = im.crop(bb)
    if im.width < 40 or im.height < 40:
        return None
    im.thumbnail((520, 520), Image.LANCZOS)
    slug = f"{tag}-{xref}"
    im.save(DEST_IMG / f"{slug}.webp", quality=84, method=6)
    return f"catalogo/suryha/{slug}.webp"


def main(pasta: Path, cache: Path) -> None:
    DEST_IMG.mkdir(parents=True, exist_ok=True)
    for f in DEST_IMG.glob("*.webp"):
        f.unlink()
    pags = linhas_por_pagina(ocr(pasta, cache))
    voc = vocabulario(pags)
    itens = extrai_itens(pags, voc)
    fts = fotos(pasta)
    # liga cada código à foto mais próxima do bloco de texto (cada foto serve a quem estiver mais perto)
    pares = []
    for k, it in enumerate(itens):
        for f in fts.get(it["_pag"], []):
            b = f["b"]
            dx = max(b.x0 - it["_x"], 0, it["_x"] - b.x1)
            dy = max(b.y0 - it["_y"], 0, it["_y"] - b.y1)
            pares.append(((dx * dx + dy * dy) ** .5, k, f))
    usado_item, usado_foto, salvas = set(), {}, {}
    for d, k, f in sorted(pares, key=lambda p: p[0]):
        if k in usado_item or d > 900:
            continue
        chave = (f["doc"], f["xref"])
        if chave in usado_foto and d > usado_foto[chave] + 250:
            continue  # foto já é de outro produto bem mais perto
        usado_item.add(k)
        usado_foto.setdefault(chave, d)
        if chave not in salvas:
            salvas[chave] = salva_foto(pasta, f["doc"], f["xref"])
        itens[k]["img"] = salvas[chave]
    secoes = {t: s for t, _, s in DOCS}
    vistos, final = set(), []
    for it in sorted(itens, key=lambda i: (i["_pag"], i["_y"], i["_x"])):
        if it["codigo"] in vistos:
            continue
        vistos.add(it["codigo"])
        it["secao"] = secoes[it["_pag"].split("-")[0]]
        for k in ("_pag", "_x", "_y"):
            it.pop(k)
        if not it.get("img"):
            it["img"] = ""
        final.append(it)
    por_cod = {i["codigo"]: i for i in final}
    for cod, irmao in ADICIONAIS.items():
        if cod not in por_cod:
            base = por_cod.get(irmao, {})
            novo = {"codigo": cod, "tipo": "", "linha": "", "img": base.get("img", ""), "secao": base.get("secao", "Linha 2026")}
            final.append(novo); por_cod[cod] = novo
    for cod, (nome, det) in REVISADO.items():
        if cod in por_cod:
            por_cod[cod]["tipo"], por_cod[cod]["linha"] = nome, det
    # ventiladores 80160: a foto do exaustor axial está no folder, mas sem código perto dela
    exaustor = next((f"catalogo/suryha/{p.name}" for p in DEST_IMG.glob("f26-47.webp")), "")
    for i in final:
        if i["codigo"].startswith("80160") and not i["img"]:
            i["img"] = exaustor or salva_foto(pasta, "f26", 47) or ""
    originais = {c: i["img"] for c, i in por_cod.items()}
    for cod, regra in FOTO.items():
        if cod not in por_cod:
            continue
        if regra is None:
            por_cod[cod]["img"] = ""
        elif regra[0] == "x":
            por_cod[cod]["img"] = salva_foto(pasta, "f26", regra[1]) or ""
        else:
            por_cod[cod]["img"] = originais.get(regra[1], "")
    # capacitores da tabela substituem as duas entradas do folder com o mesmo código (80151.105 e 80151.172)
    fotos_folder = {c: i["img"] for c, i in por_cod.items()}
    final = [i for i in final if i["codigo"] not in ("80151.105", "80151.172")] + capacitores(pasta, fotos_folder)
    usados = {i["img"].rsplit("/", 1)[-1] for i in final if i["img"]}
    for f in DEST_IMG.glob("*.webp"):  # fotos que ficaram sem dono
        if f.name not in usados:
            f.unlink()
    for i in final:
        if i["secao"] != "Capacitores":
            i["secao"] = secao_de(i["tipo"], i["secao"])
    final.sort(key=lambda i: (ORDEM_SECOES.index(i["secao"]) if i["secao"] in ORDEM_SECOES else 99, i["codigo"]))
    DEST_JSON.write_text(json.dumps({"marca": "suryha", "fonte": [a for _, a, _ in DOCS], "itens": final},
                                    ensure_ascii=False, indent=1), encoding="utf-8")
    sem = sum(1 for i in final if not i["img"])
    print(len(final), "itens,", sem, "sem foto")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
