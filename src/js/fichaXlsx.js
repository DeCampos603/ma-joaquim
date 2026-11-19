/* M.A Joaquim Representação — Gerador de Ficha Cadastral (.xlsx) e Agenda (.ics / Google Calendar)
   Opera 100% no navegador sem dependências externas:
   - Lê o modelo sanitizado ../modelos/ficha-cadastro-ma-joaquim.xlsx (onde xl/worksheets/sheet1.xml é ZIP_STORED)
   - Substitui os marcadores {{CAMPO}} com escape XML estrito
   - Recalcula CRC-32, cabeçalhos locais e diretório central do arquivo ZIP
   - Dispara o download de um .xlsx válido no Excel / Google Sheets / LibreOffice
*/
(function (global) {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function escapeXml(str) {
    return String(str == null ? '' : str)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function formatarCNPJ(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length !== 14) return String(v || '').trim();
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function formatarCPF(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length !== 11) return String(v || '').trim();
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  function formatarCEP(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length !== 8) return String(v || '').trim();
    return d.slice(0, 5) + '-' + d.slice(5);
  }

  function construirMapaTokens(dados, marcaAlvo) {
    var d = dados || {};
    var trib = String(d.tributacao || '').trim().toLowerCase();
    var obsBase = String(d.observacoes_cadastro || '').trim();
    if (marcaAlvo && obsBase.indexOf('Fábrica: ' + marcaAlvo) === -1) {
      obsBase = ('Solicitação de cadastro — Fábrica: ' + marcaAlvo + '.' + (obsBase ? ' ' + obsBase : '')).trim();
    }
    return {
      RAZAO_SOCIAL: String(d.razao_social || '').trim(),
      ENDERECO: String(d.endereco || '').trim(),
      NUMERO: String(d.numero || '').trim(),
      COMPLEMENTO: String(d.complemento || '').trim(),
      CAIXA_POSTAL: String(d.caixa_postal || '').trim(),
      CEP: formatarCEP(d.cep || ''),
      BAIRRO: String(d.bairro || '').trim(),
      CIDADE: String(d.cidade || '').trim(),
      UF: String(d.uf || 'RJ').trim().toUpperCase().slice(0, 2),
      TELEFONE_FIXO_1: String(d.telefone_fixo_1 || '').trim(),
      FAX: String(d.fax || '').trim(),
      TELEFONE_FIXO_2: String(d.telefone_fixo_2 || '').trim(),
      CELULAR_WHATSAPP: String(d.celular_whatsapp || '').trim(),
      CNPJ: formatarCNPJ(d.cnpj || ''),
      INSCRICAO_ESTADUAL: String(d.inscricao_estadual || '').trim(),
      TRIB_LUCRO_REAL: trib === 'lucro_real' ? 'X' : '',
      TRIB_LUCRO_PRESUMIDO: trib === 'lucro_presumido' ? 'X' : '',
      TRIB_SIMPLES_NACIONAL: trib === 'simples_nacional' ? 'X' : '',
      EMAIL_GERAL: String(d.email_geral || '').trim(),
      EMAIL_COMPRAS: String(d.email_compras || '').trim(),
      EMAIL_FINANCAS: String(d.email_financas || '').trim(),
      SITE: String(d.site || '').trim(),
      EMAIL_XML_NFE: String(d.email_xml_nfe || '').trim(),
      CONTATO_COMERCIAL: String(d.contato_comercial || '').trim(),
      CONTATO_FINANCEIRO: String(d.contato_financeiro || '').trim(),
      BANCO_NOME: String(d.banco_nome || '').trim(),
      BANCO_NUMERO: String(d.banco_numero || '').trim(),
      BANCO_AGENCIA: String(d.banco_agencia || d.agencia || '').trim(),
      BANCO_CONTA: String(d.banco_conta || d.conta || '').trim(),
      BANCO_TITULAR_CNPJ: formatarCNPJ(d.banco_titular_cnpj || d.titular_cnpj || ''),
      BANCO_TITULAR_CPF: formatarCPF(d.banco_titular_cpf || d.titular_cpf || ''),
      OBSERVACOES_CADASTRO: obsBase,
      FORMA_PAGAMENTO_DIFERENCIADA: String(d.forma_pagamento_diferenciada || 'NÃO').trim() || 'NÃO',
      SUFRAMA_IDENTIFICACAO: String(d.suframa_identificacao || '').trim(),
      SUFRAMA_INSCRICAO: String(d.suframa_inscricao || '').trim(),
      SUFRAMA_VALIDADE: String(d.suframa_validade || '').trim(),
    };
  }

  function preencherXmlPlanilha(xml, mapa) {
    return xml.replace(/\{\{([A-Z0-9_]+)\}\}/g, function (_, chave) {
      return escapeXml(Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : '');
    });
  }

  function gerarBufferXlsx(templateBuffer, dados, marcaAlvo) {
    var src = templateBuffer instanceof Uint8Array ? templateBuffer : new Uint8Array(templateBuffer);
    var dv = new DataView(src.buffer, src.byteOffset, src.byteLength);

    // Localiza End of Central Directory (0x06054b50)
    var eocdOffset = -1;
    for (var pos = src.length - 22; pos >= Math.max(0, src.length - 65557); pos--) {
      if (dv.getUint32(pos, true) === 0x06054b50) {
        eocdOffset = pos;
        break;
      }
    }
    if (eocdOffset === -1) throw new Error('Modelo XLSX inválido (EOCD não encontrado).');

    var totalEntries = dv.getUint16(eocdOffset + 10, true);
    var cdOffset = dv.getUint32(eocdOffset + 16, true);
    var decoder = new TextDecoder('utf-8');
    var encoder = new TextEncoder();
    var mapa = construirMapaTokens(dados, marcaAlvo);

    var entries = [];
    var p = cdOffset;
    for (var idx = 0; idx < totalEntries; idx++) {
      if (dv.getUint32(p, true) !== 0x02014b50) {
        throw new Error('Modelo XLSX inválido (assinatura CD ausente).');
      }
      var verMade = dv.getUint16(p + 4, true);
      var verNeed = dv.getUint16(p + 6, true);
      var flags = dv.getUint16(p + 8, true);
      var method = dv.getUint16(p + 10, true);
      var modTime = dv.getUint16(p + 12, true);
      var modDate = dv.getUint16(p + 14, true);
      var crc = dv.getUint32(p + 16, true);
      var compSize = dv.getUint32(p + 20, true);
      var uncompSize = dv.getUint32(p + 24, true);
      var fnLen = dv.getUint16(p + 28, true);
      var cdExtraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var diskStart = dv.getUint16(p + 34, true);
      var intAttr = dv.getUint16(p + 36, true);
      var extAttr = dv.getUint32(p + 38, true);
      var localOffset = dv.getUint32(p + 42, true);

      var nameBytes = src.subarray(p + 46, p + 46 + fnLen);
      var name = decoder.decode(nameBytes);
      var cdExtraBytes = src.subarray(p + 46 + fnLen, p + 46 + fnLen + cdExtraLen);
      var commentBytes = src.subarray(p + 46 + fnLen + cdExtraLen, p + 46 + fnLen + cdExtraLen + commentLen);

      if (dv.getUint32(localOffset, true) !== 0x04034b50) {
        throw new Error('Cabeçalho local inválido para ' + name);
      }
      var lFnLen = dv.getUint16(localOffset + 26, true);
      var lExtraLen = dv.getUint16(localOffset + 28, true);
      var lExtraBytes = src.subarray(localOffset + 30 + lFnLen, localOffset + 30 + lFnLen + lExtraLen);
      var dataStart = localOffset + 30 + lFnLen + lExtraLen;
      var payload = src.subarray(dataStart, dataStart + compSize);

      if (name === 'xl/worksheets/sheet1.xml') {
        if (method !== 0) {
          throw new Error('O template sheet1.xml precisa estar armazenado sem compressão (ZIP_STORED).');
        }
        var xmlOrig = decoder.decode(payload);
        var xmlNovo = preencherXmlPlanilha(xmlOrig, mapa);
        payload = encoder.encode(xmlNovo);
        crc = crc32(payload);
        compSize = payload.length;
        uncompSize = payload.length;
        flags = flags & ~0x08;
      }

      entries.push({
        verMade: verMade,
        verNeed: verNeed,
        flags: flags & ~0x08,
        method: method,
        modTime: modTime,
        modDate: modDate,
        crc: crc,
        compSize: compSize,
        uncompSize: uncompSize,
        nameBytes: nameBytes,
        lExtraBytes: lExtraBytes,
        cdExtraBytes: cdExtraBytes,
        commentBytes: commentBytes,
        diskStart: diskStart,
        intAttr: intAttr,
        extAttr: extAttr,
        payload: payload,
        newLocalOffset: 0,
      });

      p += 46 + fnLen + cdExtraLen + commentLen;
    }

    // Calcula tamanho total para alocação exata
    var localTotal = 0;
    var cdTotal = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      e.newLocalOffset = localTotal;
      localTotal += 30 + e.nameBytes.length + e.lExtraBytes.length + e.payload.length;
      cdTotal += 46 + e.nameBytes.length + e.cdExtraBytes.length + e.commentBytes.length;
    }

    var out = new Uint8Array(localTotal + cdTotal + 22);
    var odv = new DataView(out.buffer);
    var cursor = 0;

    // 1. Grava entradas locais
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      odv.setUint32(cursor, 0x04034b50, true);
      odv.setUint16(cursor + 4, e.verNeed, true);
      odv.setUint16(cursor + 6, e.flags, true);
      odv.setUint16(cursor + 8, e.method, true);
      odv.setUint16(cursor + 10, e.modTime, true);
      odv.setUint16(cursor + 12, e.modDate, true);
      odv.setUint32(cursor + 14, e.crc, true);
      odv.setUint32(cursor + 18, e.compSize, true);
      odv.setUint32(cursor + 22, e.uncompSize, true);
      odv.setUint16(cursor + 26, e.nameBytes.length, true);
      odv.setUint16(cursor + 28, e.lExtraBytes.length, true);
      cursor += 30;
      out.set(e.nameBytes, cursor); cursor += e.nameBytes.length;
      out.set(e.lExtraBytes, cursor); cursor += e.lExtraBytes.length;
      out.set(e.payload, cursor); cursor += e.payload.length;
    }

    // 2. Grava Diretório Central
    var newCdOffset = cursor;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      odv.setUint32(cursor, 0x02014b50, true);
      odv.setUint16(cursor + 4, e.verMade, true);
      odv.setUint16(cursor + 6, e.verNeed, true);
      odv.setUint16(cursor + 8, e.flags, true);
      odv.setUint16(cursor + 10, e.method, true);
      odv.setUint16(cursor + 12, e.modTime, true);
      odv.setUint16(cursor + 14, e.modDate, true);
      odv.setUint32(cursor + 16, e.crc, true);
      odv.setUint32(cursor + 20, e.compSize, true);
      odv.setUint32(cursor + 24, e.uncompSize, true);
      odv.setUint16(cursor + 28, e.nameBytes.length, true);
      odv.setUint16(cursor + 30, e.cdExtraBytes.length, true);
      odv.setUint16(cursor + 32, e.commentBytes.length, true);
      odv.setUint16(cursor + 34, e.diskStart, true);
      odv.setUint16(cursor + 36, e.intAttr, true);
      odv.setUint32(cursor + 38, e.extAttr, true);
      odv.setUint32(cursor + 42, e.newLocalOffset, true);
      cursor += 46;
      out.set(e.nameBytes, cursor); cursor += e.nameBytes.length;
      out.set(e.cdExtraBytes, cursor); cursor += e.cdExtraBytes.length;
      out.set(e.commentBytes, cursor); cursor += e.commentBytes.length;
    }

    // 3. End of Central Directory (EOCD)
    odv.setUint32(cursor, 0x06054b50, true);
    odv.setUint16(cursor + 4, 0, true);
    odv.setUint16(cursor + 6, 0, true);
    odv.setUint16(cursor + 8, entries.length, true);
    odv.setUint16(cursor + 10, entries.length, true);
    odv.setUint32(cursor + 12, cdTotal, true);
    odv.setUint32(cursor + 16, newCdOffset, true);
    odv.setUint16(cursor + 20, 0, true);

    return out;
  }

  var cacheModelo = null;
  function carregarModelo(urlModelo) {
    var alvo = urlModelo || '../modelos/ficha-cadastro-ma-joaquim.xlsx';
    if (!cacheModelo) {
      cacheModelo = fetch(alvo).then(function (resp) {
        if (!resp.ok) throw new Error('Falha ao baixar o modelo de ficha cadastral (' + resp.status + ').');
        return resp.arrayBuffer();
      });
    }
    return cacheModelo;
  }

  function baixarBlob(blob, nomeArquivo) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function baixarFichaXlsx(dadosEmpresa, marcaAlvo, urlModelo) {
    return carregarModelo(urlModelo).then(function (buf) {
      var outBytes = gerarBufferXlsx(buf, dadosEmpresa, marcaAlvo || '');
      var blob = new Blob([outBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      var cnpjLimpo = String((dadosEmpresa && dadosEmpresa.cnpj) || 'sem-cnpj').replace(/\D/g, '') || 'loja';
      var sufixoMarca = marcaAlvo ? '-' + String(marcaAlvo).toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
      var nomeArq = 'Ficha-Cadastral-MA-Joaquim-' + cnpjLimpo + sufixoMarca + '.xlsx';
      baixarBlob(blob, nomeArq);
      return nomeArq;
    });
  }

  // ---------------- Agenda (.ics e Google Calendar) ----------------
  function escaparICS(t) {
    return String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
  }

  function paraUtcICS(dataISO, horaStr) {
    var d = (dataISO || new Date().toISOString().slice(0, 10)).slice(0, 10);
    var h = (horaStr || '09:00').slice(0, 5);
    var dt = new Date(d + 'T' + h + ':00-03:00');
    if (isNaN(dt.getTime())) dt = new Date();
    return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function somarMinutosHora(horaStr, mins) {
    var partes = String(horaStr || '09:00').split(':');
    var total = (parseInt(partes[0], 10) || 9) * 60 + (parseInt(partes[1], 10) || 0) + (mins || 45);
    var hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
    var mm = String(total % 60).padStart(2, '0');
    return hh + ':' + mm;
  }

  function gerarICSVisita(visita, empresa) {
    var v = visita || {};
    var e = empresa || {};
    var data = v.data_confirmada || v.data_preferida || new Date().toISOString().slice(0, 10);
    var hora = v.hora_confirmada || (v.turno === 'tarde' ? '14:00' : '09:30');
    var fimHora = somarMinutosHora(hora, 45);
    var nomeLoja = e.nome_fantasia || e.razao_social || 'Cliente M.A Joaquim';
    var local = [e.endereco, e.numero, e.bairro, e.cidade, e.uf].filter(Boolean).join(', ');
    var repTxt = v.representante_preferido || v.representante || 'Alexandre Bunn / Deivid';
    var desc = [
      'Objetivo: ' + (v.objetivo || 'Atendimento comercial'),
      'Representante: ' + repTxt,
      v.observacoes ? 'Obs.: ' + v.observacoes : '',
    ].filter(Boolean).join('\n');

    var conteudo = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//M.A Joaquim Representacao//Area do Cliente//PT-BR',
      'BEGIN:VEVENT',
      'UID:' + (v.id || ('vis_' + Date.now())) + '@representacaorj.com',
      'DTSTART:' + paraUtcICS(data, hora),
      'DTEND:' + paraUtcICS(data, fimHora),
      'SUMMARY:' + escaparICS('Visita M.A Joaquim — ' + nomeLoja),
      'DESCRIPTION:' + escaparICS(desc),
      'LOCATION:' + escaparICS(local || 'Rio de Janeiro - RJ'),
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + escaparICS('Visita M.A Joaquim em 30 min'),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    var blob = new Blob([conteudo], { type: 'text/calendar;charset=utf-8' });
    baixarBlob(blob, 'visita-ma-joaquim-' + data + '.ics');
    return conteudo;
  }

  function linkGoogleCalendar(visita, empresa) {
    var v = visita || {};
    var e = empresa || {};
    var data = v.data_confirmada || v.data_preferida || new Date().toISOString().slice(0, 10);
    var hora = v.hora_confirmada || (v.turno === 'tarde' ? '14:00' : '09:30');
    var fimHora = somarMinutosHora(hora, 45);
    var nomeLoja = e.nome_fantasia || e.razao_social || 'Cliente M.A Joaquim';
    var local = [e.endereco, e.numero, e.bairro, e.cidade, e.uf].filter(Boolean).join(', ');
    var params = new URLSearchParams({
      action: 'TEMPLATE',
      text: 'Visita M.A Joaquim — ' + nomeLoja,
      dates: paraUtcICS(data, hora) + '/' + paraUtcICS(data, fimHora),
      details: 'Objetivo: ' + (v.objetivo || 'Atendimento comercial') + '\nRepresentante: ' + (v.representante_preferido || v.representante || 'Alexandre Bunn / Deivid') + (v.observacoes ? '\nObs.: ' + v.observacoes : ''),
      location: local || 'Rio de Janeiro, RJ',
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  global.MAJ_FICHA_XLSX = {
    gerarBufferXlsx: gerarBufferXlsx,
    baixarFichaXlsx: baixarFichaXlsx,
    gerarICSVisita: gerarICSVisita,
    linkGoogleCalendar: linkGoogleCalendar,
    formatarCNPJ: formatarCNPJ,
    formatarCEP: formatarCEP,
  };
})(typeof window !== 'undefined' ? window : globalThis);
