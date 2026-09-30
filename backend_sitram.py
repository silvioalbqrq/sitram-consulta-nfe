# backend_sitram.py — Consulta em lote de NFe no SITRAM-CE (SEFAZ/CE)
# Descoberta por engenharia reversa do frontend Angular do portal SITRAM:
#   GET https://portal-sitram.sefaz.ce.gov.br/api-nota/notafiscal/por-chave-de-acesso/{chave44}?page=0&size=25
# Esse backend atua como proxy (o portal NAO libera CORS p/ origins externas),
# normaliza o retorno e classifica se a nota esta PAGA ou NAO.
#
# INSTALAR: python -m pip install fastapi uvicorn
# RODAR (na pasta deste arquivo): python -m uvicorn backend_sitram:app --port 8001
# TESTAR: http://127.0.0.1:8001/docs  |  site: abra sitram-consulta-nfe.html no navegador
import json
import re
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
HTML_FILE = BASE_DIR / "sitram-consulta-nfe.html"

SITRAM_API = "https://portal-sitram.sefaz.ce.gov.br/api-nota/notafiscal/por-chave-de-acesso"
UA = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

# Limite anti-DoS: o Railway gratuito + SITRAM nao aguentam lote infinito.
MAX_LOTE = 500
# Origens autorizadas a usar este proxy (Pages + local). Evita que
# terceiros usem sua cota do Railway como proxy gratuito.
ORIGENS = [
    "https://silvioalbqrq.github.io",
    "http://127.0.0.1:8001",
    "http://localhost:8001",
]

app = FastAPI(title="VMF Consulta SITRAM NFe")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def somente_digitos(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def dv_valido(chave: str) -> bool:
    """DV modulo 11 da chave NF-e (43 primeiros digitos, pesos 2..9)."""
    if not re.fullmatch(r"\d{44}", chave or ""):
        return False
    soma, peso = 0, 2
    for i in range(42, -1, -1):
        soma += int(chave[i]) * peso
        peso = 2 if peso == 9 else peso + 1
    resto = soma % 11
    dv = 0 if resto in (0, 1) else 11 - resto
    return dv == int(chave[43])


def valida_chave(chave: str) -> Optional[str]:
    """Retorna msg de erro ou None se OK. Exige 44 digitos, modelo 55 e DV."""
    if not re.fullmatch(r"\d{44}", chave or ""):
        return "chave deve ter 44 digitos numericos"
    if chave[20:22] != "55":
        return "modelo invalido (posicoes 21-22 devem ser 55 p/ NF-e)"
    if not dv_valido(chave):
        return "digito verificador invalido (modulo 11)"
    return None


def classifica_status(situacao_nf: str, situacao_imposto: str) -> tuple:
    """Classifica a partir dos rotulos observados no portal SITRAM.

    Status observados na API (campo numerico `situacao` + descricao):
    - 20 / 'A Pagar'                       -> A_PAGAR (selada, imposto pendente)
    - 30 / 'Paga ou Parcelada ou Deb.Autuado' (+ 'SUBT/ANTC - Pago') -> PAGA
    - 40 / 'Sem Cobranca'                  -> SEM_COBRANCA (selada, sem imposto a recolher)
    - HTTP 404 / lista vazia               -> NAO_ENCONTRADA (nao selada: precisa
      selar no posto / aguardar o transito; so depois fica disponivel p/ pagar)

    ATENCAO a ordem dos testes: 'A Pagar' contem o trecho 'paga', por isso o
    teste de 'a pagar' vem ANTES do teste de 'paga'.
    Retorna (status, pago_bool).
    """
    nf = (situacao_nf or "").lower()
    imp = (situacao_imposto or "").lower()
    if "a pagar" in nf or "a pagar" in imp:
        return ("A_PAGAR", False)
    if "paga" in nf or "parcelada" in nf or "autuado" in nf:
        return ("PAGA", True)
    if "pago" in imp:
        return ("PAGA", True)
    if "sem cobran" in nf:
        return ("SEM_COBRANCA", False)
    if not nf and not imp:
        return ("SEM_COBRANCA", False)
    return ("OUTRO", False)


def consulta_sitram(chave: str, timeout: int = 20) -> dict:
    url = f"{SITRAM_API}/{chave}?page=0&size=25"
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = json.loads(r.read().decode("utf-8", errors="ignore"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Mesmo modal do portal: "Nao foram encontradas notas fiscais para
            # esta consulta" = chave ainda NAO SELADA (selar antes de pagar).
            return {"chave": chave, "ok": True, "encontrada": False,
                    "erro": None, "pago": None, "status": "NAO_ENCONTRADA",
                    "acao": "nao selada: selar no posto / aguardar transito e consultar de novo"}
        detalhe = ""
        try:
            detalhe = e.read()[:300].decode("utf-8", errors="ignore")
        except Exception:
            pass
        return {"chave": chave, "ok": False, "encontrada": None,
                "erro": f"HTTP {e.code} na SEFAZ. {detalhe}".strip(),
                "pago": None, "status": "ERRO"}
    except Exception as e:
        return {"chave": chave, "ok": False, "encontrada": None,
                "erro": f"falha de rede: {e}"[:300], "pago": None, "status": "ERRO"}

    itens = payload.get("content", []) or []
    if not itens:
        return {"chave": chave, "ok": True, "encontrada": False,
                "erro": None, "pago": None, "status": "NAO_ENCONTRADA",
                "acao": "nao selada: selar no posto / aguardar transito e consultar de novo"}
    n = itens[0]
    sit_nf = (n.get("situacaoDescricao") or "").strip()
    sit_imp = (n.get("situacaoDoImposto") or "").strip()
    status, pago = classifica_status(sit_nf, sit_imp)
    return {
        "chave": chave,
        "ok": True,
        "encontrada": True,
        "erro": None,
        "status": status,
        "pago": pago,
        "numero": n.get("numero"),
        "selo": n.get("id"),
        "situacao_nf": sit_nf,
        "situacao_imposto": sit_imp,
        "retorno": n.get("retorno"),
        "data_fato_gerador": (n.get("dataFatoGerador") or "")[:10],
        "data_inclusao": (n.get("dataInclusao") or "")[:10],
        "emitente": f"{n.get('nomeEmitente') or ''} ({n.get('codigoEmitente') or ''})".strip(),
        "destinatario": f"{n.get('nomeDestinatario') or ''} ({n.get('codigoDestinatario') or ''})".strip(),
        "uf_emitente": n.get("ufEmitente"),
        "uf_destinatario": n.get("ufDestinatario"),
        "valor_total": n.get("total"),
    }


@app.get("/", include_in_schema=False)
def site():
    # O backend serve o proprio site: basta abrir http://127.0.0.1:8001/
    # (mesma origem = sem problema de CORS e sem configurar URL).
    if HTML_FILE.exists():
        return FileResponse(str(HTML_FILE), media_type="text/html")
    return {"status": "backend SITRAM no ar (arquivo sitram-consulta-nfe.html nao encontrado ao lado do backend)",
            "docs": "/docs"}


@app.get("/api/status")
def status():
    return {"status": "backend SITRAM no ar", "docs": "/docs",
            "site": "http://127.0.0.1:8001/"}


@app.get("/api/sitram/health")
def sitram_health(timeout: int = 12):
    # Sonda leve na API real do SITRAM para o alerta do frontend.
    sonda = "35260361797924001984550050007807621598114292"
    url = f"{SITRAM_API}/{sonda}?page=0&size=1"
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            r.read(4096)
            return {"ok": True, "saude": "OK", "mensagem": "API SITRAM alcançável.", "http": r.status}
    except urllib.error.HTTPError as e:
        if e.code in (400, 404, 422):
            return {"ok": True, "saude": "OK", "mensagem": "API SITRAM alcançável.", "http": e.code}
        if e.code in (401, 403):
            return {"ok": False, "saude": "BLOQUEADA", "mensagem": "API SITRAM negou acesso.", "http": e.code}
        return {"ok": False, "saude": "INDISPONIVEL", "mensagem": f"SITRAM respondeu HTTP {e.code}.", "http": e.code}
    except Exception as e:
        return {"ok": False, "saude": "INDISPONIVEL", "mensagem": f"Falha de rede até o SITRAM: {e}"[:200], "http": None}


@app.get("/api/sitram/consulta")
def consultar_uma(chave: str = Query(..., description="Chave de acesso com 44 digitos")):
    c = somente_digitos(chave)
    err = valida_chave(c)
    if err:
        return {"chave": c, "ok": False, "erro": err, "pago": None, "status": "INVALIDA"}
    return consulta_sitram(c)


class LoteIn(BaseModel):
    chaves: List[str] = Field(max_length=MAX_LOTE)
    intervalo: float = 0.3
    workers: int = 4
    timeout: int = 20


@app.post("/api/sitram/lote")
def consultar_lote(lote: LoteIn):
    if len(lote.chaves) > MAX_LOTE:
        raise HTTPException(status_code=413, detail=f"lote maximo de {MAX_LOTE} chaves por requisicao")
    # normaliza + deduplica preservando ordem
    vistas, fila, invalidas = set(), [], []
    for bruta in lote.chaves:
        c = somente_digitos(bruta)
        if not c or c in vistas:
            continue
        vistas.add(c)
        err = valida_chave(c)
        if err:
            invalidas.append({"chave": c or bruta, "ok": False,
                              "erro": err, "pago": None,
                              "encontrada": None, "status": "INVALIDA"})
        else:
            fila.append(c)

    resultados = []

    def uma(chave: str):
        return consulta_sitram(chave, timeout=lote.timeout)

    if fila:
        workers = max(1, min(lote.workers, 8, len(fila)))
        if workers == 1:
            for c in fila:
                resultados.append(uma(c))
                if lote.intervalo:
                    time.sleep(lote.intervalo)
        else:
            # Throttle global: espacar submissoes para taxa ~= 1/intervalo,
            # em vez de dormir dentro de cada thread (que multiplicava a taxa).
            pausa = (lote.intervalo or 0) / workers
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futs = []
                for c in fila:
                    futs.append(ex.submit(uma, c))
                    if pausa:
                        time.sleep(pausa)
                for f in futs:
                    resultados.append(f.result())

    todos = invalidas + resultados
    pagas = sum(1 for r in todos if r.get("status") == "PAGA")
    a_pagar = sum(1 for r in todos if r.get("status") == "A_PAGAR")
    sem_cobranca = sum(1 for r in todos if r.get("status") == "SEM_COBRANCA")
    nao_pagas = sum(1 for r in todos
                    if r.get("ok") and r.get("encontrada") and r.get("pago") is False)
    nao_encontradas = sum(1 for r in todos
                          if r.get("ok") and r.get("encontrada") is False)
    erros = sum(1 for r in todos if not r.get("ok"))
    return {"total": len(todos), "pagas": pagas, "a_pagar": a_pagar,
            "sem_cobranca": sem_cobranca, "nao_pagas": nao_pagas,
            "nao_encontradas": nao_encontradas, "erros": erros,
            "resultados": todos}
