# Alpa Seasonal VIP Stories

Персоналізовані сторіс-підсумки сезону для Alpa / RocketPlay. Vue 3 + Vite + GSAP,
без TypeScript і тестів. Збирається у `dist/`, розгортається на CDN, відкривається
в продуктовому `iframe`.

Вертикальна сцена 1080×1920: грає пререндерене фонове відео, а поверх нього журнал
анімується в CSS 3D через GSAP, і навколо нього літають 3D-предмети. Фонове відео
містить лише кімнату — журнал, його сторінки і предмети малює браузер.

## Запуск

```sh
npm install
npm run dev       # сторіс, http://localhost:5173
npm run lab       # 3D-лабораторія
npm run build     # production build → dist/
npm run preview
```

## Деплой

`vite.config.js` має `base: './'` — збірку можна класти в будь-яку CDN-піддиректорію.
Готовий `dist/` вбудовується на домен продукту через `iframe`.

`lab.html` збирається разом зі сторіс і потрапляє в `dist/` (~10 КБ). Посилань на неї
немає; вона потрібна, щоб переглянути 3D-пресети з пристрою.

## Архітектура (коротко)

- `public/video/story.{mp4,webm}` — master clock. Усе інше читає `video.currentTime`,
  тож `час таймлайна === час відео`.
- Журнал — DOM у сцені з `preserve-3d`. Його поза задана одним шляхом
  (`JOURNAL_PATH` у `src/story/slides.js`), а не твіном на слайд.
- 17 сторінок змонтовані одночасно і перемикаються через `visibility` з rAF-циклу.
- Предмети — сіблінги журнала в тій самій 3D-сцені; сортування за глибиною виконує
  браузер.
- Конфіг — це дані: `story/slides.js` (слайди й поза), `story/timing.js` (тайм-коди
  й тривалості), `story/flyObjects.js` (польоти), `story/pageLayouts.js` (розкладка
  по мовах). Пресети не містять числових тривалостей.
- Сторінки, для яких у посиланні немає даних, не показуються; історія коротшає
  відповідно — `src/story/storyPlan.js`.

Логіка розділена на composables: `useStoryPlayback` (синхронізація з відео,
навігація), `useStoryData` (параметри посилання → дані сторінок), `useJournalFit`
(підбір кегля під бокси макета), `useStoryBridge` (зв'язок з parent frame).
Анімації будуються в `animations/buildStoryTimeline.js` з пресетів
`journal3d/presets.js`.

Внутрішня документація (рішення ADR, тайм-коди, таблиці поз, лог прогресу) лежить у
`_context/` і не входить до git — канонічна копія зберігається разом з проєктом у
DevHubVault.

## URL-параметри

Персоналізація приходить query-рядком; серверних запитів немає. Повний контракт —
типи, формати, приклади, умови пропуску сторінок —
[`docs/link-parameters.md`](docs/link-parameters.md).

```
?user_language=de&user_currency=EUR&name=Marianna
 &days=257&points=1200000&level=GOLD&total_wins=2222577
 &biggest_win=222257&biggest_win_game=Dragon+Coins
 &biggest_win_game_thunbnail=https://cdn.example.com/dragon.png
 &top_multiplier=2257&top_multiplier_game=Tiger+Jackpots
 &favorite_game_name=Tiger+Jackpots
 &favorite_game_thunbnail=https://cdn.example.com/tiger.png
 &bonuses=2572257&sports_wins=2572257&sports_multiplier=257
 &final_link=https://example.com/promotions/andromeda
```

Десять сторінок (від Days in the Spotlight до Top Sport Signal) пропускаються, якщо
відповідний параметр не передано або він нульовий. Обкладинка, слово редактора і
фінальний блок показуються завжди. Посилання лише з іменем дає історію приблизно на
51 секунду замість 94.

**Рівні:** `IRON`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND`; `REGULAR`
показує бейдж Iron. Інше значення — сторінка пропускається.

Орфографію `thunbnail` збережено навмисно: це ім'я вже використовується посиланнями
Thor VIP Stories.

## Локалізація

Файли: `src/i18n/{en,fr,de,it}.json`. `npm run check-locales` перевіряє повноту
ключів і покриття сторінок.

Додати мову:

1. Створити `<lang>.json` з ключами як в `en.json`.
2. Імпортувати його в `MESSAGES` у `src/composables/useStoryData.js`.
3. Додати код у `LOCALES` у `src/story/params.js`.

Невідома мова дає англійську. У Thor п'ять мов (ще `pt`); тут `pt` покаже англійську.

## Інтеграція (postMessage)

Надсилається в parent frame як `{ source: 'alpa-vip-stories', message }`:

| Подія                              | Коли                           |
| ---------------------------------- | ------------------------------ |
| `reach_end`                        | таймлайн дійшов до фіналу      |
| `bonuses_btn`                      | натиснуто CONTINUE JOURNEY     |
| `watch_again`                      | натиснуто WATCH AGAIN          |
| `close`                            | натиснуто хрестик              |
| `click_forward` / `click_backward` | навігація стрілками або тапом  |
| `click_pause` / `click_start`      | пауза утриманням і відновлення |

`getGift()` і `closeStory()` після події переводять `window.parent.location.href`
на `final_link`.

## Інструменти розробки

**`lab.html`** — журнал у 3D-сцені з панеллю керування: запуск окремого пресету,
підбір його параметрів, паркування пози, прохід по слайдах, показ еталонного кліпу
під DOM-журналом для звірки. Кожен контрол дублюється URL-параметром, тому
лабораторія скриптується; гейти поз працюють саме через неї.

```
lab.html?panel=0&bg=preview&frame=11&lead=2.4      # слайд 11 над еталоном
lab.html?panel=0&bg=grid&rotY=90&jd=34             # ребром
lab.html?frame=13&rot=0&rotX=0&rotY=0&scale=0.62   # сторінка плоско
```

`bg=preview|clean|grid` · `frame` · `lead` · `journal=0` ·
`rotX/rotY/rot/scale/z/cx/cy` · `persp` · `jd` · `face` · `play=1` · `panel=0`

**`review.html`** — збірка в `iframe` і еталонний кліп поверх неї, з повзунком
прозорості та спільним таймкодом. На 50 % розбіжність видно як подвоєний контур.
У збірку не потрапляє.

## Перевірка

Гейти запускати по одному: два headless Chrome конфліктують за профільну директорію.

```sh
npm run check-locales   # повнота локалей
npm run build
npm run fit:check       # сцена влазить у стейдж, відео її вкриває
npm run pose:check      # екранний бокс кожного слайда проти slides.js
npm run journal:selftest
npm run clip:selftest
npm run tiles:fit       # звіт, не вирок
npm run fly:check       # польоти проти scripts/fly-reference.json
npm run preloader:fit   # лого завантаження проти першого кадру кліпу
npm run smooth:scan && node scripts/smooth-report.mjs _refs/smooth/scan-0-94.3667.json
```

Гейти вище звіряють збірку з таблицями, виведеними з макета, тому вони не можуть
виявити помилку в самій таблиці. Пряме порівняння з макетом робить інша пара:

```sh
node scripts/shoot-pages.mjs /tmp/pages en     # 17 сторінок плоско, по PNG на кожну
python3 scripts/mock-overlay.py <config.json>  # сторінка проти свого вузла Figma
```

Друга команда друкує частку незгодних пікселів і пише червоно-блакитне накладання.
Експорт з Figma брати в натуральному розмірі (`get_screenshot`, `maxDimension` не
менше за `original_width`), інакше вирівнювання піде не в тому масштабі.

## Робота з відео

Сирі матеріали від моушн-дизайнера лежать у `_refs/` (в git не входять, по 187 МБ).
`scripts/encode-video.sh dev|prod` — єдиний спосіб зібрати `public/video/`, щоб
налаштування кодування були у версіонуванні. `-g 30` (GOP в одну секунду) і
`+faststart` обов'язкові; причини — в шапці скрипта.

Після заміни відео звірити тайм-коди в `story/slides.js` і `story/timing.js` та
прогнати `npm run preloader:fit`.

`-an` вирізає звукову доріжку. Кнопка звуку в шапці поки не підключена: щоб вона
запрацювала, потрібно прибрати `-an`, замінити атрибут `muted` у `Story.vue` на
прив'язку і присвоювати `video.muted` зі стану `soundOn`. Стартувати без звуку
обов'язково — браузер не дозволяє автозапуск зі звуком.

Еталонні кліпи `public/video/ref-*.mp4` (34 МБ) використовує лабораторія і
дев-сервер; вони потрапляють у збірку разом з `lab.html`.

## Трансформації

У кожного елемента 3D-ланцюга рівно один автор `transform`. Елементи, які анімує
GSAP, не мають CSS-`transform`; центрування виконують від'ємні маргіни. Порушення
цього правила призводить до того, що кеш трансформацій GSAP фіксує відсоткове
значення в пікселях.

Пошарова таблиця власності та перелік властивостей, що роблять 3D-сцену пласкою, —
у шапці `src/styles/_stage.scss`. Числові константи в `src/story/` отримані
вимірюванням еталонного відео та макета; пояснення до кожної — в коментарях поруч.
