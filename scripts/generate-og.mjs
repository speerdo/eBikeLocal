import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: #0a0f1a;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    position: relative;
  }
  /* Circuit grid */
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(143,214,0,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(143,214,0,0.04) 1px, transparent 1px);
    background-size: 40px 40px;
  }
  /* Glow blobs */
  .glow-1 {
    position: absolute; top: -80px; right: 100px;
    width: 400px; height: 400px; border-radius: 50%;
    background: rgba(143,214,0,0.07);
    filter: blur(80px);
  }
  .glow-2 {
    position: absolute; bottom: -60px; left: 200px;
    width: 300px; height: 300px; border-radius: 50%;
    background: rgba(99,190,255,0.05);
    filter: blur(60px);
  }
  /* Bottom volt bar */
  .volt-bar {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 4px;
    background: linear-gradient(90deg, transparent, #8fd600 30%, #63beff 70%, transparent);
  }
  /* Content */
  .content {
    position: relative; z-index: 10;
    display: flex; flex-direction: column; justify-content: center;
    height: 100%; padding: 70px 90px;
  }
  .eyebrow {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 28px;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #8fd600; }
  .eyebrow-text {
    font-size: 13px; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: #8fd600;
  }
  h1 {
    font-size: 72px; font-weight: 800; line-height: 1.05;
    color: #ffffff; letter-spacing: -0.02em; margin-bottom: 24px;
  }
  h1 span.volt { color: #8fd600; }
  h1 span.blue { color: #63beff; }
  .sub {
    font-size: 22px; font-weight: 400; color: #6b7a9a; line-height: 1.4;
    max-width: 560px;
  }
  .stats {
    display: flex; gap: 40px; margin-top: 44px;
  }
  .stat-val {
    font-size: 28px; font-weight: 800; color: #8fd600;
  }
  .stat-lbl {
    font-size: 12px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: #4a566e; margin-top: 2px;
  }
  /* Logo mark top-right */
  .logo {
    position: absolute; top: 48px; right: 72px;
    display: flex; align-items: center; gap: 12px;
  }
  .logo-icon {
    width: 48px; height: 48px; border-radius: 14px;
    background: #111827; border: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
  }
  .logo-text { font-size: 22px; font-weight: 800; }
  .logo-text .ebike { color: #ffffff; }
  .logo-text .local { color: #8fd600; }
  .logo-sub {
    font-size: 10px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: #4a566e; margin-top: 2px;
  }
</style>
</head>
<body>
<div class="grid"></div>
<div class="glow-1"></div>
<div class="glow-2"></div>
<div class="volt-bar"></div>

<!-- Logo -->
<div class="logo">
  <div class="logo-icon">
    <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
      <circle cx="7" cy="22" r="4.5" stroke="#8fd600" stroke-width="1.8" fill="none"/>
      <circle cx="25" cy="22" r="4.5" stroke="#8fd600" stroke-width="1.8" fill="none"/>
      <path d="M7 22 L15.5 12 L25 22" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
      <path d="M15.5 12 L17.5 22" stroke="white" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
      <path d="M15 7 L12.5 11.5 L15.5 11.5 L13 16.5 L19.5 10 L16 10 L18 7 Z" fill="#8fd600"/>
    </svg>
  </div>
  <div>
    <div class="logo-text"><span class="ebike">eBike</span><span class="local">Local</span></div>
    <div class="logo-sub">Find · Compare · Ride</div>
  </div>
</div>

<!-- Main content -->
<div class="content">
  <div class="eyebrow">
    <div class="dot"></div>
    <span class="eyebrow-text">The eBike Dealer Directory</span>
  </div>

  <h1>Find Local <span class="volt">eBike</span><br><span class="blue">Shops</span> Near You</h1>

  <p class="sub">Brand-level dealer data from 15+ manufacturers.<br>See exactly which brands each shop carries.</p>

  <div class="stats">
    <div>
      <div class="stat-val">8,000+</div>
      <div class="stat-lbl">eBike Shops</div>
    </div>
    <div>
      <div class="stat-val">15+</div>
      <div class="stat-lbl">Brands Tracked</div>
    </div>
    <div>
      <div class="stat-val">1,500+</div>
      <div class="stat-lbl">Cities Covered</div>
    </div>
  </div>
</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(html, { waitUntil: 'networkidle' });
const buf = await page.screenshot({ type: 'png' });
await browser.close();
writeFileSync('/home/adam/Projects/eBikeLocal/public/og-default.png', buf);
console.log('OG image written:', buf.length, 'bytes');
