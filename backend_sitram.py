# backend_sitram.py — Consulta em lote de NFe no SITRAM-CE (SEFAZ/CE)
# Descoberta por engenharia reversa do frontend Angular do portal SITRAM:
#   GET https://portal-sitram.sefaz.ce.gov.br/api-nota/notafiscal/por-chave-de-acesso/{chave44}?page=0&size=25
# Esse backend atua como proxy (o portal NAO libera CORS p/ origins externas),
# normaliza o retorno e classifica se a nota esta PAGA ou NAO.
#
# INSTALAR: python -m pip install fastapi uvicorn
# RODAR (na pasta deste arquivo): python -m uvicorn backend_sitram:app --port 8001
# TESTAR: http://127.0.0.1:8001/docs  |  site: abra index.html no navegador (ou http://127.0.0.1:8001/)
import json
import re
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
HTML_FILE = BASE_DIR / "index.html"

SITRAM_API = "https://portal-sitram.sefaz.ce.gov.br/api-nota/notafiscal/por-chave-de-acesso"
UA = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

app = FastAPI(title="VMF Consulta SITRAM NFe")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def somente_digitos(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def valida_chave(chave: str) -> Optional[str]:
    """Retorna msg de erro ou None se OK. Exige 44 digitos e modelo 55."""
    if not re.fullmatch(r"\d{44}", chave or ""):
        return "chave deve ter 44 digitos numericos"
    if chave[20:22] != "55":
        return "modelo invalido (posicoes 21-22 devem ser 55 p/ NF-e)"
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
    return {"status": "backend SITRAM no ar (arquivo index.html nao encontrado ao lado do backend)",
            "docs": "/docs"}


@app.get("/api/status")
def status():
    return {"status": "backend SITRAM no ar", "docs": "/docs",
            "site": "http://127.0.0.1:8001/"}


@app.get("/api/sitram/consulta")
def consultar_uma(chave: str = Query(..., description="Chave de acesso com 44 digitos")):
    c = somente_digitos(chave)
    err = valida_chave(c)
    if err:
        return {"chave": c, "ok": False, "erro": err, "pago": None, "status": "INVALIDA"}
    return consulta_sitram(c)


class LoteIn(BaseModel):
    chaves: List[str]
    intervalo: float = 0.3
    workers: int = 4
    timeout: int = 20


@app.post("/api/sitram/lote")
def consultar_lote(lote: LoteIn):
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
        r = consulta_sitram(chave, timeout=lote.timeout)
        if lote.intervalo:
            time.sleep(lote.intervalo)
        return r

    if fila:
        workers = max(1, min(lote.workers, 8, len(fila)))
        if workers == 1:
            resultados = [uma(c) for c in fila]
        else:
            with ThreadPoolExecutor(max_workers=workers) as ex:
                # map preserva a ordem da fila
                resultados = list(ex.map(uma, fila))

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
