/* M.A Joaquim Representação — interações do site. Sem dependências. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ponteiroFino = matchMedia('(pointer: fine)').matches;
  const semAcento = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const raf = (fn) => { let p = false; return (...a) => { if (!p) { p = true; requestAnimationFrame(() => { p = false; fn(...a); }); } }; };

  /* ---------- topo, progresso, barra de WhatsApp ---------- */
  const topo = $('[data-topo]');
  const barraZap = $('.barra-zap');
  const aoRolar = raf(() => {
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    topo && topo.classList.toggle('rolou', y > 40);
    document.documentElement.style.setProperty('--p', h > 0 ? (y / h).toFixed(4) : 0);
    barraZap && barraZap.classList.toggle('mostra', y > innerHeight * .6);
  });
  addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();

  const btnMenu = $('[data-menu]'), menu = $('#menu');
  if (btnMenu && menu) {
    btnMenu.addEventListener('click', () => {
      const aberto = btnMenu.getAttribute('aria-expanded') === 'true';
      btnMenu.setAttribute('aria-expanded', String(!aberto));
      menu.classList.toggle('aberto', !aberto);
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) { btnMenu.setAttribute('aria-expanded', 'false'); menu.classList.remove('aberto'); } });
  }

  /* ---------- revelar ao rolar ---------- */
  $$('.revela-grupo').forEach((g) => [...g.children].forEach((c, i) => { c.classList.add('revela'); c.style.setProperty('--i', i); }));
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visivel'); io.unobserve(en.target); }
  }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  $$('.revela, [data-passos]').forEach((el) => io.observe(el));

  /* ---------- inclinação 3D no cursor ---------- */
  if (ponteiroFino && !calmo) {
    $$('[data-tilt]').forEach((el) => {
      const max = el.classList.contains('quem__foto') ? 5 : 7;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.classList.add('tilt-ativo');
        el.style.setProperty('--ry', ((x - .5) * max * 2).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((.5 - y) * max * 2).toFixed(2) + 'deg');
        const a = el.querySelector('a'); if (a) { a.style.setProperty('--mx', x * 100 + '%'); a.style.setProperty('--my', y * 100 + '%'); }
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('tilt-ativo'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- órbita 3D (herói e vitrine das marcas) ---------- */
  $$('[data-orbita]').forEach((orb) => {
    const anel = $('[data-anel]', orb), itens = $$('.orbita__item', anel), n = itens.length;
    if (!n) return;
    const passo = 360 / n;
    let rot = 0, alvo = 0, vel = calmo ? 0 : -0.08, arrastando = false, x0 = 0, rot0 = 0, visivel = true, ultimo = 0;
    itens.forEach((it, i) => it.style.setProperty('--i', i));
    anel.style.setProperty('--passo', passo + 'deg');
    if (orb.classList.contains('orbita--marca')) anel.style.setProperty('--inc', '-4deg');
    const medir = () => {
      const w = itens[0].offsetWidth || 180;
      const raio = Math.max(w * 1.05, (w * 1.08) / (2 * Math.tan(Math.PI / n)));
      // nos lados o item fica de perfil: o anel ocupa ~2R. Mantém dentro da coluna.
      const largura = orb.clientWidth;
      anel.style.setProperty('--raio-orb', Math.max(w * .7, Math.min(raio, largura * .48)) + 'px');
    };
    const pintar = () => {
      anel.style.setProperty('--rot', rot.toFixed(2) + 'deg');
      itens.forEach((it, i) => {
        const a = ((i * passo + rot) % 360 + 360) % 360;
        const perto = (Math.cos(a * Math.PI / 180) + 1) / 2;
        it.style.setProperty('--perto', perto.toFixed(3));
        it.style.zIndex = Math.round(perto * 100);
      });
    };
    const quadro = (t) => {
      const dt = Math.min(50, t - (ultimo || t)); ultimo = t;
      if (visivel) {
        if (!arrastando) {
          if (alvo !== null) { rot += (alvo - rot) * .12; if (Math.abs(alvo - rot) < .05) { rot = alvo; alvo = null; } }
          else if (!orb.matches(':hover') && document.activeElement !== orb) rot += vel * dt * .6;
        }
        pintar();
      }
      requestAnimationFrame(quadro);
    };
    alvo = null;
    medir(); pintar();
    addEventListener('resize', raf(medir));
    new IntersectionObserver(([en]) => { visivel = en.isIntersecting; }).observe(orb);
    requestAnimationFrame(quadro);
    const ir = (d) => { const base = Math.round(rot / passo) * passo; alvo = base + d * passo; };
    $('[data-ant]', orb).addEventListener('click', () => ir(1));
    $('[data-prox]', orb).addEventListener('click', () => ir(-1));
    orb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { ir(1); e.preventDefault(); } if (e.key === 'ArrowRight') { ir(-1); e.preventDefault(); } });
    const palco = $('.orbita__palco', orb);
    palco.addEventListener('pointerdown', (e) => { arrastando = true; alvo = null; x0 = e.clientX; rot0 = rot; orb.classList.add('arrastando'); palco.setPointerCapture(e.pointerId); });
    palco.addEventListener('pointermove', (e) => { if (arrastando) rot = rot0 + (e.clientX - x0) * .35; });
    const soltar = () => { if (!arrastando) return; arrastando = false; orb.classList.remove('arrastando'); alvo = Math.round(rot / passo) * passo; };
    palco.addEventListener('pointerup', soltar);
    palco.addEventListener('pointercancel', soltar);
  });

  /* ---------- lista de cotação (fica só no navegador) ---------- */
  const CHAVE = 'majoaquim:lista';
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return []; } };
  const gravar = (l) => { try { localStorage.setItem(CHAVE, JSON.stringify(l)); dispatchEvent(new CustomEvent('majoaquim:lista-site-alterada')); } catch { /* modo privado */ } };
  let lista = ler();
  const gaveta = $('[data-lista]');
  const botoesLista = $$('[data-abrir-lista]');

  function desenharLista() {
    $$('[data-lista-n]').forEach((el) => { el.textContent = lista.length; });
    if (!gaveta) return;
    const ul = $('[data-lista-itens]', gaveta);
    ul.innerHTML = '';
    lista.forEach((it, k) => {
      const li = document.createElement('li');
      li.className = 'lista__item';
      li.innerHTML = `<img alt=""><div><b></b><small></small></div>
        <div class="lista__qtd"><label class="sr">Quantidade</label><input type="number" min="1" inputmode="numeric">
        <button type="button" class="icone-btn" aria-label="Remover"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>`;
      // dados do localStorage entram só por propriedade, nunca como HTML
      $('img', li).src = it.img;
      $('input', li).id = `q${k}`; $('label', li).htmlFor = `q${k}`;
      $('input', li).value = it.qtd;
      $('b', li).textContent = it.nome;
      $('small', li).textContent = `${it.marca}${it.cod ? ' · ' + it.cod : ''}`;
      $('input', li).addEventListener('change', (e) => { it.qtd = Math.max(1, parseInt(e.target.value, 10) || 1); e.target.value = it.qtd; gravar(lista); });
      $('button', li).addEventListener('click', () => { lista.splice(k, 1); gravar(lista); desenharLista(); marcarCartoes(); });
      ul.appendChild(li);
    });
    $('[data-lista-vazia]', gaveta).hidden = lista.length > 0;
    $('[data-lista-enviar]', gaveta).disabled = lista.length === 0;
  }
  function marcarCartoes() {
    const ids = new Set(lista.map((i) => i.id));
    $$('[data-id]').forEach((c) => {
      const b = $('[data-add]', c); if (!b) return;
      const tem = ids.has(c.dataset.id);
      b.classList.toggle('na-lista', tem);
      b.querySelector('span') && (b.querySelector('span').textContent = tem ? 'Na lista' : 'Lista');
    });
  }
  function adicionar(d) {
    const ja = lista.find((i) => i.id === d.id);
    if (ja) { lista = lista.filter((i) => i.id !== d.id); }
    else { lista.push({ id: d.id, marca: d.marca, cod: d.cod, nome: d.nome, img: new URL(d.img, location.href).pathname, qtd: 1 }); }  // caminho absoluto: a lista é lida em qualquer página
    gravar(lista); desenharLista(); marcarCartoes();
    botoesLista.forEach((b) => { b.classList.remove('pulsa'); void b.offsetWidth; b.classList.add('pulsa'); });
    return !ja;
  }
  function abrirLista() {
    if (!gaveta) return;
    gaveta.hidden = false; document.body.style.overflow = 'hidden';
    botoesLista.forEach((b) => b.setAttribute('aria-expanded', 'true'));
    $('[data-fechar-lista]', gaveta.querySelector('.lista__topo')).focus();
  }
  function fecharLista() {
    if (!gaveta) return;
    gaveta.hidden = true; document.body.style.overflow = '';
    botoesLista.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    botoesLista[0] && botoesLista[0].focus();
  }
  botoesLista.forEach((b) => b.addEventListener('click', abrirLista));
  if (gaveta) {
    $$('[data-fechar-lista]', gaveta).forEach((b) => b.addEventListener('click', fecharLista));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !gaveta.hidden) fecharLista(); });
    $('[data-lista-limpar]', gaveta).addEventListener('click', () => { lista = []; gravar(lista); desenharLista(); marcarCartoes(); });
    $('[data-lista-enviar]', gaveta).addEventListener('click', () => {
      if (!lista.length) return;
      const linhas = lista.map((i) => `• ${i.marca}${i.cod ? ' ' + i.cod : ''} – ${i.nome} – qtd ${i.qtd}`);
      const obs = $('[data-lista-obs]', gaveta).value.trim();
      const msg = `Olá, Alexandre! Vim pelo site e quero cotação destes itens:\n${linhas.join('\n')}${obs ? '\n\nObs.: ' + obs : ''}`;
      window.open(`https://wa.me/${gaveta.dataset.zap}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    });
  }
  addEventListener('storage', (e) => { if (e.key === CHAVE) { lista = ler(); desenharLista(); marcarCartoes(); } });
  addEventListener('majoaquim:lista-cli-alterada', () => { lista = ler(); desenharLista(); marcarCartoes(); });
  desenharLista(); marcarCartoes();

  /* ---------- janela do produto ---------- */
  const dlg = $('[data-produto]');
  let atual = null;
  function abrirProduto(c) {
    if (!dlg) return;
    atual = { id: c.dataset.id, marca: c.dataset.marca, cod: c.dataset.cod, nome: c.dataset.nome, img: c.dataset.img };
    const img = $('[data-produto-img]', dlg);
    img.src = c.dataset.img; img.alt = `${c.dataset.nome} ${c.dataset.cod}`.trim();
    $('[data-produto-marca]', dlg).textContent = c.dataset.marca;
    $('[data-produto-nome]', dlg).textContent = c.dataset.nome;
    $('[data-produto-cod]', dlg).textContent = c.dataset.cod ? `Código ${c.dataset.cod}` : '';
    $('[data-produto-secao]', dlg).textContent = [c.dataset.sec, c.dataset.det].filter(Boolean).join(' · ');
    const ul = $('[data-produto-spec]', dlg); ul.innerHTML = '';
    if (c.dataset.spec) JSON.parse(c.dataset.spec).forEach((s) => { const li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
    const naLista = lista.some((i) => i.id === atual.id);
    $('[data-produto-add]', dlg).lastChild.textContent = naLista ? ' Tirar da lista' : ' Adicionar à lista';
    const msg = `Olá, Alexandre! Vim pelo site e quero cotação do item ${c.dataset.marca}${c.dataset.cod ? ' ' + c.dataset.cod : ''} – ${c.dataset.nome}.`;
    $('[data-produto-zap]', dlg).href = `https://wa.me/${gaveta ? gaveta.dataset.zap : ''}?text=${encodeURIComponent(msg)}`;
    // 3D: o botão só aparece se o item tem modelo; o visualizador carrega ao pedir
    atual.modelo = c.dataset.modelo || ''; atual.modeloNota = c.dataset.modeloNota || '';
    const b3d = $('[data-produto-ver3d]', dlg);
    b3d.hidden = !atual.modelo;
    mostrar3d(false);
    if (atual.modelo && matchMedia('(min-width: 721px)').matches) mostrar3d(true);
    dlg.showModal();
  }

  /* ---------- visualizador 3D (model-viewer, carregado sob demanda) ---------- */
  const MV_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
  let mvPronto = null;
  const carregarMV = () => mvPronto || (mvPronto = new Promise((ok, falha) => {
    if (customElements.get('model-viewer')) return ok();
    const s = document.createElement('script');
    s.type = 'module'; s.src = MV_URL; s.crossOrigin = 'anonymous';
    s.onload = () => customElements.whenDefined('model-viewer').then(ok);
    s.onerror = () => { mvPronto = null; falha(new Error('model-viewer')); };
    document.head.appendChild(s);
  }));
  function mostrar3d(ligar) {
    if (!dlg) return;
    const caixa = $('[data-produto-3d]', dlg), img = $('[data-produto-img]', dlg), b = $('[data-produto-ver3d]', dlg);
    b.setAttribute('aria-pressed', String(ligar));
    b.querySelector('span').textContent = ligar ? 'Ver foto' : 'Ver em 3D';
    if (!ligar || !atual || !atual.modelo) { caixa.hidden = true; caixa.innerHTML = ''; img.hidden = false; return; }
    caixa.hidden = false; img.hidden = true;
    caixa.innerHTML = '<p class="produto__3d-carregando">Carregando modelo 3D…</p>';
    const modelo = atual.modelo, nota = atual.modeloNota, nome = atual.nome;
    carregarMV().then(() => {
      if (!atual || atual.modelo !== modelo) return;
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', modelo);
      mv.setAttribute('poster', atual.img);
      mv.setAttribute('alt', `Modelo 3D de ${nome}`);
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('touch-action', 'pan-y');
      mv.setAttribute('shadow-intensity', '1');
      mv.setAttribute('exposure', '1.05');
      mv.setAttribute('environment-image', 'neutral');
      mv.setAttribute('ar', ''); mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
      if (!calmo) { mv.setAttribute('auto-rotate', ''); mv.setAttribute('auto-rotate-delay', '600'); }
      const ar = document.createElement('button');
      ar.slot = 'ar-button'; ar.type = 'button'; ar.className = 'btn btn--zap produto__ar'; ar.textContent = 'Ver no seu espaço (AR)';
      mv.appendChild(ar);
      caixa.innerHTML = '';
      caixa.appendChild(mv);
      if (nota) { const p = document.createElement('p'); p.className = 'produto__3d-nota'; p.textContent = nota; caixa.appendChild(p); }
    }).catch(() => { caixa.innerHTML = '<p class="produto__3d-carregando">Não foi possível carregar o 3D agora. Veja a foto.</p>'; });
  }
  if (dlg) {
    $('[data-produto-add]', dlg).addEventListener('click', () => {
      if (!atual) return;
      const entrou = adicionar(atual);
      $('[data-produto-add]', dlg).lastChild.textContent = entrou ? ' Tirar da lista' : ' Adicionar à lista';
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $('[data-produto-ver3d]', dlg).addEventListener('click', (e) => mostrar3d(e.currentTarget.getAttribute('aria-pressed') !== 'true'));
    dlg.addEventListener('close', () => mostrar3d(false));
    const palco = $('.produto__palco', dlg), img = $('img', palco);
    if (!calmo) {
      palco.addEventListener('pointermove', (e) => {
        const r = palco.getBoundingClientRect();
        img.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 30).toFixed(1) + 'deg');
        img.style.setProperty('--rx', ((.5 - (e.clientY - r.top) / r.height) * 24).toFixed(1) + 'deg');
      });
      palco.addEventListener('pointerleave', () => { img.style.setProperty('--rx', '0deg'); img.style.setProperty('--ry', '0deg'); });
    }
  }
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { const c = add.closest('[data-id]'); adicionar({ id: c.dataset.id, marca: c.dataset.marca, cod: c.dataset.cod, nome: c.dataset.nome, img: c.dataset.img }); return; }
    const ab = e.target.closest('[data-abrir-produto]');
    if (ab) abrirProduto(ab.closest('.cartao'));
  });

  /* ---------- catálogo da marca: busca, seção e paginação ---------- */
  let timerBuscaZero = null;
  function registrarBuscaZero(termo, marcaSlug) {
    const limpo = String(termo || '').trim().slice(0, 120);
    if (limpo.length < 3) return;
    clearTimeout(timerBuscaZero);
    timerBuscaZero = setTimeout(() => {
      if (window.MAJ_SUPA && typeof window.MAJ_SUPA.registrarEventoBusca === 'function') {
        window.MAJ_SUPA.registrarEventoBusca(limpo, marcaSlug || 'global', 0);
        return;
      }
      try {
        const ck = 'majoaquim:area_cliente:v1';
        const cur = JSON.parse(localStorage.getItem(ck) || '{}');
        const buscas = Array.isArray(cur.buscas) ? cur.buscas.slice(0, 49) : [];
        buscas.unshift({ termo: limpo, marca_slug: marcaSlug || 'global', resultados: 0, criado_em: new Date().toISOString() });
        localStorage.setItem(ck, JSON.stringify({ ...cur, buscas }));
      } catch { /* modo privado */ }
    }, 700);
  }

  $$('[data-catalogo]').forEach((sec) => {
    const cartoes = $$('.cartao', sec), entrada = $('[data-busca]', sec), chips = $$('[data-secao-filtro]', sec);
    const cont = $('[data-contagem]', sec), vazio = $('[data-vazio]', sec), mais = $('[data-mais]', sec);
    const POR = 36; let limite = POR, secao = '';
    const marcaSlug = (cartoes[0] && (cartoes[0].dataset.id || '').split(':')[0]) || 'catalogo';
    cartoes.forEach((c) => { c._t = semAcento(c.dataset.busca); });
    const aplicar = () => {
      const termos = semAcento(entrada.value).split(/\s+/).filter(Boolean);
      let n = 0, mostrados = 0;
      cartoes.forEach((c) => {
        const ok = !c._fora && (!secao || c.dataset.secao === secao) && termos.every((t) => c._t.includes(t));
        if (ok) n++;
        const ver = ok && n <= limite;
        c.hidden = !ver; if (ver) mostrados++;
      });
      cont.textContent = n === cartoes.length ? `${n} itens` : `${n} de ${cartoes.length} itens`;
      vazio.hidden = n > 0;
      if (n === 0 && entrada.value.trim().length >= 3) registrarBuscaZero(entrada.value, marcaSlug);
      mais.hidden = n <= limite;
      mais.textContent = `Mostrar mais (${n - mostrados} restantes)`;
    };
    let tm;
    entrada.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { limite = POR; aplicar(); }, 120); });
    chips.forEach((ch) => ch.addEventListener('click', () => {
      chips.forEach((x) => x.setAttribute('aria-pressed', String(x === ch)));
      cartoes.forEach((c) => { c._fora = false; });
      secao = ch.dataset.secaoFiltro; limite = POR; aplicar();
    }));
    mais.addEventListener('click', () => { limite += POR; aplicar(); });
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) { entrada.value = q; }
    // ?secao=A|B vem da navegação por categoria da página inicial
    const sp = params.get('secao');
    if (sp) {
      const lista = sp.split('|');
      if (lista.length === 1) {
        const ch = chips.find((x) => x.dataset.secaoFiltro === lista[0]);
        if (ch) { chips.forEach((x) => x.setAttribute('aria-pressed', String(x === ch))); secao = lista[0]; }
      } else {
        const conj = new Set(lista);
        chips.forEach((x) => x.setAttribute('aria-pressed', String(conj.has(x.dataset.secaoFiltro))));
        cartoes.forEach((c) => { if (!conj.has(c.dataset.secao)) c._fora = true; });
      }
    }
    aplicar();
  });

  /* ---------- busca em todas as marcas (início) ---------- */
  const bg = $('[data-busca-global]');
  if (bg) {
    const inlineIdx = $('#indice-catalogo');
    const prepIdx = (arr) => arr.map((i) => ({ ...i, t: semAcento(`${i.m} ${i.c} ${i.n} ${i.x} ${i.o || ''}`) }));
    let idxCache = inlineIdx ? prepIdx(JSON.parse(inlineIdx.textContent)) : null;
    let idxProm = null;
    const carregarIdx = () => {
      if (idxCache) return Promise.resolve(idxCache);
      if (!idxProm) {
        idxProm = fetch('dados/indice-busca.json')
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then((arr) => (idxCache = prepIdx(arr)))
          .catch((err) => { idxProm = null; throw err; });
      }
      return idxProm;
    };
    const inp = $('[data-busca-global-input]', bg), res = $('[data-busca-global-res]', bg), info = $('[data-busca-global-info]', bg);
    const caixaMarcas = $('[data-busca-global-marcas]', bg);
    const secoesCat = JSON.parse(($('#categorias-secoes') || { textContent: '{}' }).textContent);
    const desenhar = (achados) => {
      res.innerHTML = '';
      achados.slice(0, 24).forEach((i) => {
        const li = document.createElement('li');
        li.className = 'resultado';
        const a = document.createElement('a');
        a.href = `marcas/${i.s}/?q=${encodeURIComponent(i.c || i.n)}#catalogo`;
        a.innerHTML = '<img alt="" loading="lazy"><small></small><b></b>';
        $('img', a).src = i.i;
        $('small', a).textContent = `${i.m}${i.c ? ' · ' + i.c : ''}`;
        $('b', a).textContent = i.n;
        li.appendChild(a); res.appendChild(li);
      });
    };
    inp.addEventListener('focus', () => { carregarIdx().catch(() => {}); }, { once: true });
    let tm;
    inp.addEventListener('input', () => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        caixaMarcas.hidden = true;
        const val = inp.value.trim();
        res.innerHTML = '';
        if (val.length < 2) { info.textContent = 'Digite pelo menos 2 letras, ou escolha uma categoria acima.'; return; }
        if (!idxCache) info.textContent = 'Buscando…';
        carregarIdx().then((idx) => {
          const atualVal = inp.value.trim();
          if (atualVal.length < 2) { info.textContent = 'Digite pelo menos 2 letras, ou escolha uma categoria acima.'; return; }
          const termos = semAcento(atualVal).split(/\s+/).filter(Boolean);
          const achados = idx.filter((i) => termos.every((t) => i.t.includes(t)));
          info.textContent = achados.length ? `${achados.length} ${achados.length === 1 ? 'item encontrado' : 'itens encontrados'}${achados.length > 24 ? '. Mostrando os 24 primeiros' : ''}.` : 'Nada encontrado. Mande a foto ou o código pelo WhatsApp que eu procuro na fábrica.';
          if (!achados.length && atualVal.length >= 3) {
            registrarBuscaZero(atualVal, 'home');
          }
          desenhar(achados);
        }).catch(() => {
          info.textContent = 'Não foi possível carregar o índice agora. Tente abrir a página da marca.';
        });
      }, 140);
    });
    // navegação por categoria: mostra os itens das quatro marcas e um atalho por marca
    $$('[data-categoria]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.categoria, nome = b.dataset.categoriaNome;
      inp.value = '';
      caixaMarcas.innerHTML = '';
      caixaMarcas.hidden = true;
      res.innerHTML = '';
      if (!idxCache) info.textContent = `Carregando ${nome}…`;
      $('#catalogo').scrollIntoView({ behavior: calmo ? 'auto' : 'smooth' });
      carregarIdx().then((idx) => {
        const achados = idx.filter((i) => i.k === k);
        info.textContent = `${nome}: ${achados.length} itens${achados.length > 24 ? '. Abaixo, uma amostra; veja tudo na página de cada marca' : ''}.`;
        caixaMarcas.innerHTML = '';
        const porMarca = {};
        achados.forEach((i) => { (porMarca[i.s] = porMarca[i.s] || { nome: i.m, n: 0 }).n++; });
        Object.entries(porMarca).forEach(([s, v]) => {
          const secs = (secoesCat[k] || {})[s] || [];
          const a = document.createElement('a');
          a.className = 'chip';
          a.href = `marcas/${s}/${secs.length && secs[0] !== '*' ? '?secao=' + encodeURIComponent(secs.join('|')) : ''}#catalogo`;
          a.textContent = `Ver os ${v.n} da ${v.nome} →`;
          caixaMarcas.appendChild(a);
        });
        caixaMarcas.hidden = false;
        desenhar(achados);
      }).catch(() => {
        info.textContent = 'Não foi possível carregar o catálogo agora. Tente abrir a página da marca.';
      });
    }));
  }

  /* ---------- faixa de categorias: reinicia depois da fonte e para fora da tela ---------- */
  $$('[data-faixa]').forEach((fx) => {
    const grupos = $$('.faixa__grupo', fx);
    const reiniciar = () => {
      grupos.forEach((g) => { g.style.animation = 'none'; });
      void fx.offsetWidth;  // força o Safari a medir de novo com a fonte final
      grupos.forEach((g) => { g.style.animation = ''; });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reiniciar);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((ents) => ents.forEach((en) => fx.classList.toggle('parada', !en.isIntersecting))).observe(fx);
    }
  });

  /* ---------- tabela técnica com filtros (capacitores e equivalências OEM) ---------- */
  $$('[data-tabela-filtros]').forEach((f) => {
    const sec = f.closest('section'), linhas = $$('tbody tr', sec), cont = $('[data-tf-contagem]', sec);
    const busca = $('[data-tf-busca]', f), tipo = $('[data-tf-tipo]', f), tensao = $('[data-tf-tensao]', f);
    const unid = (cont && cont.dataset.tfUnidade) || 'capacitores';
    linhas.forEach((l) => { l._t = semAcento(l.dataset.busca).replace(/\s+/g, ''); });
    const aplicar = () => {
      const termos = semAcento(busca ? busca.value : '').split(/\s+/).filter(Boolean).map((t) => t.replace(/\s+/g, ''));
      const valTipo = tipo ? tipo.value : '';
      const valTensao = tensao ? tensao.value : '';
      let n = 0;
      linhas.forEach((l) => {
        const ok = (!valTipo || l.dataset.tipo === valTipo) && (!valTensao || l.dataset.tensao === valTensao) && termos.every((t) => l._t.includes(t));
        l.hidden = !ok; if (ok) n++;
      });
      if (cont) cont.textContent = n === linhas.length && !termos.length && !valTipo && !valTensao ? `${n} ${unid}` : `${n} de ${linhas.length} ${unid}`;
    };
    [busca, tipo, tensao].filter(Boolean).forEach((el) => { el.addEventListener('input', aplicar); el.addEventListener('change', aplicar); });
  });

  /* ---------- menu fixo da marca: marca a seção visível ---------- */
  const subnav = $('[data-subnav]');
  if (subnav) {
    const links = $$('a', subnav);
    const alvos = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
    const io2 = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle('ativo', a.getAttribute('href') === '#' + en.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    alvos.forEach((s) => io2.observe(s));
  }

  /* ---------- modelo 3D da fábrica (Sketchfab): só carrega ao clicar ---------- */
  $$('[data-sketchfab]').forEach((palco) => {
    const botao = $('.modelo3d__play', palco);
    botao.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = palco.dataset.src;
      f.title = palco.dataset.titulo;
      f.allow = 'autoplay; fullscreen; xr-spatial-tracking';
      f.setAttribute('allowfullscreen', '');
      f.loading = 'eager';
      palco.classList.add('ativo');
      palco.appendChild(f);
      botao.remove();
    });
  });

  /* ---------- âncora (#folhear, #tabela...) refeita depois que a página assenta ---------- */
  if (location.hash.length > 1) {
    let mexeu = false;
    const parar = () => { mexeu = true; };
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, parar, { once: true, passive: true }));
    const ancorar = () => { if (mexeu) return; const alvo = document.getElementById(decodeURIComponent(location.hash.slice(1))); alvo && alvo.scrollIntoView({ block: 'start', behavior: 'instant' }); };
    addEventListener('load', () => { ancorar(); setTimeout(ancorar, 500); });
  }

  /* ---------- folheador 3D ---------- */
  $$('[data-livro]').forEach((livro) => {
    const docs = JSON.parse(livro.dataset.docs);
    const palco = $('[data-livro-palco]', livro), pagEl = $('[data-livro-pag]', livro);
    const abas = $$('[data-doc]', livro.parentElement);
    let doc = 0, i = 0, dois = false, ocupado = false;
    const docPedido = parseInt(new URLSearchParams(location.search).get('doc'), 10);  // vindo de "Recursos técnicos"
    if (docPedido > 0 && docPedido < docs.length) {
      doc = docPedido;
      abas.forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.doc === doc)));
    }
    const pags = () => docs[doc].paginas;
    const novaImg = (p, cls) => { const im = new Image(); im.decoding = 'async'; im.alt = ''; if (p) { im.src = p.src; im.width = p.w; im.height = p.h; } im.className = cls; return im; };
    const preCarregar = (k) => { const p = pags()[k]; if (p) { const im = new Image(); im.src = p.src; } };
    function montar() {
      const p0 = pags()[0];
      dois = livro.clientWidth >= 760;
      if (!dois) i = Math.max(0, i); else i -= i % 2;
      palco.classList.toggle('um', !dois);
      livro.style.setProperty('--razao', ((dois ? 2 : 1) * p0.w / p0.h).toFixed(4));
      palco.innerHTML = '';
      if (dois) { palco.append(novaImg(pags()[i], 'livro__pag-img esq'), novaImg(pags()[i + 1], 'livro__pag-img dir')); }
      else palco.append(novaImg(pags()[i], 'livro__pag-img'));
      $$('.livro__pag-img', palco).forEach((im) => { if (!im.getAttribute('src')) im.style.visibility = 'hidden'; });
      const ze = document.createElement('button'), zd = document.createElement('button');
      ze.className = 'livro__zona e'; zd.className = 'livro__zona d'; ze.type = zd.type = 'button';
      ze.setAttribute('aria-label', 'Página anterior'); zd.setAttribute('aria-label', 'Próxima página'); ze.tabIndex = zd.tabIndex = -1;
      ze.style.background = zd.style.background = 'none'; ze.style.border = zd.style.border = '0';
      ze.onclick = () => voltar(); zd.onclick = () => avancar();
      palco.append(ze, zd);
      const tot = pags().length;
      pagEl.textContent = dois ? `${i + 1}${pags()[i + 1] ? '–' + (i + 2) : ''} de ${tot}` : `${i + 1} de ${tot}`;
      preCarregar(i + 2); preCarregar(i + 3);
    }
    function virar(dir) {
      const passo = dois ? 2 : 1, tot = pags().length;
      const novo = i + dir * passo;
      if (ocupado || novo < 0 || novo >= tot) return;
      if (calmo) { i = novo; montar(); return; }
      ocupado = true;
      const folha = document.createElement('div');
      folha.className = 'folha ' + (dir > 0 ? 'vai' : 'volta');
      let frente, verso;
      if (dois) {
        if (dir > 0) { frente = pags()[i + 1]; verso = pags()[novo]; $('.dir', palco).src = pags()[novo + 1] ? pags()[novo + 1].src : ''; if (!pags()[novo + 1]) $('.dir', palco).style.visibility = 'hidden'; }
        else { frente = pags()[i]; verso = pags()[novo + 1]; $('.esq', palco).src = pags()[novo].src; }
      } else {
        frente = pags()[dir > 0 ? i : novo]; verso = null;
        if (dir > 0) $('.livro__pag-img', palco).src = pags()[novo].src;
      }
      const f = novaImg(frente, 'frente'); folha.append(f);
      if (verso) folha.append(novaImg(verso, 'verso')); else { const v = document.createElement('div'); v.className = 'verso-branco verso'; folha.append(v); }
      if (!dois && dir < 0) folha.style.transform = 'rotateY(-180deg)';
      palco.append(folha);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        folha.classList.add('virando');
        if (dois) folha.style.transform = dir > 0 ? 'rotateY(-180deg)' : 'rotateY(180deg)';
        else folha.style.transform = dir > 0 ? 'rotateY(-180deg)' : 'rotateY(0deg)';
      }));
      const fim = () => { i = novo; ocupado = false; montar(); };
      folha.addEventListener('transitionend', fim, { once: true });
      setTimeout(() => { if (ocupado) fim(); }, 1200);
    }
    const avancar = () => virar(1), voltar = () => virar(-1);
    $('[data-livro-prox]', livro).addEventListener('click', avancar);
    $('[data-livro-ant]', livro).addEventListener('click', voltar);
    livro.tabIndex = 0;
    livro.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') avancar(); if (e.key === 'ArrowLeft') voltar(); });
    let x0 = null;
    palco.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    palco.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) (dx < 0 ? avancar : voltar)(); });
    abas.forEach((a) => a.addEventListener('click', () => {
      abas.forEach((b) => b.setAttribute('aria-selected', String(b === a)));
      doc = +a.dataset.doc; i = 0; montar();
    }));
    let larg = livro.clientWidth;
    addEventListener('resize', raf(() => { if (Math.abs(livro.clientWidth - larg) > 40) { larg = livro.clientWidth; montar(); } }));
    new IntersectionObserver(([en], obs) => { if (en.isIntersecting) { montar(); obs.disconnect(); } }, { rootMargin: '400px' }).observe(livro);
  });
})();
