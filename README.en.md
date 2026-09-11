# Voxly Karaoke 🎤

A **collaborative karaoke** app for parties and events: the **host** (computer) controls the session and the song queue, while **singers** join from their phones — scanning a **QR Code** and requesting songs in real time.

Built with **Electron**, **Firebase / Firestore**, and **Node.js**.

> Versão em português: [README.md](README.md)

---

## 📥 Quick Install

Latest versions are always at: **[github.com/disouz4-dev/voxly/releases/latest](https://github.com/disouz4-dev/voxly/releases/latest)**

### 🐧 Linux

**Option A — .deb (Ubuntu/Debian, recommended):**
```bash
sudo apt-get remove -y voxly 2>/dev/null || true

VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Could not resolve the latest version"; exit 1; }
wget -O voxly_${VER}_amd64.deb https://github.com/disouz4-dev/voxly/releases/download/v$VER/voxly_${VER}_amd64.deb
sudo dpkg -i voxly_${VER}_amd64.deb
sudo apt-get install -f -y
sudo apt-get install -y yt-dlp ffmpeg

dpkg -s voxly | grep ^Version
```

**Option B — AppImage (portable):**
```bash
sudo apt-get install -y yt-dlp ffmpeg

VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Could not resolve the latest version"; exit 1; }
wget -O Voxly-${VER}.AppImage https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.AppImage
chmod +x Voxly-${VER}.AppImage
./Voxly-${VER}.AppImage
```

### 🍎 macOS
```bash
# Download the .dmg 
# Resolves the latest version automatically
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Could not resolve the latest version"; exit 1; }
# Releases ship two .dmg files: Voxly-<version>.dmg for Intel Macs (x64) and
# Voxly-<version>-arm64.dmg for Apple Silicon. Installing the wrong one gives
# you an app that will not launch.
case "$(uname -m)" in
  arm64) ARCH="-arm64" ;;
  *)     ARCH=""       ;;
esac
curl -fL -o Voxly.dmg "https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}${ARCH}.dmg"

# Mount at a fixed point and copy to /Applications. The .dmg volume carries
# the version in its name ("Voxly 1.1.25"), so /Volumes/Voxly does not exist.
hdiutil attach Voxly.dmg -mountpoint /Volumes/VoxlyInstall
cp -R /Volumes/VoxlyInstall/Voxly.app /Applications/
hdiutil detach /Volumes/VoxlyInstall

# The app is not signed by Apple yet: without this macOS says it "cannot
# verify" Voxly and refuses to open it.
xattr -dr com.apple.quarantine /Applications/Voxly.app

# ffmpeg merges video and audio of downloads and measures song loudness
brew install ffmpeg

open /Applications/Voxly.app
```

> ⚠️ **Gatekeeper**: the app is not signed/notarized by Apple. On recent macOS versions "right-click → Open" is not enough — use the `xattr` line above (or System Settings → Privacy & Security → **Open Anyway**).

---

## ✨ Features

**Session and screens**
- 🎵 **Live sessions** — the host starts a session and generates a code + QR Code. The badge at the top shows the venue and time; clicking it lets the KJ **edit name, date and time without dropping** the session. **💥 Derrubar sessão** wipes any open session, including ones stuck on another machine.
- 🖥️ **3 screens** — **Host** (KJ), **Stage** (karaoke video fullscreen) and an optional **Audience** screen that mirrors the Stage video alongside the singer, their avatar, who is up next and a large QR. The **next-singer call-up** shows on both Stage and Audience.
- ⏱️ **Show start time** — the KJ sets when the show begins; the audience screen and the singers' app show a live **countdown**. With no song playing, the audience screen cycles through an **animated how-to-join guide**.
- 🕐 **KJ clock** — the time, in the top bar.
- ⏳ **Session deadline** — the session ends when the KJ said it would, plus 5 minutes of slack. After that singers can no longer queue songs; the KJ keeps playing what is already in the queue.
- 🔒 **One session at a time** — opening a new one purges the previous ones and disconnects their singers. A session whose Host screen is open is never deleted by the automatic cleanup, not even from another machine: songs only leave the queue when the KJ ends, drops or replaces the session.

**Queue**
- 🎤 **Real-time queue** — singers request from their phones, the host controls it (play, skip, swap someone's song, remove, add a singer and song by hand). A request never lands twice, even on repeated taps.
- ↕️ **First come, first served** — whoever asked first sings first. The KJ drags to reorder and the app plays **exactly the order on screen**.
- ☕ **"Café com leite"** — when the wait goes past the limit the KJ sets (40 min by default), people who have not sung yet tonight are **interleaved** with the main queue: one from the queue, one newcomer, another from the queue… The main queue never stops moving. Can be turned off in the rules.
- 🧑‍🤝‍🧑 **Online presence** — the host sees who is connected and **how many songs each person has sung** tonight.

**Sound**
- 🎚️ **Pitch shifting** — singers can change the song key to match their voice.
- 🔊 **Volume fader** in the Host screen, next to the key control — the KJ does not depend on the sound desk. Remembered across launches.
- 📏 **Even loudness across songs** — each file is measured once with ffmpeg (EBU R128 loudness) and the Stage applies the gain at playback: loud songs go down, quiet ones go up, nothing is re-encoded. Covers the existing library too. Toggle in ⚙ Config → Som.
- 🤫 **No pop between songs** — the sound ramps down and up over a few milliseconds on every change, pause and stop.
- 🔈 **Audio outputs** — in ⚙ Config → Som the KJ picks where the house sound goes (an audio interface, say) and a **monitor** output (their headphones), each with a test button.
- 🎧 **Preview before downloading** — in the version picker, 🎧 Ouvir plays the YouTube version **on the monitor output only**, without downloading. With no headphones chosen, headphones disconnected, or the monitor on the same device as the house, the preview refuses to play.
- 🗣️ **Optional voice call-ups** — announces the next singer with Brazilian neural voices from **Piper**, installed on demand from Settings.

**Songs**
- 📂 **Catalog** — the host's library is published for the singers' app to search; songs not in the library are suggested by **iTunes** (with **Deezer** as a fallback), without live versions, remixes and duplicates.
- ⬇️ **YouTube downloads** — singers search by artist and title only. Voxly finds karaoke versions, ranks them by relevance, channel and upload date, and **the KJ picks the version** from cards showing duration, views and age. The file is renamed with the official iTunes names. 1080p by default.
- 🎚️ **Library versions** — the same song often exists on several channels. The KJ chooses which one plays, looks for others on YouTube, deletes unwanted files, or links a file by hand (📎 Vincular).
- 🔧 **Always-current yt-dlp** — Voxly keeps its own copy of yt-dlp and updates it by itself, checking the published SHA-256. An old yt-dlp was the #1 cause of "403 error" mid-show.

**Records**
- 📋 **Singer history** — in their profile, singers see everything they sang, night by night, with venue and date. Tapping a song opens a pre-filled request with the same version and key as last time.
- 📜 **Diary** — everything that happens in a night goes to one file per day (`logs/voxly-YYYY-MM-DD.jsonl` in the app folder, kept for 30 days): every queue and singer change saying whether it came from this machine or from outside, every Stage command, every KJ action, downloads, screen errors. In ⚙ Config: view today's diary (with a filter) or open the folder.
- 📊 **Reports** — every night gets a permanent summary (participants, songs sung, who sang what and when), saved before the session is deleted. The **📊 Relatórios** button shows every night: totals, averages, most-sung songs and regulars, with a per-venue filter. Tonight shows up as "ao vivo" (live).

**Infra**
- 🎛️ **Interval themes** — editable, theme-based playlists (Rock, Pagode, MPB...). Rock venue? Only rock plays between songs.
- 🔄 **Auto-update** — new installers are downloaded from GitHub Releases (Linux and Windows).
- 🔌 **Offline fallback (LAN)** — even without internet the karaoke keeps going (details below).

## 🏗️ Architecture

```
┌──────────────────────── Fullscreen ─────────────────────────┐
│  Electron (Host) — session, queue, player                   │
│      │                                                      │
│      │ QR: http://<IP>:8030/profile.html                    │
│      ▼                                                      │
│  LAN Server (port 8030) ── serves the singer web app       │
│      │  + REST API  /api/store                              │
│      │  + Events    /api/eventos (SSE)                      │
│      │  + Disk persistence (voxly-offline.json)             │
│      ▼                                                      │
│  Singers (browser/phone on the event's Wi-Fi)               │
└─────────────────────────────────────────────────────────────┘

        Internet (when available)
   ───────────────┬───────────────
                  ▼
        Firebase Auth + Firestore (web hosting)
```

### 🌐 Online vs Offline

- **Online**: the app uses **Firebase Auth + Firestore** as usual, and singers access the app through Firebase Hosting (public URL).
- **Offline (internet outage)**: the **host** spins up a local server on port `8030` and the **QR Code now points to the LAN** (`http://IP:8030/profile.html`). A shim (`web/public/offline-client.js`) emulates the Firestore API on top of the local server, with real-time events (SSE). The host mirrors session/queue/attendance to the local server, keeping singers and host in sync **with no cloud dependency**.

> ⚠️ **Offline-mode limitations:** Google login is unavailable (singers join with a local identity), and offline data is **not** automatically synced back to Firestore once the internet comes back.

## 🚀 Getting started

### Desktop app (host/player)
```bash
cd app
npm install
npm start            # launches Electron (host + player)
npm run dev          # development mode
```
### Platform builds

```bash
cd app
npm run build:mac     # macOS  (DMG + ZIP)   — requires macOS
npm run build:win     # Windows (NSIS + portable)
npm run build:linux   # Linux  (AppImage + .deb)
```
> ⚠️ **The `.deb` cannot be built on macOS.** `fpm` falls back to the system
> `ar` and writes a ~96-byte package with exit code 0 and no warning — the file
> looks ready and is empty. Build it on Linux, or let the `build-electron-linux`
> CI job do it. The AppImage does build correctly on macOS.
>
> CI builds macOS for **arm64** only; the Intel (x64) `.dmg` has to be built
> locally with `npx electron-builder --mac --x64` and attached to the release.
>
> The app icon is generated from `app/src/assets/icons/icon.png` (1024×1024) for
> all platforms, with a multi-size `icon.ico` on Windows.

### 🐧 Installation (Linux)

After building or downloading the Linux installers (via [GitHub Releases](https://github.com/disouz4-dev/voxly/releases)):

#### **Debian Package (.deb)**
```bash
# Make sure you're in the directory containing the .deb file
# (if you downloaded from Releases, this is where you saved the file;
#  if you built locally, this is the 'dist/' directory)
# NEVER use "voxly_*.deb": the glob matches any .deb left in the folder,
# including old downloads, so you silently reinstall an old version.
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Could not resolve the latest version"; exit 1; }
wget -O voxly_${VER}_amd64.deb https://github.com/disouz4-dev/voxly/releases/download/v$VER/voxly_${VER}_amd64.deb
sudo dpkg -i voxly_${VER}_amd64.deb
sudo apt-get install -f  # fix dependencies, if needed

# Confirm the installed version
dpkg -s voxly | grep ^Version
```

To **uninstall** Voxly (separate block — never run it together with the install):

```bash
sudo apt-get remove voxly
```

#### **AppImage**
```bash
# Download the latest version (a Voxly-*.AppImage glob would pick up old
# downloads still in the folder)
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Could not resolve the latest version"; exit 1; }
wget -O Voxly-${VER}.AppImage https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.AppImage

# Make executable and run
chmod +x Voxly-${VER}.AppImage
./Voxly-${VER}.AppImage

# Optional: integrate with the system (creates application menu shortcut)
./Voxly-${VER}.AppImage --appimage-install
```

> 💡 **Tip**: AppImages are portable - just download, make executable, and run. No installation or root privileges required.

### The 3 screens

| Screen | Window | Shows |
|---|---|---|
| **1 · Host (KJ)** | Main window | Queue, attendance (with songs sung per person), now-playing, QR, rules, downloads, key and volume fader, clock, 📊 reports and the 🎥 **Audience** toggle |
| **2 · Stage** | Fullscreen | The karaoke video, the 30 s call-up and the singer intro. It is the **only audio source** |
| **3 · Audience** | Another monitor | Mirrors the Stage video, plus singer, avatar, who is up next and a large QR. Starts **muted** |

- The host turns the audience screen on/off with the **🎥 Público** button.
- **Show start time**: in the *Controle do Palco* panel the KJ sets the time (`🎬 Horário do Show`) and the **audience, stage and singers' app** show a live countdown until the show starts. At the right time, just hit ▶ Play.

### 🔄 Auto-update
Installers published on **GitHub Releases** are detected by `electron-updater`
and installed on the next restart. It reads `latest-linux.yml` / `latest.yml`
from the release, which CI uploads since v1.1.9.

> **macOS auto-update does not work**: it requires an app signed and notarized
> by Apple. `latest-mac.yml` is left out of the release on purpose — download
> the `.dmg` by hand.

**yt-dlp has its own updater.** YouTube changes often and breaks old versions —
the symptom is 403/404 mid-show. Distro packages lag months behind and
`yt-dlp -U` refuses to update package-manager installs. So Voxly downloads and
keeps its own copy (in `~/.config/Voxly/bin` on Linux), checks its SHA-256
against the official release's `SHA2-256SUMS`, and only then swaps it in.
Between its own copy and the system one, the newer wins. Status and an
**Atualizar agora** button live in ⚙ Config → Motor de download.

### 🎛️ Interval themes
In the host's **🎛 Temas** button you create themes (e.g. *Rock*) with your own **editable playlist**, built from the local catalog. The active theme defines what plays between songs; without one, the default animated tracks play.

### Singer web app (local)
```bash
# option 1: served automatically by the app over the LAN (port 8030)
# option 2: serve it manually
cd web
npx serve public -l 3000
```

### Tests & lint
```bash
cd app
npm test             # node --test test/*.test.js
npm run lint         # syntax validation of the main processes
npm run fumaca       # boots the real app and checks 20 points (outside npm test)
```

**Automated show script** — a ~30 min night of 2000s classics on the real app. It plays the KJ (Play, drag, swap, skip) and the singers (request, confirm, decline, arrive late, duet); you only pick the YouTube versions. Every 3 s it checks the house rules and ends with a report built from the diary:

```bash
npx electron . --remote-debugging-port=9222     # one terminal
node test/roteiro-show.mjs <report-folder>       # another, with no session open
```

The suite mostly guards failures that give **no** visible error: songs matched
to the wrong file, a queue that ignores the KJ's order, a variable used before
its declaration killing a whole screen at load (`carga.test.js` reads the code,
`carga-execucao.test.js` actually runs each screen's load in a `vm`), and the
rules shared with the web app drifting from their copies (`copias.test.js`).

### Docker
```bash
docker compose up -d        # start services
docker compose down         # stop services
make docker-build           # build the image
```

## 📦 Deploy

- **Firebase Hosting** (singer web app): `make deploy` or the CI pipeline (staging/production).
- **Docker image** for the host: published to the GitHub Container Registry via CI.
- **Installers**: `build-electron-win` (NSIS + portable), `build-electron-linux` (AppImage + .deb) and `build-electron-mac` (DMG + ZIP, **arm64**). The `release` job publishes to GitHub Releases when a `v*` tag is pushed.

## 🧰 Tech stack

- **Electron 30** — cross-platform desktop app (Windows, macOS, Linux)
- **Firebase / Firestore** — authentication, sessions, real-time queue
- **Firebase Hosting** — public web app for singers
- **Node.js** — LAN server, IPC, and tests
- **yt-dlp** (own copy, self-updating) and **ffmpeg** — downloads and loudness measurement
- **Web Audio** — pitch (rubberband), normalization, compressor, ramp and fader
- **qrcode, electron-store, soundtouchjs / rubberband-web**

## 📁 Project layout

```
app/                       # Electron app (Host + Stage + Audience + LAN server)
  src/main.js              # main process: windows, IPC, yt-dlp, Piper, loudness
  src/preload.js           # the only bridge between screens and the main process
  src/local-server.js      # LAN server: static + REST + SSE
  src/screens/host.html    # Host (KJ)
  src/screens/player.html  # Stage and Audience — same page, "?tela=publico" tells them apart
  src/yt-busca.js          # karaoke version search and ranking
  src/ytdlp.js             # own yt-dlp copy: version, URL, SHA-256
  src/identificacao.js     # official name of a downloaded file (iTunes)
  src/loudness.js          # loudness measurement (ffmpeg ebur128) and gain
  src/relatorio.js         # per-night summary and totals across nights
  src/saidas.js            # audio outputs and the rule that keeps the preview off the house sound
  src/ordem.js, prioridade.js, sessao-regras.js, trava.js, texto.js, sugestoes.js, historico.js
                           # rules shared with the singers' app; copied to
                           # web/public by `npm run sincronizar-regras`,
                           # copias.test.js fails if they drift
  test/                    # automated tests (node --test)
web/                       # singer web app (Firebase Hosting)
  public/                  # index, profile, signup + offline-client.js + rule copies
  firestore.rules          # Firestore security rules (includes relatorios/{sessaoId})
Dockerfile / docker-compose.yml
.github/workflows/ci-cd.yml   # CI/CD pipeline
scripts/                 # deploy and health-check
```

> `player.html` serves **both** video screens. When debugging, filter by the
> query string: without it you are on the Stage, with `?tela=publico` on the
> Audience.

## 🤝 Contributing

Feel free to open issues and pull requests. Please keep the offline mode working when you change the data flow.

## 📄 License

Distributed under the **MIT** license.