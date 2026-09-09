#!/bin/bash
# ============================================================
# Voxly - Script de Verificacao de Saude
# Uso: ./scripts/health-check.sh [url]
# ============================================================

set -e

URL="${1:-http://localhost:3000}"
FAILED=0

echo "============================================"
echo "  Voxly - Verificacao de Saude"
echo "  URL: $URL"
echo "============================================"

# Verificar se o servidor esta respondendo
echo -n "[1/3] Testando conexao... "
if curl -sf "$URL" > /dev/null 2>&1; then
    echo "OK"
else
    echo "FALHOU"
    FAILED=1
fi

# Verificar tempo de resposta
echo -n "[2/3] Tempo de resposta... "
RESPONSE_TIME=$(curl -sf -o /dev/null -w "%{time_total}" "$URL" 2>/dev/null || echo "999")
if (( $(echo "$RESPONSE_TIME < 2.0" | bc -l) )); then
    echo "OK (${RESPONSE_TIME}s)"
else
    echo "LENTO (${RESPONSE_TIME}s)"
fi

# Verificar status HTTP
echo -n "[3/3] Status HTTP... "
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "OK ($HTTP_STATUS)"
else
    echo "FALHOU ($HTTP_STATUS)"
    FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
    echo "Resultado: SAUDAVEL"
    exit 0
else
    echo "Resultado: PROBLEMAS DETECTADOS"
    exit 1
fi
