# Consulta NFe Interestadual — SITRAM / SEFAZ-CE

Ferramenta local/online para consulta em lote de chaves de acesso de NF-e no portal **SITRAM** (SEFAZ-CE).

Classifica automaticamente se a nota está **PAGA**, **A PAGAR**, **SEM COBRANÇA** ou **NÃO SELADA**.

> Uso interno. Baixa frequência. Um usuário.

---

## Arquitetura

| Parte | Onde | Arquivo |
|-------|------|---------|
| Frontend (interface) | **GitHub Pages** | `index.html` |
| Backend (API proxy) | **Railway** | `backend_sitram.py` |

O frontend chama o backend. O backend consulta a API pública do portal SITRAM e devolve o status normalizado.

Também funciona **100% local** (sem Railway), com o arquivo `iniciar_sitram.bat`.

---

## 1. Deploy do backend no Railway

1. Crie uma conta em [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo** (este repositório)
3. Se pedir, defina o **Start Command**:
   ```bash
   uvicorn backend_sitram:app --host 0.0.0.0 --port $PORT
   ```
4. O `Procfile` e o `requirements.txt` já estão prontos
5. Após o deploy, copie a URL pública, exemplo:
   ```
   https://sitram-consulta-nfe-production.up.railway.app
   ```

### Teste rápido do backend

Abra no navegador:

```
https://SUA-URL.up.railway.app/api/status
```

Deve retornar algo como:

```json
{"status": "backend SITRAM no ar", "docs": "/docs", "site": "..."}
```

Documentação interativa: `https://SUA-URL.up.railway.app/docs`

---

## 2. Frontend no GitHub Pages

1. Neste repositório: **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` (ou `master`), pasta `/ (root)`
4. Salve e aguarde alguns minutos
5. A URL ficará assim:
   ```
   https://SEU-USUARIO.github.io/sitram-consulta-nfe/
   ```

### Configurar a URL do backend

1. Abra o site no GitHub Pages
2. No canto superior direito, no campo **Backend**, cole a URL do Railway
3. Clique em **Salvar** (fica gravado no navegador via `localStorage`)

Pronto. As consultas passam a usar o backend online.

---

## 3. Uso local (sem Railway)

No Windows, na pasta do projeto:

1. Dê 2 cliques em `iniciar_sitram.bat`
2. O script sobe o backend em `http://127.0.0.1:8001` e abre o navegador
3. Não feche a janela preta enquanto estiver usando

Ou manualmente:

```bash
python -m pip install -r requirements.txt
python -m uvicorn backend_sitram:app --port 8001
```

Abra: [http://127.0.0.1:8001/](http://127.0.0.1:8001/)

---

## Como usar a ferramenta

1. Informe a URL do backend (Railway ou local) e salve
2. Arraste um `.csv` / `.txt` ou cole as chaves de 44 dígitos
3. Clique em **Consultar lote**
4. Veja o resumo (Pagas, A pagar, Sem cobrança, Não seladas, Erros)
5. Exporte CSV ou imprima

### Significado dos status

| Status | Significado |
|--------|-------------|
| **PAGA** | Nota selada e imposto pago / parcelado / déb. autuado |
| **A PAGAR** | Nota selada com imposto pendente |
| **SEM COBRANÇA** | Nota selada, sem imposto a recolher |
| **NÃO SELADA** | Ainda não aparece no SITRAM (selar no posto / aguardar trânsito) |
| **INVÁLIDA** | Chave com formato incorreto (não tem 44 dígitos ou não é modelo 55) |

---

## API (backend)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | Health check |
| GET | `/api/sitram/consulta?chave=...` | Consulta uma chave |
| POST | `/api/sitram/lote` | Consulta em lote |

Exemplo de lote:

```json
{
  "chaves": ["3524...44digitos", "3524...outra"],
  "intervalo": 0.3,
  "workers": 4,
  "timeout": 20
}
```

---

## Estrutura do repositório

```
├── index.html           # Frontend (GitHub Pages)
├── backend_sitram.py    # Backend FastAPI (Railway)
├── requirements.txt     # fastapi + uvicorn
├── Procfile             # Comando de start do Railway
├── iniciar_sitram.bat   # Atalho Windows (uso local)
├── README.md
└── .gitignore
```

---

## Observações importantes

- A API do portal SITRAM **não é oficialmente documentada**. Foi mapeada por engenharia reversa do frontend do portal. Pode mudar sem aviso.
- Use com moderação (intervalo entre requisições e poucos workers). Uso abusivo pode gerar bloqueio temporário de IP.
- O backend libera CORS (`*`) para permitir o frontend no GitHub Pages.
- Não coloque dados sensíveis no repositório. Este projeto não armazena chaves nem resultados no servidor.

---

## Licença

Uso interno. Sem garantia. A responsabilidade pelo uso perante a SEFAZ é de quem opera a ferramenta.
