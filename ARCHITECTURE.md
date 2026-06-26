# Arquitetura do Projeto Voxly Karaoke

## Visão Geral
Voxly Karaoke é uma aplicação desktop baseada em **Electron** que permite sessões colaborativas de karaokê usando **Firebase/Firestore** para persistência e **QR Code** para ingresso de cantores.

## Estrutura de Diretórios
```
Voxly/
├─ src/                         # Código‑fonte da aplicação
│   ├─ main.js                  # Processo principal (Electron) – cria janelas, registra IPCs
│   ├─ preload.js               # Bridge segura – expõe `window.electronAPI`
│   ├─ screens/                 # HTML das telas
│   │   ├─ host.html            # Tela do Host (inicia sessão, lista cantores, abre Player)
│   │   ├─ player.html          # Tela do Player (QR Code, fila, controles)
│   │   └─ ...                  # Outras telas (login, configur.)
│   └─ assets/                  # Imagens, ícones, avatars
├─ package.json                 # Dependências, scripts (`npm start`, `npm run build`)
├─ firebase.json                # Configuração do Firebase (auth, rules)
├─ README.md                    # Descrição geral (PT‑BR) – já incluído no diretório raiz do projeto
├─ FEATURES.md                  # Lista de funcionalidades a implementar
├─ ARCHITECTURE.md              # Este documento – detecção de estrutura para IAs
└─ ...                         # Outros arquivos de configuração (webpack, .gitignore, etc.)
```

## Principais Componentes
### 1. `main.js`
- **Criação das janelas**:
  - **HostWindow** – barra de título padrão (controles do SO habilitados).
  - **PlayerWindow** – pode ser reaberta via IPC `open-player`.
- **Canais IPC registrados** (expostos via `preload.js`):
  - `start-session` – cria documento `sessoes/{id}` no Firestore e gera código.
  - `join-session` – associa usuário ao ID da sessão.
  - `list-participants` – devolve lista de cantores online.
  - `get-current-session` – retorna `{id, code}` da sessão ativa.
  - `open-player` – (re)abre a janela do player.
  - `invoke` – canal genérico para chamadas dinâmicas.

### 2. `preload.js`
```js
contextBridge.exposeInMainWorld('electronAPI', {
  // Métodos de IPC exportados
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // Listeners de eventos (ex.: music‑folder‑changed)
});
```
Permite que o código do renderer (**host.html**, **player.html**) chame `window.electronAPI.invoke('nome-canal', args…)`.

### 3. `host.html`
- **Botões**
  - **Iniciar Sessão** → `invoke('start-session')` → exibe código.
  - **Abrir Player** → `invoke('open-player')` para reabrir a janela caso fechada.
- **Lista de cantores** (`#onlineSingers`) preenchida por `renderOnlineSingers()` que chama `invoke('list-participants')` a cada 10 s.
- **Código da sessão** exibido em `#sessionCodeDisplay`.

### 4. `player.html`
- **QR Code** (`#qrImg`)
  - Função `updateQRCode()` verifica a sessão via `invoke('get-current-session')`.
  - Se `session?.code` existir, gera QR apenas com o código (`https://api.qrserver.com/v1/create-qr-code?...`). Caso contrário, esconde a imagem (`display:none`).
- **Campo oculto** `sessionCodeInput` usado para enviar código ao chamar `invoke('join-session')`.
- **Controles de fila** (pedir música, marcar cantada, pular, remover) usando IPCs correspondentes.
- **Barra de título do sistema** habilitada (janela padrão do Electron) – permite minimizar, maximizar e fechar.

## Fluxo de Dados
1. **Host** cria sessão → Firestore gravado → código retornado ao host.
2. **Host** exibe código e lista de cantores.
3. **Cantor** escaneia QR no **Player** → `updateQRCode()` detecta sessão ativa → campo de código preenchido → `join-session` registra o cantor.
4. **Player** permite que o cantor solicite músicas; as solicitações são gravadas em `sessoes/{sessionId}/fila`.
5. **Host** (ou qualquer cliente) consome a fila usando listeners de Firestore para atualizar UI em tempo real.

## Persistência (Firestore)
- **Coleções principais**:
  - `sessoes/{sessionId}` – metadados da sessão (código, regras, status).
  - `sessoes/{sessionId}/fila` – músicas na fila (status: aguardando, tocando, cantada, pulada).
  - `participantes/{sessionId}` – documentos de cantores conectados (uid, displayName, avatar, timestamp).
  - `historico/{uid}/apresentacoes` – histórico de músicas cantadas por cada usuário.

## Pontos de Extensão
- **Novos canais IPC** podem ser adicionados ao `main.js` e expostos via `preload.js`.
- **Persistência de código** no host via `localStorage` para recarregamento automático.
- **Login integrado** na tela do player (Firebase Auth UI).
- **Múltiplas sessões simultâneas** com UI de seleção no host.
- **Notificações** via Electron `Notification` ou listeners Firestore.

---

> Este documento está salvo como **`ARCHITECTURE.md`** no diretório raiz do projeto (`/home/lab2/Documentos/Voxly/app`). Ele fornece a visão completa necessária para que outras IAs compreendam a arquitetura, fluxo de dados e pontos de integração da aplicação.
