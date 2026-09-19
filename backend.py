# backend.py — VMF Contabilidade v2.1 (com anti-Cloudflare + instalador)
# INSTALAR (CMD): python -m pip install -r requirements.txt
#   requirements.txt: fastapi uvicorn selenium webdriver-manager
# RODAR (CMD, na pasta do backend.py): python -m uvicorn backend:app --port 8000
# TESTAR: http://127.0.0.1:8000/docs
import os, time, re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

app = FastAPI(title="VMF Downloader NFe Pro")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def home():
    return {"status": "backend NFe Pro no ar", "docs": "/docs"}

class Lote(BaseModel):
    chaves: List[str]
    destino: str = "Downloads/XML_NFe"
    espera_explicita: int = 15   # FIX: antes sleep(10) fixo
    timeout_download: int = 60   # FIX: antes max_wait = 1 (bug)
    intervalo: float = 2.0
    tentativas: int = 2
    headless: bool = False

SELECTORS = {
  "search": [ (By.XPATH,'//*[@id="searchTxt"]'), (By.CSS_SELECTOR,"#searchTxt") ],
  "go":     [ (By.XPATH,'//*[@id="searchBtn"]'), (By.CSS_SELECTOR,"#searchBtn") ],
  "dl":     [ (By.XPATH,'//*[@id="downloadXmlBtn"]/span'), (By.CSS_SELECTOR,"#downloadXmlBtn span, #downloadXmlBtn") ],
  "new":    [ (By.XPATH,'//*[@id="newSearchBtn"]/span'), (By.CSS_SELECTOR,"#newSearchBtn span, #newSearchBtn") ],
}

def dv_ok(chave: str) -> bool:  # valida DV modulo 11
    if not re.fullmatch(r"\d{44}", chave or ""): return False
    corpo, dv = chave[:43], int(chave[43])
    soma, peso = 0, 2
    for d in reversed(corpo):
        soma += int(d) * peso
        peso = peso + 1 if peso < 9 else 2
    resto = soma % 11
    calc = 0 if resto in (0, 1) else 11 - resto
    return calc == dv

def find(driver, name, timeout=15):
    last = None
    for by, sel in SELECTORS[name]:
        try:
            return WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((by, sel)))
        except Exception as e: last = e
    raise last

def fechar_banners(driver):
    # Tenta fechar cookie/LGPD/modal que intercepta o clique
    seletores = [
        (By.XPATH, "//button[contains(translate(.,'ACEITARCONCORDOKFECHARENTENDI','aceitarconcordokfecharentendi'),'aceitar')]"),
        (By.XPATH, "//button[contains(translate(.,'ACEITARCONCORDOKFECHARENTENDI','aceitarconcordokfecharentendi'),'concordo')]"),
        (By.XPATH, "//button[contains(translate(.,'ACEITARCONCORDOKFECHARENTENDI','aceitarconcordokfecharentendi'),'entendi')]"),
        (By.XPATH, "//button[contains(@class,'close')]"),
        (By.CSS_SELECTOR, ".cookie-accept, .cc-accept, #accept-cookies"),
    ]
    for by, sel in seletores:
        try:
            els = driver.find_elements(by, sel)
            for el in els:
                if el.is_displayed():
                    driver.execute_script("arguments[0].click();", el)
                    time.sleep(0.5)
        except: pass

def safe_click(driver, element):
    # Rola ate o elemento, tenta clique normal, cai para clique via JS
    try:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
        time.sleep(0.4)
    except: pass
    fechar_banners(driver)
    try:
        element.click()
        return
    except Exception as e:
        msg = str(e)
        if "click intercepted" not in msg and "not clickable" not in msg:
            raise
    # Fallback: clique via JavaScript (ignora overlay)
    driver.execute_script("arguments[0].click();", element)

def make_driver(destino, headless=False):
    # FIX anti-Cloudflare: perfil persistente + SEM headless por padrao
    # Na 1a execucao resolva o "Sou humano" manualmente; o cookie fica salvo.
    os.makedirs(destino, exist_ok=True)
    os.makedirs("./chrome-perfil-vmf", exist_ok=True)
    opts = Options()
    opts.add_argument("--user-data-dir=" + os.path.abspath("./chrome-perfil-vmf"))
    if headless:
        opts.add_argument("--headless=new")  # evite headless no MeuDANFE (Cloudflare barra)
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    prefs = {"download.default_directory": os.path.abspath(destino),
             "download.prompt_for_download": False,
             "download.directory_upgrade": True,
             "safebrowsing.enabled": True}
    opts.add_experimental_option("prefs", prefs)
    # FIX: multiplataforma via webdriver-manager, sem reg query nem .exe commitado
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

def esperar_cloudflare(driver, timeout=90):
    # Aguarda a tela "Verificando / Sou humano" liberar antes de procurar o botao.
    # Se travar aqui, resolva MANUALMENTE no Chrome que o backend abriu.
    ini = time.time()
    while time.time() - ini < timeout:
        try:
            # Se o campo de pesquisa ja esta visivel, liberou
            els = driver.find_elements(By.CSS_SELECTOR, "#searchTxt")
            if els and els[0].is_displayed():
                return True
            html = driver.page_source.lower()
            if ("verifying" in html or "checking your browser" in html
                or "falha na verifica" in html or "sou humano" in html
                or "turnstile" in html or "cloudflare" in html):
                time.sleep(3)
                continue
        except: pass
        time.sleep(2)
    # Ultima checagem
    try:
        els = driver.find_elements(By.CSS_SELECTOR, "#searchTxt")
        return bool(els and els[0].is_displayed())
    except: return False

def esperar_xml(destino, chave, timeout=60):
    # FIX: timeout real + tamanho estavel + .crdownload
    alvo = os.path.join(os.path.abspath(destino), f"nfe_{chave}.xml")
    ini = time.time()
    while time.time() - ini < timeout:
        if os.path.exists(alvo) and os.path.getsize(alvo) > 0:
            t1 = os.path.getsize(alvo); time.sleep(1)
            if os.path.getsize(alvo) == t1: return alvo
        cr = [f for f in os.listdir(os.path.abspath(destino)) if f.endswith(".crdownload")]
        time.sleep(1)
        if not cr and os.path.exists(alvo) and os.path.getsize(alvo) > 0:
            return alvo
    cands = [f for f in os.listdir(os.path.abspath(destino)) if f.endswith(".xml") and chave in f]
    if cands: return os.path.join(os.path.abspath(destino), cands[0])
    raise TimeoutError("tempo limite aguardando XML")

@app.post("/api/nfe/download")
def baixar(lote: Lote):
    # deduplica + valida antes de abrir browser
    vistas, fila = set(), []
    for c in [re.sub(r"\D", "", x) for x in lote.chaves]:
        if c and c not in vistas:
            vistas.add(c)
            fila.append({"chave": c, "valida": dv_ok(c)})
    os.makedirs(lote.destino, exist_ok=True)
    driver = make_driver(lote.destino, lote.headless)  # FIX: 1 driver p/ o lote
    resultados = []
    try:
        driver.get("https://www.meudanfe.com.br/")
        if not esperar_cloudflare(driver, 90):
            # Tira print da tela do challenge para voce ver
            shot = os.path.join(lote.destino, "cloudflare_bloqueio.png")
            try: driver.save_screenshot(shot)
            except: shot = None
            return {"total": len(fila), "ok": 0, "resultados": [
                {"chave": i["chave"], "ok": False,
                 "erro": "Cloudflare nao liberou (resolva o 'Sou humano' no Chrome aberto e repita). Print: " + str(shot),
                 "print": shot} for i in fila]}
        for item in fila:
            c = item["chave"]
            if not item["valida"]:
                resultados.append({"chave": c, "ok": False, "erro": "chave/DV invalido"}); continue
            ok, erro, arq, shot = False, None, None, None
            for t in range(1, lote.tentativas + 1):
                try:
                    campo = find(driver, "search", lote.espera_explicita)
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", campo)
                    campo.clear(); campo.send_keys(c)
                    safe_click(driver, find(driver, "go", lote.espera_explicita))
                    # FIX: espera condicional do botao, nao sleep fixo
                    safe_click(driver, find(driver, "dl", lote.espera_explicita))
                    arq = esperar_xml(lote.destino, c, lote.timeout_download)
                    ok = True; break
                except Exception as e:
                    erro = str(e)[:300]
                    shot = os.path.join(lote.destino, f"erro_{c}_t{t}.png")
                    try: driver.save_screenshot(shot)
                    except: shot = None
                    time.sleep(2 * t)  # backoff
            try: safe_click(driver, find(driver, "new", 5))
            except:
                driver.get("https://www.meudanfe.com.br/")
                esperar_cloudflare(driver, 60)
            resultados.append({"chave": c, "ok": ok, "arquivo": arq, "erro": erro, "print": shot})
            time.sleep(lote.intervalo)
    finally:
        driver.quit()
    return {"total": len(fila), "ok": sum(1 for r in resultados if r["ok"]), "resultados": resultados}
