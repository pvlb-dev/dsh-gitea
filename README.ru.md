# 🏴 @goodandready/dsh-gitea — приватный форк для развёртывания

**Интеграция Gitea/Forgejo для DeepSeek Harness — наш форк для собственного сервера.**

[Проект-источник](https://github.com/GooDAnDReaDY/dsh-gitea) · [LICENSE](LICENSE) · [AGENTS.md](AGENTS.md) · [English README](README.md)

---

Этот репозиторий — **приватный форк**
[`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea) (MIT),
который мы поддерживаем для работы плагина на своём сервере DeepSeek Harness.
Это не публикация пакета: профиль DSH устанавливает этот checkout как
`link:`-зависимость, а в npm под именем upstream мы ничего не публикуем.

**Наш форк — основная ветка разработки. Upstream только отслеживается.**
Публичное дерево на GitHub генерируется из приватного репозитория автора
(каждый коммит — `chore(publish): sanitized tree from <sha>`), поэтому PR в
сгенерированные файлы ненадёжен: следующая публикация может его перезаписать.
Синхронизируемся осознанно, держим патчи небольшими и тегируем то, что реально
запущено. Полный рабочий контракт — слоты DSH, настройки, установка, таблица
сбоев — в [AGENTS.md](AGENTS.md).

- Версия форка: `0.7.40-dsh.1`
- База: upstream `abfd952`; проверено на DSH `0.2.0-rc.2` и Forgejo
  `17.0.0+gitea-1.22.0`

## Что делает

- **20+ инструментов агента**: issues, pull requests, ветки, теги, релизы,
  пакеты, wiki, milestones, labels, CI и разбор логов, worktrees, поиск по
  репозиторию.
- **Страница настроек** в **Settings → Gitea** и Configure у строки плагина:
  подключение, учётные данные, значения по умолчанию, вебхуки, фоновый триаж и
  переключатель обновлений плагина.
- **Git-чип** в шапке сессии: ветка, ahead/behind, граф коммитов, события.
- **Вебхуки** с HMAC-проверкой, лента событий и SSE, Hub, CI RCA, release
  assistant, шаблоны issue, изоляция worktree и сервисы `dshGitea` /
  `giteaEvents`.

## Почему этот форк существует

В upstream-сборке на DSH 0.2.x страница настроек не появлялась: плагин
регистрировал удалённый слот `settings.plugin.item` и привязывал форму к
браузерному `configForms`, который на не-loopback страницах отдаёт
`unavailable`. Плюс баг в HTTP-guard превращал допущенные запросы из
Tailscale/LAN в `403`. Наш форк несёт эти исправления и обвязку для локальной
установки через `link:`.

Отличия от upstream `abfd952`:

| Изменение | Зачем |
|:--|:--|
| регистрация `settings.section` (`Settings → Gitea`) | удалённый `settings.plugin.item` ничего не рендерил на 0.2.x |
| форма настроек через Host-маршрут `GET/POST /dsh-gitea/config` с `writable` и Retry | `configForms` на удалённых страницах работает только в памяти и скрывал все поля |
| `lib/http-guard.js`: смонтированный DSH Connection — главный | допущенные запросы через reverse proxy/Tailscale проваливались в loopback-fallback и получали `403` |
| `scripts/dev-link-dsh.mjs` (`npm run dev:link`) | при `link:`-установке pnpm не резолвит peer-пакеты DSH |
| переключатель `updates` в конфиге, здесь выключен | встроенный npm-апдейтер заменил бы checkout upstream-архивом и откатил все патчи форка |
| `test/` + `scripts/leak-scan.mjs` | публичное дерево upstream содержит скрипт тестов, но не сами тесты; наши тесты реально запускаются |
| этот README, AGENTS.md, версия и теги форка | форк — сопровождаемый проект, а не анонимный снимок |

## Требования

- DeepSeek Harness `0.1.7-rc.2` / `0.2.0-rc.x` (см. `peerDependencies`)
- Node.js 20+
- `pnpm` (нужен Plugin Manager для установки в профиль)
- Gitea/Forgejo, доступный с сервера DSH по HTTPS

## Установка в профиль DSH

Файлы профиля лежат **вне** этого репозитория (`<profile>/package.json`,
`<profile>/cordis.patch.yml`). Предпочтительны инструменты Harness, а не ручная
правка.

### 1. Подготовить checkout (один раз)

```bash
cd /path/to/dsh-gitea
node scripts/dev-link-dsh.mjs        # он же: npm run dev:link
```

Plugin Manager ставит абсолютный путь через `link:`-протокол pnpm, а pnpm не
резолвит peer-зависимости связанного пакета из его каталога. Без этого шага
строка плагина показывает `failed to import`
(`Cannot find package '@deepseek-ai/schemastery'`). Скрипт только создаёт
симлинки из работающей установки DSH в gitignored `node_modules/` этого
checkout и ничего не пишет в установку DSH.

### 2. Установить бандл

```
plugin_manager action=install_bundle target=/path/to/dsh-gitea enabled=true
```

Если Plugin Manager падает с `spawn pnpm ENOENT`, пропишите `pnpm` в патче
профиля:

```yaml
- id: plugin-manager
  name: "@deepseek-ai/dsh-plugin-manager"
  config:
    pnpmCommand: /opt/node/bin/pnpm
```

### 3. Перезагрузка после правок

Переключите бандл off/on (`plugin_manager action=set_bundle ...`) или добавьте
checkout в HMR:

```yaml
- id: hmr
  config:
    root: ["/path/to/dsh-gitea"]
```

С HMR правки Host-части применяются без перезапуска `dsh web`. Клиентский бандл
отдаётся на каждый запрос — после правки `lib/client.js` сделайте жёсткую
перезагрузку страницы (`Ctrl+F5`).

### 4. Проверка

```bash
plugin_manager action=list_bundles
curl -s http://127.0.0.1:3080/dsh-gitea/config | head   # 401 без сессии — так и должно быть
```

В Web UI: **Settings → Gitea** существует и показывает поля, у строки плагина
есть **Configure**, в шапке сессии — Git-чип в git-каталоге.

## Настройка

Откройте **Settings → Gitea** (или **Plugins → строка бандла → Configure**).

| Поле | По умолчанию | Смысл |
|:--|:--|:--|
| `baseUrl` | — | URL Gitea/Forgejo, например `https://gitea.example.com` (HTTPS, если DSH по HTTPS) |
| `tokenEnv` | `GITEA_TOKEN` | **имя DSH-креденшела**, не токен |
| `defaultOwner` / `defaultRepo` | — | fallback для вызовов без owner/repo |
| `updates` | `true` (**здесь `false`**) | показывать встроенный npm-апдейтер; в форке держим выключенным |
| `timeoutMs` | `30000` | таймаут REST |
| `forceHttpsUrls` | `false` | переписывать `http://` в `html_url` за TLS-прокси |
| `webhookSecretEnv` | — | имя креденшела с HMAC-секретом вебхука |
| `notifyWebhook` | — | внешний URL для уведомлений о PR/CI |
| `bgScheduler*` | выкл. | фоновый триаж/health |
| `instances` | `[]` | дополнительные инстансы (в UI только чтение; задаются в конфиге) |
| `gitWrapper` | — | git-обёртка для worktree-операций |
| `dodReminder` | `false` | неблокирующее напоминание Definition of Done |

### Креденшел

Создайте API-токен **в Forgejo/Gitea** (Settings → Applications) и сохраните его
в **DSH credentials** под именем из `tokenEnv` (по умолчанию `GITEA_TOKEN`).
Форма настроек принимает только *имя* креденшела; значение, похожее на токен,
отклоняется. Пока креденшела нет, страница показывает «Token not configured», а
инструменты не проходят авторизацию.

## Безопасность

- Токенов нет ни в репозитории, ни в чате, ни в форме — только ссылка на
  креденшел.
- Свои HTTP-маршруты проходят через `lib/http-guard.js`: при смонтированном DSH
  Connection он главный (401 без аутентификации / 403-фенс), иначе fallback
  только для loopback и fail-closed.
- Вебхуки проверяются HMAC-SHA256 через `webhookSecretEnv`; без секрета маршрут
  отвечает 401 и не обрабатывает payload.
- Апдейтер плагина закрыт **двумя** шлюзами: запросы только с loopback и
  заголовком `x-dsh-plugin-update`, плюс конфиг-переключатель `updates`. В этом
  профиле он выключен, чтобы npm-установка не заменила checkout форка.
- `npm run test:leaks` падает при приватных домашних путях, npm-скоупах,
  токенах и кириллице в поставляемом JS.

## Политика upstream и синхронизация

- `origin` — наш приватный Forgejo. Единственная цель для push.
- `upstream` — `https://github.com/GooDAnDReaDY/dsh-gitea.git`. Только fetch.

Синхронизируемся осознанно, когда изменение upstream действительно нужно, а не
на каждую публикацию:

```bash
git fetch upstream
git rebase upstream/main     # или merge, если сгенерированный бандл шумит
npm test && npm run test:leaks
```

Конфликтные места: `package.json` (строка версии), верх `CHANGELOG.md` и
`lib/client.js` (сгенерированный бандл — наш самый большой диф). Никогда не
пушьте это дерево и его историю на GitHub: в нём внутренние hostname. Если
захотим отдать что-то upstream — делайте минимальную ветку или патч;
`lib/http-guard.js` самодостаточен и лучше всего подходит для PR.

## Версии и теги

- Формат: `<upstream base>-dsh.<n>` — сейчас `0.7.40-dsh.1`.
- Каждое живое состояние тегируется `v<версия>`. Откат:
  `git checkout v0.7.40-dsh.1`, затем переключить бандл off/on и жёстко
  перезагрузить страницу.
- В `CHANGELOG.md` добавляется запись форка на релиз; записи upstream не трогаем.

## Разработка и проверки

```bash
npm test             # регрессии: настройки, guard, переключатель апдейтера
npm run test:leaks   # гигиена поставляемого дерева
node --check lib/client.js
node --check lib/index.js
```

`lib/client.js` — **сгенерированный браузерный бандл** (единая фабрика
`window.__ModuleLoader__.load`). Ручные правки там — намеренные патчи, но автор
upstream пересобирает этот файл из приватного TypeScript: при синхронизации
ждать конфликтов и переносить наш блок заново. Автоматизации браузера в этом
окружении нет — изменения UI проверяет человек в Web UI.

## Структура репозитория

| Путь | Роль |
|:--|:--|
| `lib/index.js` | Host-entry: схема Config, настройки, инструменты, маршруты, сервисы |
| `lib/client.js` | Сгенерированный веб-бандл: страница настроек, Git-чип, карточки действий, локали |
| `lib/routes.js`, `lib/routes-hub.js` | HTTP-маршруты (`/config`, `/events`, `/git-*`, `/sse`, `/hub`, вебхук) |
| `lib/http-guard.js` | Авторизация/CSRF для маршрутов (сначала DSH Connection, иначе loopback) |
| `lib/plugin-updater.js` | npm-апдейтер за переключателем `updates` |
| `lib/gitea-client.js` | Клиент REST Gitea (кэш, ETag, ретраи, таймауты) |
| `lib/handlers*`, `lib/tool-defs*` | Реализации инструментов и схемы |
| `scripts/dev-link-dsh.mjs`, `scripts/leak-scan.mjs` | bootstrap для `link:` и гигиена |
| `test/*.test.mjs` | Регрессии для исправлений форка |
| `AGENTS.md` | Глубокие заметки для следующего агента: слоты, контракты, runbook |

## Лицензия

MIT — оригинальная работа © [GooDAnDReaDY](https://github.com/GooDAnDReaDY), см.
[LICENSE](LICENSE). Изменения форка поддерживаются в этом репозитории.
