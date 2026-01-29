# Инструкция по установке

**Repository**: https://github.com/GGrirorev/SutochnoEventManager

Руководство по развёртыванию Analytics Event Schema Manager на собственном сервере.

## Требования

- **Node.js** 18+ (рекомендуется 20 LTS)
- **PostgreSQL** 14+
- **npm** или **yarn**

## Шаг 1: Подготовка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/GGrirorev/SutochnoEventManager.git
cd SutochnoEventManager
```

2. Установите зависимости:
```bash
npm install
```

## Шаг 2: Настройка базы данных

1. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE analytics_events;
CREATE USER analytics_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE analytics_events TO analytics_user;
```

2. Настройте переменную окружения `DATABASE_URL`:
```bash
export DATABASE_URL="postgresql://analytics_user:your_secure_password@localhost:5432/analytics_events"
```

3. Примените схему базы данных:
```bash
npm run db:push
```

## Шаг 3: Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# Обязательные переменные
DATABASE_URL=postgresql://user:password@localhost:5432/analytics_events
SESSION_SECRET=your_very_long_random_secret_key_here

# Опционально (для модуля мониторинга событий)
ANALYTICS_API_TOKEN=your_matomo_api_token

# Опционально
NODE_ENV=production
PORT=5000
```

### Генерация SESSION_SECRET

Используйте криптографически безопасный генератор:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Важно:** `SESSION_SECRET` обязателен в production-режиме. Без него сервер не запустится.

## Шаг 4: Сборка приложения

```bash
npm run build
```

## Шаг 5: Запуск

### Development режим
```bash
npm run dev
```

### Production режим
```bash
NODE_ENV=production npm start
```

Приложение будет доступно по адресу: `http://localhost:5000`

## Шаг 6: Первоначальная настройка

При первом запуске система автоматически перенаправит вас на страницу первоначальной настройки (`/setup`), где вы сможете:

1. Создать аккаунт первого администратора
2. Указать email и пароль для входа
3. Автоматически войти в систему

После создания первого пользователя страница настройки станет недоступна.

## Настройка через systemd (Linux)

Создайте файл сервиса `/etc/systemd/system/analytics-events.service`:

```ini
[Unit]
Description=Analytics Event Schema Manager
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/analytics-events
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

Environment=NODE_ENV=production
Environment=PORT=5000
EnvironmentFile=/opt/analytics-events/.env

[Install]
WantedBy=multi-user.target
```

Активируйте и запустите:
```bash
sudo systemctl enable analytics-events
sudo systemctl start analytics-events
```

## Настройка через Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
```

Docker Compose (`docker-compose.yml`):
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/analytics
      - SESSION_SECRET=${SESSION_SECRET}
      - NODE_ENV=production
    depends_on:
      - db

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=analytics
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Настройка Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name analytics.example.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Для HTTPS используйте Let's Encrypt:
```bash
sudo certbot --nginx -d analytics.example.com
```

## Роли пользователей

| Роль | Описание |
|------|----------|
| viewer | Только просмотр событий и свойств |
| developer | Просмотр + изменение статусов платформ |
| analyst | Создание/редактирование событий + статусы |
| admin | Полный доступ + управление пользователями |

## Решение проблем

### Ошибка "SESSION_SECRET must be set in production"
Установите переменную окружения `SESSION_SECRET` со случайной строкой.

### Ошибка подключения к базе данных
Проверьте:
- PostgreSQL запущен
- `DATABASE_URL` указан правильно
- Пользователь имеет права на базу данных

### Приложение не запускается на порту 5000
Убедитесь, что порт не занят другим процессом:
```bash
lsof -i :5000
```

## Обновление

1. Остановите приложение
2. Получите новую версию: `git pull`
3. Установите зависимости: `npm install`
4. Примените миграции: `npm run db:push`
5. Соберите приложение: `npm run build`
6. Запустите: `npm start`

## Дополнительные возможности

### Управление категориями событий

Страница `/categories` позволяет:
- Просматривать все категории с количеством связанных событий
- Добавлять новые категории с описанием
- Редактировать название и описание категорий
- Удалять категории (только если нет связанных событий)

### Мониторинг событий (Алерты)

Модуль мониторинга отслеживает падение количества событий между вчерашним и позавчерашним днём.

**Настройка** (только для администраторов, `/alerts/settings`):
- URL Matomo API
- Токен API (или используйте переменную `ANALYTICS_API_TOKEN`)
- Порог падения (по умолчанию 30%)
- Соответствие платформ и Site ID

**Автоматическая проверка через Cron:**
```bash
# Ежедневно в 23:00
curl -X POST https://your-domain.com/api/alerts/check
```

Рекомендуемые сервисы: cron-job.org, EasyCron, UptimeRobot
