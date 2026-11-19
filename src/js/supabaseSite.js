/* M.A Joaquim Representação — Adaptador Supabase + Fallback Local Offline
   Convive sem conflito no mesmo projeto Supabase do Portal Comercial
   usando exclusivamente tabelas prefixadas com `site_*`.
*/
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://jzqsyityeoqnvuznboto.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_l8du_r66HkU-w8fNZThQnw_z8Frm4uw';
  var CHAVE_LOCAL = 'majoaquim:area_cliente:v1';
  var CHAVE_WEBHOOK = 'majoaquim:ws_webhook';

  var clienteSupa = null;
  var migracaoPronta = null;

  function obterCliente() {
    if (clienteSupa) return clienteSupa;
    if (global.supabase && typeof global.supabase.createClient === 'function') {
      clienteSupa = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return clienteSupa;
  }

  function estadoPadraoLocal() {
    return {
      usuario: null,
      empresas: [],
      bancarioPorEmpresa: {},
      fabricasPorEmpresa: {},
      cotacoes: [],
      kits: [],
      visitas: [],
      chamados: [],
      buscas: []
    };
  }

  function lerLocal() {
    try {
      var bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return estadoPadraoLocal();
      var obj = JSON.parse(bruto);
      return Object.assign(estadoPadraoLocal(), obj || {});
    } catch (_e) {
      return estadoPadraoLocal();
    }
  }

  function salvarLocal(estado) {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado));
    } catch (_e) {
      // Sem cota de armazenamento
    }
  }

  function fabricasPadrao(empresaId) {
    return [
      { id: empresaId + '-suryha', empresa_id: empresaId, marca_slug: 'suryha', status: 'nao_solicitado', observacao_representante: '' },
      { id: empresaId + '-sibb', empresa_id: empresaId, marca_slug: 'sibb', status: 'nao_solicitado', observacao_representante: '' },
      { id: empresaId + '-coel', empresa_id: empresaId, marca_slug: 'coel', status: 'nao_solicitado', observacao_representante: '' },
      { id: empresaId + '-perfiltec', empresa_id: empresaId, marca_slug: 'perfiltec', status: 'nao_solicitado', observacao_representante: '' }
    ];
  }

  function gerarUUID() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
  }

  function apenasDigitos(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function erroTabelaAusente(err) {
    if (!err) return false;
    var msg = String(err.message || err.details || err.hint || '');
    return err.code === 'PGRST205' || err.code === '42P01' || /site_empresas/i.test(msg) && /does not exist|not find/i.test(msg);
  }

  async function checarMigracao() {
    if (migracaoPronta !== null) return migracaoPronta;
    var supa = obterCliente();
    if (!supa) {
      migracaoPronta = false;
      return false;
    }
    try {
      var res = await supa.from('site_empresas').select('id').limit(1);
      if (res.error && erroTabelaAusente(res.error)) {
        migracaoPronta = false;
        return false;
      }
      migracaoPronta = true;
      return true;
    } catch (_e) {
      migracaoPronta = false;
      return false;
    }
  }

  async function obterSessao() {
    var supa = obterCliente();
    if (supa) {
      try {
        var r = await supa.auth.getSession();
        if (r && r.data && r.data.session && r.data.session.user) {
          return { user: r.data.session.user, origem: 'supabase' };
        }
      } catch (_e) {
        // segue fallback
      }
    }
    var loc = lerLocal();
    if (loc.usuario) {
      return { user: loc.usuario, origem: 'local' };
    }
    return { user: null, origem: 'nenhum' };
  }

  async function entrarComGoogle(urlRetorno) {
    var supa = obterCliente();
    if (!supa) throw new Error('SDK Supabase indisponível.');
    var r = await supa.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: urlRetorno || global.location.href.split('#')[0] }
    });
    if (r.error) throw r.error;
    return r.data;
  }

  async function entrarComSenha(email, password) {
    var supa = obterCliente();
    if (!supa) throw new Error('SDK Supabase indisponível.');
    var r = await supa.auth.signInWithPassword({ email: email.trim(), password: password });
    if (r.error) throw r.error;
    return r.data;
  }

  async function criarContaEmail(email, password, nome) {
    var supa = obterCliente();
    if (!supa) throw new Error('SDK Supabase indisponível.');
    var r = await supa.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        emailRedirectTo: global.location.href.split('#')[0],
        data: { nome: (nome || '').trim() }
      }
    });
    if (r.error) throw r.error;
    return r.data;
  }

  async function redefinirSenha(email) {
    var supa = obterCliente();
    if (!supa) throw new Error('SDK Supabase indisponível.');
    var r = await supa.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: global.location.href.split('#')[0]
    });
    if (r.error) throw r.error;
    return true;
  }

  function entrarModoLocal(email, nome) {
    var loc = lerLocal();
    loc.usuario = {
      id: loc.usuario && loc.usuario.id ? loc.usuario.id : gerarUUID(),
      email: (email || 'cliente@local.dev').trim(),
      user_metadata: { nome: (nome || 'Comprador Local').trim() },
      modo_local: true
    };
    salvarLocal(loc);
    return loc.usuario;
  }

  async function sair() {
    var supa = obterCliente();
    if (supa) {
      try {
        await supa.auth.signOut();
      } catch (_e) {
        // segue limpeza local
      }
    }
    var loc = lerLocal();
    loc.usuario = null;
    salvarLocal(loc);
  }

  async function carregarDadosCliente(sessao, empresaAtivaId) {
    var pronto = await checarMigracao();
    var loc = lerLocal();

    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var empRes = await supa.from('site_empresas').select('*').order('criado_em', { ascending: true });
      if (empRes.error) throw empRes.error;
      var empresas = empRes.data || [];
      var ativa = empresas.find(function (x) { return x.id === empresaAtivaId; }) || empresas[0] || null;
      if (!ativa) {
        return { modo: 'supabase', empresas: [], empresaAtiva: null, bancario: null, fabricas: [], cotacoes: [], kits: [], visitas: [], chamados: [] };
      }

      var [banR, fabR, cotR, kitR, visR, chaR] = await Promise.all([
        supa.from('site_empresas_bancario').select('*').eq('empresa_id', ativa.id).maybeSingle(),
        supa.from('site_cadastros_fabrica').select('*').eq('empresa_id', ativa.id),
        supa.from('site_cotacoes').select('*, site_cotacao_itens(*)').eq('empresa_id', ativa.id).order('criada_em', { ascending: false }),
        supa.from('site_kits_reposicao').select('*').eq('empresa_id', ativa.id).order('criado_em', { ascending: false }),
        supa.from('site_solicitacoes_visita').select('*').eq('empresa_id', ativa.id).order('criada_em', { ascending: false }),
        supa.from('site_chamados_pos_venda').select('*').eq('empresa_id', ativa.id).order('criado_em', { ascending: false })
      ]);

      return {
        modo: 'supabase',
        empresas: empresas,
        empresaAtiva: ativa,
        bancario: (banR && banR.data) || {},
        fabricas: (fabR && fabR.data && fabR.data.length) ? fabR.data : fabricasPadrao(ativa.id),
        cotacoes: (cotR && cotR.data) || [],
        kits: (kitR && kitR.data) || [],
        visitas: (visR && visR.data) || [],
        chamados: (chaR && chaR.data) || []
      };
    }

    // Modo fallback local (offline ou migração SQL ainda não aplicada no Supabase)
    var emps = loc.empresas || [];
    var atv = emps.find(function (x) { return x.id === empresaAtivaId; }) || emps[0] || null;
    if (!atv) {
      return { modo: 'local', empresas: [], empresaAtiva: null, bancario: {}, fabricas: [], cotacoes: [], kits: [], visitas: [], chamados: [] };
    }
    return {
      modo: 'local',
      empresas: emps,
      empresaAtiva: atv,
      bancario: loc.bancarioPorEmpresa[atv.id] || {},
      fabricas: loc.fabricasPorEmpresa[atv.id] || fabricasPadrao(atv.id),
      cotacoes: (loc.cotacoes || []).filter(function (c) { return c.empresa_id === atv.id; }),
      kits: (loc.kits || []).filter(function (k) { return k.empresa_id === atv.id; }),
      visitas: (loc.visitas || []).filter(function (v) { return v.empresa_id === atv.id; }),
      chamados: (loc.chamados || []).filter(function (ch) { return ch.empresa_id === atv.id; })
    };
  }

  async function cadastrarEmpresaNivel1(sessao, payload) {
    var pronto = await checarMigracao();
    var cnpjDig = apenasDigitos(payload.cnpj);

    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r = await supa.rpc('cadastrar_empresa_site', {
        p_cnpj: cnpjDig,
        p_razao_social: payload.razao_social,
        p_nome_fantasia: payload.nome_fantasia || null,
        p_cep: payload.cep || null,
        p_endereco: payload.endereco || null,
        p_numero: payload.numero || null,
        p_complemento: payload.complemento || null,
        p_bairro: payload.bairro || null,
        p_cidade: payload.cidade || null,
        p_uf: payload.uf || 'RJ',
        p_telefone_fixo_1: payload.telefone_fixo_1 || null,
        p_celular_whatsapp: payload.celular_whatsapp || null,
        p_email_geral: payload.email_geral || null,
        p_email_compras: payload.email_compras || null,
        p_contato_comercial: payload.contato_comercial || null,
        p_cargo: payload.cargo || null
      });
      if (r.error) throw r.error;
      return r.data;
    }

    var loc = lerLocal();
    var existente = loc.empresas.find(function (e) { return e.cnpj === cnpjDig; });
    if (existente) {
      return { empresa_id: existente.id, ja_existia: true, vinculado: true };
    }
    var id = gerarUUID();
    var nova = Object.assign({
      id: id,
      cnpj: cnpjDig,
      uf: 'RJ',
      representante: 'M A JOAQUIM REPRESENTAÇÃO.',
      forma_pagamento_diferenciada: 'NÃO',
      nivel_cadastro: 1,
      criado_em: new Date().toISOString()
    }, payload, { cnpj: cnpjDig });
    loc.empresas.push(nova);
    loc.fabricasPorEmpresa[id] = fabricasPadrao(id);
    salvarLocal(loc);
    return { empresa_id: id, ja_existia: false, vinculado: true };
  }

  async function salvarFichaCompleta(sessao, empresaId, dadosEmp, dadosBan) {
    var pronto = await checarMigracao();
    var dadosLimpos = Object.assign({}, dadosEmp, { nivel_cadastro: 2 });
    delete dadosLimpos.id;
    delete dadosLimpos.cnpj;

    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r1 = await supa.from('site_empresas').update(dadosLimpos).eq('id', empresaId).select().single();
      if (r1.error) throw r1.error;

      var temBan = dadosBan && (dadosBan.banco_nome || dadosBan.banco_numero || dadosBan.agencia || dadosBan.conta);
      if (temBan) {
        var bPayload = Object.assign({ empresa_id: empresaId }, dadosBan);
        var r2 = await supa.from('site_empresas_bancario').upsert(bPayload, { onConflict: 'empresa_id' });
        if (r2.error) throw r2.error;
      }
      return r1.data;
    }

    var loc = lerLocal();
    loc.empresas = loc.empresas.map(function (e) {
      return e.id === empresaId ? Object.assign({}, e, dadosLimpos, { atualizado_em: new Date().toISOString() }) : e;
    });
    if (dadosBan) {
      loc.bancarioPorEmpresa[empresaId] = Object.assign({ empresa_id: empresaId }, dadosBan);
    }
    salvarLocal(loc);
    return loc.empresas.find(function (e) { return e.id === empresaId; });
  }

  async function solicitarFabrica(sessao, empresaId, marcaSlug) {
    var pronto = await checarMigracao();
    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r = await supa.rpc('solicitar_cadastro_fabrica_site', {
        p_empresa_id: empresaId,
        p_marca_slug: marcaSlug
      });
      if (r.error) throw r.error;
      return r.data;
    }

    var loc = lerLocal();
    var lista = loc.fabricasPorEmpresa[empresaId] || fabricasPadrao(empresaId);
    lista = lista.map(function (f) {
      if (f.marca_slug !== marcaSlug) return f;
      if (f.status === 'nao_solicitado' || f.status === 'pendencia_documento') {
        return Object.assign({}, f, { status: 'pendente_envio', solicitado_em: new Date().toISOString() });
      }
      return f;
    });
    loc.fabricasPorEmpresa[empresaId] = lista;
    salvarLocal(loc);
    return lista.find(function (f) { return f.marca_slug === marcaSlug; });
  }

  async function salvarCotacao(sessao, empresaId, cotacao, itens) {
    var pronto = await checarMigracao();
    var cotId = cotacao.id || ('COT-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase());
    var numero = cotacao.numero || cotId;
    var registro = Object.assign({
      id: cotId,
      numero: numero,
      empresa_id: empresaId,
      autor_id: sessao && sessao.user ? sessao.user.id : null,
      status: cotacao.status || 'enviada',
      observacoes_gerais: cotacao.observacoes_gerais || '',
      observacoes_por_marca: cotacao.observacoes_por_marca || {},
      canal: cotacao.canal || 'site_whatsapp',
      criada_em: new Date().toISOString()
    }, cotacao, { id: cotId, numero: numero, empresa_id: empresaId });

    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r1 = await supa.from('site_cotacoes').insert({
        id: registro.id,
        numero: registro.numero,
        empresa_id: empresaId,
        autor_id: registro.autor_id,
        status: registro.status,
        observacoes_gerais: registro.observacoes_gerais,
        observacoes_por_marca: registro.observacoes_por_marca,
        canal: registro.canal
      }).select().single();
      if (r1.error) throw r1.error;

      if (itens && itens.length) {
        var r2 = await supa.from('site_cotacao_itens').insert(itens.map(function (it) {
          return {
            cotacao_id: registro.id,
            marca_slug: it.marca_slug || it.marca || 'sibb',
            marca_nome: it.marca_nome || it.marca || 'SIBB',
            codigo: it.codigo || '',
            nome: it.nome || it.codigo || 'Item sem nome',
            secao: it.secao || '',
            quantidade: Math.max(1, Number(it.quantidade || it.qtd || 1)),
            observacao_item: it.observacao_item || ''
          };
        }));
        if (r2.error) throw r2.error;
      }
      return Object.assign({}, r1.data, { site_cotacao_itens: itens });
    }

    var loc = lerLocal();
    registro.site_cotacao_itens = itens || [];
    loc.cotacoes.unshift(registro);
    salvarLocal(loc);
    return registro;
  }

  async function salvarKit(sessao, empresaId, kit) {
    var pronto = await checarMigracao();
    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r = await supa.from('site_kits_reposicao').insert({
        empresa_id: empresaId,
        nome: kit.nome,
        descricao: kit.descricao || '',
        itens: kit.itens || []
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    }

    var loc = lerLocal();
    var novo = {
      id: gerarUUID(),
      empresa_id: empresaId,
      nome: kit.nome,
      descricao: kit.descricao || '',
      itens: kit.itens || [],
      criado_em: new Date().toISOString()
    };
    loc.kits.unshift(novo);
    salvarLocal(loc);
    return novo;
  }

  async function excluirKit(sessao, kitId) {
    var pronto = await checarMigracao();
    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r = await supa.from('site_kits_reposicao').delete().eq('id', kitId);
      if (r.error) throw r.error;
      return true;
    }
    var loc = lerLocal();
    loc.kits = loc.kits.filter(function (k) { return k.id !== kitId; });
    salvarLocal(loc);
    return true;
  }

  async function solicitarVisita(sessao, empresaId, visita) {
    var pronto = await checarMigracao();
    var vId = 'VIS-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase();
    var reg = Object.assign({
      id: vId,
      empresa_id: empresaId,
      autor_id: sessao && sessao.user ? sessao.user.id : null,
      status: 'solicitada',
      criada_em: new Date().toISOString()
    }, visita, { id: vId, empresa_id: empresaId });

    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r = await supa.from('site_solicitacoes_visita').insert({
        id: reg.id,
        empresa_id: empresaId,
        autor_id: reg.autor_id,
        objetivo: reg.objetivo,
        data_preferida: reg.data_preferida || null,
        turno: reg.turno || 'qualquer',
        representante_preferido: reg.representante_preferido || 'qualquer',
        corredor_sugerido: reg.corredor_sugerido || null,
        observacoes: reg.observacoes || ''
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    }

    var loc = lerLocal();
    loc.visitas.unshift(reg);
    salvarLocal(loc);
    return reg;
  }

  async function abrirChamadoPosVenda(sessao, empresaId, chamado) {
    var pronto = await checarMigracao();
    var chId = 'POS-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase();
    var reg = Object.assign({
      id: chId,
      empresa_id: empresaId,
      autor_id: sessao && sessao.user ? sessao.user.id : null,
      status: 'aberto',
      criado_em: new Date().toISOString()
    }, chamado, { id: chId, empresa_id: empresaId });

    if (sessao && sessao.origem === 'supabase' && pronto) {
      var supa = obterCliente();
      var r = await supa.from('site_chamados_pos_venda').insert({
        id: reg.id,
        empresa_id: empresaId,
        autor_id: reg.autor_id,
        marca_slug: reg.marca_slug,
        tipo: reg.tipo,
        numero_nf_ou_pedido: reg.numero_nf_ou_pedido || '',
        descricao: reg.descricao
      }).select().single();
      if (r.error) throw r.error;
      return r.data;
    }

    var loc = lerLocal();
    loc.chamados.unshift(reg);
    salvarLocal(loc);
    return reg;
  }

  async function registrarEventoBusca(termo, marcaSlug, resultados) {
    var limpo = String(termo || '').trim().slice(0, 120);
    if (limpo.length < 2) return;
    var loc = lerLocal();
    loc.buscas = (loc.buscas || []).slice(0, 49);
    loc.buscas.unshift({
      termo: limpo,
      marca_slug: marcaSlug || 'global',
      resultados: Number(resultados || 0),
      criado_em: new Date().toISOString()
    });
    salvarLocal(loc);

    var pronto = await checarMigracao();
    var supa = obterCliente();
    if (!pronto || !supa) return;
    try {
      await supa.from('site_eventos_busca').insert({
        termo: limpo,
        marca_slug: marcaSlug || 'global',
        resultados: Number(resultados || 0)
      });
    } catch (_e) {
      // Silencioso para não impactar UX de busca
    }
  }

  /* ---------- Métodos exclusivos do /painel/ (Representantes) ---------- */
  async function verificarRepresentante() {
    var supa = obterCliente();
    if (!supa) return { ehRep: false, rep: null };
    try {
      var s = await supa.auth.getSession();
      if (!s || !s.data || !s.data.session) return { ehRep: false, rep: null };
      var uid = s.data.session.user.id;
      var r = await supa.from('representantes').select('*').eq('user_id', uid).eq('ativo', true).maybeSingle();
      if (r.error || !r.data) return { ehRep: false, rep: null, user: s.data.session.user };
      return { ehRep: true, rep: r.data, user: s.data.session.user };
    } catch (_e) {
      return { ehRep: false, rep: null };
    }
  }

  async function carregarPainelRepresentante() {
    var pronto = await checarMigracao();
    var repInfo = await verificarRepresentante();
    var loc = lerLocal();

    if (repInfo.ehRep && pronto) {
      var supa = obterCliente();
      var [empR, resR, fabR, cotR, visR, chaR, busR, banR] = await Promise.all([
        supa.from('site_empresas').select('*').order('atualizado_em', { ascending: false }),
        supa.from('site_empresas_resumo_carteira').select('*'),
        supa.from('site_cadastros_fabrica').select('*'),
        supa.from('site_cotacoes').select('*, site_cotacao_itens(*)').order('criada_em', { ascending: false }).limit(80),
        supa.from('site_solicitacoes_visita').select('*').order('criada_em', { ascending: false }).limit(80),
        supa.from('site_chamados_pos_venda').select('*').order('criado_em', { ascending: false }).limit(80),
        supa.from('site_eventos_busca').select('*').eq('resultados', 0).order('criado_em', { ascending: false }).limit(80),
        supa.from('site_empresas_bancario').select('*')
      ]);

      return {
        modo: 'supabase',
        rep: repInfo.rep,
        empresas: (empR && empR.data) || [],
        resumos: (resR && resR.data) || [],
        fabricas: (fabR && fabR.data) || [],
        cotacoes: (cotR && cotR.data) || [],
        visitas: (visR && visR.data) || [],
        chamados: (chaR && chaR.data) || [],
        buscas: (busR && busR.data) || [],
        bancarios: (banR && banR.data) || []
      };
    }

    var fabricasAll = [];
    Object.keys(loc.fabricasPorEmpresa || {}).forEach(function (eid) {
      fabricasAll = fabricasAll.concat(loc.fabricasPorEmpresa[eid] || []);
    });
    var bancariosAll = Object.keys(loc.bancarioPorEmpresa || {}).map(function (eid) {
      return loc.bancarioPorEmpresa[eid];
    });

    return {
      modo: 'local',
      rep: repInfo.rep,
      empresas: loc.empresas || [],
      resumos: [],
      fabricas: fabricasAll,
      cotacoes: loc.cotacoes || [],
      visitas: loc.visitas || [],
      chamados: loc.chamados || [],
      buscas: (loc.buscas || []).filter(function (b) { return Number(b.resultados) === 0; }),
      bancarios: bancariosAll
    };
  }

  async function atualizarStatusCotacaoRep(id, status, resposta, motivoNaoFechou) {
    var pronto = await checarMigracao();
    var repInfo = await verificarRepresentante();
    var supa = obterCliente();
    if (repInfo.ehRep && pronto && supa) {
      var payload = { status: status };
      if (resposta !== undefined) payload.resposta_representante = resposta;
      if (motivoNaoFechou !== undefined) payload.motivo_nao_fechou = motivoNaoFechou || '';
      if (status === 'respondida') payload.respondida_em = new Date().toISOString();
      var r = await supa.from('site_cotacoes').update(payload).eq('id', id).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
    var loc = lerLocal();
    loc.cotacoes = loc.cotacoes.map(function (c) {
      return c.id === id ? Object.assign({}, c, {
        status: status,
        resposta_representante: resposta !== undefined ? resposta : c.resposta_representante,
        motivo_nao_fechou: motivoNaoFechou !== undefined ? (motivoNaoFechou || '') : c.motivo_nao_fechou,
        respondida_em: status === 'respondida' ? new Date().toISOString() : c.respondida_em
      }) : c;
    });
    salvarLocal(loc);
    return loc.cotacoes.find(function (c) { return c.id === id; });
  }

  async function atualizarFabricaRep(empresaId, marcaSlug, status, observacao, codigoFabrica) {
    var pronto = await checarMigracao();
    var repInfo = await verificarRepresentante();
    var supa = obterCliente();
    if (repInfo.ehRep && pronto && supa) {
      var upd = {
        empresa_id: empresaId,
        marca_slug: marcaSlug,
        status: status,
        observacao_representante: observacao || '',
        codigo_cliente_fabrica: codigoFabrica || ''
      };
      if (status === 'aprovado') upd.aprovado_em = new Date().toISOString();
      var r = await supa.from('site_cadastros_fabrica').upsert(upd, { onConflict: 'empresa_id,marca_slug' }).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
    var loc = lerLocal();
    var lista = loc.fabricasPorEmpresa[empresaId] || fabricasPadrao(empresaId);
    lista = lista.map(function (f) {
      if (f.marca_slug !== marcaSlug) return f;
      return Object.assign({}, f, {
        status: status,
        observacao_representante: observacao || '',
        codigo_cliente_fabrica: codigoFabrica || ''
      });
    });
    loc.fabricasPorEmpresa[empresaId] = lista;
    salvarLocal(loc);
    return lista.find(function (f) { return f.marca_slug === marcaSlug; });
  }

  async function atualizarVisitaRep(id, status, dataConf, horaConf, resposta) {
    var pronto = await checarMigracao();
    var repInfo = await verificarRepresentante();
    var supa = obterCliente();
    if (repInfo.ehRep && pronto && supa) {
      var upd = { status: status };
      if (dataConf !== undefined) upd.data_confirmada = dataConf || null;
      if (horaConf !== undefined) upd.hora_confirmada = horaConf || null;
      if (resposta !== undefined) upd.resposta_representante = resposta;
      var r = await supa.from('site_solicitacoes_visita').update(upd).eq('id', id).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
    var loc = lerLocal();
    loc.visitas = loc.visitas.map(function (v) {
      return v.id === id ? Object.assign({}, v, { status: status, data_confirmada: dataConf, hora_confirmada: horaConf, resposta_representante: resposta }) : v;
    });
    salvarLocal(loc);
    return loc.visitas.find(function (v) { return v.id === id; });
  }

  async function atualizarChamadoRep(id, status, resposta) {
    var pronto = await checarMigracao();
    var repInfo = await verificarRepresentante();
    var supa = obterCliente();
    if (repInfo.ehRep && pronto && supa) {
      var upd = { status: status };
      if (resposta !== undefined) upd.resposta_representante = resposta;
      var r = await supa.from('site_chamados_pos_venda').update(upd).eq('id', id).select().single();
      if (r.error) throw r.error;
      return r.data;
    }
    var loc = lerLocal();
    loc.chamados = loc.chamados.map(function (c) {
      return c.id === id ? Object.assign({}, c, { status: status, resposta_representante: resposta }) : c;
    });
    salvarLocal(loc);
    return loc.chamados.find(function (c) { return c.id === id; });
  }

  function removerEmpresaLocal(empresaId) {
    var loc = lerLocal();
    loc.empresas = (loc.empresas || []).filter(function (e) { return e.id !== empresaId; });
    delete loc.bancarioPorEmpresa[empresaId];
    delete loc.fabricasPorEmpresa[empresaId];
    loc.cotacoes = (loc.cotacoes || []).filter(function (c) { return c.empresa_id !== empresaId; });
    loc.kits = (loc.kits || []).filter(function (k) { return k.empresa_id !== empresaId; });
    loc.visitas = (loc.visitas || []).filter(function (v) { return v.empresa_id !== empresaId; });
    loc.chamados = (loc.chamados || []).filter(function (ch) { return ch.empresa_id !== empresaId; });
    salvarLocal(loc);
    return true;
  }

  function obterWebhookWorkspace() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_WEBHOOK) || '{}');
    } catch (_e) {
      return {};
    }
  }

  function salvarWebhookWorkspace(url, token) {
    localStorage.setItem(CHAVE_WEBHOOK, JSON.stringify({ url: (url || '').trim(), token: (token || '').trim() }));
  }

  async function dispararWebhookWorkspace(acao, dados) {
    var cfg = obterWebhookWorkspace();
    if (!cfg.url || !cfg.token) return { enviado: false, motivo: 'Webhook Google Workspace não configurado.' };
    var corpo = JSON.stringify(Object.assign({ acao: acao, token: cfg.token }, dados || {}));
    await fetch(cfg.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: corpo
    });
    return { enviado: true };
  }

  global.MAJ_SUPA = {
    SUPABASE_URL: SUPABASE_URL,
    obterCliente: obterCliente,
    checarMigracao: checarMigracao,
    obterSessao: obterSessao,
    entrarComGoogle: entrarComGoogle,
    entrarComSenha: entrarComSenha,
    criarContaEmail: criarContaEmail,
    redefinirSenha: redefinirSenha,
    entrarModoLocal: entrarModoLocal,
    sair: sair,
    carregarDadosCliente: carregarDadosCliente,
    cadastrarEmpresaNivel1: cadastrarEmpresaNivel1,
    salvarFichaCompleta: salvarFichaCompleta,
    solicitarFabrica: solicitarFabrica,
    salvarCotacao: salvarCotacao,
    salvarKit: salvarKit,
    excluirKit: excluirKit,
    solicitarVisita: solicitarVisita,
    abrirChamadoPosVenda: abrirChamadoPosVenda,
    registrarEventoBusca: registrarEventoBusca,
    verificarRepresentante: verificarRepresentante,
    carregarPainelRepresentante: carregarPainelRepresentante,
    atualizarStatusCotacaoRep: atualizarStatusCotacaoRep,
    atualizarFabricaRep: atualizarFabricaRep,
    atualizarVisitaRep: atualizarVisitaRep,
    atualizarChamadoRep: atualizarChamadoRep,
    removerEmpresaLocal: removerEmpresaLocal,
    obterWebhookWorkspace: obterWebhookWorkspace,
    salvarWebhookWorkspace: salvarWebhookWorkspace,
    dispararWebhookWorkspace: dispararWebhookWorkspace,
    apenasDigitos: apenasDigitos
  };
})(typeof window !== 'undefined' ? window : globalThis);
