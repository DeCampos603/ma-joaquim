/* ---------------------------------------------------------------------------
   Medição e Google Ads com consentimento prévio (LGPD).
   - Este arquivo só entra nas páginas quando dados/medicao.json tem algum ID
     (o build injeta window.SITE_ANALYTICS antes dele).
   - Nenhum script do Google é baixado e nenhum sinal é enviado antes de a pessoa
     clicar em "Aceitar". Se recusar ou ignorar, o site funciona igual.
   - Depois do aceite: Consent Mode v2 concedido, tags carregadas e duas conversões:
     clique em qualquer link do WhatsApp e envio da lista de cotação.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';
  var cfg = window.SITE_ANALYTICS || {};
  var temGtm = !!cfg.gtmId, temGtag = !!(cfg.ga4Id || cfg.adsId);
  if (!temGtm && !temGtag) return;

  var CHAVE = 'maj_consent_v1';
  var SIM = { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };
  var NAO = { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  function ler() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function gravar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* modo privado */ } }

  var iniciado = false;
  function gtag() { window.dataLayer.push(arguments); }
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || gtag;
    gtag('consent', 'default', NAO);
    gtag('consent', 'update', SIM);
    var s = document.createElement('script');
    s.async = true;
    if (temGtm) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtmId);
    } else {
      gtag('js', new Date());
      if (cfg.ga4Id) gtag('config', cfg.ga4Id, { anonymize_ip: true });
      if (cfg.adsId) gtag('config', cfg.adsId);
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4Id || cfg.adsId);
    }
    document.head.appendChild(s);
  }

  function evento(nome, rotulo, extra) {
    if (!iniciado) return;
    var dados = Object.assign({ pagina: location.pathname }, extra || {});
    if (temGtm) { window.dataLayer.push(Object.assign({ event: nome }, dados)); return; }
    gtag('event', nome, dados);
    if (cfg.adsId && rotulo) gtag('event', 'conversion', { send_to: cfg.adsId + '/' + rotulo });
  }
  document.addEventListener('click', function (ev) {
    var alvo = ev.target.closest ? ev.target : null;
    if (!alvo) return;
    if (alvo.closest('[data-lista-enviar]')) { evento('lista_whatsapp', cfg.adsListaLabel || cfg.adsWhatsappLabel); return; }
    var a = alvo.closest('a[href*="wa.me/"]');
    if (a) evento('whatsapp_click', cfg.adsWhatsappLabel, { destino: a.href.split('?')[0].split('/').pop() });
  }, true);

  var escolha = ler();
  if (escolha === 'aceito') { iniciar(); return; }
  if (escolha === 'recusado') return;

  function aviso() {
    var box = document.createElement('div');
    box.className = 'cookies';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aviso de cookies');
    box.innerHTML = '<p>Uso cookies de medição para saber como o site é encontrado e melhorar o atendimento. ' +
      'Nada é medido sem a sua permissão, e o site funciona igual nas duas opções. ' +
      '<a href="/privacidade/">Política de privacidade</a>.</p>' +
      '<div class="cookies__acoes"><button type="button" class="btn btn--contorno" data-c="recusado">Recusar</button>' +
      '<button type="button" class="btn btn--primario" data-c="aceito">Aceitar</button></div>';
    box.addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-c');
      if (!v) return;
      gravar(v);
      if (v === 'aceito') iniciar();
      box.remove();
    });
    document.body.appendChild(box);
  }
  if (document.body) aviso(); else document.addEventListener('DOMContentLoaded', aviso);
})();
