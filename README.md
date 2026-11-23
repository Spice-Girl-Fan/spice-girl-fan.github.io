# Question of the day

A small static site for GitHub Pages. Scanning the QR code on the business card opens it.
Each day there's a new fun question, and a correct answer unlocks three songs.

Everything personal is encrypted with AES-128-GCM: the question bank, the song list, the
songs and the card image. The key is only in the QR code link, after the `#`. Browsers never
send that part to the server, so the files in this repo can't be read without the card.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | The page, styles and logic |
| `data/content.bin` | Encrypted questions and track list |
| `data/card.bin` | Encrypted front of the card, used by the intro animation |
| `audio/<n>.bin` | Encrypted MP3s |
| `tools/build.mjs` | Encrypts `private/` into the files above, or unpacks them again |
| `private/` | Plaintext sources. **Git ignores this folder; never commit it.** |

## Editing content

You need Node 18+ and the key from the QR link (the 22 characters after `#`).
Pass the key as an environment variable. Never write it into a file in this repo.

```bash
# Get the plaintext sources back from the encrypted files (creates private/)
SITE_KEY=<key> node tools/build.mjs unpack

# Edit private/questions.txt, private/tracks.json, or private/audio/1.mp3 … 3.mp3, then:
SITE_KEY=<key> node tools/build.mjs build
```

`questions.txt` has one question per line: `question | correct | wrong | wrong | wrong`.
Line order is day order: line 1 is Day 1 (`START` in `assets/app.js`), line 2 is Day 2, and so on.
The site shuffles the answers. After the last line it starts again from the top.

After editing `assets/app.js` or `assets/style.css`, run `node tools/build.mjs stamp` (no key needed).
It updates the `?v=` version on the asset links in `index.html`, so phones never mix a new page
with an old cached script. `build` does this automatically.

To preview the page without the intro, add `?nointro` before the `#`.
