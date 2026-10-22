# 📦 @goodandready/dsh-gitea

<div align="center">

<h3>Корпоративная интеграция Gitea и Forgejo для DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-gitea"><img src="https://img.shields.io/npm/v/@goodandready/dsh-gitea.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-gitea.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/Все_проекты_автора-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="Все проекты автора"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

<table align="center">
  <tr>
    <td align="center">
      ⭐ <strong>Если вам нравится этот плагин, поставьте ему звезду на GitHub</strong> — это покажет мне, что плагин вам полезен, и будет мотивировать меня развивать его дальше.
      <br><br>
      🐛 <strong>Если вы нашли баг или хотите предложить новый функционал</strong>, создайте issue на GitHub на любом языке — я рассмотрю ваше предложение и реализую полезные идеи в одной из следующих версий плагина.
    </td>
  </tr>
</table>

</div>

---

### 🌟 Что нового в v0.7.6
- **Встроенное автообновление**: Проверка и обновление плагина прямо из карточки настроек DSH.
- **Сервисы композиции**: Публичные сервисы `dshGitea` (создание задач) и `giteaEvents` (поток событий для `@goodandready/dsh-pulse`).
- **Безопасность и гигиена**: Строгая защита POST-маршрутов (`lib/http-guard.js`), чистый экспорт без внутренних файлов (`publish.sh`).
- **Производительность**: Своевременная инвалидация кэша снимка git при мутациях и декомпозиция `lib/tool-defs.js`.

### 🌟 Что нового в v0.7.5
- **Канонический английский серверной половины и инструментов агента**: Все ответы инструментов, детали проверок и сообщения об ошибках приведены к стандарту `dsh-plugin-authoring` (канонический английский в коде и ответах агенту).
- **Чистые границы npm-пакета**: Эталонные шаблоны issue-форм размещены в `assets/issue-templates/`, а внутренние материалы разработки (`docs/superpowers/`, `.gitea/`) полностью исключены из состава npm-пакета.
- **Автоматический Compliance Quality Gate**: Встроен непрерывный тест на 0 символов кириллицы в `lib/` и валидацию состава файлов пакета.

## ⚡ Обзор и решаемая проблема

При выполнении масштабных задач автономной разработки в DeepSeek Harness агентам необходим полноценный доступ к трекеру задач (Issues), созданию и ревью пул-реквестов (PR), управлению ветками и изоляции рабочих сред (Worktrees). Без специализированного плагина агент вынужден выполнять «грязные» правки напрямую в рабочей ветке или обращаться к сторонним CLI без контроля прав доступа.

**`@goodandready/dsh-gitea`** обеспечивает бесшовную интеграцию DeepSeek Harness с серверами **Gitea** и **Forgejo**. Плагин предоставляет агенту 20+ типизированных инструментов, добавляет живой **Git Status Chip** в шапку веб-интерфейса чата и защищает репозиторий барьерами безопасности (требование `confirm: true` для слияния и удаления).

---

## 🏗️ Архитектура

```mermaid
graph LR
    subgraph DSH ["DeepSeek Harness"]
        UI["Шапка чата Web UI<br/>(Git Status Chip)"]
        Agent["Автономный агент<br/>(20+ инструментов Gitea)"]
        Creds["Хранилище Credentials<br/>(Ссылка на GITEA_TOKEN)"]
    end

    subgraph Plugin ["Плагин dsh-gitea"]
        ChipPoller["/git-status API<br/>Инспектор веток и Diff"]
        Client["GiteaClient<br/>(REST API v1)"]
        WorktreeMgr["Менеджер Worktree<br/>(Изолированные задачи)"]
    end

    subgraph Server ["Сервер версий"]
        Gitea["Gitea / Forgejo Server<br/>(Задачи, PR, Метки, Вехи)"]
        GitRepo["Git Репозиторий<br/>(Ветки и Worktrees)"]
    end

    UI -->|Опрос статуса| ChipPoller
    ChipPoller -->|Чтение статуса| GitRepo
    Agent -->|Вызов инструментов| Client
    Agent -->|Управление ветками| WorktreeMgr
    WorktreeMgr -->|git worktree| GitRepo
    Client -->|Авторизованный REST| Gitea
    Creds -.->|Разрешение в памяти| Client
```

---

## ✨ Исчерпывающий разбор возможностей

### 1. Набор из 20+ инструментов агента

Все инструменты автоматически определяют владельца (`owner`) и имя репозитория (`repo`) из адреса `git remote get-url origin` активной рабочей области, если агент не указал их явно.

| Инструмент | Категория | Назначение | Контроль безопасности |
|:---|:---|:---|:---|
| `gitea_labels` | Метки | Фасад управления метками: `list`, `create`, `delete`, `set` | - |
| `gitea_milestones` | Вехи | Фасад управления вехами: `list`, `create`, `update`, `delete` | ⚠️ Удаление требует `confirm: true` |
| `gitea_releases` | Релизы | Фасад управления релизами: `list`, `create`, `update`, `delete`, `plan`, `notes` | ⚠️ Удаление требует `confirm: true` |
| `gitea_ci` | CI / Actions | Фасад инспекции CI: `status`, `jobs`, `rerun`, `explain` | ⚠️ Перезапуск требует `confirm: true` |
| `gitea_branches` | Ветки | Фасад управления ветками: `list`, `create`, `delete` | ⚠️ Удаление требует `confirm: true` |
| `gitea_tags` | Теги | Фасад управления тегами: `list`, `create`, `delete` | ⚠️ Удаление требует `confirm: true` |
| `gitea_webhooks` | Вебхуки | Фасад управления вебхуками: `list`, `create`, `delete` | ⚠️ Удаление требует `confirm: true` |
| `gitea_org` | Организации | Фасад организаций: `list`, `repos`, `members`, `teams`, `create_repo` | - |
| `gitea_wiki` | Вики | Фасад вики-страниц: `list`, `get` | - |
| `gitea_issue_create` | Задачи | Создание новой задачи с заголовком, описанием, метками и исполнителями | - |
| `gitea_issue_list` | Задачи | Список задач с фильтрацией по статусу (`open`/`closed`), вехам и меткам | - |
| `gitea_issue_get` | Задачи | Получение полной информации о задаче по её номеру | - |
| `gitea_issue_comment`| Задачи | Добавление комментариев, отчётов о прогрессе и ревью | - |
| `gitea_issue_comments`| Задачи | Список комментариев задачи (с признаком `mine: true/false`) | - |
| `gitea_issue_comment_delete`| Задачи | Удаление собственного комментария (по умолчанию dry-run превью; удаляются только комментарии текущего токена) | ⚠️ Требует `confirm: true` |
| `gitea_issue_update` | Задачи | Редактирование заголовка, тела или статуса задачи | - |
| `gitea_issue_close`  | Задачи | Закрытие выполненной задачи | - |
| `gitea_issue_search` | Задачи | Полнотекстовый поиск по задачам репозитория/инстанса | - |
| `gitea_issue_set_assignee` | Команда | Назначение ответственных разработчиков или агентов | - |
| `gitea_pr_create`    | Пул-реквесты | Открытие PR из рабочей ветки в целевую | - |
| `gitea_pr_list`      | Пул-реквесты | Список открытых и закрытых PR | - |
| `gitea_pr_get`       | Пул-реквесты | Получение сводки изменений, ревью и статусов проверок | - |
| `gitea_pr_comment`   | Пул-реквесты | Построчные комментарии к коду и обсуждение PR | - |
| `gitea_pr_merge`     | Пул-реквесты | Слияние PR (merge / rebase / squash) | ⚠️ Требуется `confirm: true` |
| `gitea_worktree_list`| Worktree | Список активных изолированных воркдеревьев | - |
| `gitea_worktree_add` | Worktree | Создание изолированного рабочего дерева для отдельной задачи | - |
| `gitea_worktree_use` | Worktree | Переключение контекста сессии в директорию воркдерева | - |
| `gitea_worktree_remove` | Worktree | Удаление и очистка завершённого воркдерева | ⚠️ Требуется `confirm: true` |
| `gitea_issue_templates` | Задачи | Получение и валидация стандартизированных YAML-шаблонов issue из `.gitea/ISSUE_TEMPLATE` | - |
| `gitea_git_graph`    | Git и граф | Визуальный топологический граф коммитов, моноширинные дорожки, ветки/теги и статусы CI | - |
| `gitea_repo_search`  | Поиск | Поиск репозиториев по всему инстансу Gitea | - |
| `gitea_whoami`       | Профиль | Информация об авторизованном пользователе и правах | - |
| `gitea_release_assistant` | Релизы | Помощник релизов: проверка SemVer, многоязычные списки изменений, проверки CI | - |
| `gitea_worktree_gc` | Worktrees | Безопасная очистка объединённых рабочих копий (GC) в фоне и по запросу | ⚠️ Требуется `confirm: true` |
| `gitea_issue_to_pr` | Pull Requests | Автоматическое создание PR из задачи с шаблоном и контекстом | - |
| `gitea_ai_review` | Pull Requests | Автоматическое код-ревью с комментариями по строкам, защитой от утечек и suggestion-блоками | - |
| `gitea_pr_line_comment` | Pull Requests | Добавление комментариев по строкам дифа и интерактивных блоков ```suggestion для однокликовых коммитов | - |
| `gitea_task_tracker_sync` | Экосистема | Двусторонняя синхронизация канбан-досок Task Tracker (`dsh-drives.task-provision.v1`) | - |
| `gitea_memory_brain_sync` | Экосистема | Индексация долговременных фактов, задач и PR в Memory Brain | - |
| `gitea_incident_report` | Инциденты | Создание отчётов об инцидентах с маскированием ключей и токенов | - |
| `gitea_ci_logs_analyze` | CI & Actions | Анализ первопричин сбоев (RCA) в Gitea Actions: локализация упавшего шага, классификация ошибок и готовые рекомендации | - |
| `gitea_action_card` | Generative UI | Интерактивные Generative UI Action Cards задач, PR и веток в чате с быстрыми действиями в один клик | - |
| `gitea_pr_stack_status` | Pull Requests | Анализ цепочек зависимых PR (Stacked PRs), глубины стека и готовности к перебазированию | - |
| `gitea_pr_stack_rebase` | Pull Requests | Автоматический каскадный rebase дочерней ветки на обновлённую базу с авто-откатом при конфликтах | - |
| `gitea_conflict_analyze` | Git & Conflicts | Трёхсторонний in-memory анализ конфликтов слияния и категоризация секций (импорты, зависимости, семантика) | - |
| `gitea_pr_conflict_resolve` | Git & Conflicts | Структурированное разрешение конфликтов PR с preview diff до фиксации | ⚠️ Требует `confirm: true` |
| `gitea_release_plan` | Releases | Анализатор Conventional Commits с авто-расчётом SemVer и структурированным чейнджлогом | - |
| `gitea_packages_list` | Packages | Просмотр опубликованных пакетов в Gitea Package Registry (npm, PyPI, OCI, Generic) | - |
| `gitea_package_get` | Packages | Метаданные, версии и ассеты пакета в реестре Gitea | - |
| `gitea_package_delete` | Packages | Удаление версии пакета из реестра Gitea | ⚠️ Требует `confirm: true` |
| `gitea_package_config` | Packages | Генерация клиентского конфига (.npmrc, pip.conf, docker login) | - |
| `gitea_suggest_reviewers` | Reviews | Рекомендация ревьюеров PR на основе правил CODEOWNERS и авторства коммитов через git blame | - |
| `gitea_branch_protection_get` | Security | Проверка правил защиты ветки, обязательных аппрувов и запрета force push | - |
| `gitea_branch_protection_set` | Security | Настройка или удаление правил защиты ветки с режимом предварительного просмотра | ⚠️ Требует `confirm: true` |
| `gitea_deploy_keys` | Security | Управление deploy keys репозитория (просмотр, добавление, удаление) | ⚠️ Удаление требует `confirm: true` |
| `gitea_security_audit` | Security | Комплексный аудит безопасности репозитория (защита веток, ключи деплоя, политики пуша) | - |
| `gitea_mirror_sync_status` | Mirror | Мониторинг синхронизации и задержки публичных зеркал (Gitea <-> GitHub) с ручным триггером | ⚠️ Синхронизация требует `confirm: true` |
| `gitea_webhook_sandbox` | Webhooks | Песочница вебхуков: кольцевой буфер событий, маскирование секретов и повторный прогон | ⚠️ Очистка требует `confirm: true` |

*(Примечание: Все устаревшие индивидуальные имена инструментов, такие как `gitea_label_list`, `gitea_release_now` и т.д., на 100% поддерживаются через прозрачный маппинг обратной совместимости).*

---

### 2. Git Status Chip и топологический граф коммитов

Клиентский модуль встраивает динамический чип статуса Git прямо в верхнюю панель чата DSH:
* **Активный репозиторий и ветка**: отображает имя текущей ветки (например, `feature/issue-42-auth`).
* **Чистота рабочей копии**: цветной индикатор (чистое дерево vs наличие незакоммиченных правок) и счётчик файлов.
* **Счётчик Ahead/Behind**: живые бейджи расхождения с удалённой веткой (`↑ahead`, `↓behind`).
* **Модальное окно графа коммитов**: моноширинная визуализация дорожек ветвления и слияний (`●`, `◆`, `│`), ссылки на коммиты в Gitea Web UI, бейджи веток/тегов и живые статусы сборок Gitea Actions CI (`CI ✓`, `CI ✗`, `CI ●`).
* **Межвкладочная синхронизация**: выборы лидера через `navigator.locks` и канал `BroadcastChannel`, исключающие дублирующий сетевой поллинг при множестве открытых вкладок.
* **Инспектор несохранённых изменений**: панель в 1 клик с просмотром последних коммитов и диффа незакоммиченных строк.

---

### 3. Изоляция Worktree и безопасность агента

Для безопасного выполнения агентом параллельных задач:
* **Неразрушающие Worktree**: создание рабочих копий по пути `.worktrees/issue-<id>/` без переключения основной ветки.
* **Защита от случайных слияний**: деструктивные операции `gitea_pr_merge` и `gitea_worktree_remove` строго требуют явного параметра `confirm: true`. Неподтверждённые вызовы мгновенно блокируются.
* **Изоляция правки через Git Wrapper**: запись изменений может направляться через специальную обёртку (`gitWrapper`, например `git-deepseek-harness`), сохраняя строгую цифровую подпись агента.

---

### 4. Набор шаблонов задач Gitea Issue Templates

В комплект поставки входит готовый набор шаблонов задач `.gitea/ISSUE_TEMPLATE/`:

| Файл шаблона | Назначение | Рекомендуемые стартовые метки |
|:---|:---|:---|
| `bug.yaml` | Отчёт об ошибке (Bug report) | `type/bug`, `status/ready` |
| `feature.yaml` | Запрос новой функциональности | `type/feature`, `status/ready` |
| `security.yaml` | Отчёт об уязвимости безопасности | `type/security`, `priority/high`, `scope/security` |
| `research.yaml` | Архитектурное исследование / Spike | `type/research`, `status/ready` |
| `tech-debt.yaml` | Технический долг и рефакторинг | `type/tech-debt`, `status/ready` |
| `incident.yaml` | Отчёт об инциденте на проде | `type/incident`, `priority/critical` |
| `config-change.yaml` | Изменение конфигурации и инфраструктуры | `type/refactor`, `scope/settings`, `status/ready` |

---

### 5. Gitea Hub и интерактивное управление Worktree

Боковая панель включает вкладку **Gitea Hub** на базе маршрута `/dsh-gitea/hub`:
- **Назначенные задачи и PR**: просмотр задач, статусов сборок и быстрые действия (Approve, Merge, Close).
- **Управление Worktree**: мгновенное переключение между каталогами рабочих копий и безопасная очистка смёрженных веток.
- **Мониторинг Runners**: актуальное состояние доступных runner'ов Gitea Actions.

### 6. Жизненный цикл автономных агентов и безопасность

- **Сборка мусора Worktree (`gitea_worktree_gc`)**: безопасное удаление смёрженных веток через `git merge-base --is-ancestor`, защита текущей ветки, `main` и незакоммиченных изменений.
- **Автоматическое AI-ревью (`gitea_ai_review`, `gitea_pr_line_comment`)**: публикация формального ревью с комментариями по строкам дифа, поиск утечек секретов и опасных путей, формирование интерактивных блоков предложений (```suggestion) для однокликового применения правок прямо в интерфейсе Gitea.
- **Преобразование задачи в PR (`gitea_issue_to_pr`)**: формирование ветки и PR по шаблону из контекста issue.

### 7. Синхронизация экосистемы и инциденты

- **Синхронизация Task Tracker (`gitea_task_tracker_sync`)**: двусторонний мост к канбан-доске по стандарту `dsh-drives.task-provision.v1`.
- **Индексация в Memory Brain (`gitea_memory_brain_sync`)**: сохранение долговременного контекста, решений и задач в Memory Brain.
- **Безопасные отчёты об инцидентах (`gitea_incident_report`)**: создание инцидент-тикетов с маскированием приватных ключей OpenSSH/EC/RSA и API-токенов.

### 8. Ассистент релизов и потоковые события SSE

- **Ассистент релизов (`gitea_release_assistant`)**: проверка шага SemVer, многоязычный changelog, проверки тестов и готовности пайплайна.
- **Потоковые события SSE (`/dsh-gitea/sse`)**: доставка событий в реальном времени с поддержкой keepalive, автопереподключения и дедупликации вкладок.

## 📦 Установка

Установка через консольный клиент DeepSeek Harness:

```bash
dsh plugin --profile web add @goodandready/dsh-gitea
```

Перезапустите Web UI DSH и обновите вкладку в браузере с очисткой кэша (`Ctrl+F5` или `Cmd+Shift+R`).

### Установка из локальной копии репозитория

Plugin Manager устанавливает абсолютный локальный путь по протоколу pnpm `link:`, а pnpm
не разрешает peer-зависимости связанного пакета из его каталога. В результате Loader
сообщает `failed to import` (обычно `Cannot find package '@deepseek-ai/schemastery'`).
Выполните в копии репозитория один раз:

```bash
cd /path/to/dsh-gitea
node scripts/dev-link-dsh.mjs   # или: npm run dev:link
```

Скрипт связывает пакеты DSH из работающей установки в `node_modules/` (каталог в
`.gitignore`) и не изменяет саму установку DSH. Для установки из реестра это не нужно.

> Если Plugin Manager сообщает `spawn pnpm ENOENT`, pnpm отсутствует в `PATH` сервера
> DSH. Укажите его в патче профиля:
>
> ```yaml
> - id: plugin-manager
>   name: "@deepseek-ai/dsh-plugin-manager"
>   config:
>     pnpmCommand: /opt/node/bin/pnpm   # путь к pnpm
> ```

---

## ⚙️ Конфигурация

Откройте **Настройки → Gitea** в Web UI (в актуальных версиях DSH та же форма доступна
через **Плагины → пакет Gitea → строка → Configure**):

```yaml
# config.yaml
dsh-gitea:
  baseUrl: "https://gitea.yourcompany.com"
  tokenEnv: "GITEA_TOKEN"
  gitWrapper: ""
  timeoutMs: 15000
```

### Таблица параметров конфигурации

Страница настроек плагина организует все 17 параметров схемы в основные и расширенные секции:

| Параметр | Тип | По умолчанию | Раздел | Описание |
|:---|:---|:---|:---|:---|
| `baseUrl` | `string` | `""` | Основные | Базовый URL вашего инстанса Gitea или Forgejo (например, `https://gitea.example.com`) |
| `tokenEnv` | `string` | `"GITEA_TOKEN"` | Основные | Имя DSH Credential, содержащего персональный токен доступа |
| `defaultOwner` | `string` | `""` | Основные | Организация или пользователь по умолчанию, если не указаны в вызове |
| `defaultRepo` | `string` | `""` | Основные | Репозиторий по умолчанию, если не указан в вызове |
| `gitWrapper` | `string` | `""` | Дополнительные (Git) | Команда-обёртка для операций записи (например, `git-dsh`) |
| `dodReminder` | `boolean` | `false` | Дополнительные (Git) | Напоминание DoD, если инструмент изменил git-файлы без ссылки на задачу/PR |
| `forceHttpsUrls` | `boolean` | `false` | Дополнительные (Git) | Принудительная перезапись ссылок `http://` в `https://` за HTTPS reverse proxy |
| `timeoutMs` | `number` | `30000` | Дополнительные (Git) | Таймаут выполнения HTTP-запросов (в миллисекундах) |
| `webhookSecretEnv` | `string` | `""` | Дополнительные (Вебхуки) | Имя DSH Credential с секретом для проверки подписи `X-Gitea-Signature` |
| `webhookSecret` | `string` | `""` | — | *Устарело*: используйте `webhookSecretEnv`. Оставлено для обратной совместимости |
| `notifyWebhook` | `string` | `""` | Дополнительные (Вебхуки) | Внешний URL вебхука для оповещений о новых PR и упавшем CI |
| `bgSchedulerEnabled` | `boolean` | `false` | Дополнительные (Планировщик) | Включение фонового планировщика проверок здоровья и триажа |
| `bgSchedulerIntervalMin` | `number` | `60` | Дополнительные (Планировщик) | Интервал между фоновыми проверками (в минутах) |
| `bgSchedulerOwner` | `string` | `""` | Дополнительные (Планировщик) | Владелец для фоновых проверок (по умолчанию `defaultOwner`) |
| `bgSchedulerRepo` | `string` | `""` | Дополнительные (Планировщик) | Репозиторий для фоновых проверок (по умолчанию `defaultRepo`) |
| `bgSchedulerWebhook` | `string` | `""` | Дополнительные (Планировщик) | URL вебхука для отправки дайджестов фоновых проверок |
| `instances` | `array` | `[]` | Дополнительные (Инстансы) | Список дополнительных инстансов (`name`, `baseUrl`, `tokenEnv`) |

> [!IMPORTANT]
> Никогда не вставляйте сырой API-токен в поле `tokenEnv`. Токен сохраняется в зашифрованном виде в DSH Credentials, а в настройках указывается только имя ссылки.

---

## 🛠️ Надёжность, вебхуки и кроссплатформенность

Добавлено и улучшено в `v0.4.3`:
- **Доставка вебхуков**: `gitea_digest_delivery` и отправка push-уведомлений формируют полноценные HTTP POST JSON-запросы со стандартными заголовками, гарантируя корректную доставку в Slack, Discord, Telegram или корпоративные вебхуки.
- **Кроссплатформенность путей**: Полная поддержка файловых путей как в Linux/macOS (POSIX), так и в Windows с прозрачной нормализацией разделителей и дисковых букв.
- **Точная аналитика слияний**: Инструмент `gitea_repo_analytics` корректно определяет объединённые PR в соответствии со спецификацией Gitea REST API (`merged: true`).
- **Парсинг политик безопасности**: В `gitea_pr_policy` исправлена обработка списка `requiredChecks` в связке с защищёнными путями репозитория.
- **Автономная маршрутизация инструментов**: Инструменты без привязки к репозиторию (`gitea_repo_create_org`, `gitea_repo_bootstrap`, `gitea_digest_delivery`) работают без наличия локального git origin.

---

## 🧪 Тестирование и верификация

Запуск полного набора юнит- и интеграционных тестов:

```bash
npm test
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)

## Сервисы композиции

### Создание задач (`dshGitea`)
Предоставляет контракт `dsh-drives.task-provision.v1` для создания и идемпотентного поиска задач по `externalRef`.

### Поток событий Gitea (`giteaEvents`)
Предоставляет сервис безопасной публикации событий вебхуков для телеметрии (`@goodandready/dsh-pulse`):
- `subscribe(listener)` и `on("event", listener)` с возвратом функции отписки.
- Передаются исключительно безопасные идентификаторы (`id`, `event`, `action`, `at`, `owner`, `repo`, `issue`, `pull`, `ref`).
- Никаких токенов, секретов, заголовков, сырых тел запросов или текстов комментариев.
- Ошибки подписчиков изолированы и не влияют на ответ вебхука.

### Автообновление плагина

Карточка настроек включает встроенный блок проверки и установки обновлений (`/api/dsh-gitea/update`):
- Проверка свежей версии в npm-реестре и отображение статуса.
- Безопасный вызов POST: защита loopback, совпадение origin/host и заголовок `x-dsh-plugin-update: 1`.
- Без отключения карантина пакетов pnpm.
- Корректная поддержка версий с пререлизными тегами.

---

## 🛡️ Аутентификация маршрутов и модель безопасности

 предоставляет HTTP-эндпоинты для опроса статуса репозитория, графа коммитов, управления настройками и операций в Hub. Для защиты от несанкционированного доступа из локальной сети, межсайтовой подделки запросов (CSRF) и атак DNS-rebinding:

- **Аутентификация через DSH Connection**: Все внутренние HTTP-маршруты (`/dsh-gitea/config`, `/events`, `/git-status`, `/git-graph`, `/sse`, `/release-assistant`, `/hub`) проверяются каноническим сервисом DSH Host Connection (`ctx.connection.requestRejection`). Запросы из LAN/WAN без аутентифицированной сессии DSH отклоняются с кодами 401 Unauthorized или 403 Forbidden.
- **Fail-Closed изоляция loopback**: В тестовом окружении без сервиса Connection разрешён доступ только с локального интерфейса loopback (`127.0.0.1`, `::1`). Удалённые клиенты блокируются.
- **Строгая защита операций записи**: Мутации конфигурации и действия в Hub требуют подтверждённой сессии и соответствия same-origin, исключая подмену `baseUrl` и утечку токенов.
- **HMAC-проверка вебхуков**: Входящие события Gitea (`/dsh-gitea/webhook`) криптографически верифицируются по подписи HMAC-SHA256 через `webhookSecretEnv`.
