import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetFolder = process.argv[2] || 'docs/ui-fidelity-screenshots/corrected';
const prefix = process.argv[3] || 'corrected_';
const width = parseInt(process.argv[4] || '390', 10);
const height = parseInt(process.argv[5] || '844', 10);
const OUTPUT_DIR = path.resolve(targetFolder);

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

    const client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log('Navigating to http://localhost:3000...');
    await client.send('Page.navigate', { url: 'http://localhost:3000' });
    await sleep(2500);

    // Capture Screen 1: Figure 31
    console.log('Capturing Figure 31: QR Scan...');
    const shot1 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig31_qr_scan.png`), Buffer.from(shot1.data, 'base64'));

    // Click 'Quick demo access codes'
    console.log('Clicking Quick demo access codes...');
    const clickQuick = await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const quick = btns.find(b => b.innerText.includes('Quick demo'));
          if (quick) {
            quick.click();
            return true;
          }
          return false;
        })()
      `,
    });
    console.log('Click quick result:', clickQuick);
    await sleep(1000);

    // Click Room 103 demo chip
    console.log('Clicking Room 103 button...');
    const click103 = await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn103 = btns.find(b => b.innerText.trim() === '103' || b.innerText.includes('103'));
          if (btn103) {
            btn103.click();
            return btn103.innerText;
          }
          return 'NOT_FOUND: ' + btns.map(b => b.innerText).join(', ');
        })()
      `,
    });
    console.log('Click 103 result:', click103);
    await sleep(3500);

    // Verify page state
    const pageState = await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            h1: document.querySelector('h1')?.innerText,
            header: document.querySelector('header')?.innerText,
            hasTabs: Boolean(document.getElementById('nav-tab-menu')),
            firstItem: document.querySelector('[role="feed"]')?.innerText?.slice(0, 100)
          };
        })()
      `,
    });
    console.log('Page state after 103 login:', pageState);

    // Screen 2: Figure 32 - Menu Home
    console.log('Capturing Figure 32: Menu Home...');
    const shot2 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig32_menu_home.png`), Buffer.from(shot2.data, 'base64'));

    // Screen 3: Figure 33 - Menu Item Detail
    console.log('Clicking first menu item card...');
    const clickedItem = await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const card = document.querySelector('[data-testid="menu-item-card"]') ||
            document.querySelector('[role="feed"] [role="button"]');
          if (card) {
            card.click();
            return card.innerText.slice(0, 50);
          }
          return 'NO_CARD';
        })()
      `,
    });
    console.log('Clicked item:', clickedItem);
    await sleep(2000);

    console.log('Capturing Figure 33: Item Detail...');
    const shot3 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig33_item_detail.png`), Buffer.from(shot3.data, 'base64'));

    // Click Add to Cart
    console.log('Clicking Add to Cart...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const add = btns.find(b => b.innerText.includes('Add to Cart'));
          if (add) {
            add.click();
            return true;
          }
          return false;
        })()
      `,
    });
    await sleep(2000);

    // Click View Cart
    console.log('Opening View Cart...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const cart = btns.find(b => b.innerText.includes('View Cart'));
          if (cart) {
            cart.click();
            return true;
          }
          return false;
        })()
      `,
    });
    await sleep(2000);

    // Screen 4: Figure 34 - Cart
    console.log('Capturing Figure 34: Cart...');
    const shot4 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig34_cart.png`), Buffer.from(shot4.data, 'base64'));

    // Click Place Order
    console.log('Clicking Place Order...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const place = btns.find(b => b.innerText.includes('Place Order'));
          if (place) {
            place.click();
            return true;
          }
          return false;
        })()
      `,
    });
    await sleep(3500);

    // Screen 5: Figure 35 - Order Confirmation
    console.log('Capturing Figure 35: Order Confirmation...');
    const shot5 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig35_confirmation.png`), Buffer.from(shot5.data, 'base64'));

    // Click Track Order Status
    console.log('Clicking Track Order Status...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const track = btns.find(b => b.innerText.includes('Track Order Status'));
          if (track) {
            track.click();
            return true;
          }
          return false;
        })()
      `,
    });
    await sleep(2500);

    // Screen 6: Figure 36 - Order Status Tracker
    console.log('Capturing Figure 36: Order Status Tracker...');
    const shot6 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig36_tracker.png`), Buffer.from(shot6.data, 'base64'));

    // Click Orders tab (Order History)
    console.log('Navigating to Orders tab...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const tab = document.getElementById('nav-tab-orders');
          if (tab) tab.click();
        })()
      `,
    });
    await sleep(2500);

    // Screen 7: Figure 37 - Order History
    console.log('Capturing Figure 37: Order History...');
    const shot7 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig37_history.png`), Buffer.from(shot7.data, 'base64'));

    // Click Service tab
    console.log('Navigating to Service tab...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const tab = document.getElementById('nav-tab-services');
          if (tab) tab.click();
        })()
      `,
    });
    await sleep(2500);

    // Screen 8: Figure 38 - Service Request Form
    console.log('Capturing Figure 38: Service Request Form...');
    const shot8 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig38_services.png`), Buffer.from(shot8.data, 'base64'));

    // Click Complaints tab
    console.log('Navigating to Complaints tab...');
    await client.send('Runtime.evaluate', {
      expression: `
        (() => {
          const tab = document.getElementById('nav-tab-complaints');
          if (tab) tab.click();
        })()
      `,
    });
    await sleep(2500);

    // Screen 9: Figure 39 - Complaints Submission
    console.log('Capturing Figure 39: Complaints Submission...');
    const shot9 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTPUT_DIR, `${prefix}fig39_complaints.png`), Buffer.from(shot9.data, 'base64'));

    console.log('SUCCESS: All 9 screenshots captured in:', OUTPUT_DIR);

    client.close();
  } finally {
    chromeProc.kill();
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
