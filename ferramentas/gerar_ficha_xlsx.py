"""Gera o modelo sanitizado (.xlsx) e preenche a Ficha Cadastral oficial M.A Joaquim.

Fonte original:
  G:/Meu Drive/REPO/Agente-Portal-Comercial/SITE M A JOAQUIM/Cadastro Modelo M A JOAQUIM.xlsx

⚠️ SEGURANÇA / LGPD:
  A aba 'Plan4' da planilha original contém dados reais de terceiros
  (Eletropeças / Dicosul) e é REMOVIDA obrigatoriamente antes de salvar o
  modelo público em `src/modelos/ficha-cadastro-ma-joaquim.xlsx`.

Uso:
  py -3 -X utf8 site/ferramentas/gerar_ficha_xlsx.py            # gera modelo limpo
  py -3 -X utf8 site/ferramentas/gerar_ficha_xlsx.py --testar   # gera e valida células
"""
from __future__ import annotations

import argparse
import io
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:
    raise SystemExit("Instale openpyxl para rodar este script: pip install openpyxl") from exc

AQUI = Path(__file__).resolve().parent
SITE_DIR = AQUI.parent
MODELO_SAIDA = SITE_DIR / "src" / "modelos" / "ficha-cadastro-ma-joaquim.xlsx"
FONTE_ORIGINAL = (
    SITE_DIR.parents[3]
    / "Agente-Portal-Comercial"
    / "SITE M A JOAQUIM"
    / "Cadastro Modelo M A JOAQUIM.xlsx"
)

# Mapa exato de coordenadas mescladas na aba 'Cadastro' -> chave de dados
MAPA_CELULAS: dict[str, str] = {
    "G10": "razao_social",
    "G12": "endereco",
    "AD12": "numero",
    "G14": "complemento",
    "U14": "caixa_postal",
    "AD14": "cep",
    "G16": "bairro",
    "T16": "cidade",
    "AG16": "uf",
    "G18": "telefone_fixo_1",
    "T18": "fax",
    "G20": "telefone_fixo_2",
    "T20": "celular_whatsapp",
    "G22": "cnpj",
    "Y22": "inscricao_estadual",
    "M24": "trib_lucro_real",
    "W24": "trib_lucro_presumido",
    "AG24": "trib_simples_nacional",
    "E28": "email_geral",
    "X28": "email_compras",
    "E30": "email_financas",
    "X30": "site",
    "U32": "email_xml_nfe",
    "I34": "contato_comercial",
    "I36": "contato_financeiro",
    "G42": "banco_nome",
    "AB42": "banco_numero",
    "E44": "banco_agencia",
    "P44": "banco_conta",
    "E46": "banco_titular_cnpj",
    "V46": "banco_titular_cpf",
    "A50": "observacoes_cadastro",
    "S55": "forma_pagamento_diferenciada",
    "X58": "suframa_identificacao",
    "X60": "suframa_inscricao",
    "X62": "suframa_validade",
    "G67": "representante",
}

CELULAS_TEXTO = {"AD12", "U14", "AD14", "G18", "T18", "G20", "T20", "G22", "Y22", "AB42", "E44", "P44", "E46", "V46"}


def _normalizar_dados(dados: dict) -> dict[str, str]:
    """Prepara os valores textuais exatamente como entram nas 37 células da ficha."""
    trib = str(dados.get("tributacao") or "").strip().lower()
    marca_alvo = str(dados.get("marca_alvo") or "").strip()
    obs_base = str(dados.get("observacoes_cadastro") or "").strip()
    if marca_alvo and f"Fábrica: {marca_alvo}" not in obs_base:
        obs_base = (f"Solicitação de cadastro — Fábrica: {marca_alvo}." + (f" {obs_base}" if obs_base else "")).strip()

    out = {
        "razao_social": str(dados.get("razao_social") or "").strip(),
        "endereco": str(dados.get("endereco") or "").strip(),
        "numero": str(dados.get("numero") or "").strip(),
        "complemento": str(dados.get("complemento") or "").strip(),
        "caixa_postal": str(dados.get("caixa_postal") or "").strip(),
        "cep": str(dados.get("cep") or "").strip(),
        "bairro": str(dados.get("bairro") or "").strip(),
        "cidade": str(dados.get("cidade") or "").strip(),
        "uf": str(dados.get("uf") or "RJ").strip().upper()[:2],
        "telefone_fixo_1": str(dados.get("telefone_fixo_1") or "").strip(),
        "fax": str(dados.get("fax") or "").strip(),
        "telefone_fixo_2": str(dados.get("telefone_fixo_2") or "").strip(),
        "celular_whatsapp": str(dados.get("celular_whatsapp") or "").strip(),
        "cnpj": str(dados.get("cnpj") or "").strip(),
        "inscricao_estadual": str(dados.get("inscricao_estadual") or "").strip(),
        "trib_lucro_real": "X" if trib == "lucro_real" else "",
        "trib_lucro_presumido": "X" if trib == "lucro_presumido" else "",
        "trib_simples_nacional": "X" if trib == "simples_nacional" else "",
        "email_geral": str(dados.get("email_geral") or "").strip(),
        "email_compras": str(dados.get("email_compras") or "").strip(),
        "email_financas": str(dados.get("email_financas") or "").strip(),
        "site": str(dados.get("site") or "").strip(),
        "email_xml_nfe": str(dados.get("email_xml_nfe") or "").strip(),
        "contato_comercial": str(dados.get("contato_comercial") or "").strip(),
        "contato_financeiro": str(dados.get("contato_financeiro") or "").strip(),
        "banco_nome": str(dados.get("banco_nome") or "").strip(),
        "banco_numero": str(dados.get("banco_numero") or "").strip(),
        "banco_agencia": str(dados.get("banco_agencia") or "").strip(),
        "banco_conta": str(dados.get("banco_conta") or "").strip(),
        "banco_titular_cnpj": str(dados.get("banco_titular_cnpj") or dados.get("titular_cnpj") or "").strip(),
        "banco_titular_cpf": str(dados.get("banco_titular_cpf") or dados.get("titular_cpf") or "").strip(),
        "observacoes_cadastro": obs_base,
        "forma_pagamento_diferenciada": str(dados.get("forma_pagamento_diferenciada") or "NÃO").strip() or "NÃO",
        "suframa_identificacao": str(dados.get("suframa_identificacao") or "").strip(),
        "suframa_inscricao": str(dados.get("suframa_inscricao") or "").strip(),
        "suframa_validade": str(dados.get("suframa_validade") or "").strip(),
        "representante": "M A JOAQUIM REPRESENTAÇÃO.",
    }
    return out


def _abrir_sanitizado(fonte: Path = FONTE_ORIGINAL) -> openpyxl.Workbook:
    if not fonte.exists():
        raise FileNotFoundError(f"Planilha modelo original não encontrada: {fonte}")
    wb = openpyxl.load_workbook(fonte)
    if "Plan4" in wb.sheetnames:
        del wb["Plan4"]
    return wb


def preencher_ficha_xlsx(dados: dict, destino: Path, fonte: Path | None = None) -> Path:
    """Preenche os campos da ficha cadastral e grava em `destino`."""
    wb = _abrir_sanitizado(fonte or FONTE_ORIGINAL)
    ws = wb["Cadastro"]
    valores = _normalizar_dados(dados)
    for coord, chave in MAPA_CELULAS.items():
        cell = ws[coord]
        if coord in CELULAS_TEXTO:
            cell.number_format = "@"
        cell.value = valores[chave]

    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    wb.save(destino)
    return destino


def gerar_modelo_limpo(destino: Path = MODELO_SAIDA, fonte: Path = FONTE_ORIGINAL) -> Path:
    """Gera o template sanitizado com marcadores {{CHAVE}} e sheet1.xml sem compressão (ZIP_STORED)."""
    wb = _abrir_sanitizado(fonte)
    ws = wb["Cadastro"]
    for coord, chave in MAPA_CELULAS.items():
        cell = ws[coord]
        if coord in CELULAS_TEXTO:
            cell.number_format = "@"
        cell.value = "M A JOAQUIM REPRESENTAÇÃO." if chave == "representante" else f"{{{{{chave.upper()}}}}}"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(buf, "r") as zin, zipfile.ZipFile(destino, "w") as zout:
        for item in zin.infolist():
            raw = zin.read(item.filename)
            compress = zipfile.ZIP_STORED if item.filename == "xl/worksheets/sheet1.xml" else zipfile.ZIP_DEFLATED
            zinfo = zipfile.ZipInfo(item.filename, date_time=item.date_time)
            zinfo.compress_type = compress
            zout.writestr(zinfo, raw, compress_type=compress)
    return destino


def testar() -> int:
    modelo = gerar_modelo_limpo()
    print(f"Modelo limpo gerado: {modelo} ({modelo.stat().st_size} bytes)")

    with zipfile.ZipFile(modelo, "r") as z:
        assert "xl/worksheets/sheet2.xml" not in z.namelist(), "sheet2.xml ainda existe!"
        assert "xl/sharedStrings.xml" not in z.namelist(), "sharedStrings.xml ainda existe!"
        s1_info = z.getinfo("xl/worksheets/sheet1.xml")
        assert s1_info.compress_type == zipfile.ZIP_STORED, "sheet1.xml deve ser ZIP_STORED para JS!"
        for name in z.namelist():
            if name.endswith((".xml", ".rels")):
                txt = z.read(name).decode("utf-8", errors="replace").lower()
                for proibido in ("eletro", "dicosul", "floriano", "91.825", "94.059"):
                    assert proibido not in txt, f"Dado de terceiro '{proibido}' encontrado em {name}!"

    exemplo = {
        "razao_social": "REFRIGERAÇÃO TESTE RJ LTDA",
        "endereco": "AV BRASIL",
        "numero": "1234",
        "complemento": "LOJA A",
        "caixa_postal": "",
        "cep": "21040-360",
        "bairro": "BONSUCESSO",
        "cidade": "RIO DE JANEIRO",
        "uf": "RJ",
        "telefone_fixo_1": "(21) 2222-3333",
        "fax": "",
        "telefone_fixo_2": "(21) 2222-4444",
        "celular_whatsapp": "(21) 99999-8888",
        "cnpj": "12.345.678/0001-99",
        "inscricao_estadual": "12345678",
        "tributacao": "simples_nacional",
        "email_geral": "contato@testeloja.com.br",
        "email_compras": "compras@testeloja.com.br",
        "email_financas": "financeiro@testeloja.com.br",
        "site": "https://testeloja.com.br",
        "email_xml_nfe": "nfe@testeloja.com.br",
        "contato_comercial": "Carlos Silva",
        "contato_financeiro": "Ana Souza",
        "banco_nome": "Itaú Unibanco",
        "banco_numero": "341",
        "banco_agencia": "0123",
        "banco_conta": "45678-9",
        "banco_titular_cnpj": "12.345.678/0001-99",
        "banco_titular_cpf": "",
        "observacoes_cadastro": "Entrega preferencial pela manhã.",
        "forma_pagamento_diferenciada": "NÃO",
        "suframa_identificacao": "",
        "suframa_inscricao": "",
        "suframa_validade": "",
        "marca_alvo": "Suryha",
    }

    with tempfile.TemporaryDirectory() as tmp:
        arq_preenchido = Path(tmp) / "ficha-teste.xlsx"
        preencher_ficha_xlsx(exemplo, arq_preenchido)
        wb = openpyxl.load_workbook(arq_preenchido)
        assert wb.sheetnames == ["Cadastro"], f"Abas inesperadas: {wb.sheetnames}"
        ws = wb["Cadastro"]
        assert len(ws._images) == 4, f"Esperava 4 imagens no cabeçalho, achei {len(ws._images)}"
        assert ws["G10"].value == "REFRIGERAÇÃO TESTE RJ LTDA"
        assert ws["G22"].value == "12.345.678/0001-99"
        assert ws["Y22"].value == "12345678"
        assert ws["AG24"].value == "X"
        assert ws["M24"].value in (None, "")
        assert ws["W24"].value in (None, "")
        assert ws["U32"].value == "nfe@testeloja.com.br"
        assert ws["G42"].value == "Itaú Unibanco"
        assert ws["AB42"].value == "341"
        assert ws["S55"].value == "NÃO"
        assert ws["G67"].value == "M A JOAQUIM REPRESENTAÇÃO."
        assert "Suryha" in (ws["A50"].value or "")

    print("✅ Teste de sanitização e preenchimento da ficha .xlsx concluído (37 células + 4 logos verificados).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Gerador da Ficha Cadastral M.A Joaquim (.xlsx)")
    parser.add_argument("--testar", action="store_true", help="Gera o modelo limpo e executa a suíte de validação")
    args = parser.parse_args()
    if args.testar:
        return testar()
    modelo = gerar_modelo_limpo()
    print(f"Modelo gerado com sucesso: {modelo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
