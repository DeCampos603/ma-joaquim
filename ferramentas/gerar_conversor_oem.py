"""Gera `site/dados/conversor-oem.json` para o Conversor Técnico da Área do Cliente.

Segurança / Blindagem Comercial:
  - Extrai EXCLUSIVAMENTE códigos OEM/fábrica (`codigoFabricante`) cruzados com
    os itens públicos já existentes em `site/dados/catalogo-sibb.json`, mais
    referências funcionais de controladores/relés verificados em `catalogo-coel.json`.
  - NUNCA copia preços, centavos, IPI, ST, comissões ou estoque para o site público.

Uso:
  py -3 -X utf8 site/ferramentas/gerar_conversor_oem.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SITE_DIR = AQUI.parent
DADOS_DIR = SITE_DIR / "dados"
SAIDA = DADOS_DIR / "conversor-oem.json"
CATALOGO_PRIVADO = (
    SITE_DIR.parents[3] / "Agente-Portal-Comercial" / "dados" / "privado" / "catalogo.json"
)

REGEX_VAZAMENTO = re.compile(r"R\$\s?\d|\bestoque:\s*\d|\bsaldo:\s*\d", re.IGNORECASE)

# Referências funcionais de aplicação verificadas contra SKUs existentes em `catalogo-coel.json`
EQUIVALENCIAS_FUNCIONAIS_COEL = [
    {
        "referencia": "MT-512E / MT-512Ri / TC-512",
        "fabricante_ref": "Full Gauge (Refrigeração)",
        "codigo": "Z31",
        "nota": "Termostato 1 saída para resfriados com degelo natural (confirmar tensão e sensor antes do pedido).",
    },
    {
        "referencia": "TL-600 / MT-512G",
        "fabricante_ref": "Full Gauge / Ageon (Refrigeração)",
        "codigo": "E31",
        "nota": "Controlador de temperatura 1 saída (confirmar faixa e furação do painel).",
    },
    {
        "referencia": "MT-516E / A103 / TLZ10",
        "fabricante_ref": "Refrigeração Comercial 1 saída",
        "codigo": "KLZ10",
        "nota": "Controlador para refrigeração 1 saída Coel.",
    },
    {
        "referencia": "TC-900E Power / TC-900Ri",
        "fabricante_ref": "Full Gauge (Congelados)",
        "codigo": "Y39",
        "nota": "Controlador 3 saídas (compressor, degelo e ventilador) para congelados.",
    },
    {
        "referencia": "TC-900E / MT-543E",
        "fabricante_ref": "Full Gauge (3 saídas)",
        "codigo": "E33",
        "nota": "Controlador 3 saídas com degelo programável (confirmar corrente dos relés).",
    },
    {
        "referencia": "TC-900E Log / MT-512E Log (Sitrad)",
        "fabricante_ref": "Full Gauge Conectado",
        "codigo": "E34B",
        "nota": "Controlador compatível com plataforma Coel Online para monitoramento remoto.",
    },
    {
        "referencia": "MT-444V / Split de Potência",
        "fabricante_ref": "Controlador Modular + IHM",
        "codigo": "B05 + P03",
        "nota": "Conjunto controlador modular B05 com display remoto P03 para alta potência.",
    },
    {
        "referencia": "N1020 / N1200 / K31P",
        "fabricante_ref": "Novus / Controle PID DIN 48x48",
        "codigo": "KM1",
        "nota": "Controlador de processos universal (JKRST, PT100, NTC, 4-20 mA) com Auto Tuning PID.",
    },
    {
        "referencia": "N1200 Rampas e Patamares",
        "fabricante_ref": "Novus / Processos Multi-Segmentos",
        "codigo": "KM5",
        "nota": "Controlador KUBE com até 96 segmentos de rampa e patamar e saída analógica.",
    },
    {
        "referencia": "Temporizador DIN Multiescala",
        "fabricante_ref": "Automação Industrial",
        "codigo": "AEGM",
        "nota": "Temporizador analógico multiescala para painéis industriais.",
    },
    {
        "referencia": "Relé Falta de Fase / RPW",
        "fabricante_ref": "Proteção Trifásica",
        "codigo": "BVF1",
        "nota": "Monitor de falta de fase para proteção de compressores e motores.",
    },
    {
        "referencia": "Relé Falta e Sequência de Fase",
        "fabricante_ref": "Proteção Trifásica",
        "codigo": "BVS1",
        "nota": "Monitor de falta e inversão de sequência de fase.",
    },
]


def carregar_json(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8"))


def main() -> None:
    sibb_data = carregar_json(DADOS_DIR / "catalogo-sibb.json")
    coel_data = carregar_json(DADOS_DIR / "catalogo-coel.json")

    sibb_por_cod = {
        str(it.get("codigo", "")).strip().upper(): it for it in sibb_data.get("itens", [])
    }
    coel_por_cod = {
        str(it.get("codigo", "")).strip().upper(): it for it in coel_data.get("itens", [])
    }

    entradas_oem: list[dict] = []
    vistas: set[tuple[str, str]] = set()

    if CATALOGO_PRIVADO.exists():
        privado = carregar_json(CATALOGO_PRIVADO)
        for item in privado.get("itens", []):
            cod_sibb = str(item.get("codigoSigma", "")).strip().upper()
            cod_fab = str(item.get("codigoFabricante", "")).strip()
            if not cod_sibb or not cod_fab or cod_fab in ("-", "—", "N/A", "0"):
                continue
            pub = sibb_por_cod.get(cod_sibb)
            if not pub:
                continue
            chave = (cod_fab.upper(), pub["codigo"])
            if chave in vistas:
                continue
            vistas.add(chave)
            tipo = str(pub.get("tipo") or item.get("descricao") or "").strip()
            secao = str(pub.get("secao") or item.get("categoria") or "").strip()
            entradas_oem.append(
                {
                    "oem": cod_fab,
                    "codigo": pub["codigo"],
                    "marca": "sibb",
                    "marca_nome": "SIBB",
                    "nome": f"{tipo} {pub['codigo']}".strip(),
                    "tipo": tipo,
                    "secao": secao,
                    "img": pub.get("img", ""),
                    "origem": "Código original OEM (linha branca / eletrodomésticos)",
                }
            )

    equivalencias_coel: list[dict] = []
    for eq in EQUIVALENCIAS_FUNCIONAIS_COEL:
        cod_coel = eq["codigo"].strip().upper()
        pub = coel_por_cod.get(cod_coel)
        if not pub:
            raise ValueError(f"SKU Coel inexistente no catálogo público: {eq['codigo']}")
        equivalencias_coel.append(
            {
                "oem": eq["referencia"],
                "codigo": pub["codigo"],
                "marca": "coel",
                "marca_nome": "Coel",
                "nome": f"{pub.get('tipo', '')} {pub['codigo']}".strip(),
                "tipo": pub.get("tipo", ""),
                "secao": pub.get("secao", ""),
                "img": pub.get("img", ""),
                "origem": f"{eq['fabricante_ref']} · {eq['nota']}",
            }
        )

    payload = {
        "versao": "2026-11",
        "aviso": "Referências técnicas de aplicação e códigos OEM sem preços ou quantidades de estoque.",
        "total_oem_sibb": len(entradas_oem),
        "total_equivalencias_coel": len(equivalencias_coel),
        "itens": entradas_oem + equivalencias_coel,
    }
    texto = json.dumps(payload, ensure_ascii=False, indent=1)
    if REGEX_VAZAMENTO.search(texto):
        raise SystemExit("ERRO DE SEGURANÇA: possível dado comercial detectado na saída pública!")

    SAIDA.write_text(texto + "\n", encoding="utf-8")
    print(
        f"OK: {SAIDA.name} gerado com {len(entradas_oem)} cruzamentos OEM SIBB + "
        f"{len(equivalencias_coel)} referências funcionais Coel ({len(texto)} bytes)."
    )


if __name__ == "__main__":
    main()
