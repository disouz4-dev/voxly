# Funcionalidades a Implementar

## Curto Prazo (Sprint Atual)
- **Janela do Player com controles padrão**
  - Garantir que a janela do player abra com barra de título do sistema, permitindo minimizar, maximizar e fechar.
- **QR Code condicional**
  - Ocultar o QR Code quando não houver sessão ativa (já implementado, apenas validar visualmente).
- **Validação de entrada de código**
  - Melhorar a UI de `sessionCodeInput` para que, ao inserir um código inválido, mostre mensagem de erro amigável.
- **Persistir estado da sessão**
  - Salvar o último código de sessão em `localStorage` para recuperação automática caso o host seja recarregado.

## Médio Prazo (2‑3 Sprints)
- **Tela de Login integrada ao Player**
  - Exibir formulário de login (Firebase) diretamente na tela do player antes de permitir a entrada na sessão.
- **Gerenciamento de múltiplas sessões**
  - Permitir que o host crie e alterne entre várias sessões simultaneamente, com UI para seleção.
- **Histórico de músicas cantadas**
  - Exibir um painel no player com as últimas músicas cantadas (dados do Firestore).
- **Notificações em tempo real**
  - Enviar notificações de novas entradas na fila para todos os cantores online (via listeners do Firestore).

## Longo Prazo (Roadmap)
- **Modo Festival**
  - Suporte a múltiplos palcos simultâneos, cada um com sua própria fila e QR Code.
- **Integração com plataformas de streaming**
  - Enviar a música selecionada para YouTube/Spotify para transmissão ao vivo.
- **Customização de temas**
  - Permitir que o usuário escolha entre temas claros/escuros e personalize cores.
- **Suporte a idiomas**
  - Internacionalizar a interface (PT‑BR, EN, ES) usando arquivos de tradução.

---

> **Nota:** Todas as funcionalidades devem seguir o padrão de UI atual (botões, estilos e componentes) e usar o canal IPC genérico `electronAPI.invoke` para comunicação entre host e player.
