"""Gera o site da M.A Joaquim Representação em dist/ (só biblioteca padrão + Pillow).

Fonte única: dados/empresa.json e dados/catalogo-<marca>.json (gerados pelos scripts
de ferramentas/). Cada página sai em HTML estático completo: o catálogo inteiro está
no HTML (funciona sem JavaScript e é indexável); o JS só filtra, anima e monta a lista.

Uso:
  py -3 -X utf8 build.py              # gera dist/
  py -3 -X utf8 build.py --publicar   # gera e falha se sobrar [[PREENCHER]]
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import quote

from PIL import Image

AQUI = Path(__file__).resolve().parent
SRC, DADOS, DIST = AQUI / "src", AQUI / "dados", AQUI / "dist"
EMP = json.loads((DADOS / "empresa.json").read_text(encoding="utf-8"))
MARCAS = EMP["marcas"]
FOLHAS = json.loads((DADOS / "folhas.json").read_text(encoding="utf-8"))
BASE_URL = f"https://{EMP['dominio']}/"
ZAP = next(c for c in EMP["contatos"] if c["principal"])
ANO = 2026
HOJE = date.today().isoformat()
_med = DADOS / "medicao.json"
MEDICAO = {k: v for k, v in json.loads(_med.read_text(encoding="utf-8")).items() if not k.startswith("_")} if _med.exists() else {}
MEDE = any(MEDICAO.get(k) for k in ("ga4Id", "adsId", "gtmId"))  # sem ID, nada do Google é carregado


def fone_intl(whatsapp: str) -> str:
    """5521996147784 -> +55 21 99614-7784"""
    return f"+{whatsapp[:2]} {whatsapp[2:4]} {whatsapp[4:-4]}-{whatsapp[-4:]}"
_dims: dict[str, tuple[int, int]] = {}


def e(t: object) -> str:
    return escape(str(t), quote=True)


def dims(rel: str) -> tuple[int, int]:
    if rel.endswith(".svg"):
        return (400, 400)
    if rel not in _dims:
        with Image.open(SRC / rel) as im:
            _dims[rel] = im.size
    return _dims[rel]


def wa(msg: str) -> str:
    return f"https://wa.me/{ZAP['whatsapp']}?text={quote(msg)}"


def catalogo(slug: str) -> list[dict]:
    p = DADOS / f"catalogo-{slug}.json"
    return json.loads(p.read_text(encoding="utf-8"))["itens"] if p.exists() else []


CAT = {m["slug"]: catalogo(m["slug"]) for m in MARCAS}
TOTAL = sum(len(v) for v in CAT.values())
ALEX, DEIVID = EMP["contatos"][0], EMP["contatos"][1]

# ---------------------------------------------------------------- fatos únicos (site, JSON-LD, llms.txt, Markdown e WebMCP)
AVISO_DADOS = ("A lista de cotação fica só no seu navegador. Cookies de medição do Google só entram com a sua permissão."
               if MEDE else "Este site não usa cookies nem coleta dados: a lista de cotação fica só no seu navegador.")
MEDICAO_TAGS = (f'<script>window.SITE_ANALYTICS={json.dumps({k: MEDICAO.get(k, "") for k in ("ga4Id", "adsId", "adsWhatsappLabel", "adsListaLabel", "gtmId")})}</script>\n'
                '<script src="{base}js/analytics.js" defer></script>\n') if MEDE else ""


def resumo_empresa() -> list[str]:
    marcas = "; ".join(f"{m['nome']}{' (' + m['nome_longo'] + ')' if m.get('nome_longo') else ''}: {m['resumo'][0].lower() + m['resumo'][1:].rstrip('.')}" for m in MARCAS)
    contatos = " ou ".join(f"{c['nome']}, WhatsApp {c['telefone']}" for c in EMP["contatos"])
    return [
        f"{EMP['nome']} (razão social {EMP['razao_social']}, CNPJ {EMP['cnpj']}): representação comercial de fábricas no {EMP['area']} desde {EMP['desde']}.",
        f"Fábricas representadas: {marcas}.",
        "Atende lojas de peças, distribuidores, assistências técnicas e instaladores de refrigeração, climatização e linha branca.",
        f"O site tem um catálogo com {TOTAL} itens (códigos das fábricas). Preço, estoque, prazo, pedido mínimo e pagamento não são divulgados: dependem da fábrica e do cadastro do cliente e vêm na cotação.",
        f"Cotação: {contatos}; e-mail {EMP['email']}. Horário: {EMP['horario'].lower()}.",
    ]


DADOS_AGENTE = {"whatsapp": ZAP["whatsapp"], "contato": f"{ZAP['nome']}, {ZAP['telefone']}", "resumo": "\n".join(resumo_empresa())}

ORG_ID, SITE_ID = BASE_URL + "#organizacao", BASE_URL + "#site"
PESSOA_ID = {c["nome"]: BASE_URL + "#" + re.sub(r"\W+", "-", c["nome"].lower()).strip("-") for c in EMP["contatos"]}
NOME_CURTO = {"sobre/": "Sobre", "contato/": "Contato", "termos/": "Termos de uso", "privacidade/": "Privacidade"} | {
    f"marcas/{m['slug']}/": m["nome"] for m in MARCAS}
HORARIO_LD = {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
              "opens": "08:00", "closes": "19:00"}


def ld_org() -> dict:
    return {
        "@type": "Organization", "@id": ORG_ID, "name": EMP["nome"], "legalName": EMP["razao_social"], "taxID": EMP["cnpj"],
        "foundingDate": str(EMP["desde"]), "url": BASE_URL, "logo": BASE_URL + "img/logo-ma-joaquim.svg", "image": BASE_URL + "img/og.jpg",
        "description": resumo_empresa()[0], "email": EMP["email"], "telephone": fone_intl(ZAP["whatsapp"]),
        "address": {"@type": "PostalAddress", "addressRegion": "RJ", "addressCountry": "BR"},
        "areaServed": {"@type": "State", "name": "Rio de Janeiro"},
        "contactPoint": [{"@type": "ContactPoint", "name": c["nome"], "telephone": fone_intl(c["whatsapp"]), "contactType": "sales",
                          "availableLanguage": "Portuguese", "areaServed": "BR", "hoursAvailable": HORARIO_LD}
                         for c in EMP["contatos"] if c["whatsapp"]],
        "employee": [{"@id": PESSOA_ID[c["nome"]]} for c in EMP["contatos"]],
        "brand": [{"@type": "Brand", "name": m["nome"], "url": f"{BASE_URL}marcas/{m['slug']}/"} for m in MARCAS],
        "knowsAbout": ["Refrigeração", "Climatização", "Ar-condicionado", "Linha branca", "Peças de reposição", "Ferramentas para refrigeração",
                       "Controladores de temperatura", "Canaletas para ar-condicionado", "Capacitores"],
    }


def ld_pessoas() -> list[dict]:
    out = []
    for c in EMP["contatos"]:
        p = {"@type": "Person", "@id": PESSOA_ID[c["nome"]], "name": c["nome"], "jobTitle": c["papel"], "worksFor": {"@id": ORG_ID}}
        if c["whatsapp"]:
            p["telephone"] = fone_intl(c["whatsapp"])
        if c.get("foto"):
            p["image"] = BASE_URL + c["foto"]
        out.append(p)
    return out


def ld_servico() -> dict:
    return {"@type": "Service", "@id": BASE_URL + "#servico", "name": "Representação comercial de fábricas de refrigeração, climatização e linha branca",
            "serviceType": "Representação comercial", "provider": {"@id": ORG_ID}, "areaServed": {"@type": "State", "name": "Rio de Janeiro"},
            "audience": {"@type": "BusinessAudience", "audienceType": "Lojas de peças, distribuidores, assistências técnicas e instaladores"},
            "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Catálogo das fábricas representadas",
                                "itemListElement": [{"@type": "OfferCatalog", "name": f"Catálogo {m['nome']}", "url": f"{BASE_URL}marcas/{m['slug']}/"} for m in MARCAS]}}


def ld_base(titulo: str, desc: str, caminho: str) -> list[dict]:
    url = BASE_URL + caminho
    tipo = {"sobre/": "AboutPage", "contato/": "ContactPage"}.get(caminho, "CollectionPage" if caminho.startswith("marcas/") else "WebPage")
    pag = {"@type": tipo, "@id": url + "#pagina", "url": url, "name": titulo, "description": desc, "inLanguage": "pt-BR",
           "isPartOf": {"@id": SITE_ID}, "about": {"@id": ORG_ID}, "dateModified": HOJE}
    nos = [{"@type": "WebSite", "@id": SITE_ID, "url": BASE_URL, "name": EMP["nome"], "inLanguage": "pt-BR", "publisher": {"@id": ORG_ID}},
           ld_org(), pag]
    if caminho:
        trilha = [("Início", BASE_URL)] + ([("Marcas", BASE_URL + "#marcas")] if caminho.startswith("marcas/") else []) + [(NOME_CURTO.get(caminho, titulo), url)]
        pag["breadcrumb"] = {"@id": url + "#migalhas"}
        nos.append({"@type": "BreadcrumbList", "@id": url + "#migalhas", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(trilha)]})
    return nos


def sem_tags(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t)).strip()


def md_inline(t: str) -> str:
    """HTML simples (strong, a, em) -> Markdown."""
    t = re.sub(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', lambda m: f"[{sem_tags(m.group(2))}]({m.group(1) if m.group(1).startswith(('http', 'mailto')) else BASE_URL + m.group(1).lstrip('./')})", t)
    t = re.sub(r"</?(strong|b)>", "**", t)
    t = re.sub(r"</?em>", "*", t)
    return sem_tags(t)


def faq_home() -> list[tuple[str, str]]:
    return [
        ("Como peço uma cotação?", f"Pelo WhatsApp {e(ALEX['telefone'])}. Mande o código ou a foto da peça e a quantidade. Se preferir, monte a lista no catálogo do site e envie tudo de uma vez com o botão <strong>Enviar lista pelo WhatsApp</strong>."),
        ("O site mostra preço e estoque?", "Não. Preço e disponibilidade mudam com a fábrica, então vão na cotação, conferidos no dia."),
        ("Qual é o pedido mínimo, o prazo e a forma de pagamento?", "Dependem da fábrica e do cadastro da sua loja. Eu informo tudo junto com a cotação, antes de você fechar o pedido."),
        ("Qual o horário de atendimento?", f"{e(EMP['horario'])}. Mensagem fora desse horário eu respondo no dia útil seguinte, logo cedo."),
        ("Não achei a peça no catálogo. E agora?", "O catálogo do site traz os itens das tabelas e folders atuais, mas as fábricas têm mais. Mande a foto da etiqueta ou o código original que eu procuro."),
        ("Posso falar com outra pessoa além do Alexandre?", f"Pode. O {e(DEIVID['nome'])} também é representante da M.A Joaquim e atende pelo WhatsApp {e(DEIVID['telefone'])}."),
    ]


def ld_faq(faq: list[tuple[str, str]]) -> dict:
    return {"@type": "FAQPage", "@id": BASE_URL + "#duvidas", "mainEntity": [
        {"@type": "Question", "name": p, "acceptedAnswer": {"@type": "Answer", "text": sem_tags(r)}} for p, r in faq]}

ICONES = {
    "zap": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm5.8 14.13c-.25.69-1.44 1.32-1.98 1.36-.51.05-.99.24-3.33-.69-2.82-1.11-4.6-3.99-4.74-4.18-.14-.18-1.13-1.5-1.13-2.87 0-1.36.71-2.03.97-2.31.25-.28.55-.35.74-.35l.53.01c.17.01.4-.06.62.48.24.56.8 1.94.87 2.08.07.14.12.3.02.48-.09.18-.14.3-.28.46-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.92 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.17-.19.7-.82.88-1.1.18-.28.37-.23.62-.14.25.09 1.6.76 1.88.89.28.14.46.21.53.32.07.12.07.67-.18 1.36Z"/></svg>',
    "lista": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
    "busca": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    "seta": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "mais": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    "fechar": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    "esq": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "dir": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "cubo": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4Z M4 7.4l8 4.6 8-4.6 M12 12v9.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    "relogio":'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    "mail": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    "pin": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    "loja": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    "caminhao": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    "chave": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
}


def logo_svg() -> str:
    return (SRC / "img" / "logo-ma-joaquim.svg").read_text(encoding="utf-8").split("\n", 1)[1].rsplit("</svg>", 1)[0]


def marca_logo(m: dict, base: str, negativo: bool = False, cls: str = "") -> str:
    src = m["logo_negativo"] if negativo else m["logo"]
    w, h = dims(src)
    return f'<img class="{cls}" src="{base}{src}" alt="{e(m["nome"])}" width="{w}" height="{h}" loading="lazy" decoding="async">'


# ---------------------------------------------------------------- moldura
def head(titulo: str, desc: str, caminho: str, base: str, extra: str = "", indexar: bool = True) -> str:
    url = BASE_URL + caminho
    md = f'<link rel="alternate" type="text/markdown" href="{url}index.md" title="Esta página em Markdown">\n' if indexar else ""
    verif = (f'<meta name="google-site-verification" content="{e(MEDICAO["googleSiteVerification"])}">\n'
             if MEDICAO.get("googleSiteVerification") else "")
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(titulo)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="{'index, follow, max-image-preview:large' if indexar else 'noindex, follow'}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#051628">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="{e(EMP['nome'])}">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE_URL}img/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="675">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" sizes="96x96" type="image/png">
<link rel="icon" href="/favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
{md}<link rel="alternate" type="text/plain" href="{BASE_URL}llms.txt" title="llms.txt: guia do site para agentes de IA">
{verif}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..900&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="{base}css/site.css">
<link rel="stylesheet" href="{base}css/flow-landing-credito.css">
<script>document.documentElement.classList.add('js')</script>
{extra}</head>
"""


def cabecalho(base: str, atual: str = "") -> str:
    def item(href: str, txt: str, chave: str) -> str:
        cur = ' aria-current="page"' if chave == atual else ""
        return f'<li><a href="{href}"{cur}>{txt}</a></li>'

    sub = "".join(item(f"{base}marcas/{m['slug']}/", m["nome"], m["slug"]) for m in MARCAS)
    return f"""<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<div class="progresso" aria-hidden="true"></div>
<header class="topo" data-topo>
 <div class="topo__in">
  <a class="topo__logo" href="{base}" aria-label="M.A Joaquim Representação, página inicial">
   <svg viewBox="0 0 520 140" aria-hidden="true">{logo_svg()}</svg>
  </a>
  <nav class="topo__nav" aria-label="Principal" id="menu">
   <ul>
    <li class="topo__marcas"><span class="topo__rotulo">Marcas</span><ul>{sub}</ul></li>
    {item(base + '#catalogo', 'Catálogo', 'catalogo')}
    {item(base + '#como-funciona', 'Como funciona', 'como')}
    {item(base + '#quem-atende', 'Quem atende', 'quem')}
    {item(base + '#duvidas', 'Dúvidas', 'duvidas')}
   </ul>
  </nav>
  <button class="botao-lista" type="button" data-abrir-lista aria-controls="lista" aria-expanded="false">
   {ICONES['lista']}<span class="botao-lista__txt">Minha lista</span><span class="botao-lista__n" data-lista-n>0</span>
  </button>
  <a class="btn btn--zap topo__cta" href="{wa('Olá, Alexandre! Vim pelo site e quero uma cotação.')}" target="_blank" rel="noopener">{ICONES['zap']}<span>Pedir cotação</span></a>
  <button class="topo__menu" type="button" aria-controls="menu" aria-expanded="false" data-menu><span></span><span></span><span></span><span class="sr">Abrir menu</span></button>
 </div>
</header>
"""


def rodape(base: str) -> str:
    marcas = "".join(f'<li><a href="{base}marcas/{m["slug"]}/">{e(m["nome"])}</a></li>' for m in MARCAS)
    contatos = "".join(
        f'<li><strong>{e(c["nome"])}</strong> · '
        + (f'<a href="https://wa.me/{c["whatsapp"]}" target="_blank" rel="noopener">{e(c["telefone"])}</a>' if c["whatsapp"] else e(c["telefone"]))
        + "</li>" for c in EMP["contatos"])
    return f"""<footer class="rodape">
 <div class="rodape__in">
  <div class="rodape__marca">
   <svg viewBox="0 0 520 140" class="rodape__logo" aria-hidden="true">{logo_svg()}</svg>
   <p>Representação comercial de fábricas de refrigeração, climatização, linha branca e automação no {e(EMP['area'])}, desde {EMP['desde']}.</p>
  </div>
  <div><h2>Marcas</h2><ul>{marcas}</ul></div>
  <div><h2>Contato</h2><ul>{contatos}
   <li><a href="mailto:{EMP['email']}">{EMP['email']}</a></li>
   <li>{e(EMP['horario'])}</li></ul></div>
  <div><h2>Institucional</h2><ul>
   <li><a href="{base}sobre/">Sobre a empresa</a></li>
   <li><a href="{base}contato/">Contato</a></li>
   <li><a href="{base}termos/">Termos de uso</a></li>
   <li><a href="{base}privacidade/">Privacidade (LGPD)</a></li></ul></div>
 </div>
 <div class="rodape__base">
  <p>{e(EMP['razao_social'])} · CNPJ {EMP['cnpj']}</p>
  <p>Marcas, logotipos e fotos de produto usados com autorização das fábricas representadas. {AVISO_DADOS} Os visualizadores 3D de terceiros (Sketchfab) só carregam se você clicar para abrir.</p>
 </div>
 <div class="fl-credito-wrap">
  <a class="fl-credito" href="https://ladingflow.netlify.app/?utm_source=rodape&amp;utm_medium=assinatura&amp;utm_campaign=ma-joaquim-representacoes"
     target="_blank" rel="noopener noreferrer nofollow"
     aria-label="Site desenvolvido e criado pela Flow Landing, agência de landing pages (abre em nova aba)">
   <img src="{base}img/flow-landing-logo.webp" width="160" height="36" alt="Flow Landing, agência digital" loading="lazy" decoding="async">
   <span class="fl-credito-txt"><small>Site desenvolvido e criado pela</small><strong>Flow Landing</strong><span>Quer uma página assim? Conheça →</span></span>
  </a>
 </div>
</footer>
"""


def camadas_globais(base: str) -> str:
    """Barra de WhatsApp no celular, gaveta da lista e janela de produto."""
    return f"""<a class="barra-zap" href="{wa('Olá, Alexandre! Vim pelo site e quero uma cotação.')}" target="_blank" rel="noopener">{ICONES['zap']} Pedir cotação no WhatsApp</a>
<aside class="lista" id="lista" aria-labelledby="lista-titulo" hidden data-lista data-zap="{ZAP['whatsapp']}">
 <div class="lista__fundo" data-fechar-lista></div>
 <div class="lista__painel" role="dialog" aria-modal="true" aria-labelledby="lista-titulo">
  <div class="lista__topo">
   <h2 id="lista-titulo">Minha lista de cotação</h2>
   <button type="button" class="icone-btn" data-fechar-lista aria-label="Fechar lista">{ICONES['fechar']}</button>
  </div>
  <p class="lista__vazia" data-lista-vazia>Sua lista está vazia. No catálogo de cada marca, toque em <strong>+ Lista</strong> nos itens que quer cotar.</p>
  <ul class="lista__itens" data-lista-itens></ul>
  <label class="lista__obs"><span class="lista__obs-rot">Observação <span>(opcional)</span></span>
   <textarea rows="2" data-lista-obs placeholder="Ex.: preciso para esta semana"></textarea>
  </label>
  <div class="lista__acoes">
   <button type="button" class="btn btn--zap btn--largo" data-lista-enviar disabled>{ICONES['zap']} Enviar lista pelo WhatsApp</button>
   <button type="button" class="btn-texto" data-lista-limpar>Limpar lista</button>
  </div>
  <p class="lista__nota">A mensagem abre no seu WhatsApp, pronta para revisar e enviar ao Alexandre. Preço, prazo e disponibilidade vêm na resposta.</p>
 </div>
</aside>
<dialog class="produto" data-produto aria-labelledby="produto-nome">
 <form method="dialog" class="produto__fechar"><button class="icone-btn" aria-label="Fechar">{ICONES['fechar']}</button></form>
 <div class="produto__palco" data-tilt-forte><img alt="" data-produto-img><div class="produto__3d" data-produto-3d hidden></div></div>
 <div class="produto__info">
  <p class="produto__marca" data-produto-marca></p>
  <h2 id="produto-nome" data-produto-nome></h2>
  <p class="produto__cod" data-produto-cod></p>
  <p class="produto__secao" data-produto-secao></p>
  <ul class="produto__spec" data-produto-spec></ul>
  <div class="produto__acoes">
   <button type="button" class="btn btn--contorno" data-produto-ver3d hidden aria-pressed="false">{ICONES['cubo']} <span>Ver em 3D</span></button>
   <button type="button" class="btn btn--primario" data-produto-add>{ICONES['mais']} Adicionar à lista</button>
   <a class="btn btn--zap" data-produto-zap target="_blank" rel="noopener">{ICONES['zap']} Cotar só este</a>
  </div>
 </div>
</dialog>
<script>window.MAJ_EMPRESA={json.dumps(DADOS_AGENTE, ensure_ascii=False)}</script>
<script src="{base}js/site.js" defer></script>
<script src="{base}js/webmcp.js" defer></script>
{MEDICAO_TAGS.replace('{base}', base)}"""


def pagina(titulo: str, desc: str, caminho: str, base: str, corpo: str, atual: str = "", extra_head: str = "",
           ld: list[dict] | None = None, indexar: bool = True) -> str:
    """ld: nós schema.org da página; WebSite, Organization e WebPage entram sempre."""
    grafo = ld_base(titulo, desc, caminho) + (ld or []) if indexar else []
    extra = extra_head + (f'<script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@graph": grafo}, ensure_ascii=False)}</script>\n'
                          if grafo else "")
    return (head(titulo, desc, caminho, base, extra, indexar) + "<body>\n" + cabecalho(base, atual)
            + f'<main id="conteudo">\n{corpo}\n</main>\n' + rodape(base) + camadas_globais(base) + "</body>\n</html>\n")


# ---------------------------------------------------------------- blocos
def orbita(itens: list[tuple[str, str, str]], base: str, cls: str, rotulo: str) -> str:
    figs = "".join(
        f'<figure class="orbita__item" data-i="{i}"><img src="{base}{src}" alt="{e(alt)}" width="{dims(src)[0]}" height="{dims(src)[1]}" decoding="async" loading="{"eager" if i < 4 else "lazy"}"><figcaption>{e(cap)}</figcaption></figure>'
        for i, (src, alt, cap) in enumerate(itens))
    return f"""<div class="orbita {cls}" data-orbita role="region" aria-roledescription="carrossel 3D" aria-label="{e(rotulo)}" tabindex="0">
 <div class="orbita__palco"><div class="orbita__anel" data-anel>{figs}</div></div>
 <div class="orbita__ctrl"><button type="button" class="icone-btn" data-ant aria-label="Anterior">{ICONES['esq']}</button><span class="orbita__dica">Arraste para girar</span><button type="button" class="icone-btn" data-prox aria-label="Próximo">{ICONES['dir']}</button></div>
</div>"""


SEM_FOTO = "img/sem-foto.svg"
FAIXA = ['Refrigeração', 'Climatização', 'Lava e seca', 'Micro-ondas', 'Ventilação', 'Automação e controle',
         'Canaletas', 'Capacitores', 'Correias e turbinas', 'Ferramentas']
# Modelos 3D (GLB) por item: {"marca:CODIGO": {"glb": "modelos/arquivo.glb", "nota": "origem do modelo"}}
_m3d = DADOS / "modelos3d.json"
MODELOS3D: dict = json.loads(_m3d.read_text(encoding="utf-8")) if _m3d.exists() else {}
MODELOS3D = {k: v for k, v in MODELOS3D.items() if not k.startswith("_") and (SRC / v["glb"]).exists()}


# ---------------------------------------------------------------- categorias (navegação por tipo de peça, nas 4 marcas)
CATEGORIAS = [  # (chave, nome, frase, {marca: [seções]} ("*" = todas), códigos preferidos para a foto)
    ("refrigeracao", "Refrigeração", "Motores, sensores, termostatos, filtros e controladores",
     {"sibb": ["Refrigeração"], "coel": ["Controladores para refrigeração"]}, ["coel:TLY25", "sibb:SMV-0147E-S"]),
    ("ar-condicionado", "Ar-condicionado", "Motores, turbinas, placas universais, bombas de dreno",
     {"sibb": ["Ar-condicionado", "Turbinas"], "suryha": ["Eletrônica e controle", "Ventilação"]}, ["sibb:STU-00132-M", "suryha:80150.064"]),
    ("lava-e-seca", "Lava e seca", "Eixos, guarnições, válvulas, travas, bombas e correias",
     {"sibb": ["Lava e seca", "Correias"]}, ["sibb:SET-4371E-S"]),
    ("micro-ondas", "Micro-ondas", "Magnetrons, capacitores, pratos e interruptores",
     {"sibb": ["Micro-ondas"]}, ["sibb:SMM-0610A-U"]),
    ("capacitores", "Capacitores", "Permanentes, de partida, de lavadora e de micro-ondas",
     {"sibb": ["Capacitores"], "suryha": ["Capacitores"]}, ["suryha:80.151.050", "sibb:SCA-35+1,5UF440V-T"]),
    ("ferramentas", "Ferramentas e instrumentos", "Manifolds, bombas de vácuo, flangeadores, brasagem e medição",
     {"suryha": ["Manifolds e mangueiras", "Vácuo e recolhimento", "Brasagem e nitrogênio", "Medição e detecção",
                 "Ferramentas para tubos", "Ferramentas manuais e elétricas", "Válvulas e conexões", "Limpeza", "Automotivo"]},
     ["suryha:80150.226", "suryha:80155.031"]),
    ("canaletas", "Canaletas e acabamento", "Linhas 30, 60 e 80 mm e SPLITEC FIT, em branco e preto",
     {"perfiltec": ["*"]}, ["perfiltec:CDR60"]),
    ("automacao", "Automação e controle", "Inversores de frequência, relés e controladores de processo",
     {"coel": ["Inversores de frequência", "Relés", "Controladores de temperatura e processo"]}, ["coel:KM3"]),
]


def categoria_de(slug: str, secao: str) -> str:
    for chave, _n, _f, mapa, _p in CATEGORIAS:
        secs = mapa.get(slug, [])
        if "*" in secs or secao in secs:
            return chave
    return ""


def bloco_categorias(base: str) -> str:
    cards = []
    for chave, nome, frase, mapa, pref in CATEGORIAS:
        itens = [(s, it) for s in mapa for it in CAT.get(s, []) if categoria_de(s, it.get("secao", "")) == chave]
        if not itens:
            continue
        foto = next((it["img"] for p in pref for s, it in itens if f"{s}:{it.get('codigo', '')}" == p and it.get("img")), None)
        foto = foto or next(it["img"] for s, it in itens if it.get("img"))
        marcas = sorted({next(m["nome"] for m in MARCAS if m["slug"] == s) for s, _ in itens})
        w, h = dims(foto)
        cards.append(f"""<li class="cat-card" data-tilt>
  <button type="button" data-categoria="{chave}" data-categoria-nome="{e(nome)}">
   <span class="cat-card__foto"><img src="{base}{foto}" alt="" width="{w}" height="{h}" loading="lazy" decoding="async"></span>
   <span class="cat-card__txt"><strong>{e(nome)}</strong><span>{e(frase)}</span>
   <small>{len(itens)} itens · {e(', '.join(marcas))}</small></span>
  </button></li>""")
    return f"""<section class="secao" id="categorias" aria-labelledby="cat-titulo-home">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Navegue por categoria</p>
   <h2 id="cat-titulo-home">Procure pela peça, não pela marca</h2>
   <p class="secao__sub">Toque numa categoria para ver os itens das quatro fábricas juntos.</p></div>
  <ul class="grade-cat revela-grupo">{''.join(cards)}</ul>
 </div>
</section>"""


def bloco_selos(base: str) -> str:
    logos = "".join(f'<li><a href="{base}marcas/{m["slug"]}/" aria-label="{e(m["nome"])}">{marca_logo(m, base)}</a></li>' for m in MARCAS)
    return f"""<section class="selos" aria-label="Fábricas representadas">
 <div class="contem selos__in">
  <p class="selos__rotulo">Representação comercial no {e(EMP['area'])}<br><strong>desde {EMP['desde']}</strong></p>
  <ul class="selos__logos">{logos}</ul>
 </div>
</section>"""


def bloco_recursos(base: str) -> str:
    itens = []
    for m in MARCAS:
        for i, d in enumerate(FOLHAS.get(m["slug"], [])):
            p0 = d["paginas"][0]
            itens.append(f"""<li class="recurso" data-tilt><a href="{base}marcas/{m['slug']}/?doc={i}#folhear">
   <span class="recurso__capa"><img src="{base}{p0['src']}" alt="" width="{p0['w']}" height="{p0['h']}" loading="lazy" decoding="async"></span>
   <span class="recurso__txt"><small>{e(m['nome'])}</small><strong>{e(d['titulo'])}</strong><span>{len(d['paginas'])} páginas · folhear online</span></span>
  </a></li>""")
    return f"""<section class="secao secao--gelo" id="recursos" aria-labelledby="rec-titulo">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Recursos técnicos</p>
   <h2 id="rec-titulo">Catálogos e folders das fábricas</h2>
   <p class="secao__sub">O material original de cada marca, com todos os códigos, para folhear aqui mesmo.</p></div>
  <ul class="grade-recursos revela-grupo">{''.join(itens)}</ul>
 </div>
</section>"""


def bloco_subnav(m: dict) -> str:
    """Menu fixo da página da marca: só lista o que a página tem."""
    links = []
    if m["slug"] == "suryha":
        links.append(("lancamentos", "Lançamentos"))
    links.append(("catalogo", "Catálogo"))
    if m["slug"] in TABELAS:
        links.append(("tabela", "Tabela"))
    if m.get("sketchfab"):
        links.append(("em-3d", "3D"))
    if FOLHAS.get(m["slug"]):
        links.append(("folhear", "Folders"))
    links.append(("outras", "Outras marcas"))
    return ('<nav class="subnav" aria-label="Nesta página" data-subnav><div class="contem subnav__in">'
            + "".join(f'<a href="#{a}">{e(t)}</a>' for a, t in links) + "</div></nav>")


# ---------------------------------------------------------------- tabelas comparativas
def _tabela_capacitores(m: dict, base: str) -> str:
    linhas, tensoes, tipos = [], set(), []
    for it in CAT["suryha"]:
        if it.get("secao") != "Capacitores":
            continue
        nome = it["tipo"]
        tipo = next((t for t in ("permanente", "de partida", "de arranque", "de lavadora", "de micro-ondas") if t in nome.lower()), "outro")
        tipo_rot = tipo.replace("de ", "").capitalize()
        if tipo_rot not in tipos:
            tipos.append(tipo_rot)
        capac = (re.search(r"([\d.,+\s]+UF)", nome) or re.search(r"(SPP6)", nome))
        volt = re.search(r"(\d{3,4}V)", nome)
        dim = re.findall(r"[\d,]+", it.get("linha", ""))
        if volt:
            tensoes.add(volt.group(1))
        formato = "Quadrado" if "quadrado" in nome.lower() else ("Simples" if "simples" in nome.lower() else "")
        cod = it["codigo"]
        linhas.append(f"""<tr data-id="suryha:{e(cod)}" data-marca="Suryha" data-cod="{e(cod)}" data-nome="{e(nome)}" data-img="{base}{it['img'] or SEM_FOTO}" data-tipo="{e(tipo_rot)}" data-tensao="{e(volt.group(1) if volt else '')}" data-busca="{e((cod + ' ' + nome).lower())}">
   <td class="t-cod">{e(cod)}</td><td>{e(tipo_rot)}</td><td><strong>{e(capac.group(1).replace(' ', '') if capac else '–')}</strong></td>
   <td>{e(volt.group(1) if volt else '–')}</td><td>{e(formato or '–')}</td><td>{e(dim[0] if dim else '–')}</td><td>{e(dim[1] if len(dim) > 1 else '–')}</td>
   <td><button type="button" class="cartao__add t-add" data-add aria-label="Adicionar {e(nome)} à lista">{ICONES['mais']}<span>Lista</span></button></td></tr>""")
    op_t = "".join(f'<option>{e(t)}</option>' for t in tipos)
    op_v = "".join(f'<option>{e(v)}</option>' for v in sorted(tensoes, key=lambda x: int(x[:-1])))
    return f"""<div class="tabela-filtros" data-tabela-filtros>
   <label class="busca">{ICONES['busca']}<span class="sr">Buscar capacitor</span><input type="search" placeholder="Ex.: 35+1.5UF, 440V, 80.151.137" data-tf-busca autocomplete="off"></label>
   <label class="seletor">Tipo<select data-tf-tipo><option value="">Todos</option>{op_t}</select></label>
   <label class="seletor">Tensão<select data-tf-tensao><option value="">Todas</option>{op_v}</select></label>
  </div>
  <p class="catalogo__contagem" data-tf-contagem aria-live="polite">{len(linhas)} capacitores</p>
  <div class="tabela-rola" tabindex="0" role="region" aria-label="Tabela de capacitores Suryha">
  <table class="tabela" data-tabela>
   <thead><tr><th>Código</th><th>Tipo</th><th>Capacitância</th><th>Tensão</th><th>Formato</th><th>Altura (cm)</th><th>Diâmetro (cm)</th><th><span class="sr">Lista</span></th></tr></thead>
   <tbody>{''.join(linhas)}</tbody>
  </table></div>
  <p class="tabela-fonte">Fonte: Folder Linha de Capacitores Suryha 2025/26.</p>"""


def _tabela_coel(m: dict, base: str) -> str:
    dados = json.loads((DADOS / "coel-comparativo.json").read_text(encoding="utf-8"))
    cab = "".join(f"<th scope='col'>{e(x)}</th>" for x in dados["modelos"])
    corpo = "".join(
        f"<tr><th scope='row'>{e(rot)}</th>" + "".join(
            f"<td{f' colspan={n}' if n > 1 else ''} class='{'t-sim' if txt == 'Sim' else ('t-nao' if txt == '–' else '')}'>{e(txt)}</td>" for txt, n in cel) + "</tr>"
        for rot, cel in dados["linhas"])
    return f"""<div class="tabela-rola" tabindex="0" role="region" aria-label="{e(dados['titulo'])}">
  <table class="tabela tabela--comparativa"><thead><tr><th scope="col">Característica</th>{cab}</tr></thead><tbody>{corpo}</tbody></table></div>
  <p class="tabela-fonte">Fonte: portfólio de automação Coel (comparativo da linha KUBE). Células que abrangem vários modelos valem para todos eles.</p>"""


TABELAS = {
    "suryha": ("Tabela de capacitores", "Filtre por tipo e tensão e compare medidas antes de cotar.", _tabela_capacitores),
    "coel": ("Comparativo da linha KM", "Entradas, saídas e funções lado a lado, para escolher o controlador certo.", _tabela_coel),
}


def bloco_tabela(m: dict, base: str) -> str:
    if m["slug"] not in TABELAS:
        return ""
    titulo, sub, fn = TABELAS[m["slug"]]
    return f"""<section class="secao secao--gelo" id="tabela" aria-labelledby="tab-titulo">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Tabela técnica</p><h2 id="tab-titulo">{e(titulo)}</h2><p class="secao__sub">{e(sub)}</p></div>
  {fn(m, base)}
 </div>
</section>"""


def bloco_sketchfab(m: dict, base: str) -> str:
    """Modelo 3D oficial da fábrica no Sketchfab. Só carrega o visualizador (e os cookies dele) ao clicar."""
    sk = m.get("sketchfab")
    if not sk:
        return ""
    w, h = dims(sk["poster"])
    src = (f"https://sketchfab.com/models/{sk['id']}/embed?autostart=1&ui_theme=dark&ui_infos=0"
           "&ui_watermark_link=0&ui_hint=2&dnt=1")
    return f"""<section class="secao secao--escura modelo3d" id="em-3d" aria-labelledby="m3d-titulo">
 <div class="contem modelo3d__in">
  <div class="modelo3d__texto">
   <p class="olho">Interativo</p>
   <h2 id="m3d-titulo">{e(sk['titulo_secao'])}</h2>
   <p class="secao__sub">{e(sk['texto'])}</p>
   <ul class="modelo3d__dicas"><li>Arraste para girar</li><li>Role ou faça pinça para aproximar</li><li>Toque nas peças para ver os detalhes</li></ul>
  </div>
  <div class="modelo3d__palco" data-sketchfab data-src="{e(src)}" data-titulo="{e(sk['titulo'])}">
   <img src="{base}{sk['poster']}" alt="" width="{w}" height="{h}" loading="lazy" decoding="async">
   <button type="button" class="modelo3d__play">{ICONES['cubo']}<span>Abrir modelo 3D</span><small>carrega o visualizador do Sketchfab</small></button>
  </div>
 </div>
 <p class="contem modelo3d__credito">Modelo 3D <a href="https://sketchfab.com/3d-models/{e(sk['slug'])}" target="_blank" rel="noopener">{e(sk['titulo'])}</a>, publicado por {e(sk['autor'])} no Sketchfab.</p>
</section>"""


def card_produto(m: dict, it: dict, base: str) -> str:
    if not it.get("img"):
        it = {**it, "img": SEM_FOTO}
    w, h = dims(it["img"])
    cod = it.get("codigo", "")
    nome = it["tipo"]
    pid = f"{m['slug']}:{cod or re.sub(r'[^a-z0-9]+', '-', nome.lower())}"
    busca = " ".join([m["nome"], cod, nome, it.get("secao", ""), it.get("linha", ""), it.get("sku", "")]).lower()
    spec_l = list(it.get("spec", []))
    if it.get("sku"):
        spec_l.append(f"SKU: {it['sku']}")
    if it.get("multiplo"):
        spec_l.append(f"Múltiplo de venda: {it['multiplo']}")
    if it["img"] == SEM_FOTO:
        spec_l.append("Foto não disponível no catálogo da fábrica")
    spec = json.dumps(spec_l, ensure_ascii=False) if spec_l else ""
    det = it.get("linha", "") if it.get("linha") not in ("Coel", "") else ""
    mod = MODELOS3D.get(f"{m['slug']}:{cod}") if cod else None
    attr3d = f' data-modelo="{base}{e(mod["glb"])}" data-modelo-nota="{e(mod.get("nota", ""))}"' if mod else ""
    selo3d = '<span class="cartao__3d" aria-label="Disponível em 3D">3D</span>' if mod else ""
    return f"""<li class="cartao" data-busca="{e(busca + (' 3d' if mod else ''))}" data-secao="{e(it.get('secao', ''))}" data-id="{e(pid)}" data-marca="{e(m['nome'])}" data-cod="{e(cod)}" data-nome="{e(nome)}" data-sec="{e(it.get('secao', ''))}" data-det="{e(det)}" data-img="{base}{it['img']}"{f' data-spec="{e(spec)}"' if spec else ''}{attr3d}>
 <button type="button" class="cartao__abrir" data-abrir-produto>
  <span class="cartao__foto">{selo3d}<img src="{base}{it['img']}" alt="{e(nome + (' ' + cod if cod else ''))}" width="{w}" height="{h}" loading="lazy" decoding="async"></span>
  <span class="cartao__cod">{e(cod) if cod else '&nbsp;'}</span>
  <span class="cartao__nome">{e(nome)}</span>
  <span class="cartao__sec">{e(it.get('secao', ''))}</span>
 </button>
 <button type="button" class="cartao__add" data-add aria-label="Adicionar {e(nome)} {e(cod)} à lista">{ICONES['mais']}<span>Lista</span></button>
</li>"""


def bloco_catalogo(m: dict, base: str) -> str:
    itens = CAT[m["slug"]]
    secoes: list[str] = []
    for it in itens:
        if it.get("secao") and it["secao"] not in secoes:
            secoes.append(it["secao"])
    chips = '<button type="button" class="chip" aria-pressed="true" data-secao-filtro="">Todos</button>' + "".join(
        f'<button type="button" class="chip" aria-pressed="false" data-secao-filtro="{e(s)}">{e(s)}</button>' for s in secoes)
    cards = "\n".join(card_produto(m, it, base) for it in itens)
    return f"""<section class="secao catalogo" id="catalogo" aria-labelledby="cat-titulo" data-catalogo>
 <div class="contem">
  <div class="secao__cab">
   <p class="olho">Catálogo {e(m['nome'])}</p>
   <h2 id="cat-titulo">{len(itens)} itens para montar sua cotação</h2>
   <p class="secao__sub">{e(m['catalogo_nota'])} Toque no item para ver de perto. Use <strong>+ Lista</strong> para juntar vários e mandar tudo de uma vez.</p>
  </div>
  <div class="filtros">
   <label class="busca">{ICONES['busca']}<span class="sr">Buscar no catálogo {e(m['nome'])}</span>
    <input type="search" placeholder="Buscar por código ou nome da peça" data-busca autocomplete="off" enterkeyhint="search"></label>
   <div class="chips" role="group" aria-label="Filtrar por seção">{chips}</div>
  </div>
  <p class="catalogo__contagem" aria-live="polite" data-contagem>{len(itens)} itens</p>
  <ul class="grade-produtos" data-grade>
{cards}
  </ul>
  <p class="catalogo__vazio" data-vazio hidden>Nenhum item com essa busca. Mande a foto ou o código pelo WhatsApp que eu procuro na fábrica.</p>
  <div class="catalogo__mais"><button type="button" class="btn btn--contorno" data-mais hidden>Mostrar mais itens</button></div>
 </div>
</section>"""


def bloco_folhas(m: dict, base: str) -> str:
    docs = FOLHAS.get(m["slug"], [])
    if not docs:
        return ""
    abas = "".join(
        f'<button type="button" role="tab" class="chip" aria-selected="{"true" if i == 0 else "false"}" data-doc="{i}">{e(d["titulo"])} <small>{len(d["paginas"])} pág.</small></button>'
        for i, d in enumerate(docs))
    dados = json.dumps([{"titulo": d["titulo"], "paginas": [{"src": base + p["src"], "w": p["w"], "h": p["h"]} for p in d["paginas"]]} for d in docs], ensure_ascii=False)
    p0 = docs[0]["paginas"][0]
    return f"""<section class="secao secao--escura folhas" id="folhear" aria-labelledby="folhas-titulo">
 <div class="contem">
  <div class="secao__cab secao__cab--claro">
   <p class="olho">Material da fábrica</p>
   <h2 id="folhas-titulo">Folheie o catálogo {e(m['nome'])}</h2>
   <p class="secao__sub">As páginas originais, com todos os códigos. Arraste, use as setas ou toque na borda da página.</p>
  </div>
  <div class="abas" role="tablist" aria-label="Catálogos">{abas}</div>
  <div class="livro" data-livro data-docs='{e(dados)}'>
   <div class="livro__palco" data-livro-palco>
    <img class="livro__sem-js" src="{base}{p0['src']}" alt="Primeira página do catálogo {e(m['nome'])}" width="{p0['w']}" height="{p0['h']}" loading="lazy">
   </div>
   <div class="livro__ctrl">
    <button type="button" class="icone-btn icone-btn--claro" data-livro-ant aria-label="Página anterior">{ICONES['esq']}</button>
    <span class="livro__pag" data-livro-pag aria-live="polite">1</span>
    <button type="button" class="icone-btn icone-btn--claro" data-livro-prox aria-label="Próxima página">{ICONES['dir']}</button>
   </div>
  </div>
 </div>
</section>"""


def cta_final(base: str, msg: str, titulo: str) -> str:
    return f"""<section class="cta-final" aria-labelledby="cta-titulo">
 <div class="contem cta-final__in">
  <h2 id="cta-titulo">{titulo}</h2>
  <p>Mande o código, a foto da peça ou a lista inteira. Respondo {EMP['horario'][0].lower() + EMP['horario'][1:]}.</p>
  <div class="cta-final__acoes">
   <a class="btn btn--zap btn--grande" href="{wa(msg)}" target="_blank" rel="noopener">{ICONES['zap']} Falar com o Alexandre</a>
   <a class="btn btn--contorno-claro btn--grande" href="mailto:{EMP['email']}">{ICONES['mail']} {EMP['email']}</a>
  </div>
 </div>
</section>"""


# ---------------------------------------------------------------- páginas
def home() -> str:
    base = ""
    def foto(slug: str, cod: str) -> tuple[str, str, str] | None:
        it = next((i for i in CAT[slug] if i.get("codigo") == cod and i.get("img")), None)
        nome = next(m["nome"] for m in MARCAS if m["slug"] == slug)
        return (it["img"], f"{it['tipo']} {nome}", nome) if it else None
    destaque = [d for d in (
        foto("suryha", "80150.226"), foto("perfiltec", "CDR60"), foto("coel", "KM3"), foto("suryha", "80155.031"),
        foto("perfiltec", "ATDR80"), foto("suryha", "80150.243"), foto("coel", "TLY25"), foto("suryha", "80150.202"),
        foto("perfiltec", "FIT60"), foto("suryha", "80150.030"),
    ) if d]
    anos = ANO - EMP["desde"]
    cards_marca = "".join(f"""<li class="marca-card" data-tilt style="--cor:{m['cor']}">
  <a href="marcas/{m['slug']}/">
   <span class="marca-card__logo">{marca_logo(m, base)}</span>
   <span class="marca-card__resumo">{e(m['resumo'])}</span>
   <span class="marca-card__n">{len(CAT[m['slug']])} itens no catálogo</span>
   <span class="marca-card__ir">Ver catálogo {ICONES['seta']}</span>
  </a></li>""" for m in MARCAS)
    indice = [{"m": m["nome"], "s": m["slug"], "c": it.get("codigo", ""), "n": it["tipo"], "x": it.get("secao", ""), "i": it["img"] or SEM_FOTO,
               "k": categoria_de(m["slug"], it.get("secao", ""))}
              for m in MARCAS for it in CAT[m["slug"]]]
    alex, deivid = EMP["contatos"][0], EMP["contatos"][1]
    w, h = dims(alex["foto"])
    deivid_zap = (f'<a class="btn btn--zap" href="https://wa.me/{deivid["whatsapp"]}" target="_blank" rel="noopener">{ICONES["zap"]} {e(deivid["telefone"])}</a>'
                  if deivid["whatsapp"] else f'<p class="pendente">{e(deivid["telefone"])}</p>')
    corpo = f"""<section class="heroi" aria-labelledby="heroi-titulo">
 <div class="heroi__aneis" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
 <div class="contem heroi__in">
  <div class="heroi__texto">
   <p class="olho olho--claro entra" style="--d:0">Representação comercial · {e(EMP['area'])} · desde {EMP['desde']}</p>
   <h1 id="heroi-titulo" class="entra" style="--d:1">Peças e ferramentas para <em>refrigeração, climatização e linha branca</em>, direto das fábricas.</h1>
   <p class="heroi__sub entra" style="--d:2">A M.A Joaquim representa a Suryha, a SIBB, a Coel e a Perfiltec. Você monta a lista aqui ou manda pelo WhatsApp, e eu cuido da cotação, do pedido e do acompanhamento com a fábrica.</p>
   <div class="heroi__acoes entra" style="--d:3">
    <a class="btn btn--zap btn--grande" href="{wa('Olá, Alexandre! Vim pelo site e quero uma cotação.')}" target="_blank" rel="noopener">{ICONES['zap']} Pedir cotação no WhatsApp</a>
    <a class="btn btn--contorno-claro btn--grande" href="#marcas">Ver as marcas {ICONES['seta']}</a>
   </div>
  </div>
  <div class="heroi__3d entra" style="--d:2">{orbita(destaque, base, 'orbita--heroi', 'Produtos das fábricas representadas')}
   <div class="flutua flutua--1" aria-hidden="true"><strong>{TOTAL}</strong><span>itens no catálogo</span></div>
   <div class="flutua flutua--2" aria-hidden="true"><strong>Desde {EMP['desde']}</strong><span>no mercado</span></div>
   <div class="flutua flutua--3" aria-hidden="true"><strong>4 fábricas</strong><span>num contato só</span></div>
  </div>
 </div>
 <ul class="numeros contem" aria-label="Em números">
  <li><strong>{anos} anos</strong><span>no mercado, desde {EMP['desde']}</span></li>
  <li><strong>4 fábricas</strong><span>num contato só</span></li>
  <li><strong>{TOTAL} itens</strong><span>no catálogo online</span></li>
  <li><strong>{e(EMP['horario_curto'])}</strong><span>atendimento comercial</span></li>
 </ul>
</section>
{bloco_selos(base)}
<div class="faixa" aria-hidden="true" data-faixa><div class="faixa__trilho">{''.join('<div class="faixa__grupo">' + ''.join(f'<span>{t}</span>' for t in FAIXA) + '</div>' for _ in range(2))}</div></div>
{bloco_categorias(base)}

<section class="secao" id="marcas" aria-labelledby="marcas-titulo">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Fábricas representadas</p>
   <h2 id="marcas-titulo">Quatro fábricas, um contato só</h2>
   <p class="secao__sub">Cada marca tem a sua página com o catálogo navegável, a vitrine em 3D e o folder original para folhear.</p></div>
  <ul class="grade-marcas revela-grupo">{cards_marca}</ul>
 </div>
</section>

<section class="secao secao--gelo" id="catalogo" aria-labelledby="busca-titulo">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Catálogo</p>
   <h2 id="busca-titulo">Procure pelo código ou pelo nome da peça</h2>
   <p class="secao__sub">A busca percorre os {TOTAL} itens das quatro marcas. Sem preço e sem estoque: esses dois vêm na cotação, atualizados com a fábrica no dia.</p></div>
  <div class="busca-global" data-busca-global>
   <label class="busca busca--grande">{ICONES['busca']}<span class="sr">Buscar em todas as marcas</span>
    <input type="search" placeholder="Ex.: SET-4371E-S, capacitor, manifold, curva 60" data-busca-global-input autocomplete="off" enterkeyhint="search"></label>
   <p class="busca-global__dica" data-busca-global-info>Digite pelo menos 2 letras, ou escolha uma categoria acima.</p>
   <div class="busca-global__marcas" data-busca-global-marcas hidden></div>
   <ul class="grade-produtos grade-produtos--compacta" data-busca-global-res></ul>
  </div>
  <script type="application/json" id="indice-catalogo">{json.dumps(indice, ensure_ascii=False, separators=(',', ':'))}</script>
  <script type="application/json" id="categorias-secoes">{json.dumps({c[0]: c[3] for c in CATEGORIAS}, ensure_ascii=False, separators=(',', ':'))}</script>
 </div>
</section>
{bloco_recursos(base)}

<section class="secao" aria-labelledby="para-quem-titulo">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Para quem</p><h2 id="para-quem-titulo">Atendo quem compra para revender ou para instalar</h2></div>
  <ul class="grade-3 revela-grupo">
   <li class="bloco revela" data-tilt>{ICONES['loja']}<h3>Lojas de peças</h3><p>Reposição de linha branca, refrigeração e climatização, com o mix das quatro fábricas.</p></li>
   <li class="bloco revela" data-tilt>{ICONES['caminhao']}<h3>Distribuidores</h3><p>Volume e linha completa, com pedido acompanhado de perto junto à fábrica.</p></li>
   <li class="bloco revela" data-tilt>{ICONES['chave']}<h3>Assistências e instaladores</h3><p>Ferramentas, peças e acabamento para a instalação e a manutenção do dia a dia.</p></li>
  </ul>
 </div>
</section>

<section class="secao secao--escura" id="como-funciona" aria-labelledby="como-titulo">
 <div class="contem">
  <div class="secao__cab secao__cab--claro"><p class="olho olho--claro">Como funciona</p><h2 id="como-titulo">Da lista ao pedido em três passos</h2></div>
  <ol class="passos" data-passos>
   <svg class="passos__linha" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4H1000" pathLength="1"/></svg>
   <li class="revela"><span class="passos__n">1</span><h3>Monte a lista</h3><p>Use o <strong>+ Lista</strong> no catálogo ou mande pelo WhatsApp o código, a foto da peça e a quantidade.</p></li>
   <li class="revela"><span class="passos__n">2</span><h3>Receba a cotação</h3><p>Volto com preço, prazo e condição da fábrica para a sua loja. Cada fábrica tem a sua regra, e eu explico.</p></li>
   <li class="revela"><span class="passos__n">3</span><h3>Pedido acompanhado</h3><p>Passo o pedido para a fábrica e acompanho faturamento, entrega e boleto até chegar na sua loja.</p></li>
  </ol>
 </div>
</section>

<section class="secao" id="quem-atende" aria-labelledby="quem-titulo">
 <div class="contem quem">
  <figure class="quem__foto revela" data-tilt>
   <img src="{alex['foto']}" alt="Alexandre Bunn, representante da M.A Joaquim, de óculos e camisa azul da Suryha Ferramentas" width="{w}" height="{h}" loading="lazy" decoding="async">
  </figure>
  <div class="quem__texto">
   <p class="olho">Quem atende</p>
   <h2 id="quem-titulo">Alexandre Bunn</h2>
   <p class="quem__papel">Representante comercial · M.A Joaquim Representação</p>
   <p>A M.A Joaquim está no mercado desde {EMP['desde']}. Atendo pessoalmente: respondo pelo WhatsApp, levo o catálogo até a sua loja quando faz sentido e resolvo com a fábrica o que aparecer depois da venda, de previsão de entrega a segunda via de boleto.</p>
   <ul class="quem__dados">
    <li>{ICONES['relogio']} {e(EMP['horario'])}</li>
    <li>{ICONES['pin']} Atendimento no {e(EMP['area'])}</li>
    <li>{ICONES['mail']} <a href="mailto:{EMP['email']}">{EMP['email']}</a></li>
   </ul>
   <div class="quem__acoes">
    <a class="btn btn--zap" href="{wa('Olá, Alexandre! Vim pelo site.')}" target="_blank" rel="noopener">{ICONES['zap']} {e(alex['telefone'])}</a>
   </div>
   <div class="quem__segundo">
    <p><strong>{e(deivid['nome'])}</strong> · {e(deivid['papel'])}</p>
    {deivid_zap}
   </div>
  </div>
 </div>
</section>

<section class="secao secao--gelo" id="duvidas" aria-labelledby="duvidas-titulo">
 <div class="contem estreito">
  <div class="secao__cab"><p class="olho">Dúvidas</p><h2 id="duvidas-titulo">Perguntas frequentes</h2></div>
  <div class="faq">
   {''.join(f'<details><summary>{p}</summary><p>{r}</p></details>' for p, r in faq_home())}
  </div>
 </div>
</section>
{cta_final(base, 'Olá, Alexandre! Vim pelo site e quero uma cotação.', 'Tem uma lista para cotar?')}"""
    return pagina(f"{EMP['nome']} · Refrigeração, climatização e linha branca no RJ",
                  f"Representante comercial no Rio de Janeiro desde {EMP['desde']}: Suryha, SIBB, Coel e Perfiltec. Catálogo online com {TOTAL} itens e cotação pelo WhatsApp.",
                  "", base, corpo, ld=[ld_servico(), *ld_pessoas(), ld_faq(faq_home())])


def pagina_marca(m: dict) -> str:
    base = "../../"
    itens = CAT[m["slug"]]
    com_foto = [i for i in itens if i.get("img")]
    # vitrine: um item de cada seção primeiro, para mostrar a variedade; completa até 12
    escolha, vistos = [], set()
    for it in com_foto:
        if it["secao"] not in vistos:
            vistos.add(it["secao"])
            escolha.append(it)
    passo = max(1, len(com_foto) // 12)
    escolha += [i for i in com_foto[::passo] if i not in escolha]
    escolha = escolha[:12]
    vitrine = orbita([(it["img"], f"{it['tipo']} {it.get('codigo', '')}".strip(), it.get("codigo") or it["tipo"]) for it in escolha],
                     base, "orbita--marca", f"Vitrine 3D {m['nome']}")
    outras = "".join(f'<li><a href="{base}marcas/{o["slug"]}/" data-tilt>{marca_logo(o, base)}<span>{e(o["resumo"])}</span></a></li>'
                     for o in MARCAS if o is not m)
    extra = ""
    if m["slug"] == "suryha":
        w, h = dims("img/suryha-lancamentos.webp")
        extra = f"""<section class="secao lancamentos" id="lancamentos" aria-labelledby="lanc-titulo">
 <div class="contem lancamentos__in">
  <div><p class="olho">Novidade Suryha</p><h2 id="lanc-titulo">Temporada de lançamentos</h2>
   <p>Regulador de nitrogênio, alicate amperímetro True-RMS, engates rápidos R1234YF, manifolds ON/OFF e Inverter e mais. Os códigos estão na arte: mande o que interessar.</p>
   <a class="btn btn--zap" href="{wa('Olá, Alexandre! Vim pelo site e quero cotação dos lançamentos Suryha.')}" target="_blank" rel="noopener">{ICONES['zap']} Cotar lançamentos</a></div>
  <figure class="lancamentos__arte" data-tilt><img src="{base}img/suryha-lancamentos.webp" alt="Arte Suryha Temporada de Lançamentos com 14 produtos e seus códigos" width="{w}" height="{h}" loading="lazy" decoding="async"></figure>
 </div>
</section>"""
    nome_longo = f'<p class="marca-heroi__longo">{e(m["nome_longo"])}</p>' if m.get("nome_longo") else ""
    corpo = f"""<section class="marca-heroi" style="--cor:{m['cor']}" aria-labelledby="marca-titulo">
 <div class="heroi__aneis" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
 <div class="contem marca-heroi__in">
  <div class="marca-heroi__texto">
   <nav class="migalhas" aria-label="Você está em"><a href="{base}">Início</a> / <a href="{base}#marcas">Marcas</a> / <span aria-current="page">{e(m['nome'])}</span></nav>
   <div class="marca-heroi__logo entra" style="--d:0">{marca_logo(m, base)}</div>
   {nome_longo}
   <h1 id="marca-titulo" class="entra" style="--d:1">{e(m['nome'])}: {e(m['resumo'][0].lower() + m['resumo'][1:])}</h1>
   <p class="heroi__sub entra" style="--d:2">{e(m['texto'])}</p>
   <div class="heroi__acoes entra" style="--d:3">
    <a class="btn btn--zap btn--grande" href="{wa(f'Olá, Alexandre! Vim pelo site e quero cotação de itens {m["nome"]}.')}" target="_blank" rel="noopener">{ICONES['zap']} Cotar {e(m['nome'])}</a>
    <a class="btn btn--contorno-claro btn--grande" href="#catalogo">Ver catálogo {ICONES['seta']}</a>
    {f'<a class="btn btn--contorno-claro btn--grande" href="#em-3d">{ICONES["cubo"]} Ver em 3D</a>' if m.get('sketchfab') else ''}
   </div>
  </div>
  <div class="heroi__3d entra" style="--d:2">{vitrine}</div>
 </div>
</section>
{bloco_subnav(m)}
{extra}
{bloco_catalogo(m, base)}
{bloco_tabela(m, base)}
{bloco_sketchfab(m, base)}
{bloco_folhas(m, base)}
<section class="secao" id="outras" aria-labelledby="outras-titulo">
 <div class="contem">
  <div class="secao__cab"><p class="olho">Também represento</p><h2 id="outras-titulo">Outras fábricas</h2></div>
  <ul class="outras revela-grupo">{outras}</ul>
 </div>
</section>
{cta_final(base, f'Olá, Alexandre! Vim pelo site, página {m["nome"]}, e quero uma cotação.', f'Vai cotar {e(m["nome"])}?')}"""
    url = f"{BASE_URL}marcas/{m['slug']}/"
    ld = [{"@type": "Brand", "@id": url + "#marca", "name": m["nome"], "alternateName": m.get("nome_longo") or None,
           "logo": BASE_URL + m["logo"], "description": m["texto"], "url": url},
          {"@type": "ItemList", "@id": url + "#catalogo", "name": f"Catálogo {m['nome']} (códigos de fábrica, sem preço)",
           "numberOfItems": len(itens), "url": url + "#catalogo"}]
    ld[0] = {k: v for k, v in ld[0].items() if v is not None}
    return pagina(f"{m['nome']} no Rio de Janeiro · {EMP['nome']}",
                  f"Representante {m['nome']} no RJ. {m['resumo']} Catálogo com {len(itens)} itens e cotação pelo WhatsApp.",
                  f"marcas/{m['slug']}/", base, corpo, atual=m["slug"], ld=ld)


def pagina_404() -> str:
    corpo = f"""<section class="secao erro"><div class="contem estreito">
 <p class="olho">Erro 404</p><h1>Essa página não existe.</h1>
 <p>O link pode ter mudado. As marcas estão logo abaixo, ou fale direto comigo.</p>
 <ul class="outras">{''.join(f'<li><a href="/marcas/{m["slug"]}/">{e(m["nome"])}</a></li>' for m in MARCAS)}</ul>
 <a class="btn btn--zap" href="{wa('Olá, Alexandre! Vim pelo site.')}">{ICONES['zap']} Falar no WhatsApp</a>
</div></section>"""
    return pagina(f"Página não encontrada · {EMP['nome']}", "Página não encontrada.", "404.html", "/", corpo, indexar=False)


# ---------------------------------------------------------------- páginas institucionais
def institucionais(base: str = "../") -> dict[str, dict]:
    """Conteúdo único das páginas Sobre, Contato, Termos e Privacidade (vira HTML e Markdown)."""
    zap_a = f'<a href="{wa("Olá, Alexandre! Vim pelo site.")}" target="_blank" rel="noopener">{e(ALEX["telefone"])}</a>'
    zap_d = f'<a href="https://wa.me/{DEIVID["whatsapp"]}" target="_blank" rel="noopener">{e(DEIVID["telefone"])}</a>'
    mail = f'<a href="mailto:{EMP["email"]}">{EMP["email"]}</a>'
    marcas = [f'<a href="{base}marcas/{m["slug"]}/"><strong>{e(m["nome"])}</strong></a>{" (" + e(m["nome_longo"]) + ")" if m.get("nome_longo") else ""}: {e(m["texto"])}'
              for m in MARCAS]
    if MEDE:
        coleta = ["O site não tem formulário nem cadastro.",
                  "Se você clicar em <strong>Aceitar</strong> no aviso de cookies, o Google Analytics e o Google Ads registram visitas e cliques (por exemplo, o clique no botão do WhatsApp), sem identificar você pelo nome. Se recusar ou ignorar o aviso, nada é medido e o site funciona igual. A escolha fica salva no seu navegador; para mudar, limpe os dados do site no navegador."]
    else:
        coleta = ["Nada. O site não tem formulário, não pede cadastro e não usa cookies de medição nem de publicidade."]
    return {
        "sobre/": {
            "titulo": f"Sobre a {EMP['nome']} · representante comercial no RJ desde {EMP['desde']}",
            "desc": f"Quem é a {EMP['nome']}: representação da Suryha, SIBB, Coel e Perfiltec no Rio de Janeiro desde {EMP['desde']}, para lojas, distribuidores e assistências.",
            "olho": "Sobre", "h1": f"Representação comercial no {EMP['area']} desde {EMP['desde']}",
            "intro": f"A {EMP['nome']} é o contato entre as fábricas e a sua loja: você pede a cotação, recebe preço, prazo e condição da fábrica e o pedido é acompanhado até a entrega.",
            "secoes": [
                ("Fábricas representadas", marcas),
                ("Para quem", ["Lojas de peças, distribuidores, assistências técnicas e instaladores de refrigeração, climatização e linha branca, no Rio de Janeiro."]),
                ("Como trabalhamos", ["<strong>1. Lista:</strong> use o + Lista no catálogo do site ou mande pelo WhatsApp o código, a foto da peça e a quantidade.",
                                      "<strong>2. Cotação:</strong> preço, prazo e condição da fábrica para a sua loja. Cada fábrica tem a sua regra, e ela é explicada antes de você fechar.",
                                      "<strong>3. Pedido acompanhado:</strong> o pedido vai para a fábrica e é acompanhado no faturamento, na entrega e no boleto."]),
                ("Quem atende", [f"<strong>{e(ALEX['nome'])}</strong>, {e(ALEX['papel']).lower()}: WhatsApp {zap_a}.",
                                 f"<strong>{e(DEIVID['nome'])}</strong>, {e(DEIVID['papel']).lower()}: WhatsApp {zap_d}.",
                                 f"E-mail {mail}. {e(EMP['horario'])}."]),
                ("Dados da empresa", [f"Razão social: {e(EMP['razao_social'])}", f"CNPJ: {EMP['cnpj']}", f"No mercado desde {EMP['desde']}",
                                      f"Área de atendimento: {e(EMP['area'])}", f"Site: {BASE_URL}"]),
            ]},
        "contato/": {
            "titulo": f"Contato · {EMP['nome']}",
            "desc": f"Fale com a {EMP['nome']}: WhatsApp {ALEX['telefone']} (Alexandre) e {DEIVID['telefone']} (Deivid), e-mail {EMP['email']}. {EMP['horario']}.",
            "olho": "Contato", "h1": "Fale com a gente",
            "intro": "O atendimento é pelo WhatsApp ou por e-mail. Este site não tem formulário.",
            "secoes": [
                ("WhatsApp", [f"<strong>{e(ALEX['nome'])}</strong>: {zap_a}", f"<strong>{e(DEIVID['nome'])}</strong>: {zap_d}"]),
                ("E-mail", [mail]),
                ("Horário", [f"{e(EMP['horario'])}. Mensagem fora desse horário é respondida no dia útil seguinte, logo cedo."]),
                ("Área de atendimento", [f"{e(EMP['area'])}."]),
                ("Como pedir uma cotação", ["Mande o código ou a foto da peça e a quantidade. Se preferir, monte a lista no catálogo do site e envie tudo de uma vez pelo botão <strong>Enviar lista pelo WhatsApp</strong>.",
                                            "Preço, estoque, prazo, pedido mínimo e forma de pagamento dependem da fábrica e do cadastro da sua loja, e vêm na cotação."]),
            ]},
        "termos/": {
            "titulo": f"Termos de uso · {EMP['nome']}",
            "desc": f"Regras de uso do site da {EMP['nome']}: catálogo informativo, preço só na cotação, marcas das fábricas usadas com autorização.",
            "olho": "Termos de uso", "h1": "Termos de uso do site",
            "intro": f"Estas regras valem para quem usa {EMP['dominio']}. Atualizado em {date.today().strftime('%d/%m/%Y')}.",
            "secoes": [
                ("O que é este site", [f"Um site informativo da {EMP['nome']}, que apresenta a empresa e o catálogo das fábricas representadas. Não é loja virtual: não há venda, pagamento nem cadastro pelo site."]),
                ("Catálogo, preço e disponibilidade", ["Códigos, nomes, fotos e especificações vêm dos catálogos e folders oficiais das fábricas e podem mudar sem aviso. Confirme o item na cotação.",
                                                       "Preço, estoque, prazo, pedido mínimo e pagamento são informados só na cotação e dependem da fábrica e do cadastro do cliente. O pedido só é fechado depois que você aprova a cotação."]),
                ("Marcas e imagens", ["Marcas, logotipos e fotos de produto pertencem às fábricas (Suryha, SIBB, Coel e Perfiltec) e aparecem aqui com autorização delas. Não podem ser copiados deste site para outros usos."]),
                ("Lista de cotação", ["A lista que você monta fica guardada só no seu navegador. O botão de envio abre o WhatsApp com a mensagem pronta para você revisar antes de mandar."]),
                ("Serviços de terceiros", ["WhatsApp, Sketchfab (visualizador 3D, só carrega se você clicar) e Google Fonts têm termos próprios."]),
                ("Buscadores e assistentes de IA", ["O conteúdo pode ser indexado por buscadores e lido e citado por assistentes de IA. O uso para treinar modelos não é autorizado, como indicado no robots.txt (Content-Signal)."]),
                ("Dúvidas", [f"Escreva para {mail}."]),
            ]},
        "privacidade/": {
            "titulo": f"Política de privacidade (LGPD) · {EMP['nome']}",
            "desc": f"Como o site da {EMP['nome']} trata dados pessoais: o que é coletado, a lista de cotação no navegador, WhatsApp e seus direitos pela LGPD.",
            "olho": "Privacidade", "h1": "Política de privacidade",
            "intro": f"Como os seus dados são tratados neste site, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018). Atualizado em {date.today().strftime('%d/%m/%Y')}.",
            "secoes": [
                ("Quem é o responsável", [f"{e(EMP['razao_social'])}, CNPJ {EMP['cnpj']}. Contato para assuntos de privacidade: {mail}."]),
                ("O que o site coleta", coleta),
                ("Lista de cotação", ["Os itens que você adiciona ficam no armazenamento local do seu navegador (localStorage) e não são enviados para nós. O botão <strong>Limpar lista</strong> apaga tudo."]),
                ("WhatsApp e e-mail", ["Quando você manda mensagem, usamos o que você enviar (nome, loja, telefone, itens) para responder a cotação e acompanhar o pedido. A conversa passa pelo WhatsApp, que segue a política de privacidade dele."]),
                ("Serviços de terceiros", ["As fontes do site vêm do Google Fonts, que recebe o endereço IP de quem visita. O visualizador 3D (Sketchfab) e o visualizador de modelos (jsDelivr) só carregam se você clicar para abrir. O site é hospedado no GitHub Pages, que mantém registros técnicos de acesso."]),
                ("Seus direitos", [f"Você pode pedir acesso, correção ou exclusão dos seus dados, ou tirar dúvidas, pelo e-mail {mail}."]),
            ]},
    }


def pagina_institucional(caminho: str, d: dict) -> str:
    base = "../"
    secoes = "".join(f'<h2>{e(h)}</h2>' + ("<ul>" + "".join(f"<li>{p}</li>" for p in ps) + "</ul>" if h in ("Fábricas representadas", "Dados da empresa") else "".join(f"<p>{p}</p>" for p in ps))
                     for h, ps in d["secoes"])
    foto = ""
    if caminho == "sobre/":
        w, h = dims(ALEX["foto"])
        foto = f'<figure class="texto-longo__foto"><img src="{base}{ALEX["foto"]}" alt="{e(ALEX["nome"])}, representante da {e(EMP["nome"])}" width="{w}" height="{h}" loading="lazy" decoding="async"><figcaption>{e(ALEX["nome"])}, {e(ALEX["papel"]).lower()}</figcaption></figure>'
    corpo = f"""<section class="secao pagina-texto" aria-labelledby="pt-titulo">
 <div class="contem estreito">
  <nav class="migalhas migalhas--clara" aria-label="Você está em"><a href="{base}">Início</a> / <span aria-current="page">{e(NOME_CURTO[caminho])}</span></nav>
  <p class="olho">{e(d['olho'])}</p>
  <h1 id="pt-titulo">{e(d['h1'])}</h1>
  <p class="secao__sub">{e(d['intro'])}</p>
  {foto}
  <div class="texto-longo">{secoes}</div>
 </div>
</section>
{cta_final(base, 'Olá, Alexandre! Vim pelo site e quero uma cotação.', 'Tem uma lista para cotar?')}"""
    extra = [ld_servico(), *ld_pessoas()] if caminho in ("sobre/", "contato/") else []
    return pagina(d["titulo"], d["desc"], caminho, base, corpo, ld=extra)


# ---------------------------------------------------------------- agentes de IA (Markdown, llms.txt, catálogo JSON)
def md_rodape() -> str:
    return (f"\n---\n{EMP['nome']} · CNPJ {EMP['cnpj']} · {EMP['email']} · " + " · ".join(f"{c['nome']} {c['telefone']}" for c in EMP["contatos"])
            + f"\nGuia para agentes: {BASE_URL}llms.txt · Catálogo completo em JSON: {BASE_URL}catalogo.json\n")


def md_home() -> str:
    linhas = [f"# {EMP['nome']}", "", *[f"> {l}" for l in resumo_empresa()], "", "## Fábricas representadas", ""]
    linhas += [f"- [{m['nome']}]({BASE_URL}marcas/{m['slug']}/): {m['resumo']} {len(CAT[m['slug']])} itens no catálogo ([Markdown]({BASE_URL}marcas/{m['slug']}/index.md))." for m in MARCAS]
    linhas += ["", "## Categorias", "", ", ".join(c[1] for c in CATEGORIAS) + ".", "",
               "## Como funciona", "",
               "1. Monte a lista: use o + Lista no catálogo ou mande pelo WhatsApp o código, a foto da peça e a quantidade.",
               "2. Receba a cotação: preço, prazo e condição da fábrica para a sua loja.",
               "3. Pedido acompanhado: faturamento, entrega e boleto acompanhados junto à fábrica.", "",
               "## Contato", ""]
    linhas += [f"- {c['nome']} ({c['papel'].lower()}): WhatsApp {c['telefone']}, https://wa.me/{c['whatsapp']}" for c in EMP["contatos"]]
    linhas += [f"- E-mail: {EMP['email']}", f"- Horário: {EMP['horario']}", f"- Área: {EMP['area']}", "", "## Perguntas frequentes", ""]
    for p, r in faq_home():
        linhas += [f"### {p}", "", md_inline(r), ""]
    linhas += ["## Páginas", ""] + [f"- [{NOME_CURTO[k]}]({BASE_URL}{k})" for k in ("sobre/", "contato/", "termos/", "privacidade/")]
    return "\n".join(linhas) + "\n" + md_rodape()


def md_marca(m: dict) -> str:
    def cel(t: object) -> str:
        return str(t or "").replace("|", "/").replace("\n", " ").strip()
    url = f"{BASE_URL}marcas/{m['slug']}/"
    linhas = [f"# {m['nome']} no Rio de Janeiro · {EMP['nome']}", ""]
    if m.get("nome_longo"):
        linhas += [f"{m['nome']} = {m['nome_longo']}.", ""]
    linhas += [m["texto"], "", f"Representante no {EMP['area']}: {EMP['nome']}. Cotação pelo WhatsApp {ZAP['telefone']} ({ZAP['nome']}) ou {DEIVID['telefone']} ({DEIVID['nome']}).",
               f"Preço e estoque não são divulgados: vêm na cotação. Fonte dos códigos: {m.get('catalogo_nota', 'catálogos oficiais da fábrica')}", "",
               f"Página: {url}", "", f"## Catálogo ({len(CAT[m['slug']])} itens)", "",
               "| Código | Produto | Seção | Detalhes |", "| --- | --- | --- | --- |"]
    for it in CAT[m["slug"]]:
        det = [it.get("linha", "") if it.get("linha") not in ("Coel",) else "", *(it.get("spec") or []),
               f"SKU {it['sku']}" if it.get("sku") else "", f"múltiplo {it['multiplo']}" if it.get("multiplo") else ""]
        linhas.append(f"| {cel(it.get('codigo'))} | {cel(it['tipo'])} | {cel(it.get('secao'))} | {cel('; '.join(x for x in det if x))} |")
    return "\n".join(linhas) + "\n" + md_rodape()


def md_institucional(caminho: str, d: dict) -> str:
    linhas = [f"# {d['h1']}", "", md_inline(d["intro"]), ""]
    for h, ps in d["secoes"]:
        linhas += [f"## {h}", ""] + [f"- {md_inline(p)}" if h in ("Fábricas representadas", "Dados da empresa") else md_inline(p) + "\n" for p in ps] + [""]
    return "\n".join(linhas) + md_rodape()


def catalogo_json() -> dict:
    itens = []
    for m in MARCAS:
        for it in CAT[m["slug"]]:
            itens.append({"marca": m["nome"], "marca_slug": m["slug"], "codigo": it.get("codigo", ""), "nome": it["tipo"],
                          "secao": it.get("secao", ""), "detalhe": "; ".join(x for x in [it.get("linha", "") if it.get("linha") != "Coel" else "", *(it.get("spec") or []),
                                                                                         f"SKU {it['sku']}" if it.get("sku") else ""] if x),
                          "url": f"{BASE_URL}marcas/{m['slug']}/" + (f"?q={quote(it['codigo'])}#catalogo" if it.get("codigo") else "#catalogo"),
                          "imagem": BASE_URL + it["img"] if it.get("img") else ""})
    return {"empresa": EMP["nome"], "site": BASE_URL, "atualizado": HOJE,
            "aviso": "Catálogo informativo com os códigos das fábricas. Sem preço nem estoque: ambos vêm na cotação pelo WhatsApp.",
            "contato": [{"nome": c["nome"], "whatsapp": f"https://wa.me/{c['whatsapp']}", "telefone": c["telefone"]} for c in EMP["contatos"]],
            "total": len(itens), "itens": itens}


def llms_txt() -> str:
    linhas = [f"# {EMP['nome']}", "", "> " + " ".join(resumo_empresa()), "",
              "Cada página tem uma versão em Markdown no mesmo endereço terminado em index.md. O catálogo completo, com código, nome, seção e link de cada item, está em JSON. "
              "Não invente preço, estoque ou prazo: oriente a pessoa a pedir a cotação pelo WhatsApp.", "",
              "## Empresa", "",
              f"- [Início]({BASE_URL}): o que a empresa faz, categorias, como funciona e perguntas frequentes ([Markdown]({BASE_URL}index.md))",
              f"- [Sobre]({BASE_URL}sobre/): história, fábricas, quem atende e dados da empresa ([Markdown]({BASE_URL}sobre/index.md))",
              f"- [Contato]({BASE_URL}contato/): WhatsApp, e-mail, horário e área ([Markdown]({BASE_URL}contato/index.md))", "",
              "## Catálogos por fábrica", ""]
    linhas += [f"- [{m['nome']}]({BASE_URL}marcas/{m['slug']}/): {m['resumo']} {len(CAT[m['slug']])} itens ([Markdown com a tabela completa]({BASE_URL}marcas/{m['slug']}/index.md))" for m in MARCAS]
    linhas += ["", "## Dados", "", f"- [Catálogo completo em JSON]({BASE_URL}catalogo.json): {TOTAL} itens das quatro fábricas, sem preço nem estoque", "",
               "## Legal", "", f"- [Termos de uso]({BASE_URL}termos/)", f"- [Política de privacidade (LGPD)]({BASE_URL}privacidade/)", "",
               "## Optional", "", f"- [Sitemap]({BASE_URL}sitemap.xml)"]
    return "\n".join(linhas) + "\n"


# ---------------------------------------------------------------- saída
def favicons() -> None:
    """Ícones reais no domínio raiz (o Google não rastreia favicon em data URI)."""
    def desenha(lado: int, cantos: bool) -> Image.Image:
        from PIL import ImageDraw
        k = 8
        n = 64 * k
        im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=14 * k if cantos else 0, fill="#051628")
        d.pieslice([12 * k, 12 * k, 52 * k, 52 * k], 90, 270, fill="#38c5eb")
        for (x1, y1, x2, y2) in [(32, 6, 32, 58), (40, 24, 48, 16), (42, 32, 52, 32), (40, 40, 48, 48)]:
            d.line([x1 * k, y1 * k, x2 * k, y2 * k], fill="#38c5eb", width=4 * k)
            for x, y in ((x1, y1), (x2, y2)):
                d.ellipse([(x - 2) * k, (y - 2) * k, (x + 2) * k, (y + 2) * k], fill="#38c5eb")
        return im.resize((lado, lado), Image.LANCZOS)
    for lado in (48, 96, 192, 512):
        desenha(lado, True).save(DIST / f"favicon-{lado}.png", optimize=True)
    desenha(180, False).convert("RGB").save(DIST / "apple-touch-icon.png", optimize=True)
    desenha(256, True).save(DIST / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    shutil.copyfile(DIST / "img" / "favicon.svg", DIST / "favicon.svg")
    (DIST / "site.webmanifest").write_text(json.dumps({
        "name": EMP["nome"], "short_name": "M.A Joaquim", "start_url": "/", "display": "standalone", "lang": "pt-BR",
        "background_color": "#051628", "theme_color": "#051628",
        "icons": [{"src": f"/favicon-{n}.png", "sizes": f"{n}x{n}", "type": "image/png"} for n in (192, 512)]}, ensure_ascii=False), encoding="utf-8")


def og_e_favicon() -> None:
    (DIST / "img").mkdir(parents=True, exist_ok=True)
    (DIST / "img" / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#051628"/>'
        '<path d="M32 12a20 20 0 0 0 0 40z" fill="#38c5eb"/><g stroke="#38c5eb" stroke-width="4" stroke-linecap="round">'
        '<path d="M32 6v52M40 24l8-8M42 32h10M40 40l8 8"/></g></svg>', encoding="utf-8")
    # og.jpg já fica em src/img (vem da capa do WhatsApp) e é copiado com o resto de src/


def main() -> int:
    # O Drive e o servidor de prévia às vezes seguram um arquivo aberto: limpa o que der e sobrescreve o resto.
    if DIST.exists():
        shutil.rmtree(DIST, ignore_errors=True)
    shutil.copytree(SRC, DIST, ignore=shutil.ignore_patterns("*.py", "alexandre-bunn-site-4x5.webp"), dirs_exist_ok=True)
    og_e_favicon()
    favicons()
    # a assinatura Flow Landing (src/css e src/img) é cópia de Agente-Landing-Pages/modelos/assinatura-flow-landing
    (DIST / "index.html").write_text(home(), encoding="utf-8")
    (DIST / "index.md").write_text(md_home(), encoding="utf-8")
    for m in MARCAS:
        d = DIST / "marcas" / m["slug"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(pagina_marca(m), encoding="utf-8")
        (d / "index.md").write_text(md_marca(m), encoding="utf-8")
    for caminho, dados_pag in institucionais().items():
        d = DIST / caminho
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(pagina_institucional(caminho, dados_pag), encoding="utf-8")
        (d / "index.md").write_text(md_institucional(caminho, dados_pag), encoding="utf-8")
    (DIST / "404.html").write_text(pagina_404(), encoding="utf-8")
    (DIST / "llms.txt").write_text(llms_txt(), encoding="utf-8")
    (DIST / "catalogo.json").write_text(json.dumps(catalogo_json(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    urls = [("", "1.0"), *[(f"marcas/{m['slug']}/", "0.9") for m in MARCAS], *[(k, "0.5") for k in institucionais()]]
    (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{BASE_URL}{u}</loc><lastmod>{HOJE}</lastmod><priority>{p}</priority></url>\n" for u, p in urls)
                                      + "</urlset>\n", encoding="utf-8")
    (DIST / "robots.txt").write_text(
        f"# {EMP['nome']}. Uso do conteúdo por máquinas (Content-Signal):\n"
        "# search = indexar em buscadores | ai-input = usar como contexto para responder, citando a fonte | ai-train = treinar modelos\n"
        "User-agent: *\nAllow: /\nContent-Signal: search=yes, ai-input=yes, ai-train=no\n\n"
        f"Sitemap: {BASE_URL}sitemap.xml\n", encoding="utf-8")
    (DIST / "CNAME").write_text(EMP["dominio"] + "\n", encoding="utf-8")
    (DIST / ".nojekyll").write_text("", encoding="utf-8")

    pend = []
    for p in DIST.rglob("*.html"):
        for mm in re.finditer(r"\[\[(PREENCHER|CONFIRMAR)[^\]]*\]\]", p.read_text(encoding="utf-8")):
            pend.append(f"{p.relative_to(DIST)}: {mm.group(0)}")
    tam = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file()) / 1e6
    print(f"dist/ gerado: {TOTAL} itens, {len(list(DIST.rglob('*.html')))} páginas, {tam:.1f} MB, medição {'LIGADA' if MEDE else 'desligada (sem IDs)'}")
    for x in sorted(set(pend)):
        print("PENDENTE", x)
    if "--publicar" in sys.argv and pend:
        print("Publicação bloqueada: resolva as pendências acima.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
