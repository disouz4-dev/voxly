#!/bin/bash
# ============================================================
# Voxly - Script de Deploy
# Uso: ./scripts/deploy.sh [staging|production]
# ============================================================

set -e

ENVIRONMENT="${1:-production}"
FIREBASE_PROJECT="voxly-karaoke"

echo "============================================"
echo "  Voxly - Deploy para $ENVIRONMENT"
echo "============================================"

# Verificar se Firebase CLI esta instalado
if ! command -v firebase &> /dev/null; then
    echo "[ERRO] Firebase CLI nao encontrado. Instale com: npm install -g firebase-tools"
    exit 1
fi

# Verificar se esta autenticado
if ! firebase login:list &> /dev/null; then
    echo "[INFO] Fazendo login no Firebase..."
    firebase login
fi

# Verificar se ha alteracoes nao commitadas
if [ -n "$(git status --porcelain)" ]; then
    echo "[AVISO] Ha alteracoes nao commitadas!"
    read -p "Deseja continuar mesmo assim? (s/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 1
    fi
fi

# Build
echo "[1/3] Construindo app..."
cd app && npm install && npm run build:win && cd ..

# Deploy web
echo "[2/3] Deploy web para Firebase..."
cd web && firebase deploy --only hosting -P $FIREBASE_PROJECT && cd ..

# Deploy Firestore rules
echo "[3/3] Deploy regras Firestore..."
cd web && firebase deploy --only firestore:rules -P $FIREBASE_PROJECT && cd ..

echo ""
echo "============================================"
echo "  Deploy concluido com sucesso!"
echo "  Ambiente: $ENVIRONMENT"
echo "============================================"
echo ""
echo "Proximos passos:"
echo "  1. Verificar se o app esta funcionando"
echo "  2. Executar testes de smoke"
echo "  3. Monitorar logs do Firebase"
echo ""
