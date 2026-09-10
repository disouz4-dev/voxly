# Voxly Karaoke 🎤

Aplicação **colaborativa de karaokê** para festas e eventos: o **host** (computador) controla a sessão e a fila de músicas, enquanto **cantores** participam pelo celular — escaneando um **QR Code** e pedindo músicas em tempo real.

Construído com **Electron**, **Firebase / Firestore** e **Node.js**.

> English version: [README.en.md](README.en.md)

---

## 📥 Instalação Rápida

As versões mais recentes estão sempre em: **[github.com/disouz4-dev/voxly/releases/latest](https://github.com/disouz4-dev/voxly/releases/latest)**

### 🐧 Linux

**Opção A — .deb (Ubuntu/Debian, recomendado):**
```bash
sudo apt-get remove -y voxly 2>/dev/null || true

VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Falha ao consultar a versao mais recente"; exit 1; }
wget -O voxly_${VER}_amd64.deb https://github.com/disouz4-dev/voxly/releases/download/v$VER/voxly_${VER}_amd64.deb
sudo dpkg -i voxly_${VER}_amd64.deb
sudo apt-get install -f -y
sudo apt-get install -y yt-dlp ffmpeg

dpkg -s voxly | grep ^Version
```

**Opção B — AppImage (portátil):**
```bash
sudo apt-get install -y yt-dlp ffmpeg

VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Falha ao consultar a versao mais recente"; exit 1; }
wget -O Voxly-${VER}.AppImage https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.AppImage
chmod +x Voxly-${VER}.AppImage
./Voxly-${VER}.AppImage
```

### 🍎 macOS
```bash
# Descobre a versao mais recente automaticamente
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Falha ao consultar a versao mais recente"; exit 1; }
curl -L -o Voxly.dmg https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.dmg

# Monte e copie para /Applications
hdiutil attach Voxly.dmg
cp -R "/Volumes/Voxly/Voxly.app" /Applications/
hdiutil detach /Volumes/Voxly

# Abra (na primeira vez, use o botão direito → Abrir, pois ainda não é assinado)
open /Applications/Voxly.app
```

> ⚠️ O macOS pode exibir "não verificado" por causa do **Gatekeeper** (o app ainda não é assinado/notarizado pela Apple). Para abrir: **botão direito no app → Abrir → Abrir**.

---

## ✨ Funcionalidades

- 🎵 **Sessões ao vivo** — o host inicia uma sessão e gera um código + QR Code.
- 🖥️ **3 telas** — uma para o **host (KJ)**, uma para o **palco** (roda o vídeo karaokê em tela cheia) e uma opcional para o **público** (cantor + música + QR, sem vídeo).
- ⏱️ **Horário do show** — o KJ define quando o show começa; o público e o app dos cantores mostram a **contagem regressiva** até a hora marcada.
- 🎛️ **Temas de intervalo** — playlists editáveis por tema (Rock, Pagode, MPB...). Casa de rock? Só toca Rock no intervalo.
- 📱 **Participação pelo celular** — escaneie o QR e entre na sessão instantaneamente.
- 🎤 **Fila de músicas em tempo real** — os cantores pedem, o host controla (marcar cantada, pular, remover).
- 🎚️ **Controle de tom (pitch shift)** para quem quer cantar em outro tom.
- 🧑🤝🧑 **Presença online** — o host vê quem está conectado.
- 📂 **Catálogo de músicas** — busca com cache no Firestore e capas via iTunes.
- 🔄 **Atualização automática** — novos instaladores são baixados pelo GitHub Releases.
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
npm run build:linux   # Linux  (AppImage + .deb)
```
> O instalador **.dmg/.zip do macOS** é gerado pela pipeline `build-electron-mac` do CI (macOS runner). O **.deb** já sai pronto no `make build-linux`. O ícone do app é gerado a partir de `app/src/assets/icons/icon.png` (1024×1024) para todas as plataformas, com `icon.ico` multi-tamanho no Windows.

### 🐧 Instalação (Linux)

Após gerar ou baixar os instaladores Linux (via [GitHub Releases](https://github.com/disouz4-dev/voxly/releases)):

#### **Pacote Debian (.deb)**
```bash
# ATENÇÃO: nunca use "voxly_*.deb". O curinga casa com qualquer .deb que
# estiver na pasta — inclusive downloads antigos — e você acaba reinstalando
# uma versão velha sem perceber. Sempre nomeie a versão.

# Baixe a versão mais recente e instale
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Falha ao consultar a versao mais recente"; exit 1; }
wget -O voxly_${VER}_amd64.deb https://github.com/disouz4-dev/voxly/releases/download/v$VER/voxly_${VER}_amd64.deb
sudo dpkg -i voxly_${VER}_amd64.deb
sudo apt-get install -f  # corrige dependências, se necessário

# Confirme a versão instalada — deve mostrar a que você baixou
dpkg -s voxly | grep ^Version
```

Para **remover** o Voxly (bloco separado — não rode junto com a instalação):

```bash
sudo apt-get remove voxly
```

#### **AppImage**
```bash
# Baixe a versão mais recente (o curinga Voxly-*.AppImage pegaria downloads
# antigos que ainda estejam na pasta)
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Falha ao consultar a versao mais recente"; exit 1; }
wget -O Voxly-${VER}.AppImage https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.AppImage

# Torne executável e rode
chmod +x Voxly-${VER}.AppImage
./Voxly-${VER}.AppImage

# Opcional: integre ao sistema (cria atalho no menu de aplicações)
./Voxly-${VER}.AppImage --appimage-install
```

> 💡 **Dica**: os AppImages são portáteis - basta baixar, tornar executável e rodar. Não requerem instalação nem permissões de root.

### As 3 telas

| Tela | Janela | O que mostra |
|---|---|---|
| **1 · Host (KJ)** | Gerência | Fila, presenças, now-playing, QR, regras e botão 🎥 **Público** |
| **2 · Palco** | Fullscreen | O vídeo karaokê + intro/preview |
| **3 · Público** | Outro monitor | Cantor, música, tom e QR de acesso — **sem vídeo** |

- O host liga/desliga a tela do público pelo botão **🎥 Público**.
- **Horário do show**: no painel *Controle do Palco* o KJ define a hora (`🎬 Horário do Show`) e o **público, o palco e o app dos cantores** exibem a contagem regressiva até o show começar. Na hora, é só dar ▶ Play.

### 🔄 Atualização automática
Os instaladores publicados como *release draft* no **GitHub Releases** são detectados pelo `electron-updater` e instalados na próxima reinicialização (macOS requer assinatura/notarização da Apple).

### 🎛️ Temas de intervalo
No botão **🎛 Temas** do host você cria temas (ex.: *Rock*) com **playlist própria e editável**, montada a partir do catálogo local. O tema ativo define o que toca entre as músicas; sem tema, voltam as faixas animadas padrão.

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