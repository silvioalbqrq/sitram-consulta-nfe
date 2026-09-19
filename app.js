let CHAVES = [];
let RESULTADOS = [];
let ESTAT = { lidas: 0, duplicadas: 0, invalidas: 0, ceara: 0, fora: 0 };
let INFO_MAP = {};
let cancelado = false;
let PAG = { page: 1, perPage: 100 };

const $ = id => document.getElementById(id);
const soDigitos = s => (s || '').replace(/\D/g, '');
const ehCeara = c => (c || '').slice(0, 2) === '23';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS_KEY = 'sitram_backend_url';
const LS_MODE = 'sitram_backend_mode';
const URL_ONLINE = 'https://sitram-consulta-nfe-production.up.railway.app';
const URL_LOCAL = 'http://127.0.0.1:8001';

function mesmaOrigemBackend() {
  const o = window.location.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)) return o;
  if (/railway\.app$/i.test(window.location.hostname || '')) return o;
  return null;
}
function detectarModoInicial() {
  const salvo = localStorage.getItem(LS_MODE);
  if (salvo === 'online' || salvo === 'local' || salvo === 'custom') return salvo;
  const host = (window.location.hostname || '').toLowerCase();
  if (host.includes('github.io') || host.includes('railway.app')) return 'online';
  if (host === 'localhost' || host === '127.0.0.1') return 'local';
  return 'online';
}
function urlDoModo(modo) {
  if (modo === 'local') return URL_LOCAL;
  if (modo === 'online') return URL_ONLINE;
  const saved = (localStorage.getItem(LS_KEY) || '').trim().replace(/\/$/, '');
  return saved || URL_ONLINE;
}
function aplicarModo(modo, persistir) {
  const url = urlDoModo(modo);
  $('backendUrl').value = url;
  if (persistir) { localStorage.setItem(LS_MODE, modo); localStorage.setItem(LS_KEY, url); }
  const on = $('btnModoOnline'), off = $('btnModoLocal');
  if (on && off) {
    on.className = 'px-2 py-1 rounded-lg text-xs font-bold ' + (modo === 'online' ? 'bg-emerald-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white');
    off.className = 'px-2 py-1 rounded-lg text-xs font-bold ' + (modo === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white');
  }
  pingBackend();
}
const backend = () => (($('backendUrl').value || '').trim().replace(/\/$/, '') || urlDoModo(detectarModoInicial()));

function log(msg) {
  const d = document.createElement('div');
  d.textContent = new Date().toLocaleTimeString('pt-BR') + ' — ' + msg;
  $('log').prepend(d);
}
function salvarBackendUrl() {
  const v = ($('backendUrl').value || '').trim().replace(/\/$/, '');
  if (!v) { alert('Informe a URL do backend (Railway ou local).'); return; }
  localStorage.setItem(LS_KEY, v);
  if (v === URL_ONLINE) localStorage.setItem(LS_MODE, 'online');
  else if (v.includes('127.0.0.1') || v.includes('localhost')) localStorage.setItem(LS_MODE, 'local');
  else localStorage.setItem(LS_MODE, 'custom');
  log('URL do backend salva: ' + v);
  pingBackend();
}

async function pingBackend() {
  const base = backend();
  if (!$('backendUrl').value.trim()) $('backendUrl').value = base;
  const urls = [base + '/api/status', base + '/'];
  for (const u of urls) {
    try {
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok) {
        $('backendStatus').textContent = 'online';
        $('backendStatus').className = 'px-2 py-1 rounded-full bg-emerald-600 text-white';
        setTimeout(verificarSaudeApiSitram, 100);
        return true;
      }
    } catch (e) {}
  }
  const isLocal = /127\.0\.0\.1|localhost/i.test(base);
  $('backendStatus').textContent = isLocal ? 'offline — inicie o backend local' : 'offline — confira a URL do Railway';
  $('backendStatus').className = 'px-2 py-1 rounded-full bg-rose-600 text-white';
  return false;
}

async function verificarSaudeApiSitram() {
  const box = $('alertaApiSitram'), tit = $('alertaApiTitulo'), msg = $('alertaApiMsg');
  if (!box) return;
  try {
    const r = await fetch(backend() + '/api/sitram/health', { mode: 'cors' });
    if (!r.ok) {
      box.className = 'no-print rounded-2xl border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900';
      tit.textContent = 'Não foi possível verificar a API SITRAM';
      msg.textContent = 'O backend respondeu HTTP ' + r.status + '. Confira se o Railway/local está no ar.';
      box.classList.remove('hidden'); return;
    }
    const h = await r.json();
    if (h.ok && h.saude === 'OK') { box.classList.add('hidden'); return; }
    const mapa = {
      ALTERADA: ['no-print rounded-2xl border p-4 text-sm border-amber-400 bg-amber-50 text-amber-950', 'Atenção: a API do SITRAM parece ter sido alterada'],
      BLOQUEADA: ['no-print rounded-2xl border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900', 'API SITRAM bloqueou o acesso'],
      INDISPONIVEL: ['no-print rounded-2xl border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900', 'API SITRAM indisponível no momento']
    };
    const info = mapa[h.saude] || ['no-print rounded-2xl border p-4 text-sm border-amber-400 bg-amber-50 text-amber-950', 'Problema ao consultar a API SITRAM'];
    box.className = info[0]; tit.textContent = info[1];
    msg.textContent = (h.mensagem || '') + (h.http != null ? ' (HTTP ' + h.http + ')' : '');
    box.classList.remove('hidden');
  } catch (e) {
    box.className = 'no-print rounded-2xl border p-4 text-sm border-slate-300 bg-slate-50 text-slate-800';
    tit.textContent = 'Não foi possível verificar a API SITRAM';
    msg.textContent = 'Falha de rede ao falar com o backend. Confira se está Online/Local.';
    box.classList.remove('hidden');
  }
}

// ---------- entrada ----------
const dz = $('dropzone'), fi = $('fileInput');
dz.onclick = () => fi.click();
['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drop-active'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drop-active'); }));
dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) lerArquivos(e.dataTransfer.files); });
fi.addEventListener('change', () => { if (fi.files.length) { lerArquivos(fi.files); fi.value = ''; } });

function extrairChaves(texto) {
  const todas = String(texto || '').match(/\d{44}/g) || [];
  return [...new Set(todas)];
}
function analisarTexto(texto, nomeArquivo) {
  const t = String(texto || '');
  const todas = t.match(/\d{44}/g) || [];
  const unicas = [...new Set(todas)];
  const linhas = t.split(/\r?\n/);
  let invalidas = 0;
  linhas.forEach(l => {
    if (!l.trim()) return;
    if (!/\d{44}/.test(l) && l.trim().length >= 8) invalidas++;
  });
  unicas.forEach(c => {
    if (!INFO_MAP[c]) {
      const linha = linhas.find(l => l.includes(c)) || c;
      INFO_MAP[c] = { arquivo: nomeArquivo || '', linha: linha.trim().slice(0, 500) };
    }
  });
  return { todas, unicas, invalidas };
}
function incorporarChaves(novas) {
  let dup = 0;
  novas.forEach(c => { if (CHAVES.includes(c)) dup++; else CHAVES.push(c); });
  ESTAT.lidas += novas.length; ESTAT.duplicadas += dup;
  salvarLote(); atualizarPainelChaves();
}
function lerArquivo(file) { lerArquivos([file]); }
function lerArquivos(files) {
  const lista = [...files].filter(f => /\.(csv|txt)$/i.test(f.name) || !f.name.includes('.'));
  if (!lista.length) { alert('Selecione arquivo(s) .csv ou .txt.'); return; }
  let pendentes = lista.length, totNovas = 0;
  lista.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const a = analisarTexto(String(reader.result || ''), file.name);
      const antes = CHAVES.length;
      incorporarChaves(a.unicas);
      ESTAT.invalidas += a.invalidas;
      totNovas += (CHAVES.length - antes);
      if (--pendentes === 0) {
        $('fileInfo').textContent = `${lista.length} arquivo(s): +${totNovas} chave(s) nova(s) · total: ${CHAVES.length}`;
        log(`${lista.length} arquivo(s) lidos: +${totNovas} nova(s). Total: ${CHAVES.length}.`);
        atualizarPainelChaves();
      } else {
        $('fileInfo').textContent = `Lendo arquivos… ${lista.length - pendentes}/${lista.length}`;
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
}
function usarTextoColado() {
  const a = analisarTexto($('pasteArea').value, 'colado');
  const antes = CHAVES.length;
  a.unicas.forEach(c => { if (!CHAVES.includes(c)) CHAVES.push(c); });
  ESTAT.lidas += a.unicas.length; ESTAT.invalidas += a.invalidas;
  salvarLote(); atualizarPainelChaves();
  log(`Texto colado: ${a.unicas.length} chave(s), ${a.invalidas} linha(s) sem chave. Total: ${CHAVES.length} (antes ${antes}).`);
}
function adicionarChaveUnica() {
  const c = soDigitos($('chaveUnica').value);
  if (!/^\d{44}$/.test(c)) { alert('Informe uma chave com 44 dígitos.'); return; }
  if (c.slice(20, 22) !== '55') { alert('Modelo inválido: posições 21-22 devem ser 55 para NF-e.'); return; }
  if (!CHAVES.includes(c)) {
    CHAVES.push(c); INFO_MAP[c] = { arquivo: 'manual', linha: c }; ESTAT.lidas++;
    if (ehCeara(c)) log('Atenção: chave do Ceará (23) — entrará como EMITENTE CE, sem consultar SITRAM.');
  }
  $('chaveUnica').value = '';
  salvarLote(); atualizarPainelChaves();
}
function limparTudo() {
  CHAVES = []; RESULTADOS = []; INFO_MAP = {};
  ESTAT = { lidas: 0, duplicadas: 0, invalidas: 0, ceara: 0, fora: 0 };
  PAG.page = 1;
  try { localStorage.removeItem('sitram_ultimo_lote'); } catch (e) {}
  $('pasteArea').value = ''; $('fileInfo').textContent = '';
  atualizarPainelChaves(); renderTabela(); atualizarResumo();
  $('progressBar').style.width = '0%'; $('progressLabel').textContent = 'Aguardando consulta…'; $('progressPct').textContent = '';
  log('Lote limpo.');
}
function salvarLote() {
  try { localStorage.setItem('sitram_ultimo_lote', JSON.stringify({ chaves: CHAVES.slice(0, 2000), info: INFO_MAP, data: new Date().toISOString() })); } catch (e) {}
}
function restaurarLote() {
  try {
    const s = JSON.parse(localStorage.getItem('sitram_ultimo_lote') || 'null');
    if (s && s.chaves && s.chaves.length) {
      CHAVES = [...new Set(s.chaves.filter(c => /^\d{44}$/.test(c)))];
      INFO_MAP = s.info || {}; ESTAT.lidas = CHAVES.length;
      log(`Lote anterior restaurado: ${CHAVES.length} chave(s).`);
      atualizarPainelChaves();
    }
  } catch (e) {}
}
function atualizarPainelChaves() {
  const ce = CHAVES.filter(ehCeara), fora = CHAVES.filter(c => !ehCeara(c));
  ESTAT.ceara = ce.length; ESTAT.fora = fora.length;
  $('countChaves').textContent = `${CHAVES.length} (${fora.length} p/ consultar + ${ce.length} CE)`;
  $('btnConsultar').disabled = CHAVES.length === 0;
  $('chavesPreview').textContent = CHAVES.slice(0, 200).join('\n') + (CHAVES.length > 200 ? `\n… +${CHAVES.length - 200}` : '');
  const pill = (v, l) => `<span class="px-2 py-1 rounded-full bg-slate-100 border border-slate-200 font-bold">${v} ${l}</span>`;
  $('statsLote').innerHTML = pill(CHAVES.length, 'carregadas') + pill(fora.length, 'fora-CE p/ consultar') + pill(ce.length, 'emitente CE (23)') + pill(ESTAT.duplicadas, 'duplicadas') + pill(ESTAT.invalidas, 'linhas sem chave');
}

// ---------- consulta ----------
function respostaCearaLocal(chave) {
  return { chave, ok: true, encontrada: null, erro: null, pago: null, status: 'CEARA', cuf: '23', uf_emitente: 'CE', numero: null, selo: null, situacao_nf: 'Emitente do Ceará', situacao_imposto: '—', acao: 'nota de emitente do Ceará (cUF 23): não consultar no SITRAM. SITRAM é só para interestadual. Se Autorizada, confira no emissor/SEFAZ-CE.' };
}
function cancelarConsulta() { cancelado = true; log('Cancelamento solicitado — parando após a chave atual…'); }
async function fetchComRetry(url, opts, tentativas) {
  let erro = null;
  for (let t = 1; t <= (tentativas || 2); t++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { erro = e; await sleep(700 * t); }
  }
  throw erro;
}
async function consultarLote() {
  if (!CHAVES.length) return;
  if (!await pingBackend()) { alert('Backend offline. Clique em Online ou inicie o backend local.'); return; }
  RESULTADOS = []; cancelado = false; PAG.page = 1;
  $('btnConsultar').disabled = true; $('btnCancelar').classList.remove('hidden');
  const ceKeys = CHAVES.filter(ehCeara), foraKeys = CHAVES.filter(c => !ehCeara(c));
  ceKeys.forEach(c => RESULTADOS.push(respostaCearaLocal(c)));
  if (ceKeys.length) log(`${ceKeys.length} chave(s) do Ceará (23) marcadas como EMITENTE CE, sem consultar.`);
  if (!foraKeys.length) {
    $('progressBar').style.width = '100%'; $('progressPct').textContent = '100%';
    $('progressLabel').textContent = `Concluído: só CE (${ceKeys.length}). Nada a consultar.`;
    $('btnConsultar').disabled = false; $('btnCancelar').classList.add('hidden');
    renderTabela(); atualizarResumo(); return;
  }
  log(`Consultando ${foraKeys.length} chave(s) de fora-CE via POST /api/sitram/lote…`);
  try {
    const data = await fetchComRetry(backend() + '/api/sitram/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chaves: foraKeys, intervalo: 0.3, workers: 4, timeout: 20 }) }, 2);
    (data.resultados || []).forEach(r => RESULTADOS.push(r));
    $('progressBar').style.width = '100%'; $('progressPct').textContent = '100%';
    $('progressLabel').textContent = `Concluído: ${RESULTADOS.length} chave(s) (${foraKeys.length} consultadas + ${ceKeys.length} CE).`;
    log(`Lote POST concluído: ${data.pagas || 0} pagas, ${data.a_pagar || 0} a pagar, ${data.nao_encontradas || 0} não seladas, ${data.ceara || 0} CE.`);
  } catch (e) {
    log('POST /lote falhou (' + e + ') — fallback GET individual com retry…');
    let concluidas = 0, idx = 0; const conc = 4, totalFora = foraKeys.length;
    async function worker() {
      while (idx < totalFora && !cancelado) {
        const i = idx++, chave = foraKeys[i];
        try { RESULTADOS.push(await fetchComRetry(backend() + '/api/sitram/consulta?chave=' + chave, {}, 2)); }
        catch (err) { RESULTADOS.push({ chave, ok: false, status: 'ERRO', erro: 'falha após 2 tentativas: ' + err, pago: null }); }
        concluidas++;
        const pct = Math.round((concluidas + ceKeys.length) / CHAVES.length * 100);
        $('progressBar').style.width = pct + '%'; $('progressPct').textContent = pct + '%';
        $('progressLabel').textContent = cancelado ? `Cancelado ${concluidas}/${totalFora}…` : `Consultando ${concluidas}/${totalFora} (fora-CE)…`;
        renderTabela(); atualizarResumo();
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc, totalFora) }, worker));
    $('progressLabel').textContent = cancelado ? `Cancelado: ${RESULTADOS.length}/${CHAVES.length}.` : `Concluído: ${RESULTADOS.length} chave(s).`;
  }
  const ordem = new Map(CHAVES.map((c, i) => [c, i]));
  RESULTADOS.sort((a, b) => (ordem.get(a.chave) ?? 0) - (ordem.get(b.chave) ?? 0));
  $('btnConsultar').disabled = false; $('btnCancelar').classList.add('hidden');
  renderTabela(); atualizarResumo();
}

function classePago(r) {
  if (!r.ok) return ['ERRO', 'badge-nao', r.erro || 'Erro'];
  const st = r.status;
  if (st === 'CEARA') return ['CE — EMITENTE CE', 'badge-neutro', 'cUF 23: emitente do Ceará. Não consultado (só interestadual). Se Autorizada, confira no emissor/SEFAZ-CE.'];
  if (st === 'PAGA') return ['SIM — PAGA', 'badge-pago', 'Imposto pago/parcelado ou débito autuado'];
  if (st === 'A_PAGAR') return ['A PAGAR', 'badge-nao', 'Selada com imposto pendente de pagamento'];
  if (st === 'SEM_COBRANCA') return ['SEM COBRANÇA', 'badge-neutro', 'Selada, sem imposto a recolher'];
  if (st === 'NAO_ENCONTRADA' || r.encontrada === false) return ['NÃO SELADA', 'badge-alerta', 'Portal: "Não foram encontradas notas fiscais". Sele a nota e consulte de novo'];
  if (r.pago === true) return ['SIM — PAGA', 'badge-pago', ''];
  if (r.pago === false) return ['NÃO', 'badge-nao', ''];
  return ['—', 'badge-neutro', ''];
}
function passaFiltro(r) {
  const f = $('filtro').value;
  if (f === 'pagas') return r.status === 'PAGA' || r.pago === true;
  if (f === 'apagar') return r.status === 'A_PAGAR';
  if (f === 'semcob') return r.status === 'SEM_COBRANCA';
  if (f === 'nao') return r.ok && r.encontrada && r.pago === false;
  if (f === 'naoenc') return r.ok && r.encontrada === false;
  if (f === 'ceara') return r.status === 'CEARA';
  if (f === 'erros') return !r.ok;
  return true;
}
function fmtValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function mudarPagina(d) {
  const lista = RESULTADOS.filter(passaFiltro);
  const totalPag = Math.max(1, Math.ceil(lista.length / PAG.perPage));
  PAG.page = Math.min(totalPag, Math.max(1, PAG.page + d));
  renderTabela();
}
function renderTabela() {
  const tb = $('tbody'); tb.innerHTML = '';
  const lista = RESULTADOS.filter(passaFiltro);
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400">Nenhum resultado ainda. Carregue as chaves e clique em “Consultar lote”.</td></tr>';
    if ($('pagInfo')) $('pagInfo').textContent = '';
    if ($('pagNum')) $('pagNum').textContent = '';
    return;
  }
  const totalPag = Math.max(1, Math.ceil(lista.length / PAG.perPage));
  PAG.page = Math.min(totalPag, Math.max(1, PAG.page));
  const ini = (PAG.page - 1) * PAG.perPage;
  const fatia = lista.slice(ini, ini + PAG.perPage);
  for (const r of fatia) {
    const [txt, cls, dica] = classePago(r);
    const cuf = (r.chave || '').slice(0, 2) || '—';
    const cufBadge = cuf === '23'
      ? '<span class="px-2 py-0.5 rounded-full font-bold bg-sky-100 text-sky-800 border border-sky-200" title="Emitente do Ceará — não consultado">23 CE</span>'
      : `<span class="font-mono">${cuf}</span>`;
    const tr = document.createElement('tr'); tr.className = 'hover:bg-slate-50';
    tr.innerHTML = `<td class="px-3 py-2 font-mono text-[11px]">${r.chave || '—'}</td>` + `<td class="px-3 py-2 text-center">${cufBadge}</td>` + `<td class="px-3 py-2">${r.numero ?? '—'}</td>` + `<td class="px-3 py-2">${r.situacao_nf || (r.encontrada === false ? '—' : (r.erro || '—'))}</td>` + `<td class="px-3 py-2">${r.situacao_imposto || '—'}</td>` + `<td class="px-3 py-2"><span title="${dica}" class="px-2 py-1 rounded-full font-bold ${cls}">${txt}</span></td>` + `<td class="px-3 py-2">${r.emitente || '—'}</td>` + `<td class="px-3 py-2">${r.destinatario || '—'}</td>` + `<td class="px-3 py-2">${r.data_fato_gerador || '—'}</td>` + `<td class="px-3 py-2 text-right">${fmtValor(r.valor_total)}</td>`;
    tb.appendChild(tr);
  }
  if ($('pagInfo')) $('pagInfo').textContent = `Mostrando ${ini + 1}–${Math.min(ini + PAG.perPage, lista.length)} de ${lista.length} (filtro) · ${RESULTADOS.length} no total`;
  if ($('pagNum')) $('pagNum').textContent = `Pág. ${PAG.page}/${totalPag}`;
}
function atualizarResumo() {
  const box = $('resumo');
  if (!RESULTADOS.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  $('rTotal').textContent = RESULTADOS.length;
  $('rPagas').textContent = RESULTADOS.filter(r => r.status === 'PAGA' || (!r.status && r.pago === true)).length;
  $('rAPagar').textContent = RESULTADOS.filter(r => r.status === 'A_PAGAR').length;
  $('rSemCob').textContent = RESULTADOS.filter(r => r.status === 'SEM_COBRANCA').length;
  $('rNaoEnc').textContent = RESULTADOS.filter(r => r.ok && r.encontrada === false).length;
  if ($('rCeara')) $('rCeara').textContent = RESULTADOS.filter(r => r.status === 'CEARA').length;
  $('rErros').textContent = RESULTADOS.filter(r => !r.ok).length;
}
function imprimirResultado() {
  if (!RESULTADOS.length) { alert('Nada para imprimir. Consulte o lote primeiro.'); return; }
  window.print();
}
function exportarCSV() {
  if (!RESULTADOS.length) { alert('Nada para exportar.'); return; }
  const head = ['chave','cuf','numero','selo','situacao_nf','situacao_imposto','status','paga','emitente','destinatario','fato_gerador','valor_total','arquivo_origem','linha_original','erro_acao'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [head.join(';')];
  for (const r of RESULTADOS) {
    const info = INFO_MAP[r.chave] || {};
    linhas.push([(r.chave || ''), (r.chave || '').slice(0, 2), r.numero, r.selo, r.situacao_nf, r.situacao_imposto, r.status || '', r.pago === true ? 'SIM' : (r.pago === false ? 'NAO' : ''), r.emitente, r.destinatario, r.data_fato_gerador, r.valor_total, info.arquivo || '', info.linha || '', r.erro || r.acao || ''].map(q).join(';'));
  }
  const blob = new Blob(["\ufeff" + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sitram-consulta-nfe.csv'; a.click();
  URL.revokeObjectURL(a.href);
}
function linhaExport(r) {
  const info = INFO_MAP[r.chave] || {};
  return { chave: r.chave || '', cuf: (r.chave || '').slice(0, 2), numero: r.numero ?? '', selo: r.selo ?? '', situacao_nf: r.situacao_nf || '', situacao_imposto: r.situacao_imposto || '', status: r.status || '', paga: r.pago === true ? 'SIM' : (r.pago === false ? 'NAO' : ''), emitente: r.emitente || '', destinatario: r.destinatario || '', fato_gerador: r.data_fato_gerador || '', valor_total: r.valor_total ?? '', arquivo_origem: info.arquivo || '', linha_original: info.linha || '', erro_acao: r.erro || r.acao || '' };
}
function exportarXLSX() {
  if (!RESULTADOS.length) { alert('Nada para exportar.'); return; }
  if (typeof XLSX === 'undefined') { alert('Lib XLSX não carregou (sem internet?). Use Exportar CSV.'); return; }
  const ws = XLSX.utils.json_to_sheet(RESULTADOS.map(linhaExport));
  ws['!cols'] = [{ wch: 46 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 13 }, { wch: 14 }, { wch: 22 }, { wch: 50 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SITRAM');
  XLSX.writeFile(wb, 'sitram-consulta-nfe.xlsx');
  log('XLSX exportado (' + RESULTADOS.length + ' linhas).');
}

(function init() {
  const modo = detectarModoInicial();
  const url = urlDoModo(modo);
  $('backendUrl').value = url;
  const on = $('btnModoOnline'), off = $('btnModoLocal');
  if (on && off) {
    on.className = 'px-2 py-1 rounded-lg text-xs font-bold ' + (modo === 'online' ? 'bg-emerald-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white');
    off.className = 'px-2 py-1 rounded-lg text-xs font-bold ' + (modo === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white');
  }
  $('btnModoOnline').addEventListener('click', () => aplicarModo('online', true));
  $('btnModoLocal').addEventListener('click', () => aplicarModo('local', true));
  $('backendUrl').addEventListener('change', () => { localStorage.setItem(LS_MODE, 'custom'); pingBackend(); });
  $('btnSalvarBackend').addEventListener('click', salvarBackendUrl);
  $('backendUrl').addEventListener('keydown', e => { if (e.key === 'Enter') salvarBackendUrl(); });
  $('btnRecheckApi').addEventListener('click', verificarSaudeApiSitram);
  pingBackend();
  setInterval(verificarSaudeApiSitram, 10 * 60 * 1000);
  restaurarLote();
  renderTabela();
})();
