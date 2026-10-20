/**
 * Shared plumbing for the on-device checks: adb access, PNG decoding, real-screen diffing and a
 * WebView devtools client.
 *
 * `Page.captureScreenshot` is no use in this WebView — it comes back without the WebGPU canvas — so
 * every frame comes from `adb exec-out screencap` and is compared in process.
 */
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

/** `adb` is resolved from PATH; override with the ADB env var when platform-tools lives elsewhere. */
export const ADB = process.env.ADB ?? (process.platform === 'win32' ? 'adb.exe' : 'adb');
export const PACKAGE = 'me.copycat.squee.debug';
export const ACTIVITY = 'me.copycat.squee.MainActivity';
/** The cat only, away from the status bar clock and the flavour capsule. */
export const CAT = { x: 60, y: 900, w: 960, h: 900 };

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function pickDevice(argv = process.argv) {
  const i = argv.indexOf('--serial');
  if (i > 0) return argv[i + 1];
  const lines = execFileSync(ADB, ['devices'], { encoding: 'utf8' })
    .split('\n').slice(1).map((l) => l.trim()).filter((l) => l.endsWith('device'));
  if (lines.length !== 1) throw new Error(`expected exactly one device, found ${lines.length}`);
  return lines[0].split(/\s+/)[0];
}

export function connect(serial) {
  const adb = (args) => execFileSync(ADB, ['-s', serial, ...args], { encoding: 'buffer', maxBuffer: 1 << 28 });
  const adbText = (args) => adb(args).toString('utf8').trim();
  const frame = () => decodePng(adb(['exec-out', 'screencap', '-p']));
  /** Mean absolute difference over the cat area; a deformation moves far more than a resting wobble. */
  const diff = (a, b, crop = CAT) => {
    let sum = 0, n = 0;
    for (let y = 0; y < crop.h; y += 3) {
      for (let x = 0; x < crop.w; x += 3) {
        const i = ((crop.y + y) * a.width + (crop.x + x)) * 4;
        sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        n += 3;
      }
    }
    return sum / n;
  };
  /**
   * Waits until the screen stops changing. The pudding drops and wobbles for a few seconds after
   * launch, and measuring against a moving baseline buries every gesture signal.
   */
  async function settle(quiet = 0.25, tries = 24) {
    let previous = frame();
    for (let i = 0; i < tries; i++) {
      const next = frame();
      const delta = diff(previous, next);
      previous = next;
      if (delta < quiet) return delta;
    }
    return diff(previous, frame());
  }
  const foreground = () => {
    const top = adbText(['shell', 'dumpsys', 'activity', 'activities'])
      .split(String.fromCharCode(10)).find((line) => line.includes('topResumedActivity=')) ?? '';
    return top.includes(`${PACKAGE}/`);
  };
  /** Brings the app back if anything (a stray key event, the launcher) stole focus. Gestures aimed at
   *  the launcher are silently harmless, so every gesture re-checks before it fires. */
  async function ensureForeground() {
    for (let attempt = 0; attempt < 4 && !foreground(); attempt++) {
      adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
      adb(['shell', 'wm', 'dismiss-keyguard']);
      adb(['shell', 'am', 'start', '-n', `${PACKAGE}/${ACTIVITY}`]);
      await wait(1500);
    }
    if (!foreground()) throw new Error(`${PACKAGE} is not in the foreground`);
  }
  /** Launches the app and returns a devtools client attached to its page. */
  async function openApp({ settle = 9000 } = {}) {
    adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
    adb(['shell', 'wm', 'dismiss-keyguard']);        // a locked screen swallows every tap
    adb(['shell', 'am', 'force-stop', PACKAGE]);
    adb(['shell', 'am', 'start', '-n', `${PACKAGE}/${ACTIVITY}`]);
    // A tap that lands on the launcher instead of the cat silently measures nothing, so wait for the
    // app to actually be in front before going near it.
    // A freshly installed package can take a moment to be launchable at all, and the screen may
    // still be coming back from off; keep nudging it rather than failing on the first try.
    for (let i = 0; i < 30; i++) {
      await wait(500);
      if (foreground()) break;
      if (i % 6 === 5) adb(['shell', 'am', 'start', '-n', `${PACKAGE}/${ACTIVITY}`]);
      if (i === 29) throw new Error(`${PACKAGE} never came to the foreground`);
    }
    await wait(settle);
    const socket = adbText(['shell', 'cat', '/proc/net/unix']).match(/webview_devtools_remote_\d+/)?.[0];
    if (!socket) throw new Error('no webview devtools socket (debug build required?)');
    adb(['forward', 'tcp:9222', `localabstract:${socket}`]);
    const page = (await (await fetch('http://127.0.0.1:9222/json')).json())
      .find((t) => t.type === 'page' && t.url.includes('appassets'));
    if (!page) throw new Error('app page not found in devtools targets');
    const client = new Devtools(page.webSocketDebuggerUrl);
    await client.open();
    await client.send('Runtime.enable');
    return { adb, adbText, frame, diff, client };
  }
  return { adb, adbText, frame, diff, settle, foreground, ensureForeground, openApp };
}

/** Minimal PNG reader for 8-bit RGBA (what both Chrome and screencap emit). */
export function decodePng(buffer) {
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos), type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG (depth ${bitDepth}, type ${colorType})`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

export class Devtools {
  constructor(url) { this.url = url; this.id = 0; this.waiting = new Map(); }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((ok, bad) => {
      this.ws.onopen = ok;
      this.ws.onerror = () => bad(new Error('devtools socket refused'));
    });
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data), slot = this.waiting.get(msg.id);
      if (slot) { this.waiting.delete(msg.id); msg.error ? slot.bad(new Error(msg.error.message)) : slot.ok(msg.result); }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, bad) => {
      // A dead target would otherwise hang the whole run.
      // The first Input.* call on a busy WebView renderer can take a while to answer.
      const budget = method.startsWith('Input.') ? 25000 : 8000;
      const timer = setTimeout(() => { this.waiting.delete(id); bad(new Error(`${method} timed out`)); }, budget);
      this.waiting.set(id, { ok: (v) => { clearTimeout(timer); ok(v); }, bad: (e) => { clearTimeout(timer); bad(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  /**
   * Multi-touch through the same path a real finger takes; WebView turns these into pointer events.
   * Touch emulation has to be on or the first dispatch never comes back on this WebView.
   */
  async touch(type, points) {
    if (!this.touching) {
      this.touching = true;
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' }).catch(() => {});
      await this.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
    }
    await this.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 12, radiusY: 12, force: 1 })),
    });
  }
  close() { this.ws.close(); }
}