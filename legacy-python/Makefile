.PHONY: run setup migrate up down logs test backup restore

run:
	python -m app.main

setup:
	python scripts/setup.py

migrate:
	alembic upgrade head

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f bot

test:
	pytest -q

backup:
	python scripts/backup.py

restore:
	python scripts/restore.py $(FILE)
