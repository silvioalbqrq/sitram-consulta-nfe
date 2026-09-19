let CHAVES = [];
let RESULTADOS = [];

const $ = id => document.getElementById(id);
const soDigitos = s => (s || '').replace(/\D/g, '');
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
  if (persistir) {
    localStorage.setItem(LS_MODE, modo);
    localStorage.setItem(LS_KEY, url);
  }
  const on = $('btnModoOnline'), off = $('btnModoLocal');
  if (on && off) {
    on.className = 'px-2 py-1 rounded-lg text-xs font-bold ' +
      (modo === 'online' ? 'bg-emerald-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white');
    off.className = 'px-2 py-1 rounded-lg text-xs font-bold ' +
      (modo === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-white');
  }
  pingBackend();
}

function defaultBackendUrl() {
  return urlDoModo(detectarModoInicial());
}

const backend = () => {
  const v = ($('backendUrl').value || '').trim().replace(/\/$/, '');
  return v || defaultBackendUrl();
};

function log(msg) {
  const d = document.createElement('div');
  d.textContent = new Date().toLocaleTimeString('pt-BR') + ' — ' + msg;
  $('log').prepend(d);
}

function salvarBackendUrl() {
  const v = ($('backendUrl').value || '').trim().replace(/\/$/, '');
  if (!v) {
    alert('Informe a URL do backend (Railway ou local).');
    return;
  }
  localStorage.setItem(LS_KEY, v);
  if (v === URL_ONLINE || v.replace(/\/$/, '') === URL_ONLINE) {
    localStorage.setItem(LS_MODE, 'online');
  } else if (v === URL_LOCAL || v.includes('127.0.0.1') || v.includes('localhost')) {
    localStorage.setItem(LS_MODE, 'local');
  } else {
    localStorage.setItem(LS_MODE, 'custom');
  }
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
        if (typeof verificarSaudeApiSitram === 'function') setTimeout(verificarSaudeApiSitram, 100);
        return true;
      }
    } catch (e) { /* tenta a proxima */ }
  }
  const isLocal = /127\.0\.0\.1|localhost/i.test(base);
  $('backendStatus').textContent = isLocal
    ? 'offline — inicie o backend local'
    : 'offline — confira a URL do Railway';
  $('backendStatus').className = 'px-2 py-1 rounded-full bg-rose-600 text-white';
  return false;
}

(function initBackendUI() {
  const modo = detectarModoInicial();
  aplicarModo(modo, false);
  $('btnModoOnline')?.addEventListener('click', () => aplicarModo('online', true));
  $('btnModoLocal')?.addEventListener('click', () => aplicarModo('local', true));
  $('backendUrl').addEventListener('change', () => {
    localStorage.setItem(LS_MODE, 'custom');
    pingBackend();
  });
  $('btnSalvarBackend').addEventListener('click', salvarBackendUrl);
  $('backendUrl').addEventListener('keydown', e => { if (e.key === 'Enter') salvarBackendUrl(); });
})();

async function verificarSaudeApiSitram() {
  const box = $('alertaApiSitram');
  const tit = $('alertaApiTitulo');
  const msg = $('alertaApiMsg');
  if (!box) return;
  try {
    const r = await fetch(backend() + '/api/sitram/health', { mode: 'cors' });
    if (!r.ok) {
      box.className = 'no-print rounded-2xl border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900';
      tit.textContent = 'Não foi possível verificar a API SITRAM';
      msg.textContent = 'O backend respondeu HTTP ' + r.status + '. Confira se o Railway/local está no ar.';
      box.classList.remove('hidden');
      return;
    }
    const h = await r.json();
    if (h.ok && h.saude === 'OK') {
      box.classList.add('hidden');
      return;
    }
    const mapa = {
      ALTERADA: {
        cls: 'no-print rounded-2xl border p-4 text-sm border-amber-400 bg-amber-50 text-amber-950',
        titulo: 'Atenção: a API do SITRAM parece ter sido alterada',
      },
      BLOQUEADA: {
        cls: 'no-print rounded-2xl border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900',
        titulo: 'API SITRAM bloqueou o acesso',
      },
      INDISPONIVEL: {
        cls: 'no-print rounded-2xl border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900',
        titulo: 'API SITRAM indisponível no momento',
      },
    };
    const info = mapa[h.saude] || {
      cls: 'no-print rounded-2xl border p-4 text-sm border-amber-400 bg-amber-50 text-amber-950',
      titulo: 'Problema ao consultar a API SITRAM',
    };
    box.className = info.cls;
    tit.textContent = info.titulo;
    msg.textContent = (h.mensagem || '') + (h.http != null ? ' (HTTP ' + h.http + ')' : '');
    box.classList.remove('hidden');
  } catch (e) {
    box.className = 'no-print rounded-2xl border p-4 text-sm border-slate-300 bg-slate-50 text-slate-800';
    tit.textContent = 'Não foi possível verificar a API SITRAM';
    msg.textContent = 'Falha de rede ao falar com o backend. Confira se está Online/Local.';
    box.classList.remove('hidden');
  }
}

$('btnRecheckApi')?.addEventListener('click', verificarSaudeApiSitram);
setTimeout(verificarSaudeApiSitram, 800);
setInterval(verificarSaudeApiSitram, 10 * 60 * 1000);

const dz = $('dropzone'), fi = $('fileInput');
dz.onclick = () => fi.click();
['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drop-active'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drop-active'); }));
dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) lerArquivo(e.dataTransfer.files[0]); });
fi.addEventListener('change', () => { if (fi.files.length) lerArquivo(fi.files[0]); });

function extrairChaves(texto) {
  const todas = texto.match(/\d{44}/g) || [];
  return [...new Set(todas)];
}

function lerArquivo(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const chaves = extrairChaves(String(reader.result || ''));
    CHAVES = [...new Set([...CHAVES, ...chaves])];
    $('fileInfo').textContent = `${file.name}: ${chaves.length} chave(s) encontrada(s) · total carregado: ${CHAVES.length}`;
    log(`Arquivo "${file.name}": ${chaves.length} chave(s).`);
    atualizarPainelChaves();
  };
  reader.readAsText(file, 'UTF-8');
}

function usarTextoColado() {
  const chaves = extrairChaves($('pasteArea').value);
  CHAVES = [...new Set([...CHAVES, ...chaves])];
  log(`Texto colado: ${chaves.length} chave(s).`);
  atualizarPainelChaves();
}

function adicionarChaveUnica() {
  const c = soDigitos($('chaveUnica').value);
  if (!/^\d{44}$/.test(c)) { alert('Informe uma chave com 44 dígitos.'); return; }
  if (!CHAVES.includes(c)) CHAVES.push(c);
  $('chaveUnica').value = '';
  atualizarPainelChaves();
}

function limparTudo() {
  CHAVES = []; RESULTADOS = [];
  $('pasteArea').value = ''; $('fileInfo').textContent = '';
  atualizarPainelChaves(); renderTabela(); atualizarResumo();
  $('progressBar').style.width = '0%'; $('progressLabel').textContent = 'Aguardando consulta…'; $('progressPct').textContent = '';
}

function atualizarPainelChaves() {
  $('countChaves').textContent = CHAVES.length;
  $('btnConsultar').disabled = CHAVES.length === 0;
  $('chavesPreview').textContent = CHAVES.slice(0, 200).join('\n') + (CHAVES.length > 200 ? `\n… +${CHAVES.length - 200}` : '');
}

let cancelado = false;
async function consultarLote() {
  if (!CHAVES.length) return;
  if (!await pingBackend()) { alert('Backend offline. Clique em Online ou inicie o backend local.'); return; }
  RESULTADOS = [];
  cancelado = false;
  $('btnConsultar').disabled = true;
  const total = CHAVES.length;
  let concluidas = 0;
  const conc = 4;
  let idx = 0;

  async function worker() {
    while (idx < total && !cancelado) {
      const i = idx++;
      const chave = CHAVES[i];
      try {
        const r = await fetch(backend() + '/api/sitram/consulta?chave=' + chave);
        RESULTADOS.push(await r.json());
      } catch (e) {
        RESULTADOS.push({ chave, ok: false, status: 'ERRO', erro: 'falha ao falar com backend: ' + e, pago: null });
      }
      concluidas++;
      const pct = Math.round(concluidas / total * 100);
      $('progressBar').style.width = pct + '%';
      $('progressPct').textContent = pct + '%';
      $('progressLabel').textContent = `Consultando ${concluidas}/${total}…`;
      renderTabela(); atualizarResumo();
    }
  }
  log(`Iniciando consulta de ${total} chave(s)…`);
  await Promise.all(Array.from({ length: Math.min(conc, total) }, worker));
  const ordem = new Map(CHAVES.map((c, i) => [c, i]));
  RESULTADOS.sort((a, b) => (ordem.get(a.chave) ?? 0) - (ordem.get(b.chave) ?? 0));
  $('progressLabel').textContent = `Concluído: ${total} chave(s).`;
  log('Consulta concluída.');
  $('btnConsultar').disabled = false;
  renderTabela(); atualizarResumo();
}

function classePago(r) {
  if (!r.ok) return ['ERRO', 'badge-nao', r.erro || 'Erro'];
  const st = r.status;
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
  if (f === 'erros') return !r.ok;
  return true;
}

function fmtValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTabela() {
  const tb = $('tbody');
  tb.innerHTML = '';
  const lista = RESULTADOS.filter(passaFiltro);
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="9" class="px-4 py-6 text-center text-slate-400">Nenhum resultado ainda. Carregue as chaves e clique em “Consultar lote”.</td></tr>';
    return;
  }
  for (const r of lista) {
    const [txt, cls, dica] = classePago(r);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    tr.innerHTML =
      `<td class="px-3 py-2 font-mono text-[11px]">${r.chave || '—'}</td>` +
      `<td class="px-3 py-2">${r.numero ?? '—'}</td>` +
      `<td class="px-3 py-2">${r.situacao_nf || (r.encontrada === false ? '—' : (r.erro || '—'))}</td>` +
      `<td class="px-3 py-2">${r.situacao_imposto || '—'}</td>` +
      `<td class="px-3 py-2"><span title="${dica}" class="px-2 py-1 rounded-full font-bold ${cls}">${txt}</span></td>` +
      `<td class="px-3 py-2">${r.emitente || '—'}</td>` +
      `<td class="px-3 py-2">${r.destinatario || '—'}</td>` +
      `<td class="px-3 py-2">${r.data_fato_gerador || '—'}</td>` +
      `<td class="px-3 py-2 text-right">${fmtValor(r.valor_total)}</td>`;
    tb.appendChild(tr);
  }
}

function atualizarResumo() {
  const box = $('resumo');
  if (!RESULTADOS.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  $('rTotal').textContent = RESULTADOS.length;
  $('rPagas').textContent = RESULTADOS.filter(r => r.status === 'PAGA' || (!r.status && r.pago === true)).length;
  $('rAPagar').textContent = RESULTADOS.filter(r => r.status === 'A_PAGAR').length;
  $('rSemCob').textContent = RESULTADOS.filter(r => r.status === 'SEM_COBRANCA' || (!r.status && r.ok && r.encontrada && r.pago === false)).length;
  $('rNaoEnc').textContent = RESULTADOS.filter(r => r.ok && r.encontrada === false).length;
  $('rErros').textContent = RESULTADOS.filter(r => !r.ok).length;
}

function imprimirResultado() {
  if (!RESULTADOS.length) { alert('Nada para imprimir. Consulte o lote primeiro.'); return; }
  window.print();
}

function exportarCSV() {
  if (!RESULTADOS.length) { alert('Nada para exportar.'); return; }
  const head = ['chave','numero','selo','situacao_nf','situacao_imposto','status','paga','emitente','destinatario','fato_gerador','valor_total','erro'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [head.join(';')];
  for (const r of RESULTADOS) {
    linhas.push([r.chave, r.numero, r.selo, r.situacao_nf, r.situacao_imposto, r.status || '',
      r.pago === true ? 'SIM' : (r.pago === false ? 'NAO' : ''), r.emitente, r.destinatario,
      r.data_fato_gerador, r.valor_total, r.erro || r.acao || ''].map(q).join(';'));
  }
  const blob = new Blob(["\ufeff" + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sitram-consulta-nfe.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

renderTabela();
