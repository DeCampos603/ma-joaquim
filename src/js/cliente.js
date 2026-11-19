/* M.A Joaquim Representação — Área do Cliente (/cliente/)
   Fluxo completo:
   - Autenticação (Google OAuth, E-mail/Senha, Modo Local offline)
   - Cadastro Nível 1 instantâneo com CNPJ + BrasilAPI + ViaCEP
   - Alternância Multi-CNPJ (Matriz / Filiais)
   - 8 ferramentas operacionais + Wizard Cadastral Nível 2 + Download .xlsx oficial
*/
(function (global) {
  'use strict';

  var MARCAS = [
    { slug: 'suryha', nome: 'Suryha', desc: 'Ferramentas HVAC-R e manifolds' },
    { slug: 'sibb', nome: 'SIBB', desc: 'Peças linha branca e mecânica' },
    { slug: 'coel', nome: 'Coel', desc: 'Controladores, relés e inversores' },
    { slug: 'perfiltec', nome: 'Perfiltec', desc: 'Perfis e componentes de montagem' }
  ];

  var BANCOS_FEBRABAN = [
    ['001', 'Banco do Brasil'], ['033', 'Santander'], ['041', 'Banrisul'],
    ['077', 'Banco Inter'], ['104', 'Caixa Econômica Federal'], ['208', 'BTG Pactual'],
    ['212', 'Banco Original'], ['237', 'Bradesco'], ['260', 'Nubank'],
    ['290', 'PagSeguro'], ['318', 'Banco BMG'], ['323', 'Mercado Pago'],
    ['336', 'Banco C6'], ['341', 'Itaú Unibanco'], ['380', 'PicPay'],
    ['403', 'Cora'], ['422', 'Banco Safra'], ['623', 'Banco Pan'],
    ['655', 'Banco Votorantim'], ['707', 'Banco Daycoval'], ['748', 'Sicredi'],
    ['756', 'Sicoob']
  ];

  var ROTULOS_FABRICA = {
    nao_solicitado: 'Não solicitado',
    pendente_envio: 'Aguardando envio à fábrica',
    em_analise: 'Em análise na fábrica',
    aprovado: 'Cadastro aprovado',
    pendencia_documento: 'Pendência cadastral'
  };

  var ROTULOS_COTACAO = {
    rascunho: 'Rascunho',
    enviada: 'Enviada',
    em_atendimento: 'Em atendimento',
    respondida: 'Respondida',
    fechou_pedido: 'Pedido fechado',
    nao_fechou: 'Encerrada'
  };

  var ROTULOS_VISITA = {
    solicitada: 'Solicitada',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    remarcada: 'Remarcada',
    cancelada: 'Cancelada'
  };

  var ROTULOS_CHAMADO = {
    aberto: 'Aberto',
    em_andamento: 'Em andamento',
    resolvido: 'Resolvido'
  };

  var TIPOS_POS_VENDA = {
    segunda_via_boleto: '2ª via de boleto',
    xml_nfe: 'XML / DANFE de NF-e',
    rastreio_entrega: 'Rastreio de entrega / transportadora',
    garantia_avaria: 'Garantia ou avaria de transporte',
    outro: 'Outro assunto pós-venda'
  };

  var OBJETIVOS_VISITA = {
    lancamentos_amostras: 'Apresentação de lançamentos e amostras',
    negociacao_volume: 'Negociação comercial de reposição',
    treinamento_balcao: 'Treinamento técnico de balcão / vendedores',
    pos_venda_garantia: 'Alinhamento pós-venda / pendência',
    outro: 'Outra pauta presencial'
  };

  var CHAVE_LISTA = 'majoaquim:lista';
  var ZAP_ALEXANDRE = '5521996147784';

  var estado = {
    sessao: null,
    contexto: null,
    empresaAtivaId: null,
    abaAuth: 'entrar',
    abaApp: 'resumo',
    passoFicha: 1,
    novoCnpjAberto: false,
    obsMarcas: { suryha: '', sibb: '', coel: '', perfiltec: '' },
    obsGeral: '',
    filtroHistMarca: '',
    filtroHistStatus: '',
    filtroHistPeriodo: '',
    buscaCatalogo: '',
    buscaOem: '',
    catalogo: [],
    oem: [],
    timerBuscaZero: null,
    toastTimer: null
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function semAcento(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function apenasDig(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function fmtCnpj(v) {
    var d = apenasDig(v);
    if (d.length !== 14) return String(v || '');
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function fmtData(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR');
    } catch (_e) {
      return String(iso).slice(0, 10);
    }
  }

  function validarCNPJ(cnpj) {
    var d = apenasDig(cnpj);
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    var calc = function (base, pesos) {
      var soma = 0;
      for (var i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
      var resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    var p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var d1 = calc(d, p1);
    var d2 = calc(d, p2);
    return Number(d[12]) === d1 && Number(d[13]) === d2;
  }

  function detectarCorredorRJ(cidade, cep) {
    var cid = semAcento(cidade || '');
    var cNum = Number(apenasDig(cep).slice(0, 5) || '0');
    if (/macae|campos|cabo frio|rio das ostras|araruama|sao pedro|saquarema|buzios|iguaba|casimiro/.test(cid) || (cNum >= 27900 && cNum <= 28999)) {
      return { rota: 'Norte Fluminense / Região dos Lagos', rep: 'Deivid', wa: '5522997329367' };
    }
    if (/volta redonda|barra mansa|resende|barra do pirai|valenca|tres rios|angra|paraty/.test(cid) || (cNum >= 27100 && cNum <= 27899)) {
      return { rota: 'Sul Fluminense / Médio Paraíba', rep: 'Alexandre Bunn', wa: ZAP_ALEXANDRE };
    }
    if (/petropolis|teresopolis|nova friburgo|cachoeiras/.test(cid) || (cNum >= 25600 && cNum <= 25999) || (cNum >= 28600 && cNum <= 28699)) {
      return { rota: 'Região Serrana', rep: 'Alexandre Bunn', wa: ZAP_ALEXANDRE };
    }
    if (/duque de caxias|nova iguacu|sao joao|belford|nilopolis|mesquita|queimados|mage/.test(cid) || (cNum >= 25000 && cNum <= 26999)) {
      return { rota: 'Baixada Fluminense', rep: 'Alexandre Bunn', wa: ZAP_ALEXANDRE };
    }
    if (/niteroi|sao goncalo|marica|itaborai/.test(cid) || (cNum >= 24000 && cNum <= 24999)) {
      return { rota: 'Leste Metropolitano (Niterói / São Gonçalo / Maricá)', rep: 'Alexandre Bunn', wa: ZAP_ALEXANDRE };
    }
    if (/rio de janeiro/.test(cid) || (cNum >= 20000 && cNum <= 23999)) {
      return { rota: 'Capital RJ (Centro / Zonas Norte, Sul e Oeste)', rep: 'Alexandre Bunn', wa: ZAP_ALEXANDRE };
    }
    return { rota: 'Atendimento Estadual RJ (rota sob confirmação)', rep: 'Alexandre Bunn', wa: ZAP_ALEXANDRE };
  }

  function lerLista() {
    try {
      var arr = JSON.parse(localStorage.getItem(CHAVE_LISTA) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function salvarLista(itens) {
    localStorage.setItem(CHAVE_LISTA, JSON.stringify(itens || []));
    var total = (itens || []).length;
    document.querySelectorAll('[data-lista-n]').forEach(function (el) {
      el.textContent = String(total);
    });
    global.dispatchEvent(new CustomEvent('majoaquim:lista-cli-alterada'));
  }

  function resolverImgPathname(raw) {
    try {
      return new URL(raw || '../img/sem-foto.svg', global.location.href).pathname;
    } catch (_e) {
      return '../img/sem-foto.svg';
    }
  }

  function adicionarItemLista(item, qtdExtra) {
    var lista = lerLista();
    var qtd = Math.max(1, Number(qtdExtra || 1));
    var id = item.id || ((item.s || item.marcaSlug || item.marca || '') + ':' + (item.c || item.codigo || item.n || item.nome));
    var existe = lista.find(function (x) { return x.id === id; });
    if (existe) {
      existe.qtd = Number(existe.qtd || 1) + qtd;
    } else {
      var rawImg = item.i ? ('../' + String(item.i).replace(/^\.\.\//, '')) : (item.img || '');
      if (!rawImg && (item.c || item.codigo) && estado.catalogo.length) {
        var codRef = semAcento(item.c || item.codigo);
        var catHit = estado.catalogo.find(function (x) { return semAcento(x.c) === codRef; });
        if (catHit && catHit.i) rawImg = '../' + String(catHit.i).replace(/^\.\.\//, '');
      }
      rawImg = rawImg || '../img/sem-foto.svg';
      lista.push({
        id: id,
        marca: item.m || item.marcaNome || item.marca || '',
        cod: item.c || item.codigo || '',
        nome: item.n || item.nome || '',
        img: resolverImgPathname(rawImg),
        qtd: qtd
      });
    }
    salvarLista(lista);
    return lista;
  }

  function mostrarToast(msg) {
    var el = document.getElementById('cli-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(estado.toastTimer);
    estado.toastTimer = setTimeout(function () { el.hidden = true; }, 4500);
  }

  async function carregarIndices() {
    try {
      var cEl = document.getElementById('indice-catalogo');
      if (cEl && cEl.textContent.trim().length > 2) {
        estado.catalogo = JSON.parse(cEl.textContent);
      } else if (typeof fetch === 'function') {
        var rCat = await fetch('../catalogo.json');
        if (rCat && rCat.ok) {
          var jCat = await rCat.json();
          estado.catalogo = (jCat.itens || []).map(function (it) {
            return {
              m: it.marca || '',
              s: it.marca_slug || '',
              c: it.codigo || '',
              n: it.nome || '',
              x: it.secao || '',
              i: String(it.imagem || '').replace(/^https?:\/\/[^/]+\//, '')
            };
          });
        }
      }
    } catch (_e) { estado.catalogo = []; }

    try {
      var oEl = document.getElementById('indice-oem');
      if (oEl && oEl.textContent.trim().length > 2) {
        estado.oem = JSON.parse(oEl.textContent);
      } else if (typeof fetch === 'function') {
        var rOem = await fetch('../conversor-oem.json');
        if (rOem && rOem.ok) {
          var jOem = await rOem.json();
          estado.oem = jOem.itens || [];
        }
      }
    } catch (_e) { estado.oem = []; }
  }

  function kitsIniciaisCatalogo() {
    var porMarca = { coel: [], sibb: [], suryha: [], perfiltec: [] };
    estado.catalogo.forEach(function (it) {
      if (porMarca[it.s] && porMarca[it.s].length < 4 && it.c) porMarca[it.s].push(it);
    });
    var defs = [];
    if (porMarca.coel.length) {
      defs.push({
        id: 'starter-coel',
        nome: 'Kit Automação & Refrigeração Coel',
        descricao: 'Controladores e inversores de maior saída em balcões técnicos.',
        starter: true,
        itens: porMarca.coel.map(function (it) { return { id: it.s + ':' + it.c, marca: it.m, cod: it.c, nome: it.n, img: '../' + it.i, qtd: 2 }; })
      });
    }
    if (porMarca.sibb.length) {
      defs.push({
        id: 'starter-sibb',
        nome: 'Kit Reposição Linha Branca SIBB',
        descricao: 'Componentes essenciais de giro para manutenção de lavadoras e refrigeradores.',
        starter: true,
        itens: porMarca.sibb.map(function (it) { return { id: it.s + ':' + it.c, marca: it.m, cod: it.c, nome: it.n, img: '../' + it.i, qtd: 3 }; })
      });
    }
    if (porMarca.suryha.length || porMarca.perfiltec.length) {
      var mix = porMarca.suryha.slice(0, 2).concat(porMarca.perfiltec.slice(0, 2));
      defs.push({
        id: 'starter-campo',
        nome: 'Kit Bancada & Instalação Suryha / Perfiltec',
        descricao: 'Ferramentas e componentes de instalação rápida.',
        starter: true,
        itens: mix.map(function (it) { return { id: it.s + ':' + it.c, marca: it.m, cod: it.c, nome: it.n, img: '../' + it.i, qtd: 1 }; })
      });
    }
    return defs;
  }

  async function consultarBrasilAPI(cnpjStr) {
    var dig = apenasDig(cnpjStr);
    if (dig.length !== 14) throw new Error('Informe os 14 dígitos do CNPJ.');
    var r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + dig);
    if (!r.ok) throw new Error('Receita/BrasilAPI não localizou este CNPJ.');
    var d = await r.json();
    return {
      cnpj: dig,
      razao_social: d.razao_social || '',
      nome_fantasia: d.nome_fantasia || '',
      cep: apenasDig(d.cep || ''),
      endereco: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '),
      numero: d.numero || '',
      complemento: d.complemento || '',
      bairro: d.bairro || '',
      cidade: d.municipio || '',
      uf: (d.uf || 'RJ').toUpperCase(),
      telefone_fixo_1: d.ddd_telefone_1 || '',
      telefone_fixo_2: d.ddd_telefone_2 || '',
      email_geral: d.email || '',
      tributacao: d.opcao_pelo_simples ? 'simples_nacional' : ''
    };
  }

  async function consultarViaCEP(cepStr) {
    var dig = apenasDig(cepStr);
    if (dig.length !== 8) throw new Error('CEP deve ter 8 dígitos.');
    var r = await fetch('https://viacep.com.br/ws/' + dig + '/json/');
    if (!r.ok) throw new Error('ViaCEP indisponível no momento.');
    var d = await r.json();
    if (d.erro) throw new Error('CEP não encontrado.');
    return {
      endereco: d.logradouro || '',
      bairro: d.bairro || '',
      cidade: d.localidade || '',
      uf: (d.uf || 'RJ').toUpperCase()
    };
  }

  function atualizarCabecalhoSessao() {
    var pill = document.getElementById('cli-sessao-pill');
    if (!pill) return;
    if (!estado.sessao || !estado.sessao.user) {
      pill.innerHTML = '<span class="cli-badge-modo cli-badge-modo--local">Visitante</span><span>Entre para salvar cotações e sua ficha cadastral</span>';
      return;
    }
    var email = estado.sessao.user.email || 'Conta local';
    var ehNuvem = estado.contexto && estado.contexto.modo === 'supabase';
    pill.innerHTML =
      '<span class="cli-badge-modo ' + (ehNuvem ? 'cli-badge-modo--nuvem' : 'cli-badge-modo--local') + '">' +
        (ehNuvem ? 'Nuvem Supabase' : 'Modo Local') +
      '</span>' +
      '<span><strong>' + esc(email) + '</strong></span>' +
      '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="sair">Sair</button>';
  }

  /* ========================================================================
     RENDERIZAÇÃO: 1. TELA DE AUTENTICAÇÃO
     ======================================================================== */
  function renderAuth(root) {
    var aba = estado.abaAuth;
    root.innerHTML =
      '<div class="cli-auth-grade">' +
        '<div class="cli-card">' +
          '<div class="cli-card__cab"><div><h2>Acesse sua Área do Cliente</h2><p class="cli-subtxt">Entre com sua conta Google empresarial ou e-mail para liberar histórico, conversor OEM e ficha cadastral oficial.</p></div></div>' +
          '<button type="button" class="cli-btn-google" data-acao="login-google">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5H1.2v3.1C3.2 21.4 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.2C.4 8.2 0 10.1 0 12s.4 3.8 1.2 5.4l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.2 2.6 1.2 6.6l4 3.1c.9-2.8 3.6-4.9 6.8-4.9z"/></svg>' +
            '<span>Entrar com Google em 1 clique</span>' +
          '</button>' +
          '<div class="cli-divisor">ou por e-mail corporativo</div>' +
          '<div class="cli-auth-abas" role="tablist">' +
            '<button type="button" class="cli-auth-aba" role="tab" aria-selected="' + (aba === 'entrar') + '" data-auth-aba="entrar">Já tenho conta</button>' +
            '<button type="button" class="cli-auth-aba" role="tab" aria-selected="' + (aba === 'criar') + '" data-auth-aba="criar">Criar perfil B2B</button>' +
            '<button type="button" class="cli-auth-aba" role="tab" aria-selected="' + (aba === 'recuperar') + '" data-auth-aba="recuperar">Esqueci a senha</button>' +
          '</div>' +
          '<div id="cli-auth-msg"></div>' +
          '<form id="form-auth" class="cli-form-grade">' +
            (aba === 'criar' ? '<div class="cli-campo cli-col-12"><label for="auth-nome">Seu nome / comprador</label><input id="auth-nome" name="nome" required autocomplete="name" placeholder="Ex.: Carlos Henrique"></div>' : '') +
            '<div class="cli-campo cli-col-12"><label for="auth-email">E-mail de compras ou empresarial</label><input id="auth-email" name="email" type="email" required autocomplete="email" placeholder="compras@sualoja.com.br"></div>' +
            (aba !== 'recuperar' ? '<div class="cli-campo cli-col-12"><label for="auth-senha">Senha</label><input id="auth-senha" name="senha" type="password" minlength="6" required autocomplete="' + (aba === 'criar' ? 'new-password' : 'current-password') + '" placeholder="Mínimo 6 caracteres"></div>' : '') +
            '<div class="cli-col-12 cli-acoes">' +
              '<button type="submit" class="cli-btn cli-btn--prim">' + (aba === 'criar' ? 'Criar perfil e continuar' : (aba === 'recuperar' ? 'Enviar link de redefinição' : 'Entrar no portal do cliente')) + '</button>' +
              '<button type="button" class="cli-btn cli-btn--sec" data-acao="entrar-local" title="Salva no navegador mesmo sem conexão ao servidor">Continuar no modo navegador (sem login em nuvem)</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
        '<div class="cli-card">' +
          '<div class="cli-card__cab"><div><h2>O que sua loja ganha ao se cadastrar</h2><p class="cli-subtxt">Um único perfil B2B para comprar direto das 4 fábricas com atendimento no Rio de Janeiro.</p></div></div>' +
          '<ul class="cli-beneficios">' +
            '<li><span class="cli-beneficios__n">1</span><div><strong>Ficha Cadastral Única (.xlsx oficial)</strong><br><span class="cli-subtxt">Preencha seus dados fiscais e bancários 1 vez com busca por CNPJ/CEP e baixe a planilha oficial M.A Joaquim pronta para aprovação nas 4 fábricas.</span></div></li>' +
            '<li><span class="cli-beneficios__n">2</span><div><strong>Cotação Multi-Fábrica e Colagem em Lote</strong><br><span class="cli-subtxt">Monte pedidos mistos (Suryha, SIBB, Coel e Perfiltec), cole códigos e quantidades em massa e gere PDF ou envio estruturado por WhatsApp.</span></div></li>' +
            '<li><span class="cli-beneficios__n">3</span><div><strong>Conversor Técnico OEM e Controladores</strong><br><span class="cli-subtxt">Consulte centenas de códigos originais de linha branca e referências de controladores Coel, adicionando direto à sua lista.</span></div></li>' +
            '<li><span class="cli-beneficios__n">4</span><div><strong>Kits de Giro, Histórico, Visitas e Pós-Venda</strong><br><span class="cli-subtxt">Repita pedidos antigos em 1 clique, agende visita na rota do seu CEP (.ics / Google Agenda) e peça 2ª via de boleto ou XML de NF-e.</span></div></li>' +
          '</ul>' +
        '</div>' +
      '</div>';
  }

  /* ========================================================================
     RENDERIZAÇÃO: 2. ONBOARDING NÍVEL 1 (PRIMEIRO CNPJ / NOVO CNPJ)
     ======================================================================== */
  function renderOnboardingNivel1(root, podeVoltar) {
    root.innerHTML =
      '<div class="cli-card">' +
        '<div class="cli-card__cab">' +
          '<div><h2>Passo 1 · Vincular CNPJ da Loja / Filial</h2><p class="cli-subtxt">Digite o CNPJ e clique em <strong>Consultar CNPJ</strong> para preencher razão social e endereço automaticamente.</p></div>' +
          (podeVoltar ? '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="cancelar-novo-cnpj">Voltar para empresa ativa</button>' : '') +
        '</div>' +
        '<div id="cli-n1-msg"></div>' +
        '<form id="form-nivel1" class="cli-form-grade">' +
          '<div class="cli-campo cli-col-6"><label for="n1-cnpj">CNPJ *</label><div class="cli-campo--inline"><input id="n1-cnpj" name="cnpj" required inputmode="numeric" placeholder="00.000.000/0001-00"><button type="button" class="cli-btn cli-btn--sec" data-acao="buscar-cnpj-n1">Consultar CNPJ</button></div><small>Validação automática dos dígitos verificadores (Receita Federal / BrasilAPI).</small></div>' +
          '<div class="cli-campo cli-col-6"><label for="n1-razao">Razão Social *</label><input id="n1-razao" name="razao_social" required placeholder="RAZÃO SOCIAL LTDA"></div>' +
          '<div class="cli-campo cli-col-6"><label for="n1-fantasia">Nome Fantasia</label><input id="n1-fantasia" name="nome_fantasia" placeholder="Nome comercial da loja"></div>' +
          '<div class="cli-campo cli-col-3"><label for="n1-zap">WhatsApp comercial *</label><input id="n1-zap" name="celular_whatsapp" required inputmode="tel" placeholder="(21) 99999-9999"></div>' +
          '<div class="cli-campo cli-col-3"><label for="n1-tel">Telefone fixo</label><input id="n1-tel" name="telefone_fixo_1" inputmode="tel" placeholder="(21) 2222-2222"></div>' +
          '<div class="cli-campo cli-col-3"><label for="n1-cep">CEP *</label><div class="cli-campo--inline"><input id="n1-cep" name="cep" required inputmode="numeric" placeholder="00000-000"><button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="buscar-cep-n1">CEP</button></div></div>' +
          '<div class="cli-campo cli-col-6"><label for="n1-end">Logradouro / Endereço</label><input id="n1-end" name="endereco" placeholder="Rua, Avenida..."></div>' +
          '<div class="cli-campo cli-col-3"><label for="n1-num">Número</label><input id="n1-num" name="numero" placeholder="Nº"></div>' +
          '<div class="cli-campo cli-col-4"><label for="n1-comp">Complemento</label><input id="n1-comp" name="complemento" placeholder="Loja, Sala, Galpão"></div>' +
          '<div class="cli-campo cli-col-4"><label for="n1-bairro">Bairro</label><input id="n1-bairro" name="bairro"></div>' +
          '<div class="cli-campo cli-col-3"><label for="n1-cidade">Cidade *</label><input id="n1-cidade" name="cidade" required value="Rio de Janeiro"></div>' +
          '<div class="cli-campo cli-col-1"><label for="n1-uf">UF</label><input id="n1-uf" name="uf" maxlength="2" value="RJ"></div>' +
          '<div class="cli-campo cli-col-4"><label for="n1-contato">Seu nome (Comprador) *</label><input id="n1-contato" name="contato_comercial" required placeholder="Nome completo"></div>' +
          '<div class="cli-campo cli-col-4"><label for="n1-cargo">Cargo</label><input id="n1-cargo" name="cargo" placeholder="Comprador / Sócio / Gerente"></div>' +
          '<div class="cli-campo cli-col-4"><label for="n1-email">E-mail de compras *</label><input id="n1-email" name="email_compras" type="email" required value="' + esc(estado.sessao && estado.sessao.user ? estado.sessao.user.email : '') + '"></div>' +
          '<div class="cli-col-12">' +
            '<label style="display:flex;gap:10px;align-items:flex-start;font-size:.9rem;color:var(--tinta-2)">' +
              '<input type="checkbox" name="lgpd" required style="width:20px;height:20px;margin-top:2px">' +
              '<span>Autorizo a <strong>M.A Joaquim Representação</strong> a utilizar estes dados cadastrais para cotações B2B e abertura de cadastro nas fábricas representadas (Suryha, SIBB, Coel e Perfiltec), conforme a <a href="../privacidade/">Política de Privacidade (LGPD)</a>.</span>' +
            '</label>' +
          '</div>' +
          '<div class="cli-col-12 cli-acoes">' +
            '<button type="submit" class="cli-btn cli-btn--prim">Concluir acesso rápido (Nível 1)</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  /* ========================================================================
     RENDERIZAÇÃO: 3. SHELL AUTENTICADO COM AS 8 FERRAMENTAS
     ======================================================================== */
  function nomeMarca(slug) {
    var m = MARCAS.find(function (x) { return x.slug === slug; });
    return m ? m.nome : slug;
  }

  function renderBarraEmpresa(ctx) {
    var emp = ctx.empresaAtiva;
    var corredor = detectarCorredorRJ(emp.cidade, emp.cep);
    var opts = ctx.empresas.map(function (e) {
      return '<option value="' + esc(e.id) + '"' + (e.id === emp.id ? ' selected' : '') + '>' +
        esc(e.razao_social) + ' (' + esc(fmtCnpj(e.cnpj)) + ')' +
      '</option>';
    }).join('');

    return '<div class="cli-empresa-bar">' +
      '<div class="cli-empresa-bar__dados">' +
        '<div>' +
          '<small style="display:block;color:var(--tinta-2);font-weight:700">EMPRESA ATIVA (MULTI-CNPJ)</small>' +
          '<select aria-label="Selecionar empresa ativa" data-select-empresa>' + opts + '</select>' +
        '</div>' +
        '<div>' +
          '<span class="cli-status cli-status--' + (emp.nivel_cadastro === 2 ? 'aprovado' : 'pendente_envio') + '">' +
            (emp.nivel_cadastro === 2 ? 'Ficha Nível 2 completa' : 'Cadastro Nível 1 (básico)') +
          '</span>' +
          '<div class="cli-subtxt" style="font-size:.82rem">Corredor: <strong>' + esc(corredor.rota) + '</strong> · Rep.: ' + esc(corredor.rep) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cli-acoes">' +
        '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="abrir-novo-cnpj">+ Vincular outra filial/CNPJ</button>' +
        '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-acao="baixar-xlsx-geral">Baixar Ficha (.xlsx)</button>' +
      '</div>' +
    '</div>';
  }

  function renderPainelResumo(ctx) {
    var aprovadas = ctx.fabricas.filter(function (f) { return f.status === 'aprovado'; }).length;
    var cardsFab = MARCAS.map(function (m) {
      var fab = ctx.fabricas.find(function (f) { return f.marca_slug === m.slug; }) || { marca_slug: m.slug, status: 'nao_solicitado' };
      var st = fab.status || 'nao_solicitado';
      return '<article class="cli-fabrica cli-fabrica--' + esc(m.slug) + '">' +
        '<div>' +
          '<h3>' + esc(m.nome) + '</h3>' +
          '<p class="cli-subtxt" style="font-size:.84rem">' + esc(m.desc) + '</p>' +
        '</div>' +
        '<div>' +
          '<span class="cli-status cli-status--' + esc(st) + '">' + esc(ROTULOS_FABRICA[st] || st) + '</span>' +
          (fab.codigo_cliente_fabrica ? '<p class="cli-subtxt" style="font-size:.82rem;margin-top:6px">Cód. na fábrica: <strong>' + esc(fab.codigo_cliente_fabrica) + '</strong></p>' : '') +
          (fab.observacao_representante ? '<p class="cli-subtxt" style="font-size:.82rem">' + esc(fab.observacao_representante) + '</p>' : '') +
        '</div>' +
        '<div class="cli-acoes">' +
          ((st === 'nao_solicitado' || st === 'pendencia_documento')
            ? '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-solicitar-fab="' + esc(m.slug) + '">Solicitar cadastro</button>'
            : '') +
          '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-xlsx-fab="' + esc(m.nome) + '">.xlsx ' + esc(m.nome) + '</button>' +
        '</div>' +
      '</article>';
    }).join('');

    // Radar simples de itens mais cotados e volume por fábrica
    var contagemItens = {};
    var volMarca = { suryha: 0, sibb: 0, coel: 0, perfiltec: 0 };
    var totalPecas = 0;
    ctx.cotacoes.forEach(function (c) {
      (c.site_cotacao_itens || []).forEach(function (it) {
        var chave = (it.codigo || it.nome) + '|' + (it.marca_nome || '');
        if (!contagemItens[chave]) contagemItens[chave] = { marca: it.marca_nome, cod: it.codigo, nome: it.nome, vezes: 0 };
        contagemItens[chave].vezes++;
        var slugM = semAcento(it.marca_slug || it.marca_nome || '');
        var qItem = Math.max(1, Number(it.quantidade || 1));
        if (Object.prototype.hasOwnProperty.call(volMarca, slugM)) {
          volMarca[slugM] += qItem;
        }
        totalPecas += qItem;
      });
    });
    var radar = Object.values(contagemItens).sort(function (a, b) { return b.vezes - a.vezes; }).slice(0, 6);

    // Indicadores de ciclo de recompra
    var cotOrd = (ctx.cotacoes || []).slice().sort(function (a, b) {
      return new Date(b.criada_em || 0).getTime() - new Date(a.criada_em || 0).getTime();
    });
    var diasDesdeUltima = cotOrd.length ? Math.max(0, Math.floor((Date.now() - new Date(cotOrd[0].criada_em).getTime()) / 86400000)) : null;
    var intervaloMedio = null;
    if (cotOrd.length >= 2) {
      var spanDias = Math.max(1, Math.round((new Date(cotOrd[0].criada_em).getTime() - new Date(cotOrd[cotOrd.length - 1].criada_em).getTime()) / 86400000));
      intervaloMedio = Math.max(1, Math.round(spanDias / (cotOrd.length - 1)));
    }
    var coresMarca = { suryha: '#0d75c0', sibb: '#0076c4', coel: '#e2231a', perfiltec: '#16a34a' };
    var maxVol = Math.max(1, volMarca.suryha, volMarca.sibb, volMarca.coel, volMarca.perfiltec);
    var svgBarras = '<svg viewBox="0 0 560 152" width="100%" height="152" role="img" aria-label="Volume de itens cotados por fábrica">' +
      MARCAS.map(function (m, idx) {
        var y = 14 + idx * 34;
        var val = volMarca[m.slug] || 0;
        var wBar = Math.round((val / maxVol) * 330);
        return '<g transform="translate(0,' + y + ')">' +
          '<text x="0" y="17" fill="#092038" font-size="13" font-weight="700">' + esc(m.nome) + '</text>' +
          '<rect x="92" y="3" width="330" height="20" rx="6" fill="#eef3f8"></rect>' +
          (wBar > 0 ? '<rect x="92" y="3" width="' + Math.max(8, wBar) + '" height="20" rx="6" fill="' + coresMarca[m.slug] + '"></rect>' : '') +
          '<text x="434" y="17" fill="#092038" font-size="12" font-weight="700">' + val + ' un.</text>' +
        '</g>';
      }).join('') +
    '</svg>';

    var materiaisHtml = '<div class="cli-kits-grade">' +
      MARCAS.map(function (m) {
        var temTabela = m.slug === 'suryha' || m.slug === 'coel';
        return '<article class="cli-kit-card">' +
          '<div><h3>' + esc(m.nome) + '</h3><p class="cli-subtxt" style="font-size:.86rem">' + esc(m.desc) + '</p></div>' +
          '<div class="cli-acoes">' +
            '<a class="cli-btn cli-btn--prim cli-btn--mini" href="../marcas/' + esc(m.slug) + '/#folhear">Folhear catálogo</a>' +
            (temTabela ? '<a class="cli-btn cli-btn--sec cli-btn--mini" href="../marcas/' + esc(m.slug) + '/#tabela">Tabela técnica</a>' : '') +
          '</div>' +
        '</article>';
      }).join('') +
    '</div>';

    return '<div class="cli-kpis">' +
        '<div class="cli-kpi"><small>Fábricas aprovadas</small><strong>' + aprovadas + ' / 4</strong></div>' +
        '<div class="cli-kpi"><small>Cotações registradas</small><strong>' + ctx.cotacoes.length + '</strong></div>' +
        '<div class="cli-kpi"><small>Kits salvos</small><strong>' + ctx.kits.length + '</strong></div>' +
        '<div class="cli-kpi"><small>Visitas / Chamados</small><strong>' + (ctx.visitas.length + ctx.chamados.length) + '</strong></div>' +
      '</div>' +
      (ctx.empresaAtiva.nivel_cadastro < 2
        ? '<div class="cli-alerta cli-alerta--aviso"><strong>Complete sua Ficha Cadastral (Nível 2):</strong> para abrir cadastro nas fábricas (Suryha, SIBB, Coel e Perfiltec) com faturamento B2B, preencha inscrição estadual, tributação, e-mail de XML NF-e e dados bancários. <button type="button" class="cli-btn cli-btn--prim cli-btn--mini" style="margin-left:8px" data-ir-aba="ficha">Completar Ficha agora →</button></div>'
        : '') +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h2>Semáforo de Cadastro nas 4 Fábricas</h2><p class="cli-subtxt">Acompanhe onde seu CNPJ já pode comprar e gere a ficha .xlsx oficial para novas aberturas.</p></div></div>' +
        '<div class="cli-semaforo">' + cardsFab + '</div>' +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h2>Radar de Reposição Inteligente</h2><p class="cli-subtxt">Itens que sua loja cota com frequência, prontos para reabastecer o carrinho.</p></div></div>' +
        (radar.length
          ? '<div class="cli-sugestoes">' + radar.map(function (r) {
              return '<div class="cli-sugestao"><div class="cli-sugestao__txt"><b>' + esc(r.nome) + '</b><small>' + esc(r.marca) + (r.cod ? ' · Cód. ' + esc(r.cod) : '') + ' · Cotado ' + r.vezes + 'x</small></div>' +
                '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-add-rapido="' + esc(r.cod || r.nome) + '" data-add-marca="' + esc(r.marca) + '" data-add-nome="' + esc(r.nome) + '">+ Lista</button></div>';
            }).join('') + '</div>'
          : '<p class="cli-subtxt">Assim que sua loja enviar a primeira cotação pela aba <strong>Cotador Multi-Fábrica</strong>, seus itens recorrentes aparecerão aqui para reposição em 1 clique.</p>') +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h2>Meu Painel de Compras &amp; Ciclo de Reposição</h2><p class="cli-subtxt">' +
          (diasDesdeUltima === null
            ? 'Envie sua primeira cotação para acompanhar a distribuição entre as 4 fábricas e o intervalo médio de reposição.'
            : 'Última cotação há <strong>' + diasDesdeUltima + ' dia(s)</strong> · Total de <strong>' + totalPecas + ' unidade(s)</strong> cotadas' + (intervaloMedio ? ' · Frequência média: a cada <strong>' + intervaloMedio + ' dias</strong>.' : '.')) +
        '</p></div></div>' +
        svgBarras +
        '<div class="cli-tabela-wrap" style="margin-top:12px"><table class="cli-tabela"><thead><tr><th>Fábrica</th><th>Unidades cotadas</th><th>Participação</th></tr></thead><tbody>' +
          MARCAS.map(function (m) {
            var v = volMarca[m.slug] || 0;
            var pct = totalPecas ? Math.round((v / totalPecas) * 100) : 0;
            return '<tr><td><strong>' + esc(m.nome) + '</strong></td><td>' + v + '</td><td>' + pct + '%</td></tr>';
          }).join('') +
        '</tbody></table></div>' +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h2>Folders, Catálogos e Tabelas Técnicas das 4 Fábricas</h2><p class="cli-subtxt">Acesse rapidamente o material oficial das fábricas representadas e as tabelas comparativas de capacitores e linha KM Coel.</p></div></div>' +
        materiaisHtml +
      '</div>';
  }

  function renderPainelCotador(ctx) {
    var lista = lerLista();
    var porMarca = {};
    lista.forEach(function (it, idx) {
      var m = (it.marca || 'Outros');
      (porMarca[m] = porMarca[m] || []).push(Object.assign({ _idx: idx }, it));
    });

    var blocosMarcas = Object.keys(porMarca).map(function (marcaNome) {
      var slug = semAcento(marcaNome);
      var obsM = estado.obsMarcas[slug] || '';
      var linhas = porMarca[marcaNome].map(function (it) {
        return '<tr>' +
          '<td><strong>' + esc(it.cod || '—') + '</strong></td>' +
          '<td>' + esc(it.nome) + '</td>' +
          '<td><div class="cli-qtd">' +
            '<button type="button" aria-label="Diminuir quantidade" data-qtd-menos="' + it._idx + '">−</button>' +
            '<input type="number" min="1" value="' + Number(it.qtd || 1) + '" aria-label="Quantidade" data-qtd-input="' + it._idx + '">' +
            '<button type="button" aria-label="Aumentar quantidade" data-qtd-mais="' + it._idx + '">+</button>' +
          '</div></td>' +
          '<td><button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-qtd-rem="' + it._idx + '">Remover</button></td>' +
        '</tr>';
      }).join('');

      return '<div style="margin-top:18px">' +
        '<h3 style="margin:0 0 8px;color:var(--navy-900)">' + esc(marcaNome) + ' (' + porMarca[marcaNome].length + ' itens)</h3>' +
        '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Código</th><th>Produto</th><th>Qtd</th><th>Ação</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        '<div class="cli-campo" style="margin-top:8px"><label for="obs-m-' + esc(slug) + '">Observação específica para ' + esc(marcaNome) + ' (prazo/condição)</label>' +
          '<input id="obs-m-' + esc(slug) + '" data-obs-marca="' + esc(slug) + '" value="' + esc(obsM) + '" placeholder="Ex.: Faturar em 28/56dd ou consultar equivalente">' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="cli-print-cab">' +
        '<h2>Solicitação de Cotação B2B — M.A Joaquim Representação</h2>' +
        '<p><strong>Empresa:</strong> ' + esc(ctx.empresaAtiva.razao_social) + ' · <strong>CNPJ:</strong> ' + esc(fmtCnpj(ctx.empresaAtiva.cnpj)) + '</p>' +
        '<p><strong>Cidade/UF:</strong> ' + esc(ctx.empresaAtiva.cidade || '') + '/' + esc(ctx.empresaAtiva.uf || 'RJ') + ' · <strong>WhatsApp:</strong> ' + esc(ctx.empresaAtiva.celular_whatsapp || '') + ' · <strong>Data:</strong> ' + esc(new Date().toLocaleDateString('pt-BR')) + '</p>' +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h2>Cotador Multi-Fábrica (823 itens)</h2><p class="cli-subtxt">Busque por código/nome/OEM ou cole sua lista inteira de compra. A lista fica sincronizada com o site.</p></div></div>' +
        '<div class="cli-form-grade">' +
          '<div class="cli-campo cli-col-12">' +
            '<label for="cot-busca">Adicionar produto do catálogo</label>' +
            '<input id="cot-busca" type="search" value="' + esc(estado.buscaCatalogo) + '" placeholder="Digite código ou descrição (ex.: VF20, prato micro-ondas, bomba dreno, manifold)...">' +
            '<div id="cot-sugestoes" class="cli-sugestoes"></div>' +
          '</div>' +
          '<div class="cli-campo cli-col-12">' +
            '<label for="cot-lote">Ou cole uma lista em lote (um item por linha: CÓDIGO x QTD ou CÓDIGO ; QTD)</label>' +
            '<textarea id="cot-lote" placeholder="Exemplos:\nSGU-1828A-S x 4\nVF20 2\nDC64-01827A; 5"></textarea>' +
            '<div class="cli-acoes" style="margin-top:6px">' +
              '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="importar-lote">Importar linhas para a cotação</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        (lista.length
          ? '<hr style="margin:20px 0;border:0;border-top:1px solid var(--borda)">' +
            blocosMarcas +
            '<div class="cli-campo" style="margin-top:16px"><label for="cot-obs-geral">Itens fora do catálogo / observações gerais da cotação</label>' +
              '<textarea id="cot-obs-geral" placeholder="Descreva peças com foto/medida específica, transportadora preferida ou urgência de entrega...">' + esc(estado.obsGeral) + '</textarea>' +
            '</div>' +
            '<div class="cli-acoes" style="margin-top:16px">' +
              '<button type="button" class="cli-btn cli-btn--zap" data-acao="enviar-cotacao-wa">Registrar no histórico e abrir WhatsApp</button>' +
              '<button type="button" class="cli-btn cli-btn--prim" data-acao="salvar-cotacao-db">Salvar cotação no histórico</button>' +
              '<button type="button" class="cli-btn cli-btn--sec" data-acao="imprimir-cotacao">Imprimir / Salvar PDF</button>' +
              '<button type="button" class="cli-btn cli-btn--sec" data-acao="limpar-lista-cli">Limpar lista</button>' +
            '</div>'
          : '<div class="cli-alerta cli-alerta--info" style="margin-top:16px">Sua lista está vazia. Use a busca acima, cole uma lista em lote ou carregue um dos <strong>Kits de Giro</strong>.</div>') +
      '</div>';
  }

  function renderPainelKits(ctx) {
    var listaAtual = lerLista();
    var kitsTodos = (ctx.kits || []).concat(kitsIniciaisCatalogo());
    var cards = kitsTodos.map(function (k) {
      var itens = Array.isArray(k.itens) ? k.itens : [];
      return '<article class="cli-kit-card">' +
        '<div>' +
          '<h3>' + esc(k.nome) + '</h3>' +
          '<p class="cli-subtxt" style="font-size:.86rem">' + esc(k.descricao || '') + '</p>' +
          '<ul style="margin:10px 0 0;padding-left:18px;font-size:.86rem;color:var(--tinta-2)">' +
            itens.slice(0, 6).map(function (it) {
              return '<li><strong>' + esc(it.qtd || 1) + 'x</strong> ' + esc(it.cod ? it.cod + ' — ' : '') + esc(it.nome) + '</li>';
            }).join('') +
            (itens.length > 6 ? '<li>... +' + (itens.length - 6) + ' itens</li>' : '') +
          '</ul>' +
        '</div>' +
        '<div class="cli-acoes">' +
          '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-carregar-kit="' + esc(k.id) + '">Carregar no cotador</button>' +
          (!k.starter ? '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-excluir-kit="' + esc(k.id) + '">Excluir</button>' : '') +
        '</div>' +
      '</article>';
    }).join('');

    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Meus Kits de Reposição Rápida</h2><p class="cli-subtxt">Monte listas padrão da sua loja e recarregue em 1 clique todo mês.</p></div></div>' +
      '<form id="form-novo-kit" class="cli-form-grade" style="margin-bottom:20px;padding:14px;background:var(--gelo-50);border-radius:12px;border:1px solid var(--borda)">' +
        '<div class="cli-campo cli-col-4"><label for="kit-nome">Salvar lista atual como novo Kit *</label><input id="kit-nome" name="nome" required placeholder="Ex.: Reposição Mensal Lavadoras"></div>' +
        '<div class="cli-campo cli-col-5"><label for="kit-desc">Descrição curta</label><input id="kit-desc" name="descricao" placeholder="Itens que giram toda semana no balcão"></div>' +
        '<div class="cli-col-3" style="display:flex;align-items:flex-end"><button type="submit" class="cli-btn cli-btn--prim" style="width:100%" ' + (listaAtual.length ? '' : 'disabled') + '>Salvar kit (' + listaAtual.length + ' itens)</button></div>' +
      '</form>' +
      '<div class="cli-kits-grade">' + cards + '</div>' +
    '</div>';
  }

  function renderPainelHistorico(ctx) {
    var diasMax = Number(estado.filtroHistPeriodo || 0);
    var agora = Date.now();
    var filtradas = ctx.cotacoes.filter(function (c) {
      if (estado.filtroHistStatus && c.status !== estado.filtroHistStatus) return false;
      if (diasMax > 0 && c.criada_em) {
        var diffDias = (agora - new Date(c.criada_em).getTime()) / 86400000;
        if (diffDias > diasMax) return false;
      }
      if (estado.filtroHistMarca) {
        var itens = c.site_cotacao_itens || [];
        var temMarca = itens.some(function (i) { return semAcento(i.marca_slug || i.marca_nome) === estado.filtroHistMarca; });
        if (!temMarca) return false;
      }
      return true;
    });

    var linhas = filtradas.map(function (c) {
      var itens = c.site_cotacao_itens || [];
      var marcas = Array.from(new Set(itens.map(function (i) { return i.marca_nome; }).filter(Boolean))).join(', ') || '—';
      return '<tr>' +
        '<td><strong>' + esc(c.numero || c.id) + '</strong><br><small class="cli-subtxt">' + esc(fmtData(c.criada_em)) + '</small></td>' +
        '<td>' + esc(marcas) + '<br><small class="cli-subtxt">' + itens.length + ' itens</small></td>' +
        '<td><span class="cli-status cli-status--' + esc(c.status) + '">' + esc(ROTULOS_COTACAO[c.status] || c.status) + '</span>' +
          (c.resposta_representante ? '<div class="cli-subtxt" style="font-size:.82rem;margin-top:4px">' + esc(c.resposta_representante) + '</div>' : '') +
        '</td>' +
        '<td><div class="cli-acoes">' +
          '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-repetir-cot="' + esc(c.id) + '">Repetir no cotador</button>' +
          '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-ver-cot="' + esc(c.id) + '">Ver itens</button>' +
          '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-imprimir-cot="' + esc(c.id) + '">Imprimir / PDF</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="cli-print-cab">' +
        '<h2>Histórico de Cotações — M.A Joaquim Representação</h2>' +
        '<p><strong>Empresa:</strong> ' + esc(ctx.empresaAtiva.razao_social) + ' · <strong>CNPJ:</strong> ' + esc(fmtCnpj(ctx.empresaAtiva.cnpj)) + '</p>' +
      '</div>' +
      '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Histórico de Cotações e Pedidos</h2><p class="cli-subtxt">Consulte cotações antigas, imprima espelhos e refaça pedidos recorrentes em 1 clique.</p></div></div>' +
      '<div class="cli-form-grade" style="margin-bottom:16px">' +
        '<div class="cli-campo cli-col-4"><label for="hist-marca">Filtrar por marca</label><select id="hist-marca" data-filtro-hist-marca>' +
          '<option value="">Todas as marcas</option>' +
          MARCAS.map(function (m) { return '<option value="' + m.slug + '"' + (estado.filtroHistMarca === m.slug ? ' selected' : '') + '>' + m.nome + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="cli-campo cli-col-4"><label for="hist-status">Filtrar por status</label><select id="hist-status" data-filtro-hist-status>' +
          '<option value="">Todos os status</option>' +
          Object.keys(ROTULOS_COTACAO).map(function (k) { return '<option value="' + k + '"' + (estado.filtroHistStatus === k ? ' selected' : '') + '>' + ROTULOS_COTACAO[k] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="cli-campo cli-col-4"><label for="hist-periodo">Período</label><select id="hist-periodo" data-filtro-hist-periodo>' +
          '<option value=""' + (!estado.filtroHistPeriodo ? ' selected' : '') + '>Todo o histórico</option>' +
          '<option value="30"' + (estado.filtroHistPeriodo === '30' ? ' selected' : '') + '>Últimos 30 dias</option>' +
          '<option value="90"' + (estado.filtroHistPeriodo === '90' ? ' selected' : '') + '>Últimos 90 dias</option>' +
          '<option value="365"' + (estado.filtroHistPeriodo === '365' ? ' selected' : '') + '>Último ano</option>' +
        '</select></div>' +
      '</div>' +
      (filtradas.length
        ? '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Cotação / Data</th><th>Marcas / Itens</th><th>Status</th><th>Ações</th></tr></thead><tbody>' + linhas + '</tbody></table></div><div id="hist-detalhe" style="margin-top:16px"></div>'
        : '<div class="cli-alerta cli-alerta--info">Nenhuma cotação encontrada para os filtros selecionados.</div>') +
    '</div>';
  }

  function renderPainelConversor() {
    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Conversor Técnico OEM & Controladores</h2><p class="cli-subtxt">Converta códigos originais de fabricantes (Samsung, LG, Brastemp, Electrolux → SIBB) e referências de controladores (Full Gauge / Novus → Coel).</p></div></div>' +
      '<div class="cli-campo">' +
        '<label for="conv-busca">Digite o código OEM, referência concorrente ou descrição</label>' +
        '<input id="conv-busca" type="search" value="' + esc(estado.buscaOem) + '" placeholder="Ex.: DC64-01827A, 4986EN1003A, MT-512E, TC-900E, N1020...">' +
      '</div>' +
      '<div id="conv-resultados" style="margin-top:16px"></div>' +
    '</div>';
  }

  function renderPainelVisitas(ctx) {
    var cor = detectarCorredorRJ(ctx.empresaAtiva.cidade, ctx.empresaAtiva.cep);
    var listaVis = ctx.visitas.map(function (v) {
      return '<tr>' +
        '<td><strong>' + esc(OBJETIVOS_VISITA[v.objetivo] || v.objetivo) + '</strong><br><small class="cli-subtxt">Pref.: ' + esc(v.data_preferida || 'A combinar') + ' · ' + esc(v.turno) + '</small></td>' +
        '<td>' + esc(v.corredor_sugerido || cor.rota) + '<br><small class="cli-subtxt">Rep.: ' + esc(v.representante_preferido || cor.rep) + '</small></td>' +
        '<td><span class="cli-status cli-status--' + esc(v.status) + '">' + esc(ROTULOS_VISITA[v.status] || v.status) + '</span>' +
          (v.resposta_representante ? '<div class="cli-subtxt" style="font-size:.82rem;margin-top:4px">' + esc(v.resposta_representante) + '</div>' : '') +
        '</td>' +
        '<td><div class="cli-acoes">' +
          '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-vis-ics="' + esc(v.id) + '">Baixar .ics</button>' +
          '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-vis-gcal="' + esc(v.id) + '">Google Agenda</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Solicitar Visita Presencial no RJ</h2><p class="cli-subtxt">Corredor logístico detectado pelo seu CEP/cidade: <strong>' + esc(cor.rota) + '</strong> (atendimento principal: <strong>' + esc(cor.rep) + '</strong>).</p></div></div>' +
      '<div id="cli-vis-msg"></div>' +
      '<form id="form-visita" class="cli-form-grade">' +
        '<div class="cli-campo cli-col-6"><label for="vis-obj">Objetivo da visita *</label><select id="vis-obj" name="objetivo" required>' +
          Object.keys(OBJETIVOS_VISITA).map(function (k) { return '<option value="' + k + '">' + OBJETIVOS_VISITA[k] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="cli-campo cli-col-3"><label for="vis-data">Data preferida</label><input id="vis-data" name="data_preferida" type="date"></div>' +
        '<div class="cli-campo cli-col-3"><label for="vis-turno">Turno</label><select id="vis-turno" name="turno"><option value="qualquer">Qualquer turno</option><option value="manha">Manhã (08h30–12h)</option><option value="tarde">Tarde (13h30–17h30)</option></select></div>' +
        '<div class="cli-campo cli-col-4"><label for="vis-rep">Representante preferido</label><select id="vis-rep" name="representante_preferido"><option value="Alexandre Bunn">Alexandre Bunn (Capital / Metropolitana / Sul)</option><option value="Deivid">Deivid (Norte Fluminense / Lagos)</option><option value="qualquer">Quem estiver na rota</option></select></div>' +
        '<div class="cli-campo cli-col-8"><label for="vis-obs">Pauta e endereço para chegada</label><input id="vis-obs" name="observacoes" value="' + esc([ctx.empresaAtiva.endereco, ctx.empresaAtiva.numero, ctx.empresaAtiva.bairro, ctx.empresaAtiva.cidade].filter(Boolean).join(', ')) + '" placeholder="Ponto de referência ou linhas que deseja ver amostras"></div>' +
        '<div class="cli-col-12 cli-acoes"><button type="submit" class="cli-btn cli-btn--prim">Solicitar visita presencial</button></div>' +
      '</form>' +
      (ctx.visitas.length ? '<h3 style="margin:24px 0 10px">Suas solicitações de visita</h3><div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Objetivo / Data</th><th>Corredor / Rep.</th><th>Status</th><th>Agenda</th></tr></thead><tbody>' + listaVis + '</tbody></table></div>' : '') +
    '</div>';
  }

  function renderPainelPosVenda(ctx) {
    var linhas = ctx.chamados.map(function (ch) {
      return '<tr>' +
        '<td><strong>' + esc(nomeMarca(ch.marca_slug)) + '</strong> · ' + esc(TIPOS_POS_VENDA[ch.tipo] || ch.tipo) + '<br><small class="cli-subtxt">' + esc(fmtData(ch.criado_em)) + (ch.numero_nf_ou_pedido ? ' · NF/Ped: ' + esc(ch.numero_nf_ou_pedido) : '') + '</small></td>' +
        '<td>' + esc(ch.descricao) + '</td>' +
        '<td><span class="cli-status cli-status--' + esc(ch.status) + '">' + esc(ROTULOS_CHAMADO[ch.status] || ch.status) + '</span>' +
          (ch.resposta_representante ? '<div class="cli-subtxt" style="font-size:.82rem;margin-top:4px">' + esc(ch.resposta_representante) + '</div>' : '') +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Central Pós-Venda</h2><p class="cli-subtxt">Peça 2ª via de boleto, reenvio de XML NF-e, rastreio de transportadora ou suporte de garantia direto com a M.A Joaquim.</p></div></div>' +
      '<div id="cli-pos-msg"></div>' +
      '<form id="form-posvenda" class="cli-form-grade">' +
        '<div class="cli-campo cli-col-4"><label for="pos-marca">Fábrica *</label><select id="pos-marca" name="marca_slug" required>' +
          MARCAS.map(function (m) { return '<option value="' + m.slug + '">' + m.nome + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="cli-campo cli-col-4"><label for="pos-tipo">Assunto *</label><select id="pos-tipo" name="tipo" required>' +
          Object.keys(TIPOS_POS_VENDA).map(function (k) { return '<option value="' + k + '">' + TIPOS_POS_VENDA[k] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="cli-campo cli-col-4"><label for="pos-nf">Nº da NF-e ou Pedido</label><input id="pos-nf" name="numero_nf_ou_pedido" placeholder="Ex.: NF 45890 / Pedido 1234"></div>' +
        '<div class="cli-campo cli-col-12"><label for="pos-desc">Detalhes da solicitação *</label><textarea id="pos-desc" name="descricao" required placeholder="Informe o número do boleto, código do item em garantia ou dúvida de entrega..."></textarea></div>' +
        '<div class="cli-col-12 cli-acoes">' +
          '<button type="submit" class="cli-btn cli-btn--prim">Registrar chamado</button>' +
          '<button type="button" class="cli-btn cli-btn--zap" data-acao="posvenda-wa">Enviar também no WhatsApp</button>' +
        '</div>' +
      '</form>' +
      (ctx.chamados.length ? '<h3 style="margin:24px 0 10px">Chamados registrados</h3><div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Assunto</th><th>Descrição</th><th>Status</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' : '') +
    '</div>';
  }

  function renderPainelFicha(ctx) {
    var emp = ctx.empresaAtiva || {};
    var ban = ctx.bancario || {};
    var p = estado.passoFicha;
    var datalistBancos = '<datalist id="lista-bancos-febraban">' +
      BANCOS_FEBRABAN.map(function (b) { return '<option value="' + b[0] + ' - ' + b[1] + '">'; }).join('') +
      '</datalist>';

    return '<div class="cli-card">' +
      '<div class="cli-card__cab">' +
        '<div><h2>Ficha Cadastral Oficial M.A Joaquim (Nível 2)</h2><p class="cli-subtxt">Todos os dados alimentam diretamente os 37 campos da planilha oficial .xlsx enviada às fábricas.</p></div>' +
        '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-acao="baixar-xlsx-geral">Baixar Ficha .xlsx agora</button>' +
      '</div>' +
      '<div class="cli-passos" role="tablist">' +
        ['1. Empresa & Fiscal', '2. Endereço', '3. Contatos & Banco', '4. Suframa & Revisão'].map(function (tit, i) {
          var idx = i + 1;
          return '<button type="button" class="cli-passo" data-passo-ficha="' + idx + '" aria-current="' + (p === idx ? 'step' : 'false') + '">' + tit + '</button>';
        }).join('') +
      '</div>' +
      datalistBancos +
      '<div id="cli-ficha-msg"></div>' +
      '<form id="form-ficha" class="cli-form-grade" novalidate>' +
        // Todos os campos sempre no DOM (ocultados por grupo com hidden para preservar valores entre os passos)
        '<div class="cli-col-12 cli-form-grade"' + (p !== 1 ? ' hidden' : '') + '>' +
          '<div class="cli-campo cli-col-4"><label for="f-cnpj">CNPJ</label><input id="f-cnpj" value="' + esc(fmtCnpj(emp.cnpj)) + '" readonly style="background:var(--gelo-50)"></div>' +
          '<div class="cli-campo cli-col-8"><label for="f-razao">Razão Social *</label><input id="f-razao" name="razao_social" required value="' + esc(emp.razao_social || '') + '"></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-ie">Inscrição Estadual (ou ISENTO)</label><input id="f-ie" name="inscricao_estadual" value="' + esc(emp.inscricao_estadual || '') + '"></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-trib">Regime Tributário *</label><select id="f-trib" name="tributacao">' +
            '<option value="">Selecione...</option>' +
            '<option value="simples_nacional"' + (emp.tributacao === 'simples_nacional' ? ' selected' : '') + '>Simples Nacional</option>' +
            '<option value="lucro_presumido"' + (emp.tributacao === 'lucro_presumido' ? ' selected' : '') + '>Lucro Presumido</option>' +
            '<option value="lucro_real"' + (emp.tributacao === 'lucro_real' ? ' selected' : '') + '>Lucro Real</option>' +
          '</select></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-fant">Nome Fantasia</label><input id="f-fant" name="nome_fantasia" value="' + esc(emp.nome_fantasia || '') + '"></div>' +
        '</div>' +

        '<div class="cli-col-12 cli-form-grade"' + (p !== 2 ? ' hidden' : '') + '>' +
          '<div class="cli-campo cli-col-3"><label for="f-cep">CEP</label><div class="cli-campo--inline"><input id="f-cep" name="cep" value="' + esc(emp.cep || '') + '"><button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="buscar-cep-ficha">CEP</button></div></div>' +
          '<div class="cli-campo cli-col-7"><label for="f-end">Endereço</label><input id="f-end" name="endereco" value="' + esc(emp.endereco || '') + '"></div>' +
          '<div class="cli-campo cli-col-2"><label for="f-num">Número</label><input id="f-num" name="numero" value="' + esc(emp.numero || '') + '"></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-comp">Complemento</label><input id="f-comp" name="complemento" value="' + esc(emp.complemento || '') + '"></div>' +
          '<div class="cli-campo cli-col-3"><label for="f-cxp">Caixa Postal</label><input id="f-cxp" name="caixa_postal" value="' + esc(emp.caixa_postal || '') + '"></div>' +
          '<div class="cli-campo cli-col-5"><label for="f-bairro">Bairro</label><input id="f-bairro" name="bairro" value="' + esc(emp.bairro || '') + '"></div>' +
          '<div class="cli-campo cli-col-5"><label for="f-cid">Cidade</label><input id="f-cid" name="cidade" value="' + esc(emp.cidade || '') + '"></div>' +
          '<div class="cli-campo cli-col-2"><label for="f-uf">UF</label><input id="f-uf" name="uf" maxlength="2" value="' + esc(emp.uf || 'RJ') + '"></div>' +
          '<div class="cli-campo cli-col-3"><label for="f-tel1">Telefone Fixo 1</label><input id="f-tel1" name="telefone_fixo_1" value="' + esc(emp.telefone_fixo_1 || '') + '"></div>' +
          '<div class="cli-campo cli-col-2"><label for="f-fax">Fax / Alt.</label><input id="f-fax" name="fax" value="' + esc(emp.fax || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-tel2">Telefone Fixo 2</label><input id="f-tel2" name="telefone_fixo_2" value="' + esc(emp.telefone_fixo_2 || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-zap">Celular / WhatsApp *</label><input id="f-zap" name="celular_whatsapp" value="' + esc(emp.celular_whatsapp || '') + '"></div>' +
        '</div>' +

        '<div class="cli-col-12 cli-form-grade"' + (p !== 3 ? ' hidden' : '') + '>' +
          '<div class="cli-campo cli-col-4"><label for="f-em-ger">E-mail Geral</label><input id="f-em-ger" name="email_geral" type="email" value="' + esc(emp.email_geral || '') + '"></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-em-com">E-mail Compras *</label><input id="f-em-com" name="email_compras" type="email" value="' + esc(emp.email_compras || '') + '"></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-em-fin">E-mail Finanças</label><input id="f-em-fin" name="email_financas" type="email" value="' + esc(emp.email_financas || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-em-xml">E-mail para XML NF-e *</label><input id="f-em-xml" name="email_xml_nfe" type="email" value="' + esc(emp.email_xml_nfe || emp.email_geral || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-site">Site</label><input id="f-site" name="site" value="' + esc(emp.site || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-ct-com">Contato Comercial</label><input id="f-ct-com" name="contato_comercial" value="' + esc(emp.contato_comercial || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-ct-fin">Contato Financeiro</label><input id="f-ct-fin" name="contato_financeiro" value="' + esc(emp.contato_financeiro || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-bco-busca">Selecionar Banco (FEBRABAN)</label><input id="f-bco-busca" list="lista-bancos-febraban" placeholder="Digite código ou nome do banco..."></div>' +
          '<div class="cli-campo cli-col-4"><label for="f-bco-nome">Nome do Banco</label><input id="f-bco-nome" name="banco_nome" value="' + esc(ban.banco_nome || '') + '"></div>' +
          '<div class="cli-campo cli-col-2"><label for="f-bco-num">Nº Banco</label><input id="f-bco-num" name="banco_numero" value="' + esc(ban.banco_numero || '') + '"></div>' +
          '<div class="cli-campo cli-col-3"><label for="f-ag">Agência</label><input id="f-ag" name="agencia" value="' + esc(ban.agencia || '') + '"></div>' +
          '<div class="cli-campo cli-col-3"><label for="f-cc">Conta Corrente</label><input id="f-cc" name="conta" value="' + esc(ban.conta || '') + '"></div>' +
          '<div class="cli-campo cli-col-3"><label for="f-tit-cnpj">CNPJ do Titular (se conta PJ)</label><input id="f-tit-cnpj" name="titular_cnpj" value="' + esc(ban.titular_cnpj || '') + '"></div>' +
          '<div class="cli-campo cli-col-3"><label for="f-tit-cpf">CPF do Titular (se conta PF)</label><input id="f-tit-cpf" name="titular_cpf" value="' + esc(ban.titular_cpf || '') + '"></div>' +
        '</div>' +

        '<div class="cli-col-12 cli-form-grade"' + (p !== 4 ? ' hidden' : '') + '>' +
          '<div class="cli-campo cli-col-6"><label for="f-pagto">Forma de pagamento diferenciada</label><input id="f-pagto" name="forma_pagamento_diferenciada" value="' + esc(emp.forma_pagamento_diferenciada || 'NÃO') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-suf-id">SUFRAMA Identificação (se houver)</label><input id="f-suf-id" name="suframa_identificacao" value="' + esc(emp.suframa_identificacao || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-suf-ins">SUFRAMA Inscrição</label><input id="f-suf-ins" name="suframa_inscricao" value="' + esc(emp.suframa_inscricao || '') + '"></div>' +
          '<div class="cli-campo cli-col-6"><label for="f-suf-val">SUFRAMA Validade</label><input id="f-suf-val" name="suframa_validade" type="date" value="' + esc(emp.suframa_validade || '') + '"></div>' +
          '<div class="cli-campo cli-col-12"><label for="f-obs">Observações da Ficha Cadastral</label><textarea id="f-obs" name="observacoes_cadastro" placeholder="Horário de recebimento no estoque, exigência de agendamento, transportadora preferida...">' + esc(emp.observacoes_cadastro || '') + '</textarea></div>' +
        '</div>' +

        '<div class="cli-col-12 cli-acoes" style="margin-top:12px">' +
          (p > 1 ? '<button type="button" class="cli-btn cli-btn--sec" data-passo-ficha="' + (p - 1) + '">← Passo anterior</button>' : '') +
          (p < 4 ? '<button type="button" class="cli-btn cli-btn--prim" data-passo-ficha="' + (p + 1) + '">Próximo passo →</button>' : '') +
          '<button type="submit" class="cli-btn cli-btn--zap">Salvar Ficha Cadastral completa</button>' +
          '<button type="button" class="cli-btn cli-btn--sec" data-acao="baixar-xlsx-geral">Baixar Ficha (.xlsx)</button>' +
        '</div>' +
      '</form>' +
    '</div>' +
    '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h3>Privacidade e Direitos do Titular (LGPD)</h3><p class="cli-subtxt">Finalidade: abertura/manutenção de cadastro nas fábricas representadas e atendimento B2B. Última atualização cadastral: <strong>' + esc(fmtData(emp.atualizado_em || emp.criado_em)) + '</strong>.</p></div></div>' +
      '<div class="cli-acoes">' +
        '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="exportar-dados-lgpd">Exportar meus dados (.json)</button>' +
        '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-acao="solicitar-exclusao-lgpd">Solicitar exclusão desta empresa</button>' +
        '<a class="cli-btn cli-btn--sec cli-btn--mini" href="../privacidade/">Política de Privacidade</a>' +
      '</div>' +
    '</div>';
  }

  function renderPainelAtivo(ctx) {
    switch (estado.abaApp) {
      case 'cotador': return renderPainelCotador(ctx);
      case 'kits': return renderPainelKits(ctx);
      case 'historico': return renderPainelHistorico(ctx);
      case 'conversor': return renderPainelConversor();
      case 'visitas': return renderPainelVisitas(ctx);
      case 'posvenda': return renderPainelPosVenda(ctx);
      case 'ficha': return renderPainelFicha(ctx);
      default: return renderPainelResumo(ctx);
    }
  }

  function renderAppLogado(root, ctx) {
    var listaQtd = lerLista().reduce(function (a, b) { return a + Number(b.qtd || 1); }, 0);
    var abas = [
      { id: 'resumo', nome: 'Visão Geral & Fábricas', badge: String(ctx.fabricas.filter(function (f) { return f.status === 'aprovado'; }).length) + '/4' },
      { id: 'cotador', nome: 'Cotador Multi-Fábrica', badge: listaQtd ? String(listaQtd) : '' },
      { id: 'kits', nome: 'Meus Kits de Giro', badge: String(ctx.kits.length || 3) },
      { id: 'historico', nome: 'Histórico de Cotações', badge: String(ctx.cotacoes.length) },
      { id: 'conversor', nome: 'Conversor Técnico OEM', badge: String(estado.oem.length) },
      { id: 'visitas', nome: 'Solicitar Visita (RJ)', badge: String(ctx.visitas.length) },
      { id: 'posvenda', nome: 'Central Pós-Venda', badge: String(ctx.chamados.length) },
      { id: 'ficha', nome: 'Ficha Cadastral (.xlsx)', badge: ctx.empresaAtiva.nivel_cadastro === 2 ? 'Nível 2' : 'Nível 1' }
    ];

    root.innerHTML =
      renderBarraEmpresa(ctx) +
      '<div class="cli-shell">' +
        '<nav class="cli-nav" aria-label="Ferramentas da Área do Cliente">' +
          abas.map(function (a) {
            return '<button type="button" class="cli-nav__btn" data-ir-aba="' + a.id + '" aria-selected="' + (estado.abaApp === a.id) + '">' +
              '<span>' + esc(a.nome) + '</span>' +
              (a.badge ? '<span class="cli-nav__badge">' + esc(a.badge) + '</span>' : '') +
            '</button>';
          }).join('') +
        '</nav>' +
        '<div id="cli-painel-conteudo">' + renderPainelAtivo(ctx) + '</div>' +
      '</div>';

    if (estado.abaApp === 'cotador') atualizarSugestoesCatalogo();
    if (estado.abaApp === 'conversor') atualizarResultadosOem();
  }

  function sincronizarRascunhoFichaDoDOM() {
    var form = document.getElementById('form-ficha');
    if (!form || !estado.contexto || !estado.contexto.empresaAtiva) return;
    var fd = new FormData(form);
    var emp = estado.contexto.empresaAtiva;
    var camposEmp = [
      'razao_social', 'nome_fantasia', 'inscricao_estadual', 'tributacao',
      'cep', 'endereco', 'numero', 'complemento', 'caixa_postal', 'bairro', 'cidade', 'uf',
      'telefone_fixo_1', 'fax', 'telefone_fixo_2', 'celular_whatsapp',
      'email_geral', 'email_compras', 'email_financas', 'email_xml_nfe', 'site',
      'contato_comercial', 'contato_financeiro', 'forma_pagamento_diferenciada',
      'suframa_identificacao', 'suframa_inscricao', 'suframa_validade', 'observacoes_cadastro'
    ];
    camposEmp.forEach(function (k) {
      if (fd.has(k)) emp[k] = fd.get(k);
    });
    estado.contexto.bancario = estado.contexto.bancario || {};
    ['banco_nome', 'banco_numero', 'agencia', 'conta', 'titular_cnpj', 'titular_cpf'].forEach(function (k) {
      if (fd.has(k)) estado.contexto.bancario[k] = fd.get(k);
    });
  }

  function agendarBuscaZero(termo, origem) {
    var t = String(termo || '').trim();
    if (t.length < 3) return;
    clearTimeout(estado.timerBuscaZero);
    estado.timerBuscaZero = setTimeout(function () {
      global.MAJ_SUPA.registrarEventoBusca(t, origem, 0);
    }, 700);
  }

  function atualizarSugestoesCatalogo() {
    var box = document.getElementById('cot-sugestoes');
    if (!box) return;
    var q = semAcento(estado.buscaCatalogo).trim();
    if (q.length < 2) {
      box.innerHTML = '<small class="cli-subtxt">Digite pelo menos 2 caracteres para filtrar os ' + estado.catalogo.length + ' itens do catálogo.</small>';
      return;
    }
    var termos = q.split(/\s+/).filter(Boolean);
    var achados = estado.catalogo.filter(function (i) {
      var alvo = semAcento(i.m + ' ' + i.c + ' ' + i.n + ' ' + (i.x || ''));
      return termos.every(function (t) { return alvo.indexOf(t) !== -1; });
    });

    if (!achados.length) {
      box.innerHTML = '<div class="cli-alerta cli-alerta--aviso">Nenhum item encontrado com "' + esc(estado.buscaCatalogo) + '". Use o campo de <strong>itens fora do catálogo</strong> abaixo que buscamos na fábrica.</div>';
      agendarBuscaZero(estado.buscaCatalogo, 'area_cliente_cotador');
      return;
    }

    box.innerHTML = achados.slice(0, 12).map(function (i, idx) {
      var imgSrc = i.i ? ('../' + String(i.i).replace(/^\.\.\//, '')) : '../img/sem-foto.svg';
      return '<div class="cli-sugestao">' +
        '<div class="cli-sugestao__info">' +
          '<img src="' + esc(imgSrc) + '" alt="" loading="lazy">' +
          '<div class="cli-sugestao__txt"><b>' + esc(i.n) + '</b><small>' + esc(i.m) + (i.c ? ' · Cód. ' + esc(i.c) : '') + '</small></div>' +
        '</div>' +
        '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-add-cat-idx="' + idx + '">+ Lista</button>' +
      '</div>';
    }).join('');
    box._achados = achados.slice(0, 12);
  }

  function atualizarResultadosOem() {
    var box = document.getElementById('conv-resultados');
    if (!box) return;
    var q = semAcento(estado.buscaOem).trim();
    var lista = !q
      ? estado.oem.slice(0, 20)
      : estado.oem.filter(function (o) {
          var alvo = semAcento([o.oem, o.codigo, o.nome, o.secao, o.origem, o.marca_nome].join(' '));
          return q.split(/\s+/).every(function (t) { return alvo.indexOf(t) !== -1; });
        });

    if (!lista.length) {
      box.innerHTML = '<div class="cli-alerta cli-alerta--aviso">Nenhuma equivalência encontrada para "' + esc(estado.buscaOem) + '". Esta pesquisa foi registrada para nossa engenharia incluir no catálogo.</div>';
      agendarBuscaZero(estado.buscaOem, 'conversor_oem');
      return;
    }

    box.innerHTML = '<p class="cli-subtxt" style="margin-bottom:10px">' + lista.length + ' referências encontradas' + (lista.length > 30 ? ' (mostrando 30 primeiras)' : '') + '.</p>' +
      '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Cód. Original / Referência</th><th>Equivalente M.A Joaquim</th><th>Aplicação</th><th>Ação</th></tr></thead><tbody>' +
      lista.slice(0, 30).map(function (o) {
        return '<tr>' +
          '<td><strong>' + esc(o.oem) + '</strong></td>' +
          '<td><strong>' + esc(o.marca_nome + ' · ' + o.codigo) + '</strong><br><small class="cli-subtxt">' + esc(o.nome) + '</small></td>' +
          '<td><small class="cli-subtxt">' + esc(o.origem) + '</small></td>' +
          '<td><button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-add-oem="' + esc(o.codigo) + '">+ Lista</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  async function renderTudo() {
    var root = document.getElementById('app-cliente');
    if (!root) return;
    root.innerHTML = '<div class="cli-card"><p>Carregando Área do Cliente...</p></div>';

    try {
      estado.sessao = await global.MAJ_SUPA.obterSessao();
      if (!estado.sessao || !estado.sessao.user) {
        estado.contexto = null;
        atualizarCabecalhoSessao();
        renderAuth(root);
        return;
      }

      estado.contexto = await global.MAJ_SUPA.carregarDadosCliente(estado.sessao, estado.empresaAtivaId);
      if (estado.contexto.empresaAtiva) {
        estado.empresaAtivaId = estado.contexto.empresaAtiva.id;
      }
      atualizarCabecalhoSessao();

      if (!estado.contexto.empresas.length || estado.novoCnpjAberto) {
        renderOnboardingNivel1(root, Boolean(estado.contexto.empresas.length));
        return;
      }

      renderAppLogado(root, estado.contexto);
    } catch (err) {
      root.innerHTML = '<div class="cli-alerta cli-alerta--erro">Erro ao carregar Área do Cliente: ' + esc(err && err.message ? err.message : err) + '</div>';
    }
  }

  function importarLoteTexto(texto) {
    var linhas = String(texto || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!linhas.length) return { ok: 0, falhas: [] };
    var ok = 0;
    var falhas = [];
    linhas.forEach(function (linha) {
      var m = linha.match(/^([A-Za-z0-9._\-\/+]+)\s*(?:[xX*;,\t]\s*|\s+)(\d+)?$/);
      var codRaw = m ? m[1] : linha.split(/\s+/)[0];
      var qtd = m && m[2] ? Math.max(1, Number(m[2])) : 1;
      var codNorm = semAcento(codRaw).replace(/\s+/g, '');

      var achado = estado.catalogo.find(function (i) {
        return semAcento(i.c).replace(/\s+/g, '') === codNorm;
      });
      if (!achado) {
        var oemMatch = estado.oem.find(function (o) {
          return semAcento(o.oem).replace(/\s+/g, '') === codNorm;
        });
        if (oemMatch) {
          achado = estado.catalogo.find(function (i) { return semAcento(i.c) === semAcento(oemMatch.codigo); }) ||
            { s: oemMatch.marca, m: oemMatch.marca_nome, c: oemMatch.codigo, n: oemMatch.nome, i: oemMatch.img };
        }
      }
      if (achado) {
        adicionarItemLista(achado, qtd);
        ok++;
      } else {
        falhas.push(linha);
      }
    });
    return { ok: ok, falhas: falhas };
  }

  function montarMensagemWhatsAppCotacao(emp, lista, numCot) {
    var linhas = [
      'Olá, equipe M.A Joaquim! Segue cotação ' + numCot + ' da Área do Cliente:',
      'Empresa: ' + emp.razao_social + ' · CNPJ ' + fmtCnpj(emp.cnpj),
      'Cidade/UF: ' + (emp.cidade || '-') + '/' + (emp.uf || 'RJ'),
      ''
    ];
    var porMarca = {};
    lista.forEach(function (it) {
      (porMarca[it.marca || 'Geral'] = porMarca[it.marca || 'Geral'] || []).push(it);
    });
    Object.keys(porMarca).forEach(function (marca) {
      linhas.push('*' + marca + '*:');
      porMarca[marca].forEach(function (it) {
        linhas.push('- ' + (it.qtd || 1) + 'x ' + (it.cod ? it.cod + ' — ' : '') + it.nome);
      });
      var obsM = estado.obsMarcas[semAcento(marca)];
      if (obsM) linhas.push('Obs. ' + marca + ': ' + obsM);
      linhas.push('');
    });
    if (estado.obsGeral) linhas.push('Observações / fora do catálogo: ' + estado.obsGeral);
    return linhas.join('\n');
  }

  /* ========================================================================
     EVENTOS GLOBAIS (DELEGAÇÃO)
     ======================================================================== */
  document.addEventListener('click', async function (ev) {
    var alvo = ev.target.closest('button, [data-acao], [data-auth-aba], [data-ir-aba], [data-passo-ficha], [data-solicitar-fab], [data-xlsx-fab]');
    if (!alvo || !document.getElementById('app-cliente')) return;

    try {
      if (alvo.dataset.authAba) {
        estado.abaAuth = alvo.dataset.authAba;
        renderAuth(document.getElementById('app-cliente'));
        return;
      }

      if (alvo.dataset.irAba) {
        sincronizarRascunhoFichaDoDOM();
        estado.abaApp = alvo.dataset.irAba;
        if (estado.contexto && estado.contexto.empresaAtiva) {
          renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        } else {
          renderTudo();
        }
        return;
      }

      if (alvo.dataset.passoFicha) {
        sincronizarRascunhoFichaDoDOM();
        estado.passoFicha = Number(alvo.dataset.passoFicha);
        renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        return;
      }

      var acao = alvo.dataset.acao;
      if (acao === 'login-google') {
        await global.MAJ_SUPA.entrarComGoogle();
        return;
      }
      if (acao === 'entrar-local') {
        var em = (document.getElementById('auth-email') || {}).value || 'compras@minhaloja.com.br';
        var nm = (document.getElementById('auth-nome') || {}).value || 'Comprador';
        global.MAJ_SUPA.entrarModoLocal(em, nm);
        mostrarToast('Modo navegador ativado. Você pode cadastrar seu CNPJ e gerar a Ficha .xlsx imediatamente.');
        await renderTudo();
        return;
      }
      if (acao === 'sair') {
        await global.MAJ_SUPA.sair();
        estado.empresaAtivaId = null;
        await renderTudo();
        return;
      }
      if (acao === 'abrir-novo-cnpj') {
        estado.novoCnpjAberto = true;
        await renderTudo();
        return;
      }
      if (acao === 'cancelar-novo-cnpj') {
        estado.novoCnpjAberto = false;
        await renderTudo();
        return;
      }
      if (acao === 'buscar-cnpj-n1') {
        var inp = document.getElementById('n1-cnpj');
        var msg = document.getElementById('cli-n1-msg');
        if (!validarCNPJ(inp.value)) {
          msg.innerHTML = '<div class="cli-alerta cli-alerta--erro">CNPJ inválido pelos dígitos verificadores. Confira os 14 dígitos.</div>';
          return;
        }
        msg.innerHTML = '<div class="cli-alerta cli-alerta--info">Consultando CNPJ na Receita Federal (BrasilAPI)...</div>';
        try {
          var d = await consultarBrasilAPI(inp.value);
          document.getElementById('n1-cnpj').value = fmtCnpj(d.cnpj);
          document.getElementById('n1-razao').value = d.razao_social;
          document.getElementById('n1-fantasia').value = d.nome_fantasia;
          document.getElementById('n1-cep').value = d.cep;
          document.getElementById('n1-end').value = d.endereco;
          document.getElementById('n1-num').value = d.numero;
          document.getElementById('n1-comp').value = d.complemento;
          document.getElementById('n1-bairro').value = d.bairro;
          document.getElementById('n1-cidade').value = d.cidade;
          document.getElementById('n1-uf').value = d.uf;
          document.getElementById('n1-tel').value = d.telefone_fixo_1;
          msg.innerHTML = '<div class="cli-alerta cli-alerta--ok">Dados preenchidos pela Receita Federal. Informe seu WhatsApp e contato para concluir.</div>';
        } catch (errCnpj) {
          msg.innerHTML = '<div class="cli-alerta cli-alerta--aviso">' + esc(errCnpj.message) + ' Preencha os campos manualmente.</div>';
        }
        return;
      }
      if (acao === 'buscar-cep-n1' || acao === 'buscar-cep-ficha') {
        var isN1 = acao === 'buscar-cep-n1';
        var cepEl = document.getElementById(isN1 ? 'n1-cep' : 'f-cep');
        var end = await consultarViaCEP(cepEl.value);
        document.getElementById(isN1 ? 'n1-end' : 'f-end').value = end.endereco;
        document.getElementById(isN1 ? 'n1-bairro' : 'f-bairro').value = end.bairro;
        document.getElementById(isN1 ? 'n1-cidade' : 'f-cid').value = end.cidade;
        document.getElementById(isN1 ? 'n1-uf' : 'f-uf').value = end.uf;
        mostrarToast('Endereço preenchido via CEP.');
        return;
      }
      if (acao === 'baixar-xlsx-geral' || alvo.dataset.xlsxFab) {
        sincronizarRascunhoFichaDoDOM();
        var marcaAlvo = alvo.dataset.xlsxFab || '';
        var dados = Object.assign({}, estado.contexto.empresaAtiva, estado.contexto.bancario || {}, {
          banco_titular_cnpj: (estado.contexto.bancario || {}).titular_cnpj,
          banco_titular_cpf: (estado.contexto.bancario || {}).titular_cpf
        });
        await global.MAJ_FICHA_XLSX.baixarFichaXlsx(dados, marcaAlvo, '../modelos/ficha-cadastro-ma-joaquim.xlsx');
        mostrarToast('Ficha Cadastral .xlsx oficial gerada!');
        return;
      }
      if (acao === 'exportar-dados-lgpd') {
        sincronizarRascunhoFichaDoDOM();
        var pacoteLgpd = {
          exportado_em: new Date().toISOString(),
          empresa: estado.contexto.empresaAtiva,
          cadastros_fabrica: estado.contexto.fabricas,
          cotacoes: estado.contexto.cotacoes,
          kits: estado.contexto.kits,
          visitas: estado.contexto.visitas,
          chamados: estado.contexto.chamados
        };
        var bLgpd = new Blob([JSON.stringify(pacoteLgpd, null, 2)], { type: 'application/json;charset=utf-8' });
        var aLgpd = document.createElement('a');
        aLgpd.href = URL.createObjectURL(bLgpd);
        aLgpd.download = 'meus-dados-ma-joaquim-' + (apenasDig(estado.contexto.empresaAtiva.cnpj) || 'empresa') + '.json';
        document.body.appendChild(aLgpd);
        aLgpd.click();
        setTimeout(function () { URL.revokeObjectURL(aLgpd.href); aLgpd.remove(); }, 1000);
        mostrarToast('Portabilidade LGPD (.json) exportada!');
        return;
      }
      if (acao === 'solicitar-exclusao-lgpd') {
        var empEx = estado.contexto.empresaAtiva;
        if (estado.contexto.modo === 'local') {
          global.MAJ_SUPA.removerEmpresaLocal(empEx.id);
          estado.empresaAtivaId = null;
          mostrarToast('Empresa removida deste navegador conforme LGPD.');
          await renderTudo();
        } else {
          await global.MAJ_SUPA.abrirChamadoPosVenda(estado.sessao, empEx.id, {
            marca_slug: 'suryha',
            tipo: 'outro',
            numero_nf_ou_pedido: 'LGPD-EXCLUSAO',
            descricao: 'Solicitação formal de exclusão cadastral (LGPD) da empresa ' + empEx.razao_social + ' (CNPJ ' + fmtCnpj(empEx.cnpj) + ').'
          });
          mostrarToast('Solicitação de exclusão registrada com a equipe M.A Joaquim.');
          await renderTudo();
        }
        return;
      }
      if (alvo.dataset.solicitarFab) {
        var marcaS = alvo.dataset.solicitarFab;
        await global.MAJ_SUPA.solicitarFabrica(estado.sessao, estado.contexto.empresaAtiva.id, marcaS);
        mostrarToast('Solicitação de cadastro para ' + nomeMarca(marcaS) + ' registrada!');
        await renderTudo();
        return;
      }
      if (alvo.dataset.addCatIdx !== undefined) {
        var box = document.getElementById('cot-sugestoes');
        var it = box && box._achados ? box._achados[Number(alvo.dataset.addCatIdx)] : null;
        if (it) {
          adicionarItemLista(it, 1);
          mostrarToast((it.c || it.n) + ' adicionado à cotação.');
          renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        }
        return;
      }
      if (alvo.dataset.addOem) {
        var codOem = alvo.dataset.addOem;
        var encontrado = estado.catalogo.find(function (c) { return semAcento(c.c) === semAcento(codOem); }) ||
          estado.oem.find(function (o) { return semAcento(o.codigo) === semAcento(codOem); });
        if (encontrado) {
          adicionarItemLista({
            s: encontrado.s || encontrado.marca,
            m: encontrado.m || encontrado.marca_nome,
            c: encontrado.c || encontrado.codigo,
            n: encontrado.n || encontrado.nome,
            i: encontrado.i || encontrado.img
          }, 1);
          mostrarToast(codOem + ' adicionado ao Cotador Multi-Fábrica.');
          renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        }
        return;
      }
      if (alvo.dataset.addRapido) {
        adicionarItemLista({
          m: alvo.dataset.addMarca,
          c: alvo.dataset.addRapido,
          n: alvo.dataset.addNome
        }, 1);
        mostrarToast(alvo.dataset.addRapido + ' adicionado à lista.');
        renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        return;
      }
      if (acao === 'importar-lote') {
        var txt = (document.getElementById('cot-lote') || {}).value || '';
        var rLote = importarLoteTexto(txt);
        mostrarToast(rLote.ok + ' linha(s) importada(s).' + (rLote.falhas.length ? ' Não reconhecidas: ' + rLote.falhas.slice(0, 3).join(', ') : ''));
        renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        return;
      }
      if (alvo.dataset.qtdMenos !== undefined || alvo.dataset.qtdMais !== undefined || alvo.dataset.qtdRem !== undefined) {
        var l = lerLista();
        if (alvo.dataset.qtdRem !== undefined) {
          l.splice(Number(alvo.dataset.qtdRem), 1);
        } else {
          var idxQ = Number(alvo.dataset.qtdMenos !== undefined ? alvo.dataset.qtdMenos : alvo.dataset.qtdMais);
          if (l[idxQ]) {
            l[idxQ].qtd = Math.max(1, Number(l[idxQ].qtd || 1) + (alvo.dataset.qtdMais !== undefined ? 1 : -1));
          }
        }
        salvarLista(l);
        renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        return;
      }
      if (acao === 'limpar-lista-cli') {
        salvarLista([]);
        renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        return;
      }
      if (acao === 'imprimir-cotacao') {
        global.print();
        return;
      }
      if (acao === 'salvar-cotacao-db' || acao === 'enviar-cotacao-wa') {
        var listaEnv = lerLista();
        if (!listaEnv.length) return;
        var itensFmt = listaEnv.map(function (it) {
          return {
            marca_slug: semAcento(it.marca || 'sibb'),
            marca_nome: it.marca || 'SIBB',
            codigo: it.cod || '',
            nome: it.nome || '',
            quantidade: Number(it.qtd || 1)
          };
        });
        var cotSalva = await global.MAJ_SUPA.salvarCotacao(estado.sessao, estado.contexto.empresaAtiva.id, {
          status: 'enviada',
          observacoes_gerais: estado.obsGeral,
          observacoes_por_marca: estado.obsMarcas,
          canal: acao === 'enviar-cotacao-wa' ? 'site_whatsapp' : 'area_cliente'
        }, itensFmt);

        if (acao === 'enviar-cotacao-wa') {
          var corW = detectarCorredorRJ(estado.contexto.empresaAtiva.cidade, estado.contexto.empresaAtiva.cep);
          var msgWa = montarMensagemWhatsAppCotacao(estado.contexto.empresaAtiva, listaEnv, cotSalva.numero || cotSalva.id);
          global.open('https://wa.me/' + corW.wa + '?text=' + encodeURIComponent(msgWa), '_blank', 'noopener');
        }
        mostrarToast('Cotação ' + (cotSalva.numero || cotSalva.id) + ' salva no histórico!');
        await renderTudo();
        return;
      }
      if (alvo.dataset.carregarKit) {
        var kitsAll = (estado.contexto.kits || []).concat(kitsIniciaisCatalogo());
        var kitEsc = kitsAll.find(function (k) { return k.id === alvo.dataset.carregarKit; });
        if (kitEsc && kitEsc.itens) {
          kitEsc.itens.forEach(function (it) { adicionarItemLista(it, it.qtd || 1); });
          estado.abaApp = 'cotador';
          mostrarToast('Kit "' + kitEsc.nome + '" carregado no Cotador Multi-Fábrica.');
          renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        }
        return;
      }
      if (alvo.dataset.excluirKit) {
        await global.MAJ_SUPA.excluirKit(estado.sessao, alvo.dataset.excluirKit);
        mostrarToast('Kit excluído.');
        await renderTudo();
        return;
      }
      if (alvo.dataset.repetirCot) {
        var cotRep = estado.contexto.cotacoes.find(function (c) { return c.id === alvo.dataset.repetirCot; });
        if (cotRep) {
          (cotRep.site_cotacao_itens || []).forEach(function (it) {
            adicionarItemLista({ m: it.marca_nome, c: it.codigo, n: it.nome }, it.quantidade || 1);
          });
          estado.abaApp = 'cotador';
          mostrarToast('Itens da cotação carregados no cotador.');
          renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
        }
        return;
      }
      if (alvo.dataset.verCot || alvo.dataset.imprimirCot) {
        var cotIdVer = alvo.dataset.verCot || alvo.dataset.imprimirCot;
        var cotVer = estado.contexto.cotacoes.find(function (c) { return c.id === cotIdVer; });
        var det = document.getElementById('hist-detalhe');
        if (cotVer && det) {
          det.innerHTML = '<div class="cli-alerta cli-alerta--info"><strong>Itens da cotação ' + esc(cotVer.numero || cotVer.id) + ' (' + esc(fmtData(cotVer.criada_em)) + '):</strong><ul>' +
            (cotVer.site_cotacao_itens || []).map(function (it) {
              return '<li>' + esc(it.quantidade) + 'x [' + esc(it.marca_nome) + '] ' + esc(it.codigo ? it.codigo + ' — ' : '') + esc(it.nome) + '</li>';
            }).join('') +
            '</ul>' + (cotVer.observacoes_gerais ? '<p>Obs.: ' + esc(cotVer.observacoes_gerais) + '</p>' : '') + '</div>';
          if (alvo.dataset.imprimirCot) global.print();
        }
        return;
      }
      if (alvo.dataset.visIcs || alvo.dataset.visGcal) {
        var visId = alvo.dataset.visIcs || alvo.dataset.visGcal;
        var vObj = estado.contexto.visitas.find(function (v) { return v.id === visId; });
        if (!vObj) return;
        var visAgenda = {
          id: vObj.id,
          data_confirmada: vObj.data_confirmada || vObj.data_preferida,
          hora_confirmada: vObj.hora_confirmada || '10:00',
          objetivo: OBJETIVOS_VISITA[vObj.objetivo] || vObj.objetivo,
          observacoes: vObj.observacoes,
          representante: vObj.representante_preferido
        };
        if (alvo.dataset.visGcal) {
          global.open(global.MAJ_FICHA_XLSX.linkGoogleCalendar(visAgenda, estado.contexto.empresaAtiva), '_blank', 'noopener');
        } else {
          global.MAJ_FICHA_XLSX.gerarICSVisita(visAgenda, estado.contexto.empresaAtiva);
          mostrarToast('Arquivo de agenda (.ics) baixado!');
        }
        return;
      }
      if (acao === 'posvenda-wa') {
        var mSlug = (document.getElementById('pos-marca') || {}).value || '';
        var tipoP = (document.getElementById('pos-tipo') || {}).value || '';
        var nfP = (document.getElementById('pos-nf') || {}).value || '';
        var descP = (document.getElementById('pos-desc') || {}).value || '';
        var corP = detectarCorredorRJ(estado.contexto.empresaAtiva.cidade, estado.contexto.empresaAtiva.cep);
        var txtWa = 'Olá! Solicitação Pós-Venda (' + nomeMarca(mSlug) + ' · ' + (TIPOS_POS_VENDA[tipoP] || tipoP) + ')\n' +
          'Empresa: ' + estado.contexto.empresaAtiva.razao_social + ' · CNPJ ' + fmtCnpj(estado.contexto.empresaAtiva.cnpj) + '\n' +
          (nfP ? ('NF/Pedido: ' + nfP + '\n') : '') + descP;
        global.open('https://wa.me/' + corP.wa + '?text=' + encodeURIComponent(txtWa), '_blank', 'noopener');
      }
    } catch (errClick) {
      mostrarToast('Erro: ' + (errClick && errClick.message ? errClick.message : errClick));
    }
  });

  document.addEventListener('submit', async function (ev) {
    var form = ev.target;
    if (!form || !document.getElementById('app-cliente')) return;
    ev.preventDefault();

    try {
      if (form.id === 'form-auth') {
        var fd = new FormData(form);
        var email = fd.get('email');
        var senha = fd.get('senha');
        var nome = fd.get('nome');
        var msgEl = document.getElementById('cli-auth-msg');
        if (estado.abaAuth === 'recuperar') {
          await global.MAJ_SUPA.redefinirSenha(email);
          msgEl.innerHTML = '<div class="cli-alerta cli-alerta--ok">E-mail de redefinição enviado para ' + esc(email) + '.</div>';
          return;
        }
        if (estado.abaAuth === 'criar') {
          await global.MAJ_SUPA.criarContaEmail(email, senha, nome);
          msgEl.innerHTML = '<div class="cli-alerta cli-alerta--ok">Perfil criado! Caso o Supabase peça confirmação de e-mail, confira sua caixa de entrada ou entre logo após confirmar.</div>';
        } else {
          await global.MAJ_SUPA.entrarComSenha(email, senha);
        }
        await renderTudo();
        return;
      }

      if (form.id === 'form-nivel1') {
        var fd1 = new FormData(form);
        var cnpjStr = fd1.get('cnpj');
        if (!validarCNPJ(cnpjStr)) {
          document.getElementById('cli-n1-msg').innerHTML = '<div class="cli-alerta cli-alerta--erro">CNPJ inválido pelos dígitos verificadores.</div>';
          return;
        }
        var resN1 = await global.MAJ_SUPA.cadastrarEmpresaNivel1(estado.sessao, {
          cnpj: cnpjStr,
          razao_social: fd1.get('razao_social'),
          nome_fantasia: fd1.get('nome_fantasia'),
          celular_whatsapp: fd1.get('celular_whatsapp'),
          telefone_fixo_1: fd1.get('telefone_fixo_1'),
          cep: fd1.get('cep'),
          endereco: fd1.get('endereco'),
          numero: fd1.get('numero'),
          complemento: fd1.get('complemento'),
          bairro: fd1.get('bairro'),
          cidade: fd1.get('cidade'),
          uf: fd1.get('uf'),
          contato_comercial: fd1.get('contato_comercial'),
          cargo: fd1.get('cargo'),
          email_compras: fd1.get('email_compras'),
          email_geral: fd1.get('email_compras')
        });
        if (resN1 && resN1.precisa_autorizacao) {
          document.getElementById('cli-n1-msg').innerHTML = '<div class="cli-alerta cli-alerta--aviso">Este CNPJ já possui usuário titular cadastrado na plataforma. Fale pelo WhatsApp com a M.A Joaquim para liberar acesso adicional para outro comprador da sua equipe.</div>';
          return;
        }
        estado.empresaAtivaId = resN1.empresa_id;
        estado.novoCnpjAberto = false;
        mostrarToast('Empresa vinculada com sucesso! Agora todas as 8 ferramentas estão liberadas.');
        await renderTudo();
        return;
      }

      if (form.id === 'form-novo-kit') {
        var fdK = new FormData(form);
        var listaK = lerLista();
        if (!listaK.length) return;
        await global.MAJ_SUPA.salvarKit(estado.sessao, estado.contexto.empresaAtiva.id, {
          nome: fdK.get('nome'),
          descricao: fdK.get('descricao'),
          itens: listaK
        });
        mostrarToast('Kit salvo no seu perfil!');
        await renderTudo();
        return;
      }

      if (form.id === 'form-visita') {
        var fdV = new FormData(form);
        var corV = detectarCorredorRJ(estado.contexto.empresaAtiva.cidade, estado.contexto.empresaAtiva.cep);
        await global.MAJ_SUPA.solicitarVisita(estado.sessao, estado.contexto.empresaAtiva.id, {
          objetivo: fdV.get('objetivo'),
          data_preferida: fdV.get('data_preferida'),
          turno: fdV.get('turno'),
          representante_preferido: fdV.get('representante_preferido'),
          corredor_sugerido: corV.rota,
          observacoes: fdV.get('observacoes')
        });
        mostrarToast('Solicitação de visita registrada!');
        await renderTudo();
        return;
      }

      if (form.id === 'form-posvenda') {
        var fdP = new FormData(form);
        await global.MAJ_SUPA.abrirChamadoPosVenda(estado.sessao, estado.contexto.empresaAtiva.id, {
          marca_slug: fdP.get('marca_slug'),
          tipo: fdP.get('tipo'),
          numero_nf_ou_pedido: fdP.get('numero_nf_ou_pedido'),
          descricao: fdP.get('descricao')
        });
        mostrarToast('Chamado de pós-venda registrado!');
        await renderTudo();
        return;
      }

      if (form.id === 'form-ficha') {
        var fdF = new FormData(form);
        if (!String(fdF.get('razao_social') || '').trim()) {
          sincronizarRascunhoFichaDoDOM();
          estado.passoFicha = 1;
          renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
          var msgF = document.getElementById('cli-ficha-msg');
          if (msgF) msgF.innerHTML = '<div class="cli-alerta cli-alerta--erro">Informe a Razão Social (Passo 1) antes de salvar a Ficha Cadastral.</div>';
          return;
        }
        var dadosEmp = {
          razao_social: fdF.get('razao_social'),
          nome_fantasia: fdF.get('nome_fantasia'),
          inscricao_estadual: fdF.get('inscricao_estadual'),
          tributacao: fdF.get('tributacao') || null,
          cep: fdF.get('cep'),
          endereco: fdF.get('endereco'),
          numero: fdF.get('numero'),
          complemento: fdF.get('complemento'),
          caixa_postal: fdF.get('caixa_postal'),
          bairro: fdF.get('bairro'),
          cidade: fdF.get('cidade'),
          uf: fdF.get('uf'),
          telefone_fixo_1: fdF.get('telefone_fixo_1'),
          fax: fdF.get('fax'),
          telefone_fixo_2: fdF.get('telefone_fixo_2'),
          celular_whatsapp: fdF.get('celular_whatsapp'),
          email_geral: fdF.get('email_geral'),
          email_compras: fdF.get('email_compras'),
          email_financas: fdF.get('email_financas'),
          email_xml_nfe: fdF.get('email_xml_nfe'),
          site: fdF.get('site'),
          contato_comercial: fdF.get('contato_comercial'),
          contato_financeiro: fdF.get('contato_financeiro'),
          forma_pagamento_diferenciada: fdF.get('forma_pagamento_diferenciada') || 'NÃO',
          suframa_identificacao: fdF.get('suframa_identificacao'),
          suframa_inscricao: fdF.get('suframa_inscricao'),
          suframa_validade: fdF.get('suframa_validade') || null,
          observacoes_cadastro: fdF.get('observacoes_cadastro')
        };
        var dadosBan = {
          banco_nome: fdF.get('banco_nome'),
          banco_numero: fdF.get('banco_numero'),
          agencia: fdF.get('agencia'),
          conta: fdF.get('conta'),
          titular_cnpj: fdF.get('titular_cnpj'),
          titular_cpf: fdF.get('titular_cpf')
        };
        await global.MAJ_SUPA.salvarFichaCompleta(estado.sessao, estado.contexto.empresaAtiva.id, dadosEmp, dadosBan);
        mostrarToast('Ficha Cadastral completa (Nível 2) salva!');
        await renderTudo();
      }
    } catch (errSub) {
      mostrarToast('Erro ao salvar: ' + (errSub && errSub.message ? errSub.message : errSub));
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!t || !document.getElementById('app-cliente')) return;
    if (t.id === 'cot-busca') {
      estado.buscaCatalogo = t.value;
      atualizarSugestoesCatalogo();
    } else if (t.id === 'conv-busca') {
      estado.buscaOem = t.value;
      atualizarResultadosOem();
    } else if (t.id === 'cot-obs-geral') {
      estado.obsGeral = t.value;
    } else if (t.dataset.obsMarca) {
      estado.obsMarcas[t.dataset.obsMarca] = t.value;
    } else if (t.id === 'f-bco-busca') {
      var m = t.value.match(/^(\d{3})\s*-\s*(.+)$/);
      if (m) {
        document.getElementById('f-bco-num').value = m[1];
        document.getElementById('f-bco-nome').value = m[2].trim();
      }
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !document.getElementById('app-cliente')) return;
    if (t.hasAttribute('data-select-empresa')) {
      estado.empresaAtivaId = t.value;
      estado.novoCnpjAberto = false;
      renderTudo();
    } else if (t.hasAttribute('data-filtro-hist-marca')) {
      estado.filtroHistMarca = t.value;
      renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
    } else if (t.hasAttribute('data-filtro-hist-status')) {
      estado.filtroHistStatus = t.value;
      renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
    } else if (t.hasAttribute('data-filtro-hist-periodo')) {
      estado.filtroHistPeriodo = t.value;
      renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
    } else if (t.dataset.qtdInput !== undefined) {
      var l = lerLista();
      var idx = Number(t.dataset.qtdInput);
      if (l[idx]) {
        l[idx].qtd = Math.max(1, Number(t.value || 1));
        salvarLista(l);
      }
    }
  });

  global.addEventListener('majoaquim:lista-site-alterada', function () {
    if (document.getElementById('app-cliente') && estado.contexto && estado.contexto.empresaAtiva) {
      renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('app-cliente')) return;
    carregarIndices().then(function () {
      if (estado.contexto && estado.contexto.empresaAtiva) {
        renderAppLogado(document.getElementById('app-cliente'), estado.contexto);
      }
    });
    renderTudo();
  });
})(typeof window !== 'undefined' ? window : globalThis);
