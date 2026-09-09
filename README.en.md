# Voxly Karaoke 🎤

A **collaborative karaoke** app for parties and events: the **host** (computer) controls the session and the song queue, while **singers** join from their phones — scanning a **QR Code** and requesting songs in real time.

Built with **Electron**, **Firebase / Firestore**, and **Node.js**.

> Versão em português: [README.md](README.md)

---

## ✨ Features

- 🎵 **Live sessions** — the host starts a session and generates a code + QR Code.
- 📱 **Join from a phone** — scan the QR and join the session instantly.
- 🎤 **Real-time song queue** — singers request songs, the host controls the queue (mark as sung, skip, remove).
- 🎚️ **Pitch shifting** — singers can change the song key to match their voice.
- 🧑🤝🧑 **Online presence** — the host sees who is currently connected.
- 📂 **Song catalog** — search with Firestore cache and iTunes artwork.
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
npm run build:linux   # Linux  (AppImage)
```
> The macOS **.dmg/.zip** installer is produced by the `build-electron-mac` CI job (macOS runner). The app icon is generated from `app/src/assets/icons/icon.png` (1024×1024) for all platforms.

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