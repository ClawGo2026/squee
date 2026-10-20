/**
 * End-to-end check for the 摇一摇 sensor path.
 *
 * A test cannot shake the phone by hand, so this injects the same `devicemotion` event the
 * accelerometer delivers (through the WebView's devtools socket) and watches the real screen to see
 * whether the cat actually tumbles. It covers the regression where 复原 rewound `sim.time` and left
 * the shake cooldown parked in the far future, so the sensor looked dead afterwards.
 *
 * Usage:
 *   node scripts/verify_shake.mjs [--serial <id>]
 *
 * Requires a debug build (android:debuggable): release APKs have no devtools socket.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, pickDevice, wait } from './lib/device.mjs';

const SHAKE = `(() => {
  const e = new Event('devicemotion');
  Object.defineProperty(e, 'acceleration', { value: { x: 22, y: 0, z: 0 } });
  window.dispatchEvent(e);
  return true;
})()`;
const RESET = `(() => { document.querySelector('#reset').click(); return true; })()`;

async function main() {
  const serial = pickDevice();
  console.log('device', serial);
  const { frame, diff, settle, ensureForeground, openApp } = connect(serial);
  const { client } = await openApp();
  mkdtempSync(join(tmpdir(), 'squee-shake-'));      // frames land beside the other checks

  // The cat drops and wobbles for a few seconds after launch; measuring against a moving baseline
  // buries every signal.
  const idle = await settle();
  console.log(`idle frame-to-frame change ${idle.toFixed(2)}`);

  /** Fires one shake and returns the largest change against the frame taken just before it.
   *  A screencap costs ~0.5s and a rock lasts 1s, so the first sample still lands mid-swing. */
  async function shake() {
    await ensureForeground();
    await settle();
    const before = frame();
    await client.evaluate(SHAKE);
    let peak = 0;
    for (let i = 0; i < 3; i++) peak = Math.max(peak, diff(before, frame()));
    return peak;
  }

  console.log('1. shake before any reset');
  const first = await shake();
  console.log('   peak', first.toFixed(2));

  await wait(3000);
  console.log('2. 复原, then shake again (the regression)');
  await ensureForeground();
  await client.evaluate(RESET);
  await wait(2500);
  const second = await shake();
  console.log('   peak', second.toFixed(2));

  client.close();
  // A rock tilts the whole body; a resting wobble only ripples the surface.
  const floor = Math.max(idle * 4, 0.5);
  const ok = first > floor && second > floor;
  console.log(ok ? 'PASS — 摇一摇 works before and after 复原'
                 : `FAIL — before ${first.toFixed(2)}, after ${second.toFixed(2)}, need > ${floor.toFixed(2)}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('error:', e.message); process.exit(2); });