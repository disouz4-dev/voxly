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

O release traz **dois .dmg**: `Voxly-<versao>.dmg` para Mac Intel (x64) e
`Voxly-<versao>-arm64.dmg` para Apple Silicon (M1/M2/M3). Instalar o errado
resulta em app que não abre.

```bash
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Falha ao consultar a versao mais recente"; exit 1; }

# Escolhe o pacote da arquitetura desta maquina
case "$(uname -m)" in
  arm64) ARQ="-arm64" ;;
  *)     ARQ=""       ;;
esac
curl -fL -o Voxly.dmg "https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}${ARQ}.dmg"

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
- 🖥️ **3 telas** — **Gerência** (KJ), **Palco** (vídeo em tela cheia) e **Público** (opcional), que espelha o vídeo do Palco junto com o cantor, o avatar, os próximos da fila e o QR grande.
- ⏱️ **Horário do show** — o KJ define quando o show começa; o público e o app dos cantores mostram a **contagem regressiva** até a hora marcada.
- 🎛️ **Temas de intervalo** — playlists editáveis por tema (Rock, Pagode, MPB...). Casa de rock? Só toca Rock no intervalo.
- 📱 **Participação pelo celular** — escaneie o QR e entre na sessão instantaneamente.
- 🎤 **Fila de músicas em tempo real** — os cantores pedem, o host controla (marcar cantada, pular, remover).
- 🎚️ **Controle de tom (pitch shift)** para quem quer cantar em outro tom.
- 🧑🤝🧑 **Presença online** — o host vê quem está conectado.
- 📂 **Catálogo de músicas** — busca com cache no Firestore e capas via iTunes.
- ⬇️ **Download automático do YouTube** — o cantor pesquisa só artista e música (nomes vindos do iTunes, para saírem escritos igual dos dois lados). O Voxly procura as versões de karaokê, filtra e ordena por relevância, canal e data de postagem, e **quem escolhe a versão é o KJ** — pelos cards, com duração, visualizações e idade do vídeo. Padrão 1080p, configurável em ⚙ Config.
- 🎚️ **Versões no acervo** — a mesma música costuma existir em vários canais. O KJ escolhe qual toca, procura outras no YouTube mesmo já tendo o arquivo, apaga do disco a que não quer, ou aponta um arquivo à mão (📎 Vincular).
- 🗣️ **Chamada por voz (opcional)** — anuncia o próximo cantor com vozes neurais brasileiras do **Piper**. Não vem instalada: o KJ marca em ⚙ Config e o app baixa e configura. A chamada fica em loop durante os 30s de confirmação.
- ⏳ **Prazo da sessão** — a sessão acaba no horário que o KJ marcou, com 5 minutos de tolerância. Depois disso o cantor não põe mais música; o KJ segue tocando o que está na fila.
- 🔒 **Uma sessão por vez** — abrir uma nova expurga as anteriores e os cantores das sessões antigas são desconectados.
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
> ⚠️ **O `.deb` não pode ser gerado no macOS.** O `fpm` usa o `ar` do próprio
> sistema e produz um pacote de ~96 bytes, com exit code 0 e sem nenhum aviso —
> o arquivo parece pronto e está vazio. Gere o `.deb` no Linux ou deixe com o
> CI (job `build-electron-linux`). O AppImage sai correto no macOS.
>
> O CI compila macOS em **arm64**; para Mac Intel o `.dmg` x64 precisa ser
> gerado localmente (`npx electron-builder --mac --x64`) e anexado ao release.
>
> O ícone é gerado de `app/src/assets/icons/icon.png` (1024×1024) para todas as
> plataformas, com `icon.ico` multi-tamanho no Windows.

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
| **1 · Gerência (KJ)** | Janela principal | Fila, presenças, now-playing, QR, regras, downloads e botão 🎥 **Público** |
| **2 · Palco** | Tela cheia | Vídeo do karaokê, chamada de 30s e anúncio do cantor. É a **única fonte de áudio** |
| **3 · Público** | Outro monitor | Espelha o vídeo do Palco, mais cantor, avatar, próximos da fila e QR grande. Nasce **mudo** |

> As três janelas se organizam sozinhas. Com monitor externo, Palco e Público ocupam a tela inteira; em tela única elas se dividem em faixas para não cobrir a Gerência.

- O host liga/desliga a tela do público pelo botão **🎥 Público**.
- **Horário do show**: no painel *Controle do Palco* o KJ define a hora (`🎬 Horário do Show`) e o **público, o palco e o app dos cantores** exibem a contagem regressiva até o show começar. Na hora, é só dar ▶ Play.

### 🔄 Atualização automática
Os instaladores publicados no **GitHub Releases** são detectados pelo
`electron-updater` e instalados na próxima reinicialização.

> No **macOS a atualização automática não funciona hoje**: exige app assinado e
> notarizado pela Apple, e o build não é assinado (por isso o aviso do
> Gatekeeper na primeira abertura). Em macOS, baixe o `.dmg` novo à mão.

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

A suíte cobre sobretudo as falhas que **não** dão erro visível:

| Arquivo | O que trava |
|---|---|
| `casamento.test.js` | título contido em outro não é a mesma música — o que fazia *Miss You Love* virar *I Miss You* no palco |
| `versoes.test.js`, `yt-busca.test.js` | ranqueamento e versões locais |
| `fila.test.js` | o que o Play faz em cada estado da fila |
| `sessao.test.js` | prazo da sessão e a tolerância de 5 min |
| `ligacao.test.js` | `onclick` apontando para função inexistente e erro de sintaxe no `<script>` |
| `preload-api.test.js` | chamada a `electronAPI` que o preload não expõe (falha em silêncio) |
| `carga.test.js` | uso antes da declaração no código que roda ao carregar a tela |

### Docker
```bash
docker compose up -d        # sobe os serviços
docker compose down         # para os serviços
make docker-build           # build da imagem
```

## 📦 Deploy

- **Firebase Hosting** (web dos cantores): `make deploy` ou pipeline de CI (staging/produção).
- **Imagem Docker** para o host: publicada no GitHub Container Registry via CI.
- **Instaladores**: `build-electron-win` (NSIS + portable), `build-electron-linux` (AppImage + .deb) e `build-electron-mac` (DMG + ZIP, **arm64**). O job `release` publica no GitHub Releases quando uma tag `v*` é enviada.

## 🧰 Tecnologias

- **Electron 30** — aplicação desktop multiplataforma (Windows, macOS, Linux)
- **Firebase / Firestore** — autenticação, sessões e fila em tempo real
- **Firebase Hosting** — web pública dos cantores
- **Node.js** — servidor LAN, IPC e testes
- **qrcode, electron-store, soundtouchjs / rubberband-web**

## 📁 Estrutura

```
app/                       # aplicação Electron (Gerência + Palco + Público + servidor LAN)
  src/main.js              # processo principal: janelas, IPC, yt-dlp, Piper
  src/preload.js           # única ponte entre as telas e o processo principal
  src/local-server.js      # servidor LAN: estáticos + REST + SSE
  src/screens/host.html    # Gerência (KJ)
  src/screens/player.html  # Palco e Público — a mesma página, "?tela=publico" separa
  src/yt-busca.js          # consulta e ranqueamento das versões de karaokê
  src/casamento.js         # qual arquivo do acervo atende o pedido
  src/versoes.js           # versões da mesma música já baixadas
  src/fila.js              # o que o botão Play faz em cada estado da fila
  test/                    # testes automatizados (node --test)
web/                       # web dos cantores (Firebase Hosting)
  public/                  # index, profile, signup + offline-client.js
  public/sessao-regras.js  # prazo da sessão — mesma regra no app e no site
  firestore.rules          # regras de segurança do Firestore
Dockerfile / docker-compose.yml
.github/workflows/ci-cd.yml   # pipeline CI/CD
scripts/                 # deploy e health-check
```

> `player.html` serve **as duas** telas de vídeo. Ao depurar, filtre pela query
> string: sem ela é o Palco, com `?tela=publico` é o Público. Confundir as duas
> já custou um diagnóstico inteiro.

## 🤝 Contribuindo

Sinta-se à vontade para abrir *issues* e *pull requests*. Mantenha a compatibilidade com o modo offline ao alterar o fluxo de dados.

## 📄 Licença

Distribuído sob a licença **MIT**.