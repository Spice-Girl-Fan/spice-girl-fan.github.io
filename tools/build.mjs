#!/usr/bin/env node
// Encrypts the private sources into the public site, or decrypts them back.
//
//   SITE_KEY=<key> node tools/build.mjs build  [privateDir]   # private/ -> data/, audio/
//   SITE_KEY=<key> node tools/build.mjs unpack [privateDir]   # data/, audio/ -> private/
//                  node tools/build.mjs stamp                # re-version asset links after code edits
//
// The key is read from the SITE_KEY environment variable only. Never commit it.
// File format: 12-byte IV, then AES-128-GCM ciphertext with the 16-byte tag appended
// (the layout Web Crypto expects).

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd = 'build', dirArg = 'private'] = process.argv.slice(2);
const priv = resolve(root, dirArg);

const keyText = (process.env.SITE_KEY || '').trim();
const key = Buffer.from(keyText, 'base64url');
if (cmd !== 'stamp' && key.length !== 16) {
  console.error('Set SITE_KEY to the 22-character key from the QR link (the part after #).');
  process.exit(1);
}

const encrypt = (buf) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-128-gcm', key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
};
const decrypt = (buf) => {
  const d = createDecipheriv('aes-128-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
};
const out = (rel, buf) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
  console.log(`  wrote ${rel} (${buf.length.toLocaleString()} bytes)`);
};

function parseQuestions(text) {
  return text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l, i) => {
      // "[reveal] question | answer | wrong | wrong" shows only the wrong answers
      // first; picking one reveals the real answer.
      const reveal = l.startsWith('[reveal]');
      const parts = l.replace(/^\[reveal\]\s*/, '').split('|').map((s) => s.trim());
      if (reveal) {
        if (parts.length < 3) throw new Error(`questions.txt line ${i + 1}: a reveal question needs an answer and at least one wrong option`);
        return { q: parts, reveal: true };
      }
      if (parts.length !== 5) throw new Error(`questions.txt line ${i + 1}: expected 5 fields`);
      return parts;
    });
}

// Version the asset links in index.html by content hash, so a browser never pairs a
// fresh page with a stale cached script or stylesheet (GitHub Pages caches for 10 min).
function stampAssets() {
  const htmlPath = join(root, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  for (const asset of ['assets/style.css', 'assets/app.js']) {
    const v = createHash('sha256').update(readFileSync(join(root, asset))).digest('hex').slice(0, 10);
    html = html.replace(new RegExp(`${asset.replace(/[.]/g, '\\.')}(\\?v=[0-9a-f]*)?"`), `${asset}?v=${v}"`);
  }
  writeFileSync(htmlPath, html);
  console.log('  stamped asset versions in index.html');
}

if (cmd === 'stamp') {
  stampAssets();
  process.exit(0);
}

if (cmd === 'build') {
  const questions = parseQuestions(readFileSync(join(priv, 'questions.txt'), 'utf8'));
  const tracks = JSON.parse(readFileSync(join(priv, 'tracks.json'), 'utf8'));

  // Audio: private/audio/<n>.mp3 -> audio/<n>.bin, linked to track n (1-based).
  const audioDir = join(priv, 'audio');
  tracks.forEach((t, i) => {
    const mp3 = join(audioDir, `${i + 1}.mp3`);
    if (existsSync(mp3)) {
      const rel = `audio/${i + 1}.bin`;
      const plain = readFileSync(mp3);
      let same = false;
      try { same = existsSync(join(root, rel)) && decrypt(readFileSync(join(root, rel))).equals(plain); } catch { /* re-encrypt */ }
      if (same) console.log(`  kept ${rel} (unchanged)`);
      else out(rel, encrypt(plain));
      t.src = rel;
    } else {
      t.src = null;
    }
  });

  const cardsFile = join(priv, 'cards.json');
  // cards.json is either a list of cards or { title, cards } (title = heading on the card backs).
  const cardsJson = existsSync(cardsFile) ? JSON.parse(readFileSync(cardsFile, 'utf8')) : [];
  const cards = Array.isArray(cardsJson) ? cardsJson : cardsJson.cards || [];
  const cardsTitle = Array.isArray(cardsJson) ? '' : cardsJson.title || '';
  // Each card is { from, message }; a plain string is a message with no name.
  cards.forEach((c, i) => { if (typeof c === 'string') cards[i] = { from: '', message: c }; });
  const content = { questions, tracks, cards, cardsTitle };
  out('data/content.bin', encrypt(Buffer.from(JSON.stringify(content), 'utf8')));
  // Images: business card front (intro) and the blank front used on the wish cards.
  for (const [src, rel] of [['card-front.png', 'data/card.bin'], ['wish-front.png', 'data/wish.bin']]) {
    if (!existsSync(join(priv, src))) continue;
    const img = readFileSync(join(priv, src));
    let same = false;
    try { same = decrypt(readFileSync(join(root, rel))).equals(img); } catch { /* re-encrypt */ }
    if (same) console.log(`  kept ${rel} (unchanged)`);
    else out(rel, encrypt(img));
  }
  stampAssets();
  console.log(`Built ${questions.length} questions, ${cards.length} cards, ${tracks.filter((t) => t.src).length}/${tracks.length} tracks with audio.`);
} else if (cmd === 'unpack') {
  mkdirSync(join(priv, 'audio'), { recursive: true });
  const content = JSON.parse(decrypt(readFileSync(join(root, 'data/content.bin'))).toString('utf8'));
  writeFileSync(join(priv, 'questions.txt'),
    '# Format: question | correct answer | wrong | wrong | wrong\n' +
    content.questions.map((q) => (Array.isArray(q) ? q.join(' | ') : `[reveal] ${q.q.join(' | ')}`)).join('\n') + '\n');
  writeFileSync(join(priv, 'tracks.json'), JSON.stringify(content.tracks.map((t) => ({ ...t, src: null })), null, 2) + '\n');
  writeFileSync(join(priv, 'cards.json'), JSON.stringify({ title: content.cardsTitle || '', cards: content.cards || [] }, null, 2) + '\n');
  writeFileSync(join(priv, 'card-front.png'), decrypt(readFileSync(join(root, 'data/card.bin'))));
  if (existsSync(join(root, 'data/wish.bin'))) writeFileSync(join(priv, 'wish-front.png'), decrypt(readFileSync(join(root, 'data/wish.bin'))));
  if (existsSync(join(root, 'audio'))) {
    for (const f of readdirSync(join(root, 'audio')).filter((f) => f.endsWith('.bin'))) {
      writeFileSync(join(priv, 'audio', f.replace(/\.bin$/, '.mp3')), decrypt(readFileSync(join(root, 'audio', f))));
    }
  }
  console.log(`Unpacked into ${priv}`);
} else {
  console.error('Usage: node tools/build.mjs build|unpack [privateDir]');
  process.exit(1);
}
