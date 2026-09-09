# ============================================================
# Voxly - Makefile (Comandos de uso comum)
# ============================================================

.PHONY: help install dev build build-web build-electron \
        docker-up docker-down docker-build \
        deploy deploy-staging deploy-production \
        clean lint test

# ---- Variaveis ----
APP_DIR := app
WEB_DIR := web
FIREBASE_PROJECT := voxly-karaoke

# ---- Ajuda ----
help:
	@echo ""
	@echo "  Voxly - Comandos disponiveis:"
	@echo "  =============================="
	@echo ""
	@echo "  make install          Instala dependencias do app"
	@echo "  make dev              Inicia app Electron em modo desenvolvimento"
	@echo "  make build            Build completo (Electron + Web)"
	@echo "  make build-electron   Build do app Electron (Windows)"
	@echo "  make build-web        Build/hosting do app Web"
	@echo ""
	@echo "  make docker-up        Sobe todos os servicos (Docker)"
	@echo "  make docker-down      Para todos os servicos"
	@echo "  make docker-build     Build da imagem Docker"
	@echo ""
	@echo "  make deploy           Deploy web para Firebase (producao)"
	@echo "  make deploy-staging   Deploy web para Firebase (staging)"
	@echo ""
	@echo "  make lint             Executa lint no app"
	@echo "  make test             Executa testes"
	@echo "  make clean            Limpa builds e caches"
	@echo ""

# ---- Dependencias ----
install:
	cd $(APP_DIR) && npm install

# ---- Desenvolvimento ----
dev:
	cd $(APP_DIR) && npm run dev

# ---- Build ----
build: build-web build-electron

build-electron:
	cd $(APP_DIR) && npm run build

build-web:
	cd $(WEB_DIR) && npx serve public -l 3000

# ---- Docker ----
docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-build:
	docker compose build

docker-up-firebase:
	docker compose --profile desktop up firebase

# ---- Deploy ----
deploy:
	cd $(WEB_DIR) && firebase deploy --only hosting -P $(FIREBASE_PROJECT)

deploy-staging:
	cd $(WEB_DIR) && firebase deploy --only hosting -P $(FIREBASE_PROJECT)

# ---- Qualidade ----
lint:
	cd $(APP_DIR) && npx eslint src/ --if-present

test:
	cd $(APP_DIR) && npm test --if-present

# ---- Limpeza ----
clean:
	rm -rf $(APP_DIR)/dist $(APP_DIR)/out $(APP_DIR)/node_modules
	rm -rf $(WEB_DIR)/node_modules
	rm -rf .cache
	docker system prune -f
