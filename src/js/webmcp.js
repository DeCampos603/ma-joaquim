/* ---------------------------------------------------------------------------
   WebMCP: ferramentas para agentes de IA que rodam no navegador (navigator.modelContext).
   - Só registra se o navegador oferecer a API; senão não faz nada.
   - Somente leitura: consulta o catálogo público (/catalogo.json) e devolve links.
     Nenhuma ferramenta envia mensagem, abre o WhatsApp ou grava dado: o link de
     cotação volta como texto para a PESSOA decidir abrir.
   - Fatos em sincronia com llms.txt e o JSON-LD (todos saem de dados/empresa.json no build).
   --------------------------------------------------------------------------- */
(function () {
  'use strict';
  var mc = navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;
  var EMP = window.MAJ_EMPRESA || {};
  var cache = null;
  function catalogo() {
    if (!cache) cache = fetch('/catalogo.json').then(function (r) { return r.json(); });
    return cache;
  }
  function texto(t) { return { content: [{ type: 'text', text: t }] }; }
  function sem(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

  var ferramentas = [
    {
      name: 'informacoes_empresa',
      description: 'Dados públicos da M.A Joaquim Representação: o que faz, fábricas representadas, área, horário e canais de contato. Preço e estoque não são divulgados no site.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: function () { return Promise.resolve(texto(EMP.resumo || '')); }
    },
    {
      name: 'buscar_no_catalogo',
      description: 'Busca itens no catálogo público das fábricas representadas (Suryha, SIBB, Coel, Perfiltec) por código ou nome. Devolve código, nome, seção e link da página. Sem preço nem estoque.',
      inputSchema: {
        type: 'object',
        properties: {
          termo: { type: 'string', description: 'Código ou parte do nome. Ex.: "SET-4371E-S", "capacitor 35", "curva 60".' },
          marca: { type: 'string', enum: ['suryha', 'sibb', 'coel', 'perfiltec'], description: 'Opcional: limita a uma fábrica.' },
          limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Máximo de resultados (padrão 15).' }
        },
        required: ['termo'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: function (a) {
        var termos = sem(a && a.termo).split(/\s+/).filter(Boolean);
        var lim = Math.min(50, Math.max(1, (a && a.limite) || 15));
        return catalogo().then(function (c) {
          var achados = c.itens.filter(function (i) {
            if (a.marca && i.marca_slug !== a.marca) return false;
            var alvo = sem([i.codigo, i.nome, i.secao, i.detalhe, i.marca, (i.oem || []).join(' ')].join(' '));
            return termos.every(function (t) { return alvo.indexOf(t) !== -1; });
          });
          if (!achados.length) return texto('Nada encontrado para "' + a.termo + '". As fábricas têm mais itens que o site: a cotação pode ser pedida com foto ou código pelo WhatsApp.');
          var linhas = achados.slice(0, lim).map(function (i) {
            return '- ' + i.marca + ' ' + (i.codigo || '(sem código)') + ': ' + i.nome + (i.secao ? ' [' + i.secao + ']' : '') + ' ' + i.url;
          });
          return texto(achados.length + ' item(ns). ' + (achados.length > lim ? 'Primeiros ' + lim + ':\n' : '\n') + linhas.join('\n'));
        });
      }
    },
    {
      name: 'gerar_link_cotacao',
      description: 'Monta o link do WhatsApp com uma mensagem de cotação já escrita (códigos e quantidades). Não envia nada: devolve o link para a pessoa abrir e revisar.',
      inputSchema: {
        type: 'object',
        properties: {
          itens: { type: 'array', items: { type: 'string' }, description: 'Linhas da lista, ex.: ["2x SET-4371E-S", "1x 80.151.050"].' },
          observacao: { type: 'string', description: 'Opcional, ex.: prazo desejado.' }
        },
        required: ['itens'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: function (a) {
        var msg = 'Olá! Vim pelo site e quero uma cotação:\n' + (a.itens || []).map(function (l) { return '• ' + l; }).join('\n') +
          (a.observacao ? '\nObs.: ' + a.observacao : '');
        return Promise.resolve(texto('Link para a pessoa abrir no WhatsApp (' + (EMP.contato || '') + '): https://wa.me/' + EMP.whatsapp + '?text=' + encodeURIComponent(msg) +
          '\nPreço, prazo e disponibilidade vêm na resposta.'));
      }
    },
    {
      name: 'ir_para_pagina',
      description: 'Abre uma página pública do site.',
      inputSchema: {
        type: 'object',
        properties: { pagina: { type: 'string', enum: ['inicio', 'cliente', 'equivalencias', 'suryha', 'sibb', 'coel', 'perfiltec', 'sobre', 'contato', 'termos', 'privacidade'] } },
        required: ['pagina'],
        additionalProperties: false
      },
      execute: function (a) {
        var mapa = { inicio: '/', cliente: '/cliente/', equivalencias: '/equivalencias/', sobre: '/sobre/', contato: '/contato/', termos: '/termos/', privacidade: '/privacidade/' };
        var destino = mapa[a.pagina] || '/marcas/' + a.pagina + '/';
        window.location.assign(destino);
        return Promise.resolve(texto('Abrindo ' + destino));
      }
    }
  ];
  ferramentas.forEach(function (f) { try { mc.registerTool(f); } catch (e) { /* já registrada */ } });
})();
