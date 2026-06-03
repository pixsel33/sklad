# 📦 СкладПро — Инструкция по деплою

## Структура проекта
```
skladpro/
├── server.js          # Главный файл сервера
├── db.js              # База данных SQLite
├── package.json
├── .env.example       # Пример переменных окружения
├── routes/
│   ├── auth.js        # Авторизация (JWT)
│   ├── ops.js         # Операции (приход, расход, продажи)
│   ├── stock.js       # Склад
│   └── users.js       # Пользователи (только admin)
└── public/
    └── index.html     # Фронтенд
```

---

## 🚀 Деплой на Railway (бесплатно)

### Шаг 1 — Загрузи проект на GitHub
```bash
cd skladpro
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/pixel33/skladpro.git
git push -u origin main
```

### Шаг 2 — Создай проект на Railway
1. Зайди на **railway.app**
2. Нажми **"New Project"**
3. Выбери **"Deploy from GitHub repo"**
4. Выбери свой репозиторий `skladpro`
5. Railway автоматически определит Node.js и задеплоит

### Шаг 3 — Добавь переменные окружения
В Railway → Settings → Variables добавь:
```
JWT_SECRET=придумай_длинный_секретный_ключ_минимум_32_символа
```

### Шаг 4 — Готово!
Railway выдаст тебе ссылку типа:
`https://skladpro-production.up.railway.app`

---

## 🚀 Деплой на Render (альтернатива)

1. Зайди на **render.com**
2. New → **Web Service**
3. Connect GitHub repo
4. Настройки:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Environment Variables:
   - `JWT_SECRET` = твой секретный ключ
6. Deploy!

---

## ⚠️ Важно про SQLite на хостинге

Railway и Render имеют **эфемерную файловую систему** — данные могут сбрасываться при перезапуске.

### Решение для Railway:
Подключи **Railway Volume** (платно, $0.15/GB)

### Бесплатное решение — Railway + GitHub:
Используй **Railway Persistent Disk** в настройках

### Или перейди на PostgreSQL (бесплатно на Railway):
Замени `better-sqlite3` на `pg` — скажи мне, сделаю!

---

## 🔐 Данные для входа по умолчанию

| Логин    | Пароль   | Роль          |
|----------|----------|---------------|
| admin    | admin123 | Администратор |
| cashier  | 123456   | Кассир        |

**Смени пароли после первого входа!**

---

## 💻 Локальный запуск

```bash
cd skladpro
npm install
npm start
# Открой http://localhost:3000
```
# sklad
# sklad
# sklad
# skladpro
# sklad
# sklad
