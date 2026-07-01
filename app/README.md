# Voxly Karaoke 🎤

## Visão geral 🚀
Voxly Karaoke é uma aplicação **colaborativa de karaokê** feita com **Electron**, **Firebase** e **Firestore**. Ela permite que cantores:

- 🎵 Iniciem uma sessão de karaokê, gerando um código de sessão exibido no host.
- 📱 Escaneiem um QR Code (contendo apenas o código da sessão) na tela do player para entrar na sessão ativa.
- 🎤 Solicitem músicas e visualizem a fila de apresentações.
- ✅ Marquem músicas cantadas, pulem ou removam músicas da fila.
- 👥 Vejam quem está online – a lista de cantores conectados aparece no host logo após a sessão ser iniciada.

## Funcionalidades atuais ✅

### Host 🖥️
- Botão **Iniciar Sessão** que cria uma nova sessão e exibe o código.
- Exibição da **lista de cantores online** (`#onlineSingers`).
- Botão **Abrir Player** para (re)abrir a janela do player.

### Player 📱
- Exibe um **QR Code** contendo apenas o código da sessão; o QR só aparece quando a sessão está ativa.
- Campo oculto `sessionCodeInput` usado internamente para inserir o código ao entrar.
- Botões para **pedir música**, **marcar cantada**, **pular** e **gerenciar a fila**.
- Controle de áudio via IPC (`playSong`, `playerCommand`).

### Comunicação IPC 🔄
- Canais: `start-session`, `join-session`, `list-participants`, `get-current-session` e um **invoke genérico** para outros canais.

### Deploy 📦
- A aplicação pode ser iniciada com `npm start` (processo em segundo plano).

## Como executar ▶️
```bash
# Instalar dependências
npm install
# Iniciar a aplicação
npm start
```
A aplicação abre duas janelas (Host e Player). Use o botão **Abrir Player** no host caso a janela do player seja fechada.

---

## Tecnologias utilizadas 🛠️
- **Electron 30** – frontend desktop
- **Firebase / Firestore** – autenticação e armazenamento de sessões
- **API QR Server** – geração simples de QR Code
- **HTML / CSS / JavaScript** – interface
- **Node.js** – backend e IPC

---

## Licença 📄
Este projeto está licenciado sob a licença **MIT**.
