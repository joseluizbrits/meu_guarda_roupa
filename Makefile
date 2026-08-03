.DEFAULT_GOAL := up

.PHONY: up back android ios

## Sobe o projeto inteiro: stack do backend (detached) + servidor Expo (mobile)
up: back
	cd mobile && npm start

## Sobe só o backend (postgres + minio + api), em background
back:
	cd infra && docker compose up -d --build

## Builda e roda o app nativo Android (dispositivo/emulador conectado)
android:
	cd mobile && npm run android

## Builda e roda o app nativo iOS (dispositivo/simulador, só macOS)
ios:
	cd mobile && npm run ios
