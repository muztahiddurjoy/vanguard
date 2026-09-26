# Portal: the Digital Legal Aid System's front page

One page for everyone who comes to DLAS. At the top is the legal aid hotline,
**+1 978 845 8907** (the number the Android app's SOS dials). A tap calls it, and on a computer
a button copies it. Below the hotline, each app has a card with an **Open** button and, under
the button, the address it opens:

| App                                   | Address                               |
| ------------------------------------- | ------------------------------------- |
| District Legal Aid Office             | `https://dlao.appbaksho.com/`         |
| Panel lawyer                          | `https://lawyer.appbaksho.com/`       |
| Court portal                          | `https://court.appbaksho.com/`        |
| Jail dashboard                        | `https://prison.appbaksho.com/`       |
| Digital Legal Aid (the legal aid app) | `https://legalaid.appbaksho.com/`     |
| Backend API (its reference)           | `https://dlas-api.appbaksho.com/docs` |

The NID registry isn't public, so it has no card. The citizen's Android app isn't on the page
either: it has no download address yet.

It looks like the dashboards. It uses their navy palette, Inter and Anek Bangla, their Lucide
marks, and their cards and buttons. Like them, it is in **English and বাংলা**, one at a time,
with the same toggle. The choice is stored under the same key (`dlas.lang`). In Bangla, the
number is shown in Bangla digits.

## Files

- `index.html` is the whole page: markup, styles and a small script, with no build step. The
  typefaces come from Google Fonts. Without them it falls back to the system's sans-serif.
- `favicon.svg` is the DLAO dashboard's scale mark.

## Try it

```bash
python3 -m http.server 8000 --directory portal   # http://localhost:8000
```

Any static server works. Copying the number needs a secure page (HTTPS or `localhost`). On
plain HTTP the copy button stays hidden. Without JavaScript, the page shows in English with
every link working.

## Changing it

- **The number:** the `tel:` link and its spoken name (`hotline.call`), the number shown
  in the page (`#hotline-number`), and `HOTLINE` / `HOTLINE_SHOWN` in the script.
- **An app's address:** its card's `href` and the `.card-url` text under the button.
- **Wording:** `MESSAGES` in the script holds both languages under the same keys. The English
  there must match the page's own text, which is what shows without the script.
