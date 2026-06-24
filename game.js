// ============================================================
// Color Balloon — PixiJS v8
// ============================================================

const CFG = {
  W: 400, H: 700,
  BALLOON_X: 200, BALLOON_Y: 520,
  BALLOON_R: 16, HOLE_R: 22, WALL_H: 22,
  SPEED_INIT: 5, SPEED_MAX: 9, ACCEL: 0.0015,
  MAX_LIVES: 3, BLINK_FRAMES: 40,
  COMBO_INTERVAL: 5,
  C: {
    light: 0xf5f5f7, dark: 0x1d1d1f,
    wall: 0x3a3a3c,
    accent: 0x0a84ff, white: 0xffffff, black: 0x000000,
    ringLight: 0xc7c7cc, ringDark: 0x48484a,
    hiLight: 0x4a4a4a, hiDark: 0xffffff
  }
};
const C = CFG.C;

const overlay = document.getElementById('overlay');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');

function showOverlay(title, lines) {
  panelTitle.textContent = title;
  panelBody.innerHTML = lines.map(([text, cls]) =>
    `<div class="stat${cls ? ' ' + cls : ''}">${text}</div>`
  ).join('');
  overlay.style.display = 'flex'; setUIVisible(false);
}
function hideOverlay() { overlay.style.display = 'none'; setUIVisible(true); }
const uiEls = [];
function setUIVisible(v) { for (const e of uiEls) e.visible = v; }

async function main() {
  const app = new PIXI.Application();
  await app.init({
    width: CFG.W, height: CFG.H,
    background: '#1a1a1a',
    antialias: !('ontouchstart' in window),
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true
  });
  document.body.prepend(app.canvas);

  // --- Layers ---
  const bgLayer = new PIXI.Container();
  const wallLayer = new PIXI.Container();
  const balloonLayer = new PIXI.Container();
  const particleLayer = new PIXI.Container();
  const uiLayer = new PIXI.Container();
  app.stage.addChild(bgLayer, wallLayer, balloonLayer, particleLayer, uiLayer);

  // --- Graphics ---
  const particleGfx = new PIXI.Graphics();
  particleLayer.addChild(particleGfx);

  // --- Text ---
  const mkText = (size, color, x, y, align) => {
    const t = new PIXI.Text({
      text: '',
      style: { fontSize: size, fill: color, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: '700', align }
    });
    t.anchor.set(align === 'center' ? 0.5 : 0, 0.5);
    t.x = x; t.y = y;
    return t;
  };

  const scoreTxt = mkText(24, '#f5f5f7', CFG.W / 2, 28, 'center');
  const hiTxt = mkText(13, '#86868b', CFG.W / 2, 54, 'center');
  const livesTxt = mkText(20, '#f5f5f7', 20, 22, 'left');
  const comboTxt = mkText(16, '#f5f5f7', CFG.W / 2, 88, 'center');
  const multTxt = mkText(20, '#0a84ff', CFG.W / 2, 112, 'center');
  uiLayer.addChild(scoreTxt, hiTxt, livesTxt, comboTxt, multTxt);
  uiEls.push(scoreTxt, hiTxt, livesTxt, comboTxt, multTxt);

  // --- State ---
  const ST = { WAIT: 0, PLAY: 1, DYING: 2, OVER: 3 };
  let state = ST.WAIT;
  let speed = 0, score = 0, frame = 0, combo = 0, mult = 1, multTimer = 0;
  let lives = 3, blinkTimer = 0, lastWallColor = null, spawnTimer = 0;
  let bestCombo = 0;
  let shakeTimer = 0, shakeIntensity = 0;
  let balloonScale = 1;
  let highScore = parseInt(localStorage.getItem('cbHi')) || 0;
  hiTxt.text = `\u{1F3C6} ${highScore}`;

  // --- Pools ---
  let walls = [], particles = [];
  const wallPool = [];

  function getWall(y, color) {
    let w = wallPool.pop();
    if (!w) { w = { gfx: new PIXI.Graphics(), y: 0, color: '', h: CFG.WALL_H, holeR: CFG.HOLE_R, passed: false }; wallLayer.addChild(w.gfx); }
    w.y = y; w.color = color; w.passed = false;
    drawWall(w);
    return w;
  }
  function releaseWall(w) { w.gfx.visible = false; wallPool.push(w); }

  // --- Draw wall ---
  function drawWall(w) {
    const g = w.gfx;
    g.clear();
    const cx = CFG.BALLOON_X, hr = w.holeR, halfH = w.h / 2;
    g.rect(0, -halfH, cx - hr - 3, w.h).fill(C.wall);
    g.rect(cx + hr + 3, -halfH, CFG.W - cx - hr - 3, w.h).fill(C.wall);
    g.rect(0, -halfH, CFG.W, 4).fill(C.wall);
    g.rect(0, halfH - 4, CFG.W, 4).fill(C.wall);
    g.circle(cx, 0, hr + 2).stroke({ width: 4, color: w.color });
    g.circle(cx, 0, hr - 1).stroke({ width: 1.5, color: w.color === C.light ? C.ringLight : C.ringDark });
    g.x = 0; g.y = w.y;
    g.visible = true;
  }

  // --- Balloon ---
  const balloonGfx = new PIXI.Graphics();
  balloonLayer.addChild(balloonGfx);
  let balloonColor = C.light, balloonSway = 0;

  function drawBalloon() {
    const g = balloonGfx;
    g.clear();
    const r = CFG.BALLOON_R;
    const c = balloonColor;
    g.moveTo(1, r + 4).quadraticCurveTo(Math.sin(frame * .06) * 4 + 8, r + 16, Math.sin(frame * .06) * 4, r + 32)
      .stroke({ width: 1.5, color: C.light });
    g.moveTo(-3, r - 2).lineTo(3, r - 2).lineTo(1, r + 5).closePath().fill(c);
    g.circle(0, 0, r).fill(c).stroke({ width: 1.5, color: c === C.light ? C.light : C.ringDark });
    g.ellipse(-r * .3, -r * .3, r * .25, r * .3).fill({ color: c === C.light ? C.hiLight : C.hiDark, alpha: 0.35 });
    g.x = CFG.BALLOON_X; g.y = CFG.BALLOON_Y;
    g.scale.set(balloonScale);
    g.visible = true;
  }

  // --- Background stars ---
  const bgStars = [];
  const bgGfx = new PIXI.Graphics();
  bgLayer.addChild(bgGfx);
  for (let i = 0; i < 80; i++) {
    bgStars.push({
      x: Math.random() * CFG.W, y: Math.random() * CFG.H,
      r: .5 + Math.random() * 1.5,
      alpha: .1 + Math.random() * .3
    });
  }
  function drawBgStars() {
    bgGfx.clear();
    for (const s of bgStars) {
      bgGfx.circle(s.x, s.y, s.r).fill({ color: C.white, alpha: s.alpha });
    }
  }
  function updateBgStars(dt) {
    for (const s of bgStars) {
      s.y += speed * dt * .3;
      if (s.y > CFG.H + 5) { s.y = -5; s.x = Math.random() * CFG.W; }
    }
  }

  // --- Particles ---
  function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - .5) * 8,
        vy: (Math.random() - .5) * 8,
        life: 1,
        decay: .02 + Math.random() * .025,
        r: 2 + Math.random() * 3,
        color: color || (Math.random() > .5 ? C.light : C.dark)
      });
    }
  }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += .15; p.life -= p.decay;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
    }
  }
  function drawParticles() {
    particleGfx.clear();
    for (const p of particles) {
      particleGfx.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: Math.max(0, p.life) });
    }
  }

  // --- Spawning ---
  function spawnWall() {
    let color;
    if (lastWallColor && Math.random() < .8) color = lastWallColor === C.light ? C.dark : C.light;
    else color = Math.random() > .5 ? C.light : C.dark;
    lastWallColor = color;

    walls.push(getWall(-CFG.WALL_H, color));
  }

  // --- Collision ---
  function checkCollisions() {
    for (const w of walls) {
      if (w.passed) continue;
      const dist = Math.abs(CFG.BALLOON_Y - w.y);
      if (dist < CFG.BALLOON_R + w.h / 2 + 4) {
        w.passed = true;
        if (balloonColor !== w.color) return 'wrong';

        combo++;
        if (combo > bestCombo) bestCombo = combo;
        if (combo % CFG.COMBO_INTERVAL === 0) {
          spawnParticles(CFG.BALLOON_X, CFG.BALLOON_Y, 20);
          if (lives < CFG.MAX_LIVES) { lives++; updateLives(); bonusTimer = 60; }
        }
        if (combo >= 3 && mult === 1) { mult = 2; multTimer = 180; }
        if (combo >= 7 && mult < 3) { mult = 3; multTimer = 180; }
        if (combo >= 12 && mult < 4) { mult = 4; multTimer = 180; }
      }
    }
    return 'ok';
  }

  // --- UI update ---
  let bonusTimer = 0;
  function updateLives() {
    livesTxt.text = '\u2764\uFE0F'.repeat(lives);
  }

  // --- Reset ---
  function reset() {
    speed = CFG.SPEED_INIT; score = 0; frame = 0;
    combo = 0; mult = 1; multTimer = 0; bestCombo = 0;
    lives = CFG.MAX_LIVES; blinkTimer = 0;
    lastWallColor = null; spawnTimer = 0; bonusTimer = 0;
    balloonColor = C.light; balloonSway = 0;
    balloonGfx.visible = true; balloonScale = 1;
    shakeTimer = 0; shakeIntensity = 0;
    for (const w of walls) releaseWall(w);
    walls = []; particles = [];
    updateLives();
    scoreTxt.text = '0';
  }

  // --- Bonus text ---
  const bonusTxt = new PIXI.Text({
    text: 'BONUS +\u2764\uFE0F',
    style: { fontSize: 22, fill: '#0a84ff', fontFamily: 'Courier New', fontWeight: 'bold' }
  });
  bonusTxt.anchor.set(0.5);
  bonusTxt.x = CFG.W / 2; bonusTxt.y = 300;
  uiLayer.addChild(bonusTxt);

  // --- Game loop ---
  let blinkFrame = 0;

  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    frame += dt;

    if (state === ST.PLAY || state === ST.DYING) {
      updateBgStars(dt);
      drawBgStars();
    }

    if (state === ST.PLAY) {
      if (speed < CFG.SPEED_MAX) speed += CFG.ACCEL * dt;
      score += Math.round(speed * .3 * mult * dt);
      scoreTxt.text = score;

      if (multTimer > 0) { multTimer -= dt; if (multTimer <= 0) mult = 1; }
      if (bonusTimer > 0) bonusTimer -= dt;

      balloonSway = Math.sin(frame * .04) * 2.5;
      drawBalloon();

      spawnTimer += dt;
      const gap = Math.max(20, 45 - speed * 2);
      if (spawnTimer > gap + Math.random() * 20) { spawnWall(); spawnTimer = 0; }

      for (const w of walls) { w.y += speed * dt; w.gfx.y = w.y; w.gfx.alpha = .85 + Math.sin(frame * .08 + w.y * .02) * .15; }
      walls = walls.filter(w => { if (w.y > CFG.H + 60) { releaseWall(w); return false; } return true; });

      updateParticles();

      const result = checkCollisions();
      if (result === 'wrong') { state = ST.DYING; blinkTimer = CFG.BLINK_FRAMES; blinkFrame = 0; shakeTimer = 12; shakeIntensity = 6; }

      comboTxt.text = combo >= 3 ? `\u{1F525} ${combo}` : '';
      multTxt.text = mult > 1 && multTimer > 0 ? `x${mult}` : '';
    }
    else if (state === ST.DYING) {
      blinkTimer -= dt;
      blinkFrame += dt;
      balloonGfx.visible = Math.floor(blinkFrame / 4) % 2 === 0;
      if (balloonGfx.visible) drawBalloon();

      for (const w of walls) { w.y += speed * dt; w.gfx.y = w.y; w.gfx.alpha = .85 + Math.sin(frame * .08 + w.y * .02) * .15; }
      updateParticles();
      if (bonusTimer > 0) bonusTimer -= dt;

      if (blinkTimer <= 0) {
        spawnParticles(CFG.BALLOON_X + balloonSway, CFG.BALLOON_Y, 25);
        balloonGfx.visible = false;

        if (lives > 0) {
          lives--; combo = 0; mult = 1;
          updateLives();
          balloonSway = 0; balloonScale = 0;
          balloonGfx.visible = true;
          state = ST.PLAY;
        } else {
          if (score > highScore) {
            highScore = score;
            localStorage.setItem('cbHi', highScore);
            hiTxt.text = `\u{1F3C6} ${highScore}`;
          }
          state = ST.OVER;
          showOverlay(`\u{1F3C6} ${score}`, [
            [`\u{1F525} Best combo: ${bestCombo}`, 'sub'],
            ['Tap to restart', 'hint']
          ]);
        }
      }
    }
    else if (state === ST.OVER) {
      updateParticles();
    }

    bonusTxt.visible = bonusTimer > 0;
    if (bonusTimer > 0) bonusTxt.alpha = Math.min(1, bonusTimer / 30);

    drawParticles();

    if (shakeTimer > 0) {
      shakeTimer -= dt;
      const s = shakeIntensity * (shakeTimer / 12);
      app.stage.x = (Math.random() - .5) * s * 2;
      app.stage.y = (Math.random() - .5) * s * 2;
    } else {
      app.stage.x = 0; app.stage.y = 0;
    }

    if (balloonScale < 1) { balloonScale = Math.min(1, balloonScale + dt * .2); }
  });

  // --- Input ---
  function handleAction() {
    if (state === ST.WAIT) {
      reset(); hideOverlay(); state = ST.PLAY;
    } else if (state === ST.PLAY || state === ST.DYING) {
      balloonColor = balloonColor === C.light ? C.dark : C.light;
    } else if (state === ST.OVER) {
      reset(); hideOverlay(); state = ST.PLAY;
    }
  }

  function onAction(e) {
    if (e) e.preventDefault();
    handleAction();
  }
  overlay.addEventListener('pointerdown', onAction);
  app.canvas.addEventListener('pointerdown', onAction);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleAction(); }
  });

  // --- Start screen ---
  showOverlay('C Balloon', [
    ['Tap to change color', 'sub'],
    ['Tap to play', 'hint']
  ]);

  drawBalloon();
}

main();
