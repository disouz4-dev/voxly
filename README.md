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

# Monte num ponto fixo e copie para /Applications. O volume do .dmg leva a
# versão no nome ("Voxly 1.1.25"), então /Volumes/Voxly não existe.
hdiutil attach Voxly.dmg -mountpoint /Volumes/VoxlyInstalar
cp -R /Volumes/VoxlyInstalar/Voxly.app /Applications/
hdiutil detach /Volumes/VoxlyInstalar

# O app ainda não é assinado pela Apple: sem isto o macOS diz que "não pode
# verificar" o Voxly e não abre.
xattr -dr com.apple.quarantine /Applications/Voxly.app

# ffmpeg junta vídeo e áudio dos downloads e mede o volume das músicas
brew install ffmpeg

open /Applications/Voxly.app
```

> ⚠️ **Gatekeeper**: o app não é assinado/notarizado pela Apple. Nas versões recentes do macOS o "botão direito → Abrir" não basta — use o `xattr` acima (ou Ajustes do Sistema → Privacidade e Segurança → **Abrir Mesmo Assim**).

---

## ✨ Funcionalidades

**Sessão e telas**
- 🎵 **Sessões ao vivo** — o host inicia uma sessão e gera um código + QR Code. O badge no topo mostra a casa e o horário; clicando nele o KJ **edita nome, data e horário sem derrubar** a sessão. **💥 Derrubar sessão** apaga qualquer sessão em aberto, inclusive presas em outra máquina.
- 🖥️ **3 telas** — **Gerência** (KJ), **Palco** (vídeo em tela cheia) e **Público** (opcional), que espelha o vídeo do Palco junto com o cantor, o avatar, os próximos da fila e o QR grande. A **chamada do próximo cantor** aparece no Palco e no Público.
- ⏱️ **Horário do show** — o KJ define quando o show começa; o público e o app dos cantores mostram a **contagem regressiva**. Sem música tocando, a tela do público alterna um **guia animado** de como participar.
- 🕐 **Relógio do KJ** — a hora, na barra do topo.
- ⏳ **Prazo da sessão** — a sessão acaba no horário que o KJ marcou, com 5 minutos de tolerância. Depois disso o cantor não põe mais música; o KJ segue tocando o que está na fila.
- 🔒 **Uma sessão por vez** — abrir uma nova expurga as anteriores e os cantores das sessões antigas são desconectados. Uma sessão com a Gerência aberta nunca é apagada pela faxina automática, nem pela de outra máquina: as músicas só saem da fila quando o KJ finaliza, derruba ou abre outra sessão.

**Fila**
- 🎤 **Fila em tempo real** — os cantores pedem pelo celular, o host controla (tocar, pular, trocar a música de alguém, remover, adicionar cantor e música à mão). O pedido nunca entra duas vezes, mesmo com clique repetido.
- ↕️ **Ordem de chegada** — quem pediu antes canta antes. O KJ arrasta para reordenar e o app toca **exatamente na ordem que ele vê**; quem foi arrastado fica cravado no lugar.
- ☕ **Café com leite** — quando a espera passa do limite que o KJ define (padrão 40 min), quem ainda não cantou na noite entra **intercalado** com a fila principal: um da fila, um café com leite, outro da fila… A fila principal nunca para. Se alguém sai do meio da fila, o resto se reacomoda sozinho para continuar um de cada — sem mexer em quem o KJ arrastou. O ☕ só aparece em quem de fato entrou assim. Pode ser desligado nas regras.
- 🧑‍🤝‍🧑 **Presença online** — o host vê quem está conectado e **quantas músicas cada um já cantou** na noite.
- 🎟️ **Ingresso por noite (opcional)** — ao iniciar a sessão o KJ escolhe se o Voxly cobra ingresso e o valor (começa em R$ 10,00). Vem desligado: noite grátis ou casa que cobra por conta própria não passa por cobrança nenhuma. Ligado, o cantor vê o **QR Pix e o copia-e-cola da chave do KJ** (Nubank, Ton, qualquer banco — o dinheiro cai direto, sem intermediário e sem taxa) e só pede música depois de liberado; o ingresso vale a noite toda. O banco não avisa o Voxly que o Pix caiu, então a confirmação é do KJ: o cantor aperta **Já paguei** informando o nome da conta que pagou, a Gerência avisa na hora, e o painel **💰 Pix** mostra quem conferir no extrato (✓ Caiu / ✗ Não caiu), quem está na sessão sem ingresso (🎁 liberar grátis) e quem já foi liberado. Em **Cantores Online** cada nome traz a marca 🎟️ pagou, ⏳ conferir Pix ou ✗ sem ingresso. Ao finalizar, o Voxly lista quem pagou e não cantou, para o KJ decidir se devolve. O relatório da noite guarda quantos pagaram e o total. A trava é do banco de dados: o cantor não consegue se marcar como pago nem pedir sem estar liberado. O QR é gerado no computador do KJ, sem serviço de fora. Só vale com internet (no modo rede local não há cobrança).
- 🎤 **Convite de dueto** — o cantor convida outro pelo app. Quem recebe aceita ou recusa; para recusar escolhe **uma de cinco respostas prontas e educadas**, que chegam para quem convidou. Não existe texto livre na recusa.
- 💬 **Conversa de dueto** — depois de aceitar, o app pergunta se a pessoa quer abrir uma conversa com o parceiro para combinar a apresentação. Se não quiser, o convite fica aceito e nada se abre. Cada cantor escolhe no perfil se recebe conversas (vem ligado); com ela desligada, ninguém consegue abrir conversa com ele e as que estavam abertas se encerram. Só os dois leem — nem o KJ. Qualquer um encerra, e a conversa **some junto com a noite**. Só funciona com internet (no modo rede local não aparece).

**Som**
- 🎚️ **Controle de tom (pitch shift)** para quem quer cantar em outro tom.
- 🔊 **Fader de volume** na Gerência, ao lado do tom — o KJ não depende da mesa de som. Fica lembrado entre aberturas.
- 📏 **Volume igual entre as músicas** — cada arquivo é medido uma vez com o ffmpeg (loudness EBU R128) e o Palco ajusta o ganho ao tocar: música alta desce, baixa sobe, nada é regravado. Vale para o acervo que já existe. Liga/desliga em ⚙ Config → Som.
- 🤫 **Sem estalo na troca de música** — o som desce e sobe em rampa de milissegundos a cada troca, pausa e parada.
- 🔈 **Saídas de áudio** — em ⚙ Config → Som o KJ escolhe por onde sai o som da casa (a interface de áudio, por exemplo) e a saída de **monitoria** (o fone dele), cada uma com botão de teste.
- 🎧 **Prévia antes de baixar** — na escolha de versão, 🎧 Ouvir toca a versão do YouTube **só na monitoria**, sem baixar nada. Sem fone escolhido, com o fone desconectado ou com a monitoria no mesmo aparelho da casa, a prévia não toca.
- 🗣️ **Chamada por voz (opcional)** — anuncia o próximo cantor com vozes neurais brasileiras do **Piper**. Não vem instalada: o KJ marca em ⚙ Config e o app baixa e configura.

**Músicas**
- 📂 **Catálogo** — o acervo do host é publicado para o app do cantor buscar; o que não está no acervo é sugerido pelo **iTunes** (com o **Deezer** de reserva), já sem versões ao vivo, remixes e repetidas.
- ⬇️ **Download do YouTube** — o cantor pesquisa só artista e música. O Voxly procura as versões de karaokê, ordena por relevância, canal e data, e **quem escolhe a versão é o KJ** — pelos cards, com duração, visualizações e idade do vídeo. O arquivo é renomeado com os nomes oficiais do iTunes. Padrão 1080p, configurável.
- 🎚️ **Versões no acervo** — a mesma música costuma existir em vários canais. O KJ escolhe qual toca, procura outras no YouTube mesmo já tendo o arquivo, apaga do disco a que não quer, ou aponta um arquivo à mão (📎 Vincular).
- 🔧 **yt-dlp sempre atual** — o Voxly mantém a própria cópia do yt-dlp e a atualiza sozinho, conferindo o SHA-256 publicado. Versão velha era a causa nº 1 de "erro 403" no meio do show.

**Registro**
- 📋 **Histórico do cantor** — no perfil, o cantor vê tudo o que cantou, noite a noite, com a casa e a data. Tocar numa música abre o pedido já preenchido, com a mesma versão e o mesmo tom da última vez.
- 📜 **Diário** — tudo o que acontece numa noite fica num arquivo por dia (`logs/voxly-AAAA-MM-DD.jsonl` na pasta do app, 30 dias guardados): cada mudança na fila e nos cantores dizendo se saiu desta máquina ou veio de fora, cada comando ao Palco, cada ação do KJ, downloads, erros das telas. Em ⚙ Config: ver o diário de hoje (com filtro) ou abrir a pasta.
- 📊 **Relatórios** — cada noite ganha um resumo permanente (participantes, músicas cantadas, quem cantou o quê e quando), guardado antes de a sessão ser apagada. O botão **📊 Relatórios** mostra todas as noites: totais, médias, músicas mais cantadas e quem mais vem, com filtro por casa. A noite em curso aparece "ao vivo".

**Infra**
- 🎛️ **Temas de intervalo** — playlists editáveis por tema (Rock, Pagode, MPB...). Casa de rock? Só toca Rock no intervalo.
- 🔄 **Atualização automática** — novos instaladores são baixados pelo GitHub Releases (Linux e Windows).
- 🔌 **Fallback offline (LAN)** — mesmo sem internet, o karaokê não para (detalhes abaixo).
- 💳 **Licença mensal por casa** — opcional e desligada por padrão. Painel 🔑 Licença com o estado, renovação por **Pix** dentro do app e a explicação de como funciona. Detalhes abaixo.

## 💳 Cobrança (licença mensal por casa)

**Vem desligada.** Enquanto `app/src/chave-licenca.js` estiver com
`chavePublica: ""`, o Voxly é o app de sempre: sem licença, sem trava, sem
painel pedindo dinheiro. Ligar a cobrança é um passo consciente, descrito em
[`servidor-licenca/README.md`](servidor-licenca/README.md).

Quando ligada:

- **Quem paga é a casa**, por mês e por computador. Quem canta continua entrando
  de graça pelo celular.
- **O pagamento é por Pix**, gerado dentro do painel 🔑 Licença. Nenhum dado de
  cartão passa pelo Voxly — quem cobra é o Mercado Pago.
- **O show nunca para.** A licença é consultada só na hora de **abrir uma noite
  nova**. Sessão em andamento não é interrompida por nada relacionado a cobrança.
- **Funciona sem internet.** O bilhete fica guardado no computador com a
  validade assinada dentro dele. Bar sem Wi-Fi abre a noite igual.
- **Tolerância.** Se a licença vencer e o app não conseguir falar com o servidor,
  ainda dá para abrir por mais 7 dias. Travar a noite de quem pagou é pior do
  que deixar passar uma semana.
- **14 dias de teste** na instalação nova, sem cadastro e sem cartão.
- **Atrasar o relógio não estica a licença**: o app guarda a maior data que já
  viu e não anda para trás.

A licença é amarrada ao **código do computador** (16 letras derivadas da placa
de rede, do nome da máquina e do sistema), mostrado no painel. Copiar a pasta do
Voxly para outra máquina gera outro código. Trocou de computador, o código muda
e a licença precisa ser transferida.

Assinatura **Ed25519**: o servidor assina, o app só confere. A chave privada não
existe em lugar nenhum do app nem do repositório — mora no cofre do Cloudflare.

| Onde | O quê |
|---|---|
| `app/src/licenca.js` | a regra: ler o bilhete, conferir prazo, decidir se abre a noite |
| `app/src/instalacao.js` | o código deste computador |
| `app/src/chave-licenca.js` | chave pública e endereço do servidor (vazio = não cobra) |
| `servidor-licenca/` | o servidor (Cloudflare Workers + Mercado Pago) |

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
| **1 · Gerência (KJ)** | Janela principal | Fila, presenças (com quantas músicas cada um cantou), now-playing, QR, regras, downloads, tom e fader de volume, relógio, 📊 relatórios e botão 🎥 **Público** |
| **2 · Palco** | Tela cheia | Vídeo do karaokê, chamada de 30s e anúncio do cantor. É a **única fonte de áudio** |
| **3 · Público** | Outro monitor | Espelha o vídeo do Palco, mais cantor, avatar, próximos da fila e QR grande. Nasce **mudo** |

> As três janelas se organizam sozinhas. Com monitor externo, Palco e Público ocupam a tela inteira; em tela única elas se dividem em faixas para não cobrir a Gerência.

- O host liga/desliga a tela do público pelo botão **🎥 Público**.
- **Horário do show**: no painel *Controle do Palco* o KJ define a hora (`🎬 Horário do Show`) e o **público, o palco e o app dos cantores** exibem a contagem regressiva até o show começar. Na hora, é só dar ▶ Play.

### 🔄 Atualização automática
Os instaladores publicados no **GitHub Releases** são detectados pelo
`electron-updater` e instalados na próxima reinicialização.

O `electron-updater` descobre a versão disponível lendo `latest-linux.yml` /
`latest.yml` no release. Esses arquivos são gerados pelo `electron-builder`, mas
até a v1.1.8 **não eram coletados pelo CI** — sem eles a checagem falhava e o
app nunca sabia que havia versão nova. Corrigido a partir da v1.1.9.

> No **macOS a atualização automática não funciona**: exige app assinado e
> notarizado pela Apple, e o build não é assinado (daí o aviso do Gatekeeper na
> primeira abertura). Por isso o `latest-mac.yml` é deixado fora do release de
> propósito — o CI compila macOS só em arm64, e publicá-lo faria um Mac Intel
> tentar baixar o pacote da arquitetura errada. Em macOS, baixe o `.dmg` à mão.

> No **Linux**, a checagem passa a funcionar nas duas formas de instalação. A
> instalação automática é direta no **AppImage**; com o `.deb` pode ser
> necessário reinstalar o pacote à mão.

**O yt-dlp tem atualização própria.** O YouTube muda com frequência e quebra
versões antigas — o sintoma é 403/404 no meio do show. O yt-dlp da distro
costuma estar meses atrás e `yt-dlp -U` se recusa a atualizar instalação vinda
de gerenciador de pacotes. Por isso o Voxly baixa e mantém a própria cópia (em
`~/.config/Voxly/bin` no Linux), confere o SHA-256 contra o `SHA2-256SUMS` do
release oficial e só então troca. Entre a cópia própria e a do sistema, vale a
mais nova. Estado e botão **Atualizar agora** em ⚙ Config → Motor de download.

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
npm run fumaca       # abre o app de verdade e confere 20 pontos (fora do npm test)
```

**Roteiro de show automatizado** — uma noite de ~30 min de clássicos dos anos 2000 no app de verdade. Ele faz o papel do KJ (Play, arrastar, trocar música, pular) e dos cantores (pedir, confirmar, recusar, chegar atrasado, dueto); você só escolhe as versões do YouTube. A cada 3 s confere as regras da casa (nenhum pedido some, uma música tocando, Gerência e Público na mesma ordem, café com leite só para quem não cantou) e no fim gera um relatório com o diário:

```bash
npx electron . --remote-debugging-port=9222     # num terminal
node test/roteiro-show.mjs <pasta-do-relatorio>  # noutro, sem sessão aberta
```

A suíte cobre sobretudo as falhas que **não** dão erro visível:

| Arquivo | O que trava |
|---|---|
| `saidas.test.js` | a prévia da monitoria nunca sai no som da casa |
| `seguro.test.js` | nome, foto e título vindos de fora não viram código nas telas |
| `diario.test.js` | o diário nunca quebra: linha única, erro legível, 30 dias guardados |
| `historico.test.js`, `guia.test.js` | histórico do cantor por noite; guia do Público só com as regras ligadas |
| `sessao.test.js` (faxina) | sessão com a Gerência aberta não é apagada por outra máquina |
| `casamento.test.js` | título contido em outro não é a mesma música — o que fazia *Miss You Love* virar *I Miss You* no palco |
| `versoes.test.js`, `yt-busca.test.js` | ranqueamento e versões locais |
| `fila.test.js` | o que o Play faz em cada estado da fila |
| `sessao.test.js` | prazo da sessão e a tolerância de 5 min |
| `ligacao.test.js` | `onclick` apontando para função inexistente e erro de sintaxe no `<script>` |
| `preload-api.test.js` | chamada a `electronAPI` que o preload não expõe (falha em silêncio) |
| `carga.test.js` | uso antes da declaração no código que roda ao carregar a tela |
| `carga-execucao.test.js` | roda a carga de cada tela num `vm` — pega o que a análise do `carga.test.js` deixa passar |
| `copias.test.js` | as regras compartilhadas com o web app não divergiram da cópia |
| `ordem.test.js`, `prioridade.test.js` | ordem de chegada, arrastar do KJ e o café com leite intercalado |
| `trava.test.js` | clique repetido não põe a música duas vezes |
| `loudness.test.js`, `volume.test.js` | medida de volume do ffmpeg, ganho de normalização e curva do fader |
| `relatorio.test.js`, `relatorio-consolidado.test.js` | resumo de cada noite e a soma entre noites |
| `ytdlp.test.js`, `yt-falha.test.js` | atualização do yt-dlp (com SHA-256) e o motivo real de cada falha de download |

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
- **yt-dlp** (cópia própria, atualizada sozinha) e **ffmpeg** — downloads e medida de volume
- **Web Audio** — tom (rubberband), normalização, compressor, rampa e fader
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
  src/ytdlp.js             # cópia própria do yt-dlp: versão, URL, SHA-256
  src/identificacao.js     # nome oficial do arquivo baixado (iTunes)
  src/casamento.js         # qual arquivo do acervo atende o pedido
  src/versoes.js           # versões da mesma música já baixadas
  src/fila.js              # o que o botão Play faz em cada estado da fila
  src/loudness.js          # medida de volume (ffmpeg ebur128) e ganho de normalização
  src/volume.js            # curva do fader do KJ
  src/relatorio.js         # resumo de cada noite e soma entre noites
  src/saidas.js            # saídas de áudio e a regra que impede a prévia de vazar na casa
  src/diario.js            # formato do diário (logs/voxly-AAAA-MM-DD.jsonl)
  src/guia.js              # cartões do guia do Público, conforme as regras do KJ
  src/seguro.js            # escape de HTML e validação de endereço de imagem (copiado para web/public)
  src/pix.js               # Pix copia-e-cola (BR Code) da chave do KJ, com CRC do Banco Central
  src/licenca.js           # regra da licença: prazo, tolerância, relógio, trava da sessão nova
  src/instalacao.js        # código que identifica este computador
  src/chave-licenca.js     # chave pública e servidor da cobrança (vazio = não cobra)
  test/cdp.mjs             # acesso às janelas do app aberto, pelo DevTools
  test/roteiro-show.mjs    # roteiro de show automatizado
  src/ordem.js             # ┐ regras que valem nos DOIS lados (Gerência e app
  src/prioridade.js        # │ do cantor). O web app recebe cópias em
  src/sessao-regras.js     # │ web/public: `npm run sincronizar-regras`, e o
  src/historico.js         # │ (histórico do cantor)
  src/trava.js             # │ copias.test.js falha se divergirem
  src/texto.js             # │
  src/sugestoes.js         # │
  src/chat.js              # │ (convite de dueto: respostas prontas e conversa)
  src/entrada.js           # ┘ (ingresso da noite: quem está liberado, quem conferir)
  test/                    # testes automatizados (node --test)
web/                       # web dos cantores (Firebase Hosting)
  public/                  # index, profile, signup + offline-client.js + cópias das regras
  firestore.rules          # regras de segurança (inclui relatorios/{sessaoId})
servidor-licenca/          # servidor de licença (Cloudflare Workers + Mercado Pago, Pix)
  src/index.js             # cria o Pix, confirma o pagamento, assina o bilhete
  gerar-chaves.mjs         # cria o par Ed25519 (a privada nunca entra no repositório)
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