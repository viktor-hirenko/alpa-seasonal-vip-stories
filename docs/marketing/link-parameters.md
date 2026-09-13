# Alpa Seasonal VIP Stories — link parameters

How to build the link that opens a player's personal season story.

The story is one page; everything a player sees inside the journal comes from
the query string on that link. Nothing is looked up server-side, so a parameter
that is not on the link does not exist for that player.

**Source of truth for names and types:** `src/story/params.js`. This document is
that table in prose; if the two ever disagree, the code is right and this file
is stale.

---

## Shape of a link

```
https://<host>/vip-stories/?user_language=de&user_currency=EUR
  &name=Marianna
  &days=257&points=1200000&level=GOLD
  &total_wins=2222577
  &biggest_win=222257&biggest_win_game=Dragon+Coins+Jackpot
  &biggest_win_game_thunbnail=https://cdn.example.com/games/dragon-coins.png
  &top_multiplier=2257&top_multiplier_game=Tiger+Jackpots
  &favorite_game_name=Tiger+Jackpots
  &favorite_game_thunbnail=https://cdn.example.com/games/tiger.png
  &bonuses=2572257&sports_wins=2572257&sports_multiplier=257
  &final_link=https://example.com/promotions/andromeda
```

Rules that apply to every parameter:

- **Spaces.** Send `+` or `%20`; both arrive as a space. A literal plus sign in
  a game name must be sent as `%2B`.
- **Ampersands and equals signs inside a value** must be percent-encoded
  (`%26`, `%3D`), or the link will be cut short at that point.
- **An absent parameter and an empty one mean the same thing:** the value is
  missing. Sending `days=` is the same as not sending `days`.
- **Unknown parameters are ignored.** Campaign tracking (`utm_*` and friends)
  can be appended freely.
- **Case matters** for parameter names, not for `level` (`gold`, `Gold` and
  `GOLD` all work).

---

## Language and currency

| Parameter       | Values                 | Notes                                                         |
| --------------- | ---------------------- | ------------------------------------------------------------- |
| `user_language` | `en` `fr` `de` `it`    | Preferred. Also accepts `de-DE` style codes.                  |
| `language`      | same                   | Same thing; `user_language` wins if both are sent.            |
| `lang`          | same                   | Shorthand, used by the internal preview lab. Lowest priority. |
| `user_currency` | e.g. `EUR` `USD` `CAD` | Shown as a three-letter code next to money values.            |
| `currency`      | same                   | `user_currency` wins if both are sent.                        |

If no language is sent, the story uses the browser's language when it is one of
the four, and English otherwise. If no currency is sent it shows **USD**.

Anything outside the four languages falls back to English rather than failing —
a typo in `user_language` will not blank the story.

---

## The pages and what each one needs

Each row is one page of the journal. **"Gates the page"** means the page has
nothing to say without that parameter — see _Missing values_ below.

| #     | Page                  | Parameter                       | Type         | Gates the page              |
| ----- | --------------------- | ------------------------------- | ------------ | --------------------------- |
| 1     | Cover                 | `name`                          | text         | no                          |
| 2     | Editor's Note         | `name`                          | text         | no                          |
| 3     | Days in the Spotlight | `days`                          | whole number | **yes**                     |
| 4     | Seasonal Power        | `points`                        | whole number | **yes**                     |
| 5     | VIP Status            | `level`                         | see below    | **yes**                     |
| 6     | Money Talks           | `total_wins`                    | whole number | **yes**                     |
| 7     | Headline Win          | `biggest_win`                   | whole number | **yes**                     |
| 7     | Headline Win          | `biggest_win_game`              | text         | no                          |
| 7     | Headline Win          | `biggest_win_game_thunbnail`    | image URL    | no                          |
| 8     | Multiplier Moment     | `top_multiplier`                | number       | **yes**                     |
| 8     | Multiplier Moment     | `top_multiplier_game`           | text         | no                          |
| 8     | Multiplier Moment     | `top_multiplier_game_thunbnail` | image URL    | no                          |
| 9     | Player's Pick         | `favorite_game_name`            | text         | **yes**                     |
| 9     | Player's Pick         | `favorite_game_thunbnail`       | image URL    | (either one)                |
| 10    | Bonus Report          | `bonuses`                       | whole number | **yes**                     |
| 11    | Sports Desk           | `sports_wins`                   | whole number | **yes**                     |
| 12    | Top Sport Signal      | `sports_multiplier`             | number       | **yes**                     |
| 14    | Space Milk            | `days`                          | whole number | no (re-uses page 3's value) |
| 16    | Gift                  | `promocode`                     | text         | no                          |
| 16    | Gift                  | `bonus_label`                   | text         | no                          |
| 16/17 | Gift, Final           | `final_link`                    | URL          | no                          |

Pages 13 (Sponsor), 15 (Joke) and 17 (Final) carry no personal data.

### `level`

One of `IRON`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND`, or `REGULAR`.

`REGULAR` currently shows the **Iron** badge, matching Thor season 2. Any other
value is treated as no level at all, and a warning is logged in the browser
console.

Level names are product nouns and are **not translated** — a German player also
sees "Gold".

### Numbers

- Send them plain: `1200000`, not `1 200 000` and not `1,200,000`. Grouping is
  applied by the story, in the typography the design calls for.
- A decimal comma is accepted (`1234,56`), because some back ends send it that
  way.
- Money values are rounded to whole units. Multipliers may carry up to two
  decimals.
- Negative values are treated as missing.

### Image URLs

`*_thunbnail` (yes, spelled that way — see below) must be a full `http://` or
`https://` URL. Anything else is ignored.

If the image fails to load — a blocked CDN domain for that player, a dead link —
the card falls back to showing the game's name instead of a broken image. That
is why it is worth sending `*_game` / `favorite_game_name` even when you are
sending a thumbnail.

### `final_link`

Where the player is sent when they close the story or reach the end. Must be a
full `http(s)` URL. If it is missing, closing the story just closes it.

---

## `thunbnail` is misspelt on purpose

`favorite_game_thunbnail` has a typo in it. It is the name already used by the
existing Thor VIP Stories links and by the campaign templates built on them, so
renaming it would silently drop the thumbnail on every link already scheduled.

Alpa has **three** game thumbnails where Thor had one. The two new ones copy the
same misspelling so that all three read alike:

- `favorite_game_thunbnail`
- `biggest_win_game_thunbnail`
- `top_multiplier_game_thunbnail`

---

## Missing values

A page whose gating parameter is missing (or zero) has nothing to say: "your
biggest win: 0" is not a page worth showing anyone.

**What happens:** the page is not shown at all. The journal turns straight from
the page before it to the page after, and the story gets shorter by the seconds
that page would have taken — about four and a half each. Nothing is left blank
and no sentence is left half-finished.

Ten pages work this way: Days in the Spotlight, Seasonal Power, VIP Status,
Money Talks, Headline Win, Multiplier Moment, Player's Pick, Bonus Report,
Sports Desk and Top Sport Signal. The cover, the editor's note and the whole
closing run (sponsor, Space Milk, the joke, the gift, the final page) are always
shown — they say nothing about a player's numbers, so there is nothing to drop.

A player with none of the ten gets a story of about 51 seconds instead of 94:
cover, editor's note, and the closing run.

**What this means for you:** you do not need a separate link variant for players
who are missing something. Send the parameters you have; leave out the ones you
do not. Sending `sports_wins=0` and leaving `sports_wins` out mean the same
thing — the page is dropped either way.

⚠️ **One thing to be careful about.** A typo in a parameter name now costs a
page rather than showing a blank one. `bigest_win=5000` does not fill Headline
Win — it drops it, silently, and the story is a page shorter. Check a link by
opening it before a campaign goes out, and count the steps in the bar at the
top: one per page.

---

## Partial links — worked examples

Every parameter is optional. Send what you have; the pages you cannot fill are
not shown and the story is shorter by them.

**Everything (17 pages, 94 seconds):**

```
https://<host>/vip-stories/?user_language=en&user_currency=EUR&name=Marianna
  &days=257&points=1200000&level=GOLD&total_wins=2222577
  &biggest_win=222257&biggest_win_game=Dragon+Coins
  &top_multiplier=2257&top_multiplier_game=Tiger+Jackpots
  &favorite_game_name=Tiger+Jackpots
  &bonuses=2572257&sports_wins=2572257&sports_multiplier=257
  &final_link=https://example.com/x
```

**A player who does not bet on sport (15 pages, 87 seconds)** — Sports Desk and
Top Sport Signal are dropped:

```
https://<host>/vip-stories/?user_language=en&user_currency=EUR&name=Marianna
  &days=257&points=1200000&level=GOLD&total_wins=2222577
  &biggest_win=222257&biggest_win_game=Dragon+Coins
  &top_multiplier=2257&top_multiplier_game=Tiger+Jackpots
  &favorite_game_name=Tiger+Jackpots&bonuses=2572257
  &final_link=https://example.com/x
```

**A player with no wins to show (13 pages, 76 seconds)** — Money Talks,
Headline Win, Multiplier Moment and Player's Pick are dropped:

```
https://<host>/vip-stories/?user_language=en&user_currency=EUR&name=Marianna
  &days=257&points=1200000&level=GOLD
  &bonuses=2572257&sports_wins=2572257&sports_multiplier=257
  &final_link=https://example.com/x
```

**A brand-new player, name only (7 pages, 51 seconds)** — all ten data pages are
dropped; the cover, the editor's note and the closing run remain:

```
https://<host>/vip-stories/?user_language=en&name=Marianna
  &final_link=https://example.com/x
```

A story this short is still a story: it greets the player by name, shows the
sponsor, the joke, the gift and the final page with both buttons.

---

## Checking a link before sending it

Open the link with the browser console visible. The story logs a warning for:

- a parameter name it does not recognise (usually a typo);
- a `level` value that is not one of the seven;
- a missing translation key.

There is no server-side validation, so a link that looks right and shows the
right numbers is right.
