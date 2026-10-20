/**
 * On-device check for 戳一戳 (poke).
 *
 * A real tap goes in through `adb shell input tap`, which produces the same pointer events a finger
 * does. Because a poke is a transient, the test runs the same tap twice — once on the cat, once on
 * empty background — and compares how much the cat moved in each case. Anything the poke does to
 * the body, an identical tap off the body cannot do.
 *
 * 捏一捏 (pinch) needs two fingers at once, which `adb shell input` cannot express and which CDP's
 * touch injection only sometimes accepts on this WebView, so the pinch is covered by the unit tests
 * in tests/interaction.test.ts and by hand on the device.
 *
 * Usage:
 *   node scripts/verify_poke.mjs [--serial <id>]
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, pickDevice } from './lib/device.mjs';

const CAT = { x: 60, y: 900, w: 960, h: 900 };   // the stage band the cat lives in

/** Centroid of everything that is not the flat stage, i.e. where the cat actually is right now.
 *  A preceding gesture can leave it somewhere else entirely, so taps aim at this, not at fixed pixels. */
function catCentre(img) {
  const { data, width } = img;
  const bg = (data[(940 * width + 30) * 4] << 16) + (data[(940 * width + 30) * 4 + 1] << 8) + data[(940 * width + 30) * 4 + 2];
  let sx = 0, sy = 0, n = 0;
  for (let y = CAT.y; y < CAT.y + CAT.h; y += 4) {
    for (let x = CAT.x; x < CAT.x + CAT.w; x += 4) {
      const i = (y * width + x) * 4;
      const value = (data[i] << 16) + (data[i + 1] << 8) + data[i + 2];
      if (Math.abs(value - bg) > 1500) { sx += x; sy += y; n++; }
    }
  }
  return n > 500 ? { x: Math.round(sx / n), y: Math.round(sy / n), pixels: n } : null;
}

async function main() {
  const serial = pickDevice();
  console.log('device', serial);
  const { adb, frame, diff, settle, ensureForeground, openApp } = connect(serial);
  await openApp();
  const dir = mkdtempSync(join(tmpdir(), 'squee-poke-'));

  const idle = await settle();
  console.log(`idle frame-to-frame change ${idle.toFixed(3)}`);

  /** Aims a gesture at a point given relative to the cat's current centre, and reports how much the
   *  cat moved. `where` picks the target: the cat itself, or empty stage well above it. */
  async function gestureAndMeasure(where, gesture, label) {
    await ensureForeground();
    await settle();
    const before = frame();
    const centre = catCentre(before);
    if (!centre) throw new Error('could not find the cat on screen');
    const at = where === 'cat'
      ? { x: centre.x, y: centre.y }
      : { x: centre.x, y: Math.max(120, centre.y - 620) };
    adb(['shell', 'input', ...gesture(at)]);
    let peak = 0;
    for (let i = 0; i < 6; i++) peak = Math.max(peak, diff(before, frame()));
    console.log(`  ${label} at (${at.x},${at.y}): peak ${peak.toFixed(2)}`);
    return peak;
  }

  // Positive control: if a plain drag does nothing, the harness is not talking to the app at all
  // (locked screen, app behind the launcher) and every number below would be meaningless.
  const control = await gestureAndMeasure('cat', (a) => ['swipe', String(a.x), String(a.y), String(a.x + 220), String(a.y - 270), '1200'], 'drag  (harness control)');
  if (control < 0.5) throw new Error(`a drag on the cat changed nothing (${control.toFixed(2)}) — the app is not on screen`);
  const onVoid = await gestureAndMeasure('void', (a) => ['tap', String(a.x), String(a.y)], 'tap on the background (noise)');
  const onCat = await gestureAndMeasure('cat', (a) => ['tap', String(a.x), String(a.y)], 'tap on the cat        (the test) ');

  console.log(`frames in ${dir}`);
  const floor = Math.max(onVoid * 2, idle * 8, 0.4);
  const ok = onCat > floor;
  console.log(ok ? `PASS — 戳一戳 moves the cat ${onCat.toFixed(1)} where a tap on the background moves it ${onVoid.toFixed(1)}`
                 : `FAIL — tap on the cat ${onCat.toFixed(2)}, tap on the background ${onVoid.toFixed(2)}, need > ${floor.toFixed(2)}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('error:', e.message); process.exit(2); });