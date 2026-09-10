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
curl -L -o Voxly.dmg https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.dmg

# Mount and copy to /Applications
hdiutil attach Voxly.dmg
cp -R "/Volumes/Voxly/Voxly.app" /Applications/
hdiutil detach /Volumes/Voxly

# Open (first time, right-click → Open, since it's not notarized yet)
open /Applications/Voxly.app
```

> ⚠️ macOS may show "unidentified developer" because of **Gatekeeper** (the app is not yet signed/notarized by Apple). To open: **right-click the app → Open → Open**.

---

## ✨ Features

- 🎵 **Live sessions** — the host starts a session and generates a code + QR Code.
- 🖥️ **3 screens** — one for the **host (KJ)**, one for the **stage** (plays the karaoke video fullscreen) and an optional **audience** screen (singer + song + QR, no video).
- ⏱️ **Show start time** — the KJ sets when the show begins; the audience screen and the singers' app show a live **countdown**.
- 🎛️ **Interval themes** — editable, theme-based playlists (Rock, Pagode, MPB...). Rock venue? Only rock plays between songs.
- 📱 **Join from a phone** — scan the QR and join the session instantly.
- 🎤 **Real-time song queue** — singers request songs, the host controls the queue (mark as sung, skip, remove).
- 🎚️ **Pitch shifting** — singers can change the song key to match their voice.
- 🧑🤝🧑 **Online presence** — the host sees who is currently connected.
- 📂 **Song catalog** — search with Firestore cache and iTunes artwork.
- 🔄 **Auto-update** — new installers are downloaded from GitHub Releases.
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
> The macOS **.dmg/.zip** installer is produced by the `build-electron-mac` CI job (macOS runner). The Linux **.deb** is produced by `make build-linux`. The app icon is generated from `app/src/assets/icons/icon.png` (1024×1024) for all platforms, with a multi-size `icon.ico` on Windows.

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
# Navigate to the directory where the installers were generated
cd dist

# Make executable
VER=$(curl -s https://api.github.com/repos/disouz4-dev/voxly/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 | tr -d v)
[ -n "$VER" ] || { echo "Could not resolve the latest version"; exit 1; }
wget -O Voxly-${VER}.AppImage https://github.com/disouz4-dev/voxly/releases/download/v$VER/Voxly-${VER}.AppImage
chmod +x Voxly-${VER}.AppImage

# Run
./Voxly-${VER}.AppImage

# Optional: integrate with the system (creates application menu shortcut)
./Voxly-${VER}.AppImage --appimage-install
```

> 💡 **Tip**: AppImages are portable - just download, make executable, and run. No installation or root privileges required.

### The 3 screens

| Screen | Window | Shows |
|---|---|---|
| **1 · Host (KJ)** | Console | Queue, attendance, now-playing, QR, rules and the 🎥 **Audience** toggle |
| **2 · Stage** | Fullscreen | The karaoke video + intro/preview |
| **3 · Audience** | Another monitor | Singer, song, key and access QR — **no video** |

- The host turns the audience screen on/off with the **🎥 Público** button.
- **Show start time**: in the *Controle do Palco* panel the KJ sets the time (`🎬 Horário do Show`) and the **audience, stage and singers' app** show a live countdown until the show starts. At the right time, just hit ▶ Play.

### 🔄 Auto-update
Installers published as *draft releases* on **GitHub Releases** are detected by `electron-updater` and installed on the next restart (macOS requires Apple signing/notarization).

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
```

### Docker
```bash
docker compose up -d        # start services
docker compose down         # stop services
make docker-build           # build the image
```

## 📦 Deploy

- **Firebase Hosting** (singer web app): `make deploy` or the CI pipeline (staging/production).
- **Docker image** for the host: published to the GitHub Container Registry via CI.
- **Windows installer (Electron)**: produced by the `build-electron` pipeline.

## 🧰 Tech stack

- **Electron 30** — cross-platform desktop app (Windows, macOS, Linux)
- **Firebase / Firestore** — authentication, sessions, real-time queue
- **Firebase Hosting** — public web app for singers
- **Node.js** — LAN server, IPC, and tests
- **qrcode, electron-store, soundtouchjs / rubberband-web**

## 📁 Project layout

```
app/                     # Electron app (host + player + LAN server)
  src/main.js            # main process (boots the LAN server)
  src/local-server.js    # LAN server: static + REST + SSE
  src/screens/           # screens (host, player, profile)
  test/                  # automated tests
web/                     # singer web app (Firebase Hosting)
  public/                # index, profile, signup + offline-client.js
  firestore.rules        # Firestore security rules
Dockerfile / docker-compose.yml
.github/workflows/ci-cd.yml   # CI/CD pipeline
scripts/                 # deploy and health-check
```

## 🤝 Contributing

Feel free to open issues and pull requests. Please keep the offline mode working when you change the data flow.

## 📄 License

Distributed under the **MIT** license.