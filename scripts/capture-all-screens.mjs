import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('docs/ui-fidelity-screenshots/current');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function launchChrome() {
  const tmpDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_cdp_' + Date.now());
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    `--user-data-dir=${tmpDir}`,
  ]);

  return new Promise((resolve, reject) => {
    let started = false;
    const checkInterval = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        if (res.ok) {
          clearInterval(checkInterval);
          started = true;
          resolve(proc);
        }
      } catch {
        // keep polling
      }
    }, 200);

    setTimeout(() => {
      if (!started) {
        clearInterval(checkInterval);
        proc.kill();
        reject(new Error('Timeout launching Chrome'));
      }
    }, 10000);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = this.id++;
      this.callbacks.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Launching headless Chrome...');
  const chromeProc = await launchChrome();

  try {
    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const pages = await listRes.json();
    let page = pages.find((p) => p.type === 'page');
    if (!page) {
      const newTabRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:3000');
      page = await newTabRes.json();
    }

    console.log('Connecting to page:', page.webSocketDebuggerUrl);
    const client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // 1. Set mobile viewport 390 x 844
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log('Navigating to http://localhost:3000...');
    await client.send('Page.navigate', { url: 'http://localhost:3000' });
    await sleep(2500);

    // Screen 1: Figure 31 - QR Scan / Session Start
    console.log('Capturing Figure 31: QR Scan...');
    const shot1 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig31_qr_scan.png'), Buffer.from(shot1.data, 'base64'));

    // Authenticate session via Demo 103 token (matching approved designs Room 103)
    console.log('Authenticating session Room 103...');
    const demoTokenRes = await fetch('http://localhost:4300/foss/guest-sessions/demo-tokens');
    const demoData = await demoTokenRes.json();
    const token103 = demoData.tokens['103'] || demoData.tokens['Room 103 (Robert Frost)'] || Object.values(demoData.tokens)[0];

    await client.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const input = document.querySelector('input');
          if (input) {
            input.value = '${token103}';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const form = input.closest('form');
            if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        })()
      `,
      awaitPromise: true,
    });

    await sleep(3500);

    // Screen 2: Figure 32 - Menu Home
    console.log('Capturing Figure 32: Menu Home...');
    const shot2 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig32_menu_home.png'), Buffer.from(shot2.data, 'base64'));

    // Screen 3: Figure 33 - Menu Item Detail
    console.log('Opening Menu Item Detail...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('[role="button"]');
          for (const card of cards) {
            if (card.innerText.includes('Chicken') || card.innerText.includes('Kottu') || card.innerText.includes('LKR')) {
              card.click();
              return true;
            }
          }
          if (cards.length > 0) {
            cards[0].click();
            return true;
          }
          return false;
        })()
      `,
    });
    await sleep(2000);

    console.log('Capturing Figure 33: Menu Item Detail...');
    const shot3 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig33_item_detail.png'), Buffer.from(shot3.data, 'base64'));

    // Add to Cart
    console.log('Clicking Add to Cart...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const addBtn = btns.find(b => b.innerText.includes('Add to Cart'));
          if (addBtn) addBtn.click();
        })()
      `,
    });
    await sleep(2000);

    // Click View Cart
    console.log('Opening Cart View...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const cartBtn = btns.find(b => b.innerText.includes('View Cart'));
          if (cartBtn) cartBtn.click();
        })()
      `,
    });
    await sleep(2000);

    // Screen 4: Figure 34 - Cart + Allergy Notes
    console.log('Capturing Figure 34: Cart + Allergy Notes...');
    const shot4 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig34_cart.png'), Buffer.from(shot4.data, 'base64'));

    // Place Order
    console.log('Placing Order...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const placeBtn = btns.find(b => b.innerText.includes('Place Order'));
          if (placeBtn) placeBtn.click();
        })()
      `,
    });
    await sleep(3500);

    // Screen 5: Figure 35 - Order Confirmation
    console.log('Capturing Figure 35: Order Confirmation...');
    const shot5 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig35_confirmation.png'), Buffer.from(shot5.data, 'base64'));

    // Click Track Order Status
    console.log('Clicking Track Order Status...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const trackBtn = btns.find(b => b.innerText.includes('Track Order Status'));
          if (trackBtn) trackBtn.click();
        })()
      `,
    });
    await sleep(2500);

    // Screen 6: Figure 36 - Order Status Tracker
    console.log('Capturing Figure 36: Order Status Tracker...');
    const shot6 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig36_tracker.png'), Buffer.from(shot6.data, 'base64'));

    // Screen 7: Figure 37 - Order History (click Orders tab)
    console.log('Navigating to Orders Tab (Order History)...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const tab = document.getElementById('nav-tab-orders');
          if (tab) tab.click();
        })()
      `,
    });
    await sleep(2500);

    console.log('Capturing Figure 37: Order History...');
    const shot7 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig37_history.png'), Buffer.from(shot7.data, 'base64'));

    // Screen 8: Figure 38 - Service Request Form
    console.log('Navigating to Services Tab...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const tab = document.getElementById('nav-tab-services');
          if (tab) tab.click();
        })()
      `,
    });
    await sleep(2500);

    console.log('Capturing Figure 38: Service Request Form...');
    const shot8 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig38_services.png'), Buffer.from(shot8.data, 'base64'));

    // Screen 9: Figure 39 - Complaint Submission
    console.log('Navigating to Complaints Tab...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const tab = document.getElementById('nav-tab-complaints');
          if (tab) tab.click();
        })()
      `,
    });
    await sleep(2500);

    console.log('Capturing Figure 39: Complaint Submission...');
    const shot9 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'current_fig39_complaints.png'), Buffer.from(shot9.data, 'base64'));

    console.log('All 9 current screen screenshots successfully captured in:', OUTPUT_DIR);

    client.close();
  } finally {
    chromeProc.kill();
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
