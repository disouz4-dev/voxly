# Voxly Karaoke 🎤

Aplicação **colaborativa de karaokê** para festas e eventos: o **host** (computador) controla a sessão e a fila de músicas, enquanto **cantores** participam pelo celular — escaneando um **QR Code** e pedindo músicas em tempo real.

Construído com **Electron**, **Firebase / Firestore** e **Node.js**.

> English version: [README.en.md](README.en.md)

---

## ✨ Funcionalidades

- 🎵 **Sessões ao vivo** — o host inicia uma sessão e gera um código + QR Code.
- 📱 **Participação pelo celular** — escaneie o QR e entre na sessão instantaneamente.
- 🎤 **Fila de músicas em tempo real** — os cantores pedem, o host controla (marcar cantada, pular, remover).
- 🎚️ **Controle de tom (pitch shift)** para quem quer cantar em outro tom.
- 🧑🤝🧑 **Presença online** — o host vê quem está conectado.
- 📂 **Catálogo de músicas** — busca com cache no Firestore e capas via iTunes.
- 🔌 **Fallback offline (LAN)** — mesmo sem internet, o karaokê não para (detalhes abaixo).

## 🏗️ Arquitetura

```
┌──────────────────────── Fullscreen ─────────────────────────┐
│  Electron (Host) — sessão, fila, player                     │
│      │                                                      │
│      │ QR: http://<IP>:8030/profile.html                    │
│      ▼                                                      │
│  Servidor LAN (porta 8030) ── serve a web do cantor        │
│      │  + API REST  /api/store                              │
│      │  + Eventos   /api/eventos (SSE)                      │
│      │  + Persistência em disco (voxly-offline.json)        │
│      ▼                                                      │
│  Cantores (navegador/celular no Wi-Fi do evento)            │
└─────────────────────────────────────────────────────────────┘

        Internet (quando disponível)
   ───────────────┬───────────────
                  ▼
        Firebase Auth + Firestore (hosting web)
```

### 🌐 Online x Offline

- **Online**: o app usa **Firebase Auth + Firestore** normalmente e os cantores acessam pelo Firebase Hosting (endereço público).
- **Offline (queda de internet)**: o **host** sobe um servidor local na porta `8030` e o **QR Code passa a apontar para a LAN** (`http://IP:8030/profile.html`). Um shim (`web/public/offline-client.js`) emula a API do Firestore em cima do servidor local, com eventos em tempo real (SSE). O host espelha fila/sessão/presenças para o servidor local, mantendo cantores e host sincronizados **sem depender de nuvem**.

> ⚠️ **Limitações do modo offline:** login Google fica indisponível (cantor entra com identidade local) e os dados offline **não** são sincronizados automaticamente de volta para o Firestore quando a internet voltar.

## 🚀 Como executar

### App (host/player)
```bash
cd app
npm install
npm start            # inicia o Electron (host + player)
npm run dev          # modo desenvolvimento
```

### Builds por plataforma
```bash
cd app
npm run build:mac     # macOS  (DMG + ZIP)   — requer macOS
npm run build:win     # Windows (NSIS + portable)
npm run build:linux   # Linux  (AppImage)
```
> O instalador **.dmg/.zip do macOS** é gerado pela pipeline `build-electron-mac` do CI (macOS runner). O ícone do app é gerado a partir de `app/src/assets/icons/icon.png` (1024×1024) para todas as plataformas.

### Web dos cantores (local)
```bash
# opção 1: direto pela LAN (feito automaticamente pelo app na porta 8030)
# opção 2: servir manualmente
cd web
npx serve public -l 3000
```

### Testes e lint
```bash
cd app
npm test             # node --test test/*.test.js
npm run lint         # validação de sintaxe dos processos principais
```

### Docker
```bash
docker compose up -d        # sobe os serviços
docker compose down         # para os serviços
make docker-build           # build da imagem
```

## 📦 Deploy

- **Firebase Hosting** (web dos cantores): `make deploy` ou pipeline de CI (staging/produção).
- **Imagem Docker** para o host: publicada no GitHub Container Registry via CI.
- **Instalador Windows (Electron)**: gerado pela pipeline `build-electron`.

## 🧰 Tecnologias

- **Electron 30** — aplicação desktop multiplataforma (Windows, macOS, Linux)
- **Firebase / Firestore** — autenticação, sessões e fila em tempo real
- **Firebase Hosting** — web pública dos cantores
- **Node.js** — servidor LAN, IPC e testes
- **qrcode, electron-store, soundtouchjs / rubberband-web**

## 📁 Estrutura

```
app/                     # aplicação Electron (host + player + servidor LAN)
  src/main.js            # processo principal (inicia o servidor LAN)
  src/local-server.js    # servidor LAN: estáticos + REST + SSE
  src/screens/           # telas (host, player, profile)
  test/                  # testes automatizados
web/                     # web dos cantores (Firebase Hosting)
  public/                # index, profile, signup + offline-client.js
  firestore.rules        # regras de segurança do Firestore
Dockerfile / docker-compose.yml
.github/workflows/ci-cd.yml   # pipeline CI/CD
scripts/                 # deploy e health-check
```

## 🤝 Contribuindo

Sinta-se à vontade para abrir *issues* e *pull requests*. Mantenha a compatibilidade com o modo offline ao alterar o fluxo de dados.

## 📄 Licença

Distribuído sob a licença **MIT**.