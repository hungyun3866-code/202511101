let balloons = [];
let particles = [];
const colors = ['#ffffff', '#ffcad4', '#f4acb7', '#9d8189'];
const NUM_BALLOONS = 40; // 氣球數量
const BURST_RATE = 0.02; // (保留常數，但不再用於隨機爆破)

let score = 0; // 分數

// 新增：Web Audio 上下文（延後建立/resume，避免無預警自動播放被瀏覽器阻擋）
let audioCtx = null;
function ensureAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

// 新增：簡短爆破音效（結合短暫噪音與震盪器）
function playPop(volume = 0.18) {
    try {
        const ctx = ensureAudioContext();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
        og.gain.setValueAtTime(0.0001, now);
        og.gain.exponentialRampToValueAtTime(volume, now + 0.003);
        og.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(og);
        og.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);

        const noiseLen = Math.max(0.03, 0.06);
        const bufferSize = Math.floor(noiseLen * ctx.sampleRate);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const nf = ctx.createBiquadFilter();
        nf.type = 'highpass';
        nf.frequency.value = 1200;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(volume * 0.6, now);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + noiseLen);
        noise.connect(nf);
        nf.connect(ng);
        ng.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + noiseLen);
    } catch (e) {
        // 靜默忽略
    }
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    noStroke();
    rectMode(CENTER);
    balloons = [];
    for (let i = 0; i < NUM_BALLOONS; i++) {
        balloons.push(spawnBalloon(true));
    }
    background('#dedbd2');
}

function draw() {
    background('#dedbd2');

    // 左上顯示固定文字
    noStroke();
    fill('#432818');
    textSize(32);
    textAlign(LEFT, TOP);
    text('414730860', 10, 10);

    // 右上顯示分數
    textAlign(RIGHT, TOP);
    text(String(score), width - 10, 10);

    // 更新與繪製氣球
    for (let i = balloons.length - 1; i >= 0; i--) {
        let b = balloons[i];

        if (b.alive) {
            noStroke();
            fill(colorAlpha(b.color, b.alpha));
            ellipse(b.x, b.y, b.diameter);

            // 右上方方形（中心點落在右上 1/4 的中間）
            noStroke();
            let sqSize = b.diameter / 6;
            let sqCenterX = b.x + b.diameter * 0.25;
            let sqCenterY = b.y - b.diameter * 0.25;
            fill(255, 180);
            rect(sqCenterX, sqCenterY, sqSize, sqSize);

            // 上浮（速度加快）
            b.y -= b.speed;

            // 若超出上方邊界則重新生成到下方
            if (b.y < -b.diameter / 2) {
                respawnBalloon(b);
            }

            // 已移除自動隨機爆破（僅以滑鼠點擊爆破）
        } else {
            // 已爆破，等到 respawnAt 時間到再重生
            if (millis() >= b.respawnAt) {
                Object.assign(b, spawnBalloon(false));
            }
        }
    }

    // 更新與繪製粒子（爆破碎片）
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.vy += 0.03;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        p.life--;

        noStroke();
        fill(colorAlpha(p.color, p.alpha));
        ellipse(p.x, p.y, p.size);

        if (p.alpha <= 0 || p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// 產生一顆氣球物件
function spawnBalloon(fromSetup = true) {
    let d = random(50, 200);
    return {
        x: random(width),
        y: fromSetup ? random(height) : height + d / 2 + random(0, height * 0.2),
        diameter: d,
        color: random(colors),
        alpha: random(120, 255),
        speed: random(1.0, 2.2),
        alive: true,
        respawnAt: 0
    };
}

function respawnBalloon(b) {
    let newB = spawnBalloon(false);
    Object.assign(b, newB);
}

// 氣球爆破：生成多個碎片，設定氣球為非 alive 並排程重生
function burstBalloon(b) {
    let count = floor(random(12, 28));
    for (let i = 0; i < count; i++) {
        let angle = random(TWO_PI);
        let speed = random(1, 5) * (0.6 + (b.diameter / 140));
        particles.push({
            x: b.x + cos(angle) * random(4, b.diameter * 0.4),
            y: b.y + sin(angle) * random(4, b.diameter * 0.4),
            vx: cos(angle) * speed + random(-0.6, 0.6),
            vy: sin(angle) * speed * 0.8 + random(-1.2, 0.6),
            size: random(4, 12),
            color: b.color,
            alpha: random(180, 255),
            decay: random(1.4, 3.0),
            life: floor(random(40, 100))
        });
    }

    // 播放爆破音，音量依圓大小調整
    const vol = Math.min(0.5, 0.08 + (b.diameter / 200) * 0.35);
    playPop(vol);

    b.alive = false;
    b.respawnAt = millis() + random(800, 2800);
}

// 鼠標點擊能手動爆破最接近的氣球（且計分）
function mousePressed() {
    // 嘗試啟動 audio context（某些瀏覽器需要互動）
    ensureAudioContext();

    let nearest = null;
    let distSq = Infinity;
    for (let b of balloons) {
        if (!b.alive) continue;
        let dx = mouseX - b.x;
        let dy = mouseY - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < distSq) {
            distSq = d2;
            nearest = b;
        }
    }
    if (nearest && distSq < (nearest.diameter * nearest.diameter) * 0.64) {
        // 命中，計分：按到 #ffcad4 加 1，其他顏色扣 1
        if (nearest.color === '#ffcad4') {
            score += 1;
        } else {
            score -= 1;
        }
        burstBalloon(nearest);
    }
}

// 工具函式：將 hex 顏色與透明度結合
function colorAlpha(hex, alpha) {
    let c = color(hex);
    c.setAlpha(alpha);
    return c;
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    for (let b of balloons) {
        b.x = random(width);
        b.y = random(height);
    }
}
