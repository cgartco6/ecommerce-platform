.PHONY: help start stop restart build test clean db-migrate db-seed logs

help:
	@echo "Available commands:"
	@echo "  make start       - Start all services"
	@echo "  make stop        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make build       - Build all Docker images"
	@echo "  make test        - Run tests"
	@echo "  make clean       - Remove containers and volumes"
	@echo "  make db-migrate  - Run database migrations"
	@echo "  make db-seed     - Seed database with sample data"
	@echo "  make logs        - View service logs"

start:
	docker-compose up -d

stop:
	docker-compose down

restart:
	docker-compose down
	docker-compose up -d

build:
	docker-compose build

test:
	docker-compose run --rm api-gateway npm test
	docker-compose run --rm auth-service npm test

clean:
	docker-compose down -v
	docker system prune -f

db-migrate:
	docker-compose run --rm product-service npm run migrate
	docker-compose run --rm order-service npm run migrate
	docker-compose run --rm auth-service npm run migrate

db-seed:
	docker-compose run --rm product-service npm run seed
	docker-compose run --rm order-service npm run seed

logs:
	docker-compose logs -f

logs-auth:
	docker-compose logs -f auth-service

logs-api:
	docker-compose logs -f api-gateway
