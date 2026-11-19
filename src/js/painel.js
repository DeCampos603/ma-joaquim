/* M.A Joaquim Representação — Painel do Representante (/painel/)
   Exclusivo para representantes ativos (`public.representantes` / Alexandre & Deivid)
   ou pré-visualização com dados locais do navegador.
*/
(function (global) {
  'use strict';

  var MARCAS = [
    { slug: 'suryha', nome: 'Suryha' },
    { slug: 'sibb', nome: 'SIBB' },
    { slug: 'coel', nome: 'Coel' },
    { slug: 'perfiltec', nome: 'Perfiltec' }
  ];

  var ROTULOS_COT = {
    rascunho: 'Rascunho',
    enviada: 'Enviada',
    em_atendimento: 'Em atendimento',
    respondida: 'Respondida',
    fechou_pedido: 'Pedido fechado',
    nao_fechou: 'Não fechou'
  };

  var ROTULOS_FAB = {
    nao_solicitado: 'Não solicitado',
    pendente_envio: 'Aguardando envio',
    em_analise: 'Em análise',
    aprovado: 'Aprovado',
    pendencia_documento: 'Pendência doc.'
  };

  var ROTULOS_VIS = {
    solicitada: 'Solicitada',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    remarcada: 'Remarcada',
    cancelada: 'Cancelada'
  };

  var ROTULOS_CHA = {
    aberto: 'Aberto',
    em_andamento: 'Em andamento',
    resolvido: 'Resolvido'
  };

  var estado = {
    auth: { ehRep: false, rep: null, user: null },
    previaLocal: false,
    dados: null,
    aba: 'cotacoes',
    filtroCotStatus: '',
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

  function mostrarToast(msg) {
    var el = document.getElementById('pnl-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(estado.toastTimer);
    estado.toastTimer = setTimeout(function () { el.hidden = true; }, 4500);
  }

  function uint8ToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function empPorId(id) {
    return (estado.dados.empresas || []).find(function (e) { return e.id === id; }) || {};
  }

  function bancarioPorEmp(id) {
    return (estado.dados.bancarios || []).find(function (b) { return b.empresa_id === id; }) || {};
  }

  function resumoPorEmp(id) {
    return (estado.dados.resumos || []).find(function (r) { return r.empresa_id === id; }) || null;
  }

  function estaAtrasada24h(c) {
    if (!c || (c.status !== 'enviada' && c.status !== 'em_atendimento') || !c.criada_em) return false;
    return (Date.now() - new Date(c.criada_em).getTime()) > 86400000;
  }

  function csvCel(v) {
    var s = String(v == null ? '' : v).replace(/\r?\n/g, ' ').trim();
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function baixarCsv(nomeArq, linhas) {
    var corpo = '\uFEFF' + linhas.map(function (cols) { return cols.map(csvCel).join(';'); }).join('\r\n');
    var blob = new Blob([corpo], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeArq;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function renderAuthRep(root) {
    var logadoSemRep = estado.auth && estado.auth.user && !estado.auth.ehRep;
    root.innerHTML =
      '<div class="cli-card" style="max-width:560px;margin:0 auto">' +
        '<div class="cli-card__cab"><div><h2>Acesso Restrito ao Representante</h2><p class="cli-subtxt">Entre com sua conta de representante cadastrado no Portal Comercial para gerenciar cotações, fichas e visitas do site.</p></div></div>' +
        (logadoSemRep
          ? '<div class="cli-alerta cli-alerta--aviso">Você entrou como <strong>' + esc(estado.auth.user.email) + '</strong>, mas este usuário não está ativo na tabela de representantes. Se você é cliente, acesse a <a href="../cliente/">Área do Cliente</a>.</div>'
          : '') +
        '<div id="pnl-auth-msg"></div>' +
        '<button type="button" class="cli-btn-google" data-pnl-acao="login-google">Entrar com Google (Representante)</button>' +
        '<div class="cli-divisor">ou e-mail e senha</div>' +
        '<form id="form-pnl-auth" class="cli-form-grade">' +
          '<div class="cli-campo cli-col-12"><label for="pnl-email">E-mail do representante</label><input id="pnl-email" name="email" type="email" required placeholder="majoaquim@representacaorj.com"></div>' +
          '<div class="cli-campo cli-col-12"><label for="pnl-senha">Senha</label><input id="pnl-senha" name="senha" type="password" required></div>' +
          '<div class="cli-col-12 cli-acoes">' +
            '<button type="submit" class="cli-btn cli-btn--prim">Entrar no Painel</button>' +
            (logadoSemRep ? '<button type="button" class="cli-btn cli-btn--sec" data-pnl-acao="sair">Trocar usuário</button>' : '') +
            '<button type="button" class="cli-btn cli-btn--sec" data-pnl-acao="abrir-previa-local">Pré-visualizar dados locais deste navegador</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  function renderAbaCotacoes(d) {
    var lista = (d.cotacoes || []).filter(function (c) {
      if (estado.filtroCotStatus === 'atrasadas_24h') return estaAtrasada24h(c);
      return !estado.filtroCotStatus || c.status === estado.filtroCotStatus;
    });

    return '<div class="cli-card">' +
      '<div class="cli-card__cab">' +
        '<div><h2>Inbox de Cotações do Site</h2><p class="cli-subtxt">Acompanhe pedidos gerados na Área do Cliente, atualize o status e responda direto no WhatsApp.</p></div>' +
        '<select aria-label="Filtrar cotações por status" data-pnl-filtro-cot style="min-height:42px;padding:6px 10px;border-radius:10px;border:1px solid #cbd5e1">' +
          '<option value="">Todos os status</option>' +
          '<option value="atrasadas_24h"' + (estado.filtroCotStatus === 'atrasadas_24h' ? ' selected' : '') + '>Sem resposta há +24h</option>' +
          Object.keys(ROTULOS_COT).map(function (k) {
            return '<option value="' + k + '"' + (estado.filtroCotStatus === k ? ' selected' : '') + '>' + ROTULOS_COT[k] + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      (lista.length
        ? lista.map(function (c) {
            var emp = empPorId(c.empresa_id);
            var itens = c.site_cotacao_itens || [];
            var telWa = apenasDig(emp.celular_whatsapp || '');
            if (telWa && !telWa.startsWith('55')) telWa = '55' + telWa;
            var resumoItens = itens.map(function (it) {
              return (it.quantidade || 1) + 'x [' + it.marca_nome + '] ' + (it.codigo || '') + ' ' + it.nome;
            }).join('\n');
            var atrasada = estaAtrasada24h(c);

            return '<article class="cli-card" style="background:var(--gelo-50);margin-bottom:14px">' +
              '<div class="cli-card__cab" style="margin-bottom:10px">' +
                '<div><strong>' + esc(c.numero || c.id) + '</strong> · ' + esc(emp.razao_social || 'Empresa') + ' (' + esc(fmtCnpj(emp.cnpj)) + ')<br>' +
                  '<small class="cli-subtxt">Criada em ' + esc(fmtData(c.criada_em)) + ' · ' + esc(emp.cidade || '') + '/' + esc(emp.uf || 'RJ') + ' · WhatsApp: ' + esc(emp.celular_whatsapp || '—') + '</small></div>' +
                '<div class="cli-acoes">' +
                  (atrasada ? '<span class="cli-status cli-status--pendencia_documento">Sem resposta &gt; 24h</span>' : '') +
                  '<span class="cli-status cli-status--' + esc(c.status) + '">' + esc(ROTULOS_COT[c.status] || c.status) + '</span>' +
                '</div>' +
              '</div>' +
              '<ul style="margin:0 0 12px;padding-left:18px;font-size:.9rem">' +
                itens.map(function (it) {
                  return '<li><strong>' + esc(it.quantidade) + 'x</strong> [' + esc(it.marca_nome) + '] ' + esc(it.codigo ? it.codigo + ' — ' : '') + esc(it.nome) + '</li>';
                }).join('') +
              '</ul>' +
              (c.observacoes_gerais ? '<p class="cli-subtxt" style="margin-bottom:10px"><strong>Obs. do cliente:</strong> ' + esc(c.observacoes_gerais) + '</p>' : '') +
              '<form class="cli-form-grade" data-form-cot="' + esc(c.id) + '">' +
                '<div class="cli-campo cli-col-4"><label>Novo status</label><select name="status">' +
                  Object.keys(ROTULOS_COT).map(function (k) {
                    return '<option value="' + k + '"' + (c.status === k ? ' selected' : '') + '>' + ROTULOS_COT[k] + '</option>';
                  }).join('') +
                '</select></div>' +
                '<div class="cli-campo cli-col-4"><label>Motivo (se não fechou)</label><input name="motivo_nao_fechou" value="' + esc(c.motivo_nao_fechou || '') + '" placeholder="Ex.: preço, prazo, estoque"></div>' +
                '<div class="cli-campo cli-col-4"><label>Retorno para o cliente</label><input name="resposta" value="' + esc(c.resposta_representante || '') + '" placeholder="Espelho enviado / aguardando"></div>' +
                '<div class="cli-col-12 cli-acoes">' +
                  '<button type="submit" class="cli-btn cli-btn--prim cli-btn--mini">Salvar status</button>' +
                  (telWa ? '<a class="cli-btn cli-btn--zap cli-btn--mini" target="_blank" rel="noopener" href="https://wa.me/' + esc(telWa) + '?text=' + encodeURIComponent('Olá! Sobre a cotação ' + (c.numero || c.id) + ' (' + emp.razao_social + '):\n' + resumoItens) + '">Responder no WhatsApp</a>' : '') +
                '</div>' +
              '</form>' +
            '</article>';
          }).join('')
        : '<div class="cli-alerta cli-alerta--info">Nenhuma cotação encontrada.</div>') +
    '</div>';
  }

  function renderAbaEmpresas(d) {
    var linhas = (d.empresas || []).map(function (e) {
      var res = resumoPorEmp(e.id);
      var etiquetaCarteira = 'Novo no Site';
      var classeCarteira = 'pendente_envio';
      if (res && res.carteira_origem === 'ativo') { etiquetaCarteira = 'Carteira: Ativo (' + (res.codigo_sigma_carteira || '') + ')'; classeCarteira = 'aprovado'; }
      else if (res && res.carteira_origem === 'recuperacao') { etiquetaCarteira = 'Carteira: Recuperação'; classeCarteira = 'solicitada'; }
      else if (res && res.carteira_origem === 'inativo') { etiquetaCarteira = 'Carteira: Inativo'; classeCarteira = 'pendencia_documento'; }
      else if (e.cliente_carteira_id) { etiquetaCarteira = 'Vinculado à Carteira'; classeCarteira = 'aprovado'; }

      return '<tr>' +
        '<td><strong>' + esc(e.razao_social) + '</strong><br><small class="cli-subtxt">' + esc(fmtCnpj(e.cnpj)) + ' · ' + esc(e.cidade || '') + '/' + esc(e.uf || 'RJ') + '</small></td>' +
        '<td><span class="cli-status cli-status--' + classeCarteira + '">' + esc(etiquetaCarteira) + '</span>' +
          (res && res.carteira_ultima_visita ? '<br><small class="cli-subtxt">Últ. visita carteira: ' + esc(fmtData(res.carteira_ultima_visita)) + '</small>' : '') +
        '</td>' +
        '<td>Nível ' + esc(e.nivel_cadastro || 1) + '<br><small class="cli-subtxt">' + esc(e.celular_whatsapp || e.email_compras || '—') + '</small></td>' +
        '<td><div class="cli-acoes">' +
          '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-pnl-xlsx="' + esc(e.id) + '">Baixar .xlsx</button>' +
          '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-pnl-drive="' + esc(e.id) + '">Enviar Drive</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Clientes Cadastrados & Cruzamento com Carteira</h2><p class="cli-subtxt">Identifica automaticamente se o CNPJ já faz parte da sua carteira (Ativo / Recuperação / Inativo) e gera a planilha .xlsx oficial.</p></div></div>' +
      (d.empresas.length
        ? '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Empresa / CNPJ</th><th>Cruzamento Portal Comercial</th><th>Nível / Contato</th><th>Ficha Oficial</th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
        : '<div class="cli-alerta cli-alerta--info">Nenhuma empresa cadastrada ainda.</div>') +
    '</div>';
  }

  function renderAbaFabricas(d) {
    var blocos = (d.empresas || []).map(function (emp) {
      var fabs = (d.fabricas || []).filter(function (f) { return f.empresa_id === emp.id; });
      return '<article class="cli-card" style="background:var(--gelo-50);margin-bottom:14px">' +
        '<h3 style="margin:0 0 12px">' + esc(emp.razao_social) + ' <small class="cli-subtxt">(' + esc(fmtCnpj(emp.cnpj)) + ')</small></h3>' +
        '<div class="cli-semaforo">' +
          MARCAS.map(function (m) {
            var fab = fabs.find(function (x) { return x.marca_slug === m.slug; }) || { empresa_id: emp.id, marca_slug: m.slug, status: 'nao_solicitado' };
            return '<form class="cli-fabrica cli-fabrica--' + esc(m.slug) + '" data-form-fab="' + esc(emp.id) + ':' + esc(m.slug) + '">' +
              '<strong>' + esc(m.nome) + '</strong>' +
              '<div class="cli-campo"><label>Status</label><select name="status">' +
                Object.keys(ROTULOS_FAB).map(function (k) {
                  return '<option value="' + k + '"' + (fab.status === k ? ' selected' : '') + '>' + ROTULOS_FAB[k] + '</option>';
                }).join('') +
              '</select></div>' +
              '<div class="cli-campo"><label>Código na fábrica</label><input name="codigo_cliente_fabrica" value="' + esc(fab.codigo_cliente_fabrica || '') + '" placeholder="Opcional"></div>' +
              '<div class="cli-campo"><label>Observação</label><input name="observacao_representante" value="' + esc(fab.observacao_representante || '') + '" placeholder="Ex.: Falta IE / Aprovado"></div>' +
              '<button type="submit" class="cli-btn cli-btn--prim cli-btn--mini">Atualizar</button>' +
            '</form>';
          }).join('') +
        '</div>' +
      '</article>';
    }).join('');

    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Semáforo de Cadastros nas 4 Fábricas</h2><p class="cli-subtxt">Aprove ou aponte pendências de cadastro que aparecem em tempo real no painel do cliente.</p></div></div>' +
      (blocos || '<div class="cli-alerta cli-alerta--info">Nenhuma empresa cadastrada ainda.</div>') +
    '</div>';
  }

  function renderAbaVisitasPos(d) {
    var visHtml = (d.visitas || []).map(function (v) {
      var emp = empPorId(v.empresa_id);
      return '<article class="cli-card" style="background:var(--gelo-50);margin-bottom:12px">' +
        '<p style="margin:0 0 8px"><strong>' + esc(emp.razao_social || 'Cliente') + '</strong> · ' + esc(v.objetivo) + ' <span class="cli-status cli-status--' + esc(v.status) + '">' + esc(ROTULOS_VIS[v.status] || v.status) + '</span></p>' +
        '<p class="cli-subtxt" style="margin:0 0 10px">Corredor: ' + esc(v.corredor_sugerido || 'RJ') + ' · Preferência: ' + esc(v.data_preferida || '—') + ' (' + esc(v.turno) + ')</p>' +
        '<form class="cli-form-grade" data-form-vis="' + esc(v.id) + '">' +
          '<div class="cli-campo cli-col-3"><label>Status</label><select name="status">' +
            Object.keys(ROTULOS_VIS).map(function (k) { return '<option value="' + k + '"' + (v.status === k ? ' selected' : '') + '>' + ROTULOS_VIS[k] + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="cli-campo cli-col-3"><label>Data confirmada</label><input type="date" name="data_confirmada" value="' + esc(v.data_confirmada || v.data_preferida || '') + '"></div>' +
          '<div class="cli-campo cli-col-2"><label>Hora</label><input type="time" name="hora_confirmada" value="' + esc(v.hora_confirmada || '10:00') + '"></div>' +
          '<div class="cli-campo cli-col-4"><label>Mensagem ao cliente</label><input name="resposta" value="' + esc(v.resposta_representante || '') + '" placeholder="Ex.: Passo às 10h30 com o mostruário"></div>' +
          '<div class="cli-col-12 cli-acoes">' +
            '<button type="submit" class="cli-btn cli-btn--prim cli-btn--mini">Confirmar / Salvar</button>' +
            '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-pnl-vis-cal="' + esc(v.id) + '">Enviar p/ Google Agenda</button>' +
          '</div>' +
        '</form>' +
      '</article>';
    }).join('');

    var chaHtml = (d.chamados || []).map(function (ch) {
      var emp = empPorId(ch.empresa_id);
      return '<article class="cli-card" style="background:var(--gelo-50);margin-bottom:12px">' +
        '<p style="margin:0 0 6px"><strong>' + esc(emp.razao_social || 'Cliente') + '</strong> · ' + esc(ch.marca_slug.toUpperCase()) + ' · ' + esc(ch.tipo) + ' <span class="cli-status cli-status--' + esc(ch.status) + '">' + esc(ROTULOS_CHA[ch.status] || ch.status) + '</span></p>' +
        '<p class="cli-subtxt" style="margin:0 0 10px">' + esc(ch.numero_nf_ou_pedido ? 'NF/Ped: ' + ch.numero_nf_ou_pedido + ' · ' : '') + esc(ch.descricao) + '</p>' +
        '<form class="cli-form-grade" data-form-cha="' + esc(ch.id) + '">' +
          '<div class="cli-campo cli-col-4"><label>Status</label><select name="status">' +
            Object.keys(ROTULOS_CHA).map(function (k) { return '<option value="' + k + '"' + (ch.status === k ? ' selected' : '') + '>' + ROTULOS_CHA[k] + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="cli-campo cli-col-8"><label>Retorno (boleto/XML/rastreio)</label><input name="resposta" value="' + esc(ch.resposta_representante || '') + '" placeholder="Ex.: Boleto atualizado enviado no e-mail financeiro."></div>' +
          '<div class="cli-col-12"><button type="submit" class="cli-btn cli-btn--prim cli-btn--mini">Atualizar chamado</button></div>' +
        '</form>' +
      '</article>';
    }).join('');

    return '<div class="cli-card"><div class="cli-card__cab"><div><h2>Solicitações de Visita Presencial</h2></div></div>' + (visHtml || '<p class="cli-subtxt">Nenhuma visita solicitada.</p>') + '</div>' +
      '<div class="cli-card"><div class="cli-card__cab"><div><h2>Chamados Pós-Venda (Boletos / XML / Garantias)</h2></div></div>' + (chaHtml || '<p class="cli-subtxt">Nenhum chamado aberto.</p>') + '</div>';
  }

  function renderAbaBuscas(d) {
    var mapa = {};
    (d.buscas || []).forEach(function (b) {
      var k = String(b.termo || '').trim().toLowerCase();
      if (!k) return;
      if (!mapa[k]) mapa[k] = { termo: b.termo, origem: b.marca_slug, vezes: 0, ultima: b.criado_em };
      mapa[k].vezes++;
    });
    var lista = Object.values(mapa).sort(function (a, b) { return b.vezes - a.vezes; });

    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Buscas Sem Resultado (Demandas Não Atendidas)</h2><p class="cli-subtxt">Termos e códigos pesquisados por clientes no site e no conversor que ainda não retornaram item.</p></div></div>' +
      (lista.length
        ? '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Termo / Código pesquisado</th><th>Origem</th><th>Qtd. buscas</th><th>Última busca</th></tr></thead><tbody>' +
          lista.map(function (x) {
            return '<tr><td><strong>' + esc(x.termo) + '</strong></td><td>' + esc(x.origem || '—') + '</td><td>' + x.vezes + '</td><td>' + esc(fmtData(x.ultima)) + '</td></tr>';
          }).join('') +
          '</tbody></table></div>'
        : '<div class="cli-alerta cli-alerta--info">Nenhuma busca sem resultado registrada até o momento.</div>') +
    '</div>';
  }

  function renderAbaWorkspace() {
    var cfg = global.MAJ_SUPA.obterWebhookWorkspace();
    return '<div class="cli-card">' +
      '<div class="cli-card__cab"><div><h2>Integração Google Workspace (Drive + Agenda + Gmail)</h2><p class="cli-subtxt">Configure o App da Web criado em <code>majoaquim@representacaorj.com</code> usando o arquivo <code>apps_script_workspace.gs</code>.</p></div></div>' +
      '<form id="form-pnl-ws" class="cli-form-grade">' +
        '<div class="cli-campo cli-col-8"><label for="ws-url">URL do App da Web (Apps Script)</label><input id="ws-url" name="url" type="url" value="' + esc(cfg.url || '') + '" placeholder="https://script.google.com/macros/s/.../exec"></div>' +
        '<div class="cli-campo cli-col-4"><label for="ws-token">Token Secreto (WEBHOOK_TOKEN)</label><input id="ws-token" name="token" type="password" value="' + esc(cfg.token || '') + '" placeholder="Mesmo token das Propriedades do Script"></div>' +
        '<div class="cli-col-12 cli-acoes">' +
          '<button type="submit" class="cli-btn cli-btn--prim">Salvar configuração neste navegador</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function renderAbaMacro(d) {
    var cots = d.cotacoes || [];
    var emps = d.empresas || [];
    var encerradas = cots.filter(function (c) { return c.status === 'fechou_pedido' || c.status === 'nao_fechou'; });
    var fechadas = cots.filter(function (c) { return c.status === 'fechou_pedido'; });
    var taxaConv = encerradas.length ? Math.round((fechadas.length / encerradas.length) * 100) + '%' : '—';
    var atrasadas24 = cots.filter(estaAtrasada24h).length;

    var temposH = [];
    cots.forEach(function (c) {
      if (c.criada_em && c.respondida_em) {
        var diffH = (new Date(c.respondida_em).getTime() - new Date(c.criada_em).getTime()) / 3600000;
        if (diffH >= 0 && diffH < 720) temposH.push(diffH);
      }
    });
    var tempoMedio = temposH.length ? Math.round(temposH.reduce(function (a, b) { return a + b; }, 0) / temposH.length) + 'h' : '—';

    var volMarca = { suryha: 0, sibb: 0, coel: 0, perfiltec: 0 };
    var cotPorMarca = { suryha: 0, sibb: 0, coel: 0, perfiltec: 0 };
    var topItensMap = {};
    var totalUnidades = 0;

    cots.forEach(function (c) {
      var marcasNaCot = {};
      (c.site_cotacao_itens || []).forEach(function (it) {
        var sl = String(it.marca_slug || it.marca_nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        var q = Math.max(1, Number(it.quantidade || 1));
        if (Object.prototype.hasOwnProperty.call(volMarca, sl)) {
          volMarca[sl] += q;
          marcasNaCot[sl] = true;
        }
        totalUnidades += q;
        var kIt = (it.codigo || it.nome) + '|' + (it.marca_nome || sl);
        if (!topItensMap[kIt]) topItensMap[kIt] = { marca: it.marca_nome || sl, cod: it.codigo || '', nome: it.nome || '', vezes: 0, unidades: 0 };
        topItensMap[kIt].vezes++;
        topItensMap[kIt].unidades += q;
      });
      Object.keys(marcasNaCot).forEach(function (mSlug) { cotPorMarca[mSlug]++; });
    });

    var coresMarca = { suryha: '#0d75c0', sibb: '#0076c4', coel: '#e2231a', perfiltec: '#16a34a' };
    var maxVol = Math.max(1, volMarca.suryha, volMarca.sibb, volMarca.coel, volMarca.perfiltec);
    var svgBarras = '<svg viewBox="0 0 560 152" width="100%" height="152" role="img" aria-label="Unidades cotadas no site por fábrica">' +
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

    var topItens = Object.values(topItensMap).sort(function (a, b) { return b.unidades - a.unidades; }).slice(0, 10);

    var cidMap = {};
    emps.forEach(function (e) {
      var cid = (e.cidade || 'Não informada').trim() + '/' + (e.uf || 'RJ');
      if (!cidMap[cid]) cidMap[cid] = { cidade: cid, lojas: 0, cotacoes: 0 };
      cidMap[cid].lojas++;
      cidMap[cid].cotacoes += cots.filter(function (c) { return c.empresa_id === e.id; }).length;
    });
    var rankCidades = Object.values(cidMap).sort(function (a, b) { return b.cotacoes - a.cotacoes || b.lojas - a.lojas; }).slice(0, 10);

    var agora = Date.now();
    var parados = [];
    emps.forEach(function (e) {
      var cotsEmp = cots.filter(function (c) { return c.empresa_id === e.id; }).sort(function (a, b) {
        return new Date(b.criada_em || 0).getTime() - new Date(a.criada_em || 0).getTime();
      });
      if (!cotsEmp.length) {
        parados.push({ emp: e, dias: null, motivo: 'Cadastrou CNPJ e ainda não enviou 1ª cotação' });
      } else {
        var dias = Math.floor((agora - new Date(cotsEmp[0].criada_em).getTime()) / 86400000);
        if (dias >= 30) {
          parados.push({ emp: e, dias: dias, motivo: 'Há ' + dias + ' dias sem cotar' });
        }
      }
    });

    var datasCot = cots.map(function (c) { return new Date(c.criada_em || 0).getTime(); }).filter(Boolean);
    var janelaDias = datasCot.length >= 2 ? Math.round((Math.max.apply(null, datasCot) - Math.min.apply(null, datasCot)) / 86400000) : 0;

    return '<div class="cli-card">' +
        '<div class="cli-card__cab">' +
          '<div><h2>Visão Macro, Conversão &amp; Relatórios</h2><p class="cli-subtxt">Desempenho comercial das cotações do site, top itens, clientes parados e exportações seguras (sem dados bancários).</p></div>' +
          '<div class="cli-acoes">' +
            '<button type="button" class="cli-btn cli-btn--prim cli-btn--mini" data-pnl-acao="exportar-csv-clientes">Exportar CSV Clientes</button>' +
            '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-pnl-acao="exportar-csv-cotacoes">Exportar CSV Cotações</button>' +
            '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-pnl-acao="imprimir-relatorio-painel">Imprimir / PDF</button>' +
          '</div>' +
        '</div>' +
        '<div class="cli-kpis">' +
          '<div class="cli-kpi"><small>Taxa de conversão</small><strong>' + esc(taxaConv) + '</strong></div>' +
          '<div class="cli-kpi"><small>Tempo médio resposta</small><strong>' + esc(tempoMedio) + '</strong></div>' +
          '<div class="cli-kpi"><small>Aguardando &gt; 24h</small><strong>' + atrasadas24 + '</strong></div>' +
          '<div class="cli-kpi"><small>Unidades cotadas</small><strong>' + totalUnidades + '</strong></div>' +
        '</div>' +
        '<h3 style="margin:18px 0 8px;color:var(--navy-900)">Volume por Fábrica Representada</h3>' +
        svgBarras +
        '<div class="cli-tabela-wrap" style="margin-top:12px"><table class="cli-tabela"><thead><tr><th>Fábrica</th><th>Cotações c/ a marca</th><th>Unidades cotadas</th></tr></thead><tbody>' +
          MARCAS.map(function (m) {
            return '<tr><td><strong>' + esc(m.nome) + '</strong></td><td>' + (cotPorMarca[m.slug] || 0) + '</td><td>' + (volMarca[m.slug] || 0) + '</td></tr>';
          }).join('') +
        '</tbody></table></div>' +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h3>Top 10 Itens Mais Cotados &amp; Ranking por Cidade</h3></div></div>' +
        (topItens.length
          ? '<div class="cli-tabela-wrap" style="margin-bottom:16px"><table class="cli-tabela"><thead><tr><th>Item</th><th>Fábrica</th><th>Cotações</th><th>Total un.</th></tr></thead><tbody>' +
              topItens.map(function (it) {
                return '<tr><td><strong>' + esc(it.cod || '—') + '</strong> · ' + esc(it.nome) + '</td><td>' + esc(it.marca) + '</td><td>' + it.vezes + '</td><td>' + it.unidades + '</td></tr>';
              }).join('') +
            '</tbody></table></div>'
          : '<p class="cli-subtxt">Ainda não há itens cotados no histórico.</p>') +
        (rankCidades.length
          ? '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Cidade / UF</th><th>Lojas cadastradas</th><th>Cotações no site</th></tr></thead><tbody>' +
              rankCidades.map(function (rc) {
                return '<tr><td><strong>' + esc(rc.cidade) + '</strong></td><td>' + rc.lojas + '</td><td>' + rc.cotacoes + '</td></tr>';
              }).join('') +
            '</tbody></table></div>'
          : '') +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h3>Clientes Parados (Lista de Reativação)</h3><p class="cli-subtxt">Lojas cadastradas há +30 dias sem cotar ou que ainda não enviaram a primeira cotação.</p></div></div>' +
        (parados.length
          ? '<div class="cli-tabela-wrap"><table class="cli-tabela"><thead><tr><th>Empresa / Cidade</th><th>Situação</th><th>Contato</th></tr></thead><tbody>' +
              parados.map(function (p) {
                var waN = apenasDig(p.emp.celular_whatsapp || '');
                if (waN && !waN.startsWith('55')) waN = '55' + waN;
                return '<tr><td><strong>' + esc(p.emp.razao_social) + '</strong><br><small class="cli-subtxt">' + esc(p.emp.cidade || '—') + '/' + esc(p.emp.uf || 'RJ') + '</small></td>' +
                  '<td><span class="cli-status cli-status--pendente_envio">' + esc(p.motivo) + '</span></td>' +
                  '<td>' + (waN ? '<a class="cli-btn cli-btn--zap cli-btn--mini" target="_blank" rel="noopener" href="https://wa.me/' + esc(waN) + '?text=' + encodeURIComponent('Olá, ' + (p.emp.contato_comercial || '') + '! Tudo bem? Aqui é da M.A Joaquim. Posso ajudar com alguma cotação da Suryha, SIBB, Coel ou Perfiltec esta semana?') + '">Acionar WhatsApp</a>' : esc(p.emp.email_compras || '—')) + '</td></tr>';
              }).join('') +
            '</tbody></table></div>'
          : '<div class="cli-alerta cli-alerta--ok">Todas as lojas cadastradas cotaram nos últimos 30 dias.</div>') +
      '</div>' +
      '<div class="cli-card">' +
        '<div class="cli-card__cab"><div><h3>Previsibilidade de Demanda (4 a 8 Semanas)</h3></div></div>' +
        (janelaDias < 90
          ? '<div class="cli-alerta cli-alerta--aviso"><strong>Limite honesto (janela atual: ' + janelaDias + ' dias):</strong> são necessários pelo menos <strong>3 meses (90 dias)</strong> de cotações registradas no site para projetar média móvel com ajuste sazonal confiável. Enquanto isso, utilize o volume acumulado acima e a fila de reativação para orientar compras e visitas.</div>'
          : '<div class="cli-alerta cli-alerta--info">Base acumulada de <strong>' + janelaDias + ' dias</strong>: tendência atual liderada por ' + esc(MARCAS.slice().sort(function (a, b) { return (volMarca[b.slug] || 0) - (volMarca[a.slug] || 0); })[0].nome) + ' com ' + totalUnidades + ' unidades no histórico.</div>') +
      '</div>';
  }

  function renderPainelLogado(root, d) {
    var pill = document.getElementById('pnl-sessao-pill');
    if (pill) {
      var ehNuvem = d.modo === 'supabase';
      pill.innerHTML =
        '<span class="cli-badge-modo ' + (ehNuvem ? 'cli-badge-modo--nuvem' : 'cli-badge-modo--local') + '">' + (ehNuvem ? 'Supabase Ativo' : 'Prévia Local') + '</span>' +
        '<span><strong>' + esc((estado.auth.rep && estado.auth.rep.nome) || (estado.auth.user && estado.auth.user.email) || 'Representante') + '</strong></span>' +
        (estado.auth.user ? '<button type="button" class="cli-btn cli-btn--sec cli-btn--mini" data-pnl-acao="sair">Sair</button>' : '');
    }

    var abas = [
      { id: 'cotacoes', nome: 'Inbox de Cotações', badge: String(d.cotacoes.length) },
      { id: 'empresas', nome: 'Clientes & Carteira', badge: String(d.empresas.length) },
      { id: 'fabricas', nome: 'Semáforo Fábricas', badge: '4' },
      { id: 'visitas', nome: 'Visitas & Pós-Venda', badge: String(d.visitas.length + d.chamados.length) },
      { id: 'macro', nome: 'Visão Macro & Relatórios', badge: 'BI' },
      { id: 'buscas', nome: 'Buscas s/ Resultado', badge: String(d.buscas.length) },
      { id: 'workspace', nome: 'Google Workspace', badge: '' }
    ];

    var conteudo = '';
    if (estado.aba === 'cotacoes') conteudo = renderAbaCotacoes(d);
    else if (estado.aba === 'empresas') conteudo = renderAbaEmpresas(d);
    else if (estado.aba === 'fabricas') conteudo = renderAbaFabricas(d);
    else if (estado.aba === 'visitas') conteudo = renderAbaVisitasPos(d);
    else if (estado.aba === 'macro') conteudo = renderAbaMacro(d);
    else if (estado.aba === 'buscas') conteudo = renderAbaBuscas(d);
    else conteudo = renderAbaWorkspace();

    root.innerHTML =
      '<div class="cli-kpis">' +
        '<div class="cli-kpi"><small>Cotações recebidas</small><strong>' + d.cotacoes.length + '</strong></div>' +
        '<div class="cli-kpi"><small>Empresas cadastradas</small><strong>' + d.empresas.length + '</strong></div>' +
        '<div class="cli-kpi"><small>Visitas solicitadas</small><strong>' + d.visitas.length + '</strong></div>' +
        '<div class="cli-kpi"><small>Chamados pós-venda</small><strong>' + d.chamados.length + '</strong></div>' +
      '</div>' +
      '<div class="cli-shell">' +
        '<nav class="cli-nav" aria-label="Menu do Representante">' +
          abas.map(function (a) {
            return '<button type="button" class="cli-nav__btn" data-pnl-aba="' + a.id + '" aria-selected="' + (estado.aba === a.id) + '">' +
              '<span>' + esc(a.nome) + '</span>' +
              (a.badge ? '<span class="cli-nav__badge">' + esc(a.badge) + '</span>' : '') +
            '</button>';
          }).join('') +
        '</nav>' +
        '<div>' + conteudo + '</div>' +
      '</div>';
  }

  async function renderPainel() {
    var root = document.getElementById('app-painel');
    if (!root) return;
    root.innerHTML = '<div class="cli-card"><p>Verificando credenciais do representante...</p></div>';
    try {
      estado.auth = await global.MAJ_SUPA.verificarRepresentante();
      if (!estado.auth.ehRep && !estado.previaLocal) {
        renderAuthRep(root);
        return;
      }
      estado.dados = await global.MAJ_SUPA.carregarPainelRepresentante();
      renderPainelLogado(root, estado.dados);
    } catch (err) {
      root.innerHTML = '<div class="cli-alerta cli-alerta--erro">Erro ao carregar Painel: ' + esc(err && err.message ? err.message : err) + '</div>';
    }
  }

  document.addEventListener('click', async function (ev) {
    var alvo = ev.target.closest('button, [data-pnl-aba], [data-pnl-acao], [data-pnl-xlsx], [data-pnl-drive], [data-pnl-vis-cal]');
    if (!alvo || !document.getElementById('app-painel')) return;
    try {
      if (alvo.dataset.pnlAba) {
        estado.aba = alvo.dataset.pnlAba;
        renderPainelLogado(document.getElementById('app-painel'), estado.dados);
        return;
      }
      var ac = alvo.dataset.pnlAcao;
      if (ac === 'login-google') {
        await global.MAJ_SUPA.entrarComGoogle();
        return;
      }
      if (ac === 'sair') {
        await global.MAJ_SUPA.sair();
        estado.previaLocal = false;
        await renderPainel();
        return;
      }
      if (ac === 'abrir-previa-local') {
        estado.previaLocal = true;
        await renderPainel();
        return;
      }
      if (ac === 'imprimir-relatorio-painel') {
        global.print();
        return;
      }
      if (ac === 'exportar-csv-clientes') {
        var linhasCli = [['CNPJ', 'Razao Social', 'Nome Fantasia', 'Cidade', 'UF', 'Nivel Cadastro', 'Carteira Portal', 'Suryha', 'SIBB', 'Coel', 'Perfiltec', 'Contato Comercial', 'Email Compras', 'WhatsApp']];
        (estado.dados.empresas || []).forEach(function (e) {
          var res = resumoPorEmp(e.id);
          var statusPorMarca = function (ms) {
            var f = (estado.dados.fabricas || []).find(function (x) { return x.empresa_id === e.id && x.marca_slug === ms; });
            return (f && f.status) || 'nao_solicitado';
          };
          linhasCli.push([
            fmtCnpj(e.cnpj), e.razao_social || '', e.nome_fantasia || '', e.cidade || '', e.uf || 'RJ',
            'Nivel ' + (e.nivel_cadastro || 1), (res && res.carteira_origem) || (e.cliente_carteira_id ? 'vinculado' : 'novo_site'),
            statusPorMarca('suryha'), statusPorMarca('sibb'), statusPorMarca('coel'), statusPorMarca('perfiltec'),
            e.contato_comercial || '', e.email_compras || '', e.celular_whatsapp || ''
          ]);
        });
        baixarCsv('clientes-ma-joaquim.csv', linhasCli);
        mostrarToast('CSV de clientes exportado (sem dados bancários sensíveis).');
        return;
      }
      if (ac === 'exportar-csv-cotacoes') {
        var linhasCot = [['Numero', 'Data', 'Status', 'Empresa', 'CNPJ', 'Cidade', 'Marcas', 'Qtd Itens', 'Unidades', 'Motivo Nao Fechou', 'Resposta Representante']];
        (estado.dados.cotacoes || []).forEach(function (c) {
          var e = empPorId(c.empresa_id);
          var its = c.site_cotacao_itens || [];
          var marcas = Array.from(new Set(its.map(function (i) { return i.marca_nome; }).filter(Boolean))).join(', ');
          var totalU = its.reduce(function (acc, i) { return acc + Math.max(1, Number(i.quantidade || 1)); }, 0);
          linhasCot.push([
            c.numero || c.id, fmtData(c.criada_em), c.status || '', e.razao_social || '', fmtCnpj(e.cnpj),
            (e.cidade || '') + '/' + (e.uf || 'RJ'), marcas, its.length, totalU, c.motivo_nao_fechou || '', c.resposta_representante || ''
          ]);
        });
        baixarCsv('cotacoes-ma-joaquim.csv', linhasCot);
        mostrarToast('CSV de cotações exportado!');
        return;
      }
      if (alvo.dataset.pnlXlsx) {
        var emp = empPorId(alvo.dataset.pnlXlsx);
        var ban = bancarioPorEmp(emp.id);
        await global.MAJ_FICHA_XLSX.baixarFichaXlsx(Object.assign({}, emp, ban, {
          banco_titular_cnpj: ban.titular_cnpj,
          banco_titular_cpf: ban.titular_cpf
        }), '', '../modelos/ficha-cadastro-ma-joaquim.xlsx');
        mostrarToast('Planilha .xlsx oficial baixada!');
        return;
      }
      if (alvo.dataset.pnlDrive) {
        var cfg = global.MAJ_SUPA.obterWebhookWorkspace();
        if (!cfg.url || !cfg.token) {
          estado.aba = 'workspace';
          renderPainelLogado(document.getElementById('app-painel'), estado.dados);
          mostrarToast('Configure a URL e o token do Google Workspace primeiro.');
          return;
        }
        var empD = empPorId(alvo.dataset.pnlDrive);
        var banD = bancarioPorEmp(empD.id);
        var respTpl = await fetch('../modelos/ficha-cadastro-ma-joaquim.xlsx');
        var bufTpl = await respTpl.arrayBuffer();
        var bytesOut = global.MAJ_FICHA_XLSX.gerarBufferXlsx(bufTpl, Object.assign({}, empD, banD), '');
        await global.MAJ_SUPA.dispararWebhookWorkspace('salvar_cadastro_drive', {
          empresa: empD,
          nome_arquivo: 'Ficha_' + apenasDig(empD.cnpj) + '.xlsx',
          xlsx_base64: uint8ToBase64(bytesOut)
        });
        mostrarToast('Ficha enviada ao Google Drive da M.A Joaquim!');
        return;
      }
      if (alvo.dataset.pnlVisCal) {
        var vis = (estado.dados.visitas || []).find(function (v) { return v.id === alvo.dataset.pnlVisCal; });
        if (!vis) return;
        var empV = empPorId(vis.empresa_id);
        var cfgV = global.MAJ_SUPA.obterWebhookWorkspace();
        if (cfgV.url && cfgV.token) {
          await global.MAJ_SUPA.dispararWebhookWorkspace('agendar_visita_calendar', {
            empresa: empV,
            visita: Object.assign({}, vis, {
              corredor_logistico: vis.corredor_sugerido,
              data_inicio_iso: (vis.data_confirmada || vis.data_preferida || new Date().toISOString().slice(0, 10)) + 'T' + (vis.hora_confirmada || '10:00') + ':00-03:00'
            })
          });
          mostrarToast('Evento enviado para o Google Agenda da equipe!');
        } else {
          global.open(global.MAJ_FICHA_XLSX.linkGoogleCalendar(vis, empV), '_blank', 'noopener');
        }
      }
    } catch (errC) {
      mostrarToast('Erro: ' + (errC && errC.message ? errC.message : errC));
    }
  });

  document.addEventListener('submit', async function (ev) {
    var f = ev.target;
    if (!f || !document.getElementById('app-painel')) return;
    ev.preventDefault();
    try {
      var fd = new FormData(f);
      if (f.id === 'form-pnl-auth') {
        await global.MAJ_SUPA.entrarComSenha(fd.get('email'), fd.get('senha'));
        await renderPainel();
        return;
      }
      if (f.id === 'form-pnl-ws') {
        global.MAJ_SUPA.salvarWebhookWorkspace(fd.get('url'), fd.get('token'));
        mostrarToast('Configuração do Google Workspace salva.');
        return;
      }
      if (f.dataset.formCot) {
        await global.MAJ_SUPA.atualizarStatusCotacaoRep(f.dataset.formCot, fd.get('status'), fd.get('resposta'), fd.get('motivo_nao_fechou'));
        mostrarToast('Cotação atualizada!');
        await renderPainel();
        return;
      }
      if (f.dataset.formFab) {
        var partes = f.dataset.formFab.split(':');
        await global.MAJ_SUPA.atualizarFabricaRep(partes[0], partes[1], fd.get('status'), fd.get('observacao_representante'), fd.get('codigo_cliente_fabrica'));
        mostrarToast('Semáforo da fábrica atualizado!');
        await renderPainel();
        return;
      }
      if (f.dataset.formVis) {
        await global.MAJ_SUPA.atualizarVisitaRep(f.dataset.formVis, fd.get('status'), fd.get('data_confirmada'), fd.get('hora_confirmada'), fd.get('resposta'));
        mostrarToast('Visita atualizada!');
        await renderPainel();
        return;
      }
      if (f.dataset.formCha) {
        await global.MAJ_SUPA.atualizarChamadoRep(f.dataset.formCha, fd.get('status'), fd.get('resposta'));
        mostrarToast('Chamado pós-venda atualizado!');
        await renderPainel();
      }
    } catch (errF) {
      mostrarToast('Erro ao salvar: ' + (errF && errF.message ? errF.message : errF));
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !document.getElementById('app-painel')) return;
    if (t.hasAttribute('data-pnl-filtro-cot')) {
      estado.filtroCotStatus = t.value;
      renderPainelLogado(document.getElementById('app-painel'), estado.dados);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('app-painel')) return;
    renderPainel();
  });
})(typeof window !== 'undefined' ? window : globalThis);
