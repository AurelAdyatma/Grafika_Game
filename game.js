/**
 * ============================================================================
 * TUGAS GRAFIKA GAME - IMPLEMENTASI KAMERA 2D, CULLING & PARALLAX
 * ============================================================================
 * Rubrik Spesifikasi:
 * 1. Scene: 480 x 640 (Canvas Viewport)
 * 2. World: >= 480 x 1200 (Implementasi: 640 x 1600)
 * 3. Satu Player (Pesawat kontrol WASD/Panah, Laser, Partikel)
 * 4. >= 30 Asteroid (Implementasi: Default 35 Asteroid acak)
 * 5. Camera Follow: Mengikuti pergerakan player di tengah layar
 * 6. Clamp Kamera: Mencegah kamera keluar dari batas World (0..worldWidth, 0..worldHeight)
 * 7. isVisible(): Frustum culling deteksi apakah entitas berada di dalam viewport kamera
 * 8. Counter Drawn / Skipped: Menghitung objek yang dirender vs objek yang di-cull
 * 9. Lifecycle Filtering: Membersihkan entitas non-aktif (isAlive === false) dari array
 * 10. HUD di Screen Space: Render UI tanpa terpengaruh translasi kamera
 * 11. Opsi Parallax Dua Lapis: Background bintang jauh & dekat dengan opsi ON / OFF
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. KONSTANTA & KONFIGURASI
// ----------------------------------------------------------------------------
const SCENE_WIDTH = 480;       // Ukuran Scene (Canvas Viewport)
const SCENE_HEIGHT = 640;
const WORLD_WIDTH = 640;       // Ukuran World (>= 480x1200)
const WORLD_HEIGHT = 1600;

const DEFAULT_ASTEROID_COUNT = 35; // >= 30 Asteroid

// ----------------------------------------------------------------------------
// 2. SISTEM AUDIO EFEK (Web Audio API Synthesizer - Bebas dependensi eksternal)
// ----------------------------------------------------------------------------
class SoundSystem {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  }

  playLaser() {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch (e) {}
  }

  playExplosion() {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // White noise explosion
      const bufferSize = this.ctx.sampleRate * 0.25;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.25);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
    } catch (e) {}
  }
}

// ----------------------------------------------------------------------------
// 3. KELAS KAMERA (FOLLOW & CLAMP)
// ----------------------------------------------------------------------------
class Camera {
  constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // Koordinat kamera merepresentasikan sudut kiri-atas (Top-Left) viewport di koordinat world
    this.x = 0;
    this.y = 0;

    // Status clamp untuk visualisasi HUD
    this.isClampedLeft = false;
    this.isClampedRight = false;
    this.isClampedTop = false;
    this.isClampedBottom = false;

    // Kehalusan gerakan kamera (lerp factor: 0.1 untuk smooth follow, 1.0 untuk instant)
    this.smoothFactor = 0.12;
  }

  /**
   * Mengikuti target (Player) dan menjaga target berada di tengah viewport
   */
  follow(target, smooth = true) {
    // Posisi ideal agar target berada persis di tengah layar
    const desiredX = target.x - this.viewportWidth / 2;
    const desiredY = target.y - this.viewportHeight / 2;

    if (smooth) {
      this.x += (desiredX - this.x) * this.smoothFactor;
      this.y += (desiredY - this.y) * this.smoothFactor;
    } else {
      this.x = desiredX;
      this.y = desiredY;
    }

    // CLAMP KAMERA: Batasi kamera agar TIDAK BISA melihat keluar dari batas World!
    this.clamp();
  }

  /**
   * Clamp Kamera: Memastikan viewport kamera tetap di dalam [0, 0, worldWidth, worldHeight]
   */
  clamp() {
    const maxX = this.worldWidth - this.viewportWidth;
    const maxY = this.worldHeight - this.viewportHeight;

    // Reset status clamp
    this.isClampedLeft = this.x <= 0;
    this.isClampedRight = this.x >= maxX;
    this.isClampedTop = this.y <= 0;
    this.isClampedBottom = this.y >= maxY;

    // Clamp sumbu X
    if (this.x < 0) this.x = 0;
    else if (this.x > maxX) this.x = maxX;

    // Clamp sumbu Y
    if (this.y < 0) this.y = 0;
    else if (this.y > maxY) this.y = maxY;
  }

  /**
   * Terapkan translasi kamera ke canvas 2D context
   */
  applyTransform(ctx) {
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  }
}

// ----------------------------------------------------------------------------
// 4. PARALLAX DUA LAPIS (FAR & NEAR STARFIELD)
// ----------------------------------------------------------------------------
class ParallaxBackground {
  constructor(worldWidth, worldHeight, sceneWidth, sceneHeight) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.sceneWidth = sceneWidth;
    this.sceneHeight = sceneHeight;
    this.enabled = true; // Opsi mengaktifkan / menonaktifkan parallax dua lapis

    // Lapisan 1: Bintang Jauh (Deep Space Stars & Nebulae)
    // Bergerak lebih lambat (kecepatan 0.15x dari kamera)
    this.layer1Factor = 0.15;
    this.layer1Stars = [];
    const layer1Count = 120;
    for (let i = 0; i < layer1Count; i++) {
      this.layer1Stars.push({
        x: Math.random() * (sceneWidth * 2),
        y: Math.random() * (sceneHeight * 2),
        radius: Math.random() * 1.2 + 0.6,
        alpha: Math.random() * 0.5 + 0.3,
        color: Math.random() > 0.5 ? '#7dd3fc' : '#c084fc'
      });
    }

    // Lapisan 2: Bintang Dekat / Space Dust
    // Bergerak lebih cepat (kecepatan 0.40x dari kamera)
    this.layer2Factor = 0.40;
    this.layer2Stars = [];
    const layer2Count = 80;
    for (let i = 0; i < layer2Count; i++) {
      this.layer2Stars.push({
        x: Math.random() * (sceneWidth * 2),
        y: Math.random() * (sceneHeight * 2),
        radius: Math.random() * 1.8 + 1.2,
        alpha: Math.random() * 0.6 + 0.4,
        color: '#ffffff'
      });
    }

    // Nebula spots untuk estetika sci-fi
    this.nebulae = [
      { x: 300, y: 400, r: 180, color: 'rgba(147, 51, 234, 0.12)' },
      { x: 150, y: 900, r: 220, color: 'rgba(6, 182, 212, 0.10)' },
      { x: 450, y: 1300, r: 200, color: 'rgba(59, 130, 246, 0.12)' }
    ];
  }

  draw(ctx, camera) {
    // 1. Background dasar gelap
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, this.sceneWidth, this.sceneHeight);

    // Hitung offset translasi parallax berdasarkan kamera
    const offsetX1 = this.enabled ? -(camera.x * this.layer1Factor) : 0;
    const offsetY1 = this.enabled ? -(camera.y * this.layer1Factor) : 0;

    const offsetX2 = this.enabled ? -(camera.x * this.layer2Factor) : 0;
    const offsetY2 = this.enabled ? -(camera.y * this.layer2Factor) : 0;

    // --- LAPISAN 1: Bintang Jauh (Deep Space Layer) ---
    ctx.save();
    const wrapW = this.sceneWidth * 1.5;
    const wrapH = this.sceneHeight * 1.5;

    for (const star of this.layer1Stars) {
      // Modulo looping seamless saat kamera bergerak
      let sx = (star.x + offsetX1) % wrapW;
      let sy = (star.y + offsetY1) % wrapH;
      if (sx < 0) sx += wrapW;
      if (sy < 0) sy += wrapH;

      ctx.fillStyle = star.color;
      ctx.globalAlpha = star.alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // --- LAPISAN 2: Bintang Dekat & Debu Kosmik (Nearer Layer) ---
    ctx.save();
    for (const star of this.layer2Stars) {
      let sx = (star.x + offsetX2) % wrapW;
      let sy = (star.y + offsetY2) % wrapH;
      if (sx < 0) sx += wrapW;
      if (sy < 0) sy += wrapH;

      ctx.fillStyle = star.color;
      ctx.globalAlpha = star.alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, star.radius, 0, Math.PI * 2);
      ctx.fill();

      // Efek kilau bintang dekat
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.arc(sx, sy, star.radius * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Render nebula di world space
  drawWorldNebulae(ctx) {
    ctx.save();
    for (const neb of this.nebulae) {
      const grad = ctx.createRadialGradient(neb.x, neb.y, 10, neb.x, neb.y, neb.r);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// 5. KELAS PARTICLES & LASER (UNTUK EFEK DAN PENGUJIAN LIFECYCLE)
// ----------------------------------------------------------------------------
class Particle {
  constructor(x, y, vx, vy, color, radius, lifeTime) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.radius = radius;
    this.maxLife = lifeTime;
    this.currentLife = lifeTime;
    this.isAlive = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.currentLife -= dt;
    if (this.currentLife <= 0) {
      this.isAlive = false; // Lifecycle state: mati
    }
  }

  draw(ctx) {
    const alpha = Math.max(0, this.currentLife / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Laser {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.speed = 650;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.angle = angle;
    this.radius = 4;
    this.lifeTime = 2.0; // Detik sebelum despawn
    this.isAlive = true;  // Lifecycle flag
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifeTime -= dt;

    // Despawn jika keluar dari batas World atau waktu habis
    if (this.lifeTime <= 0 ||
        this.x < 0 || this.x > WORLD_WIDTH ||
        this.y < 0 || this.y > WORLD_HEIGHT) {
      this.isAlive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.fillRect(-10, -2, 20, 4);

    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// 6. KELAS PLAYER (SATU PLAYER)
// ----------------------------------------------------------------------------
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 18;
    this.speed = 280;
    this.vx = 0;
    this.vy = 0;
    this.friction = 0.88;
    this.angle = -Math.PI / 2; // Menghadap ke atas
    this.isAlive = true;
    this.fireCooldown = 0;
  }

  update(dt, inputState, worldWidth, worldHeight, spawnParticleCallback) {
    // Input pergerakan
    let moveX = 0;
    let moveY = 0;

    if (inputState.keys['KeyW'] || inputState.keys['ArrowUp']) moveY -= 1;
    if (inputState.keys['KeyS'] || inputState.keys['ArrowDown']) moveY += 1;
    if (inputState.keys['KeyA'] || inputState.keys['ArrowLeft']) moveX -= 1;
    if (inputState.keys['KeyD'] || inputState.keys['ArrowRight']) moveX += 1;

    // Normalisasi vektor arah
    const len = Math.hypot(moveX, moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
      this.vx += moveX * this.speed * 4 * dt;
      this.vy += moveY * this.speed * 4 * dt;

      // Rotasi pesawat mengikuti arah pergerakan
      const targetAngle = Math.atan2(moveY, moveX);
      this.angle = targetAngle;

      // Partikel thruster di belakang pesawat
      if (Math.random() < 0.6) {
        const exhaustAngle = this.angle + Math.PI + (Math.random() - 0.5) * 0.4;
        const pSpeed = Math.random() * 80 + 40;
        spawnParticleCallback(
          this.x - Math.cos(this.angle) * 14,
          this.y - Math.sin(this.angle) * 14,
          Math.cos(exhaustAngle) * pSpeed,
          Math.sin(exhaustAngle) * pSpeed,
          Math.random() > 0.4 ? '#00f0ff' : '#f59e0b',
          Math.random() * 3 + 2,
          0.35
        );
      }
    }

    // Terapkan perlambatan (friction)
    this.vx *= Math.pow(this.friction, dt * 60);
    this.vy *= Math.pow(this.friction, dt * 60);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // CLAMP PLAYER di batas World
    if (this.x < this.radius) { this.x = this.radius; this.vx = 0; }
    if (this.x > worldWidth - this.radius) { this.x = worldWidth - this.radius; this.vx = 0; }
    if (this.y < this.radius) { this.y = this.radius; this.vy = 0; }
    if (this.y > worldHeight - this.radius) { this.y = worldHeight - this.radius; this.vy = 0; }

    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const time = performance.now() / 1000;

    // Glowing alien aura di sekeliling UFO
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 15;

    // 1. Piringan Luar UFO (Outer Flying Saucer Disc)
    const hullGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 21);
    hullGrad.addColorStop(0, '#1e293b');
    hullGrad.addColorStop(0.65, '#0f172a');
    hullGrad.addColorStop(1, '#020617');

    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Lampu Navigasi Perimeter Melingkar (Perimeter LED Lights yang berputar/berkedip)
    const numLights = 6;
    for (let i = 0; i < numLights; i++) {
      const lightAngle = (i / numLights) * Math.PI * 2 + time * 2.5;
      const lx = Math.cos(lightAngle) * 15;
      const ly = Math.sin(lightAngle) * 11.5;

      const lightColor = (i % 2 === 0) ? '#00f0ff' : '#10b981';
      ctx.fillStyle = lightColor;
      ctx.shadowColor = lightColor;
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(lx, ly, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Emitter / Moncong Laser Depan (Menandakan arah hadap tembakan UFO)
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, -3);
    ctx.lineTo(21, 0);
    ctx.lineTo(17, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Cincin Reaktor Plasma Tengah
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Kubah Kokpit Kaca UFO (Central Glowing Glass Dome)
    const domeGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
    domeGrad.addColorStop(0, '#67e8f9');
    domeGrad.addColorStop(0.5, '#06b6d4');
    domeGrad.addColorStop(1, '#0e7490');

    ctx.fillStyle = domeGrad;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Refleksi / Kilau Kaca Kubah
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(-2, -2.5, 3.5, 2, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// 7. KELAS ASTEROID (>= 30 ASTEROID DENGAN isVisible & LIFECYCLE)
// ----------------------------------------------------------------------------
class Asteroid {
  constructor(id, x, y, radius) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.radius = radius || (Math.random() * 22 + 16); // Ukuran variatif: 16 - 38 px
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.8;
    this.vx = (Math.random() - 0.5) * 25;
    this.vy = (Math.random() - 0.5) * 25;

    // Status Lifecycle: aktif atau hancur
    this.isAlive = true;
    this.maxHp = Math.round(this.radius / 10);
    this.hp = this.maxHp;

    // Bentuk prosedural poligon tidak beraturan agar menyerupai batu angkasa asli
    this.vertices = [];
    const numPoints = Math.floor(Math.random() * 4) + 8; // 8-11 sudut
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const r = this.radius * (0.8 + Math.random() * 0.4);
      this.vertices.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r
      });
    }

    // Variasi warna asteroid
    const gray = Math.floor(Math.random() * 30 + 70);
    this.color = `rgb(${gray}, ${gray + 10}, ${gray + 25})`;
    this.strokeColor = `rgb(${gray + 40}, ${gray + 50}, ${gray + 70})`;

    // Kawah (craters)
    this.craters = [];
    const craterCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < craterCount; i++) {
      this.craters.push({
        x: (Math.random() - 0.5) * this.radius * 0.9,
        y: (Math.random() - 0.5) * this.radius * 0.9,
        r: Math.random() * (this.radius * 0.25) + 3
      });
    }
  }

  update(dt, worldWidth, worldHeight) {
    if (!this.isAlive) return;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;

    // Pantulkan dari batas world
    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx = Math.abs(this.vx);
    } else if (this.x + this.radius > worldWidth) {
      this.x = worldWidth - this.radius;
      this.vx = -Math.abs(this.vx);
    }

    if (this.y - this.radius < 0) {
      this.y = this.radius;
      this.vy = Math.abs(this.vy);
    } else if (this.y + this.radius > worldHeight) {
      this.y = worldHeight - this.radius;
      this.vy = -Math.abs(this.vy);
    }
  }

  /**
   * =========================================================================
   * METODE isVisible() - FRUSTUM CULLING
   * =========================================================================
   * Menentukan apakah asteroid terlihat di dalam viewport kamera (Scene).
   * Menghitung AABB / Bounding Circle intersection dengan kamera.
   * Return: boolean (true jika masuk layar/frustum, false jika di luar)
   * =========================================================================
   */
  isVisible(camera, viewportWidth = SCENE_WIDTH, viewportHeight = SCENE_HEIGHT) {
    const camLeft = camera.x;
    const camRight = camera.x + viewportWidth;
    const camTop = camera.y;
    const camBottom = camera.y + viewportHeight;

    // Periksa apakah bounding box asteroid berpotongan dengan viewport kamera
    return (
      this.x + this.radius >= camLeft &&
      this.x - this.radius <= camRight &&
      this.y + this.radius >= camTop &&
      this.y - this.radius <= camBottom
    );
  }

  draw(ctx, camera, isDebug = false) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Gambar Poligon Asteroid
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
    for (let i = 1; i < this.vertices.length; i++) {
      ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gambar Kawah
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (const c of this.craters) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    // Debug: Gambar Bounding Circle & Label ID jika opsi debug aktif
    if (isDebug) {
      ctx.save();
      ctx.strokeStyle = '#10b981'; // Hijau jika terdeteksi oleh isVisible() dan dirender
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#6ee7b7';
      ctx.font = '9px monospace';
      ctx.fillText(`#${this.id}`, this.x - 8, this.y - this.radius - 3);
      ctx.restore();
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.isAlive = false; // Menandai entitas ini mati untuk lifecycle filtering
      return true; // Hancur
    }
    return false;
  }
}

// ----------------------------------------------------------------------------
// 8. FUNGSI GLOBAL isVisible() SESUAI RUBRIK
// ----------------------------------------------------------------------------
/**
 * Implementasi fungsi isVisible(entity, camera) sesuai permintaan rubrik
 */
function isVisible(entity, camera) {
  if (typeof entity.isVisible === 'function') {
    return entity.isVisible(camera);
  }
  const radius = entity.radius || 15;
  return (
    entity.x + radius >= camera.x &&
    entity.x - radius <= camera.x + SCENE_WIDTH &&
    entity.y + radius >= camera.y &&
    entity.y - radius <= camera.y + SCENE_HEIGHT
  );
}

// ----------------------------------------------------------------------------
// 9. GAME ENGINE UTAMA & KELAS MANAGEMENT
// ----------------------------------------------------------------------------
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Pastikan ukuran canvas tepat sesuai rubrik: 480x640
    this.canvas.width = SCENE_WIDTH;
    this.canvas.height = SCENE_HEIGHT;

    // Inisialisasi Audio
    this.sound = new SoundSystem();

    // Inisialisasi Kamera (Scene 480x640, World 640x1600 >= 480x1200)
    this.camera = new Camera(SCENE_WIDTH, SCENE_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);

    // Inisialisasi Parallax Background Dua Lapis
    this.parallax = new ParallaxBackground(WORLD_WIDTH, WORLD_HEIGHT, SCENE_WIDTH, SCENE_HEIGHT);

    // Entitas Player
    this.player = new Player(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

    // Kumpulan Entitas
    this.asteroids = [];
    this.lasers = [];
    this.particles = [];

    // Statistik & Telemetri Real-time
    this.drawnCount = 0;
    this.skippedCount = 0;
    this.totalFilteredDestroyed = 0; // Menghitung berapa entitas yang telah dihapus oleh Lifecycle Filtering
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();

    // Debug Flags
    this.isDebugBoundingBox = true;

    // Status Input
    this.inputState = {
      keys: {},
      mouse: { x: 0, y: 0, isDown: false }
    };

    // Binding DOM Elements
    this.bindDOM();

    // Spawn Awal: Minimal 35 Asteroid (Memenuhi >= 30 Asteroid)
    this.spawnAsteroids(DEFAULT_ASTEROID_COUNT);

    // Waktu Loop
    this.lastTime = performance.now();

    // Inisialisasi Event Listener
    this.initEvents();

    // Mulai Game Loop
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  /**
   * Spawn asteroid dengan penyebaran merata di seluruh World
   */
  spawnAsteroids(count, append = false) {
    if (!append) {
      this.asteroids = [];
    }
    const currentMaxId = this.asteroids.length;

    for (let i = 0; i < count; i++) {
      let x, y, dist;
      // Beri jarak aman dari spawn player agar tidak langsung bertabrakan
      let attempts = 0;
      do {
        x = Math.random() * (WORLD_WIDTH - 80) + 40;
        y = Math.random() * (WORLD_HEIGHT - 80) + 40;
        dist = Math.hypot(x - this.player.x, y - this.player.y);
        attempts++;
      } while (dist < 120 && attempts < 20);

      this.asteroids.push(new Asteroid(currentMaxId + i + 1, x, y));
    }
  }

  /**
   * Spawn partikel ledakan saat asteroid hancur
   */
  spawnExplosion(x, y, count = 18, color = '#f59e0b') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 180 + 30;
      const pColor = Math.random() > 0.4 ? color : (Math.random() > 0.5 ? '#ef4444' : '#fbbf24');
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        pColor,
        Math.random() * 4 + 2,
        Math.random() * 0.6 + 0.3
      ));
    }
  }

  /**
   * =========================================================================
   * METODE LIFECYCLE FILTERING
   * =========================================================================
   * Membersihkan entitas yang sudah mati / non-aktif (isAlive === false)
   * dari memori array secara konsisten setiap frame.
   * =========================================================================
   */
  filterLifecycle() {
    // 1. Filter Asteroids
    const prevAsteroidCount = this.asteroids.length;
    this.asteroids = this.asteroids.filter(asteroid => asteroid.isAlive === true);
    const removedAsteroids = prevAsteroidCount - this.asteroids.length;
    this.totalFilteredDestroyed += removedAsteroids;

    // 2. Filter Lasers
    this.lasers = this.lasers.filter(laser => laser.isAlive === true);

    // 3. Filter Particles
    this.particles = this.particles.filter(particle => particle.isAlive === true);
  }

  /**
   * Menembak laser dari player
   */
  firePlayerLaser() {
    if (this.player.fireCooldown <= 0) {
      const tipX = this.player.x + Math.cos(this.player.angle) * 18;
      const tipY = this.player.y + Math.sin(this.player.angle) * 18;
      this.lasers.push(new Laser(tipX, tipY, this.player.angle));
      this.player.fireCooldown = 0.18; // 180ms jeda tembak
      this.sound.playLaser();
    }
  }

  /**
   * Hancurkan 1 asteroid secara acak untuk menguji lifecycle filtering secara instan
   */
  destroyRandomAsteroid() {
    if (this.asteroids.length === 0) return;
    const randomIndex = Math.floor(Math.random() * this.asteroids.length);
    const target = this.asteroids[randomIndex];
    target.isAlive = false; // Ditandai mati untuk lifecycle filter
    this.spawnExplosion(target.x, target.y, 25, '#ef4444');
    this.sound.playExplosion();
  }

  /**
   * Hubungkan tombol dan kontrol HTML dengan logic game
   */
  bindDOM() {
    const toggleParallax = document.getElementById('toggleParallax');
    const toggleDebug = document.getElementById('toggleDebug');
    const toggleAudio = document.getElementById('toggleAudio');
    const btnDestroyRandom = document.getElementById('btnDestroyRandom');
    const btnRespawn = document.getElementById('btnRespawn');
    const btnAddAsteroids = document.getElementById('btnAddAsteroids');

    if (toggleParallax) {
      toggleParallax.checked = this.parallax.enabled;
      toggleParallax.addEventListener('change', (e) => {
        this.parallax.enabled = e.target.checked;
      });
    }

    if (toggleDebug) {
      toggleDebug.checked = this.isDebugBoundingBox;
      toggleDebug.addEventListener('change', (e) => {
        this.isDebugBoundingBox = e.target.checked;
      });
    }

    if (toggleAudio) {
      toggleAudio.checked = this.sound.enabled;
      toggleAudio.addEventListener('change', (e) => {
        this.sound.enabled = e.target.checked;
      });
    }

    if (btnDestroyRandom) {
      btnDestroyRandom.addEventListener('click', () => {
        this.sound.init();
        this.destroyRandomAsteroid();
      });
    }

    if (btnRespawn) {
      btnRespawn.addEventListener('click', () => {
        this.spawnAsteroids(DEFAULT_ASTEROID_COUNT, false);
      });
    }

    if (btnAddAsteroids) {
      btnAddAsteroids.addEventListener('click', () => {
        this.spawnAsteroids(10, true);
      });
    }

    // Mirror telemetri elemen
    this.domTelDrawn = document.getElementById('telDrawn');
    this.domTelSkipped = document.getElementById('telSkipped');
    this.domTelTotal = document.getElementById('telTotal');
    this.domTelDestroyed = document.getElementById('telDestroyed');
    this.domTelClampX = document.getElementById('telClampX');
    this.domTelClampY = document.getElementById('telClampY');
  }

  /**
   * Listener input keyboard dan mouse
   */
  initEvents() {
    window.addEventListener('keydown', (e) => {
      this.sound.init(); // Aktifkan Web Audio Context pada user interaction
      this.inputState.keys[e.code] = true;

      // Shortcut: P untuk toggle parallax
      if (e.code === 'KeyP') {
        this.parallax.enabled = !this.parallax.enabled;
        const cb = document.getElementById('toggleParallax');
        if (cb) cb.checked = this.parallax.enabled;
      }

      // Shortcut: B untuk toggle bounding box debug
      if (e.code === 'KeyB') {
        this.isDebugBoundingBox = !this.isDebugBoundingBox;
        const cb = document.getElementById('toggleDebug');
        if (cb) cb.checked = this.isDebugBoundingBox;
      }

      // Shortcut: M untuk toggle audio FX
      if (e.code === 'KeyM') {
        this.sound.enabled = !this.sound.enabled;
        const cb = document.getElementById('toggleAudio');
        if (cb) cb.checked = this.sound.enabled;
      }

      // Spacebar untuk menembak
      if (e.code === 'Space') {
        e.preventDefault();
        this.firePlayerLaser();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.inputState.keys[e.code] = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.sound.init();
      this.firePlayerLaser();
    });
  }

  /**
   * Update Physics & Logic
   */
  update(dt) {
    // 1. Update Player
    this.player.update(
      dt,
      this.inputState,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      (x, y, vx, vy, color, radius, life) => {
        this.particles.push(new Particle(x, y, vx, vy, color, radius, life));
      }
    );

    // Tembak laser jika space ditekan terus menerus
    if (this.inputState.keys['Space']) {
      this.firePlayerLaser();
    }

    // 2. Camera Follow target Player & Clamp batas World
    this.camera.follow(this.player, true);

    // 3. Update Asteroid
    for (const asteroid of this.asteroids) {
      asteroid.update(dt, WORLD_WIDTH, WORLD_HEIGHT);
    }

    // 4. Update Laser & Deteksi Tabrakan Laser dengan Asteroid
    for (const laser of this.lasers) {
      laser.update(dt);
      if (!laser.isAlive) continue;

      for (const asteroid of this.asteroids) {
        if (!asteroid.isAlive) continue;
        const dist = Math.hypot(laser.x - asteroid.x, laser.y - asteroid.y);
        if (dist <= asteroid.radius + laser.radius) {
          laser.isAlive = false; // Laser mati
          const destroyed = asteroid.takeDamage(1);
          if (destroyed) {
            this.spawnExplosion(asteroid.x, asteroid.y, 22, '#f59e0b');
            this.sound.playExplosion();
          } else {
            this.spawnExplosion(laser.x, laser.y, 5, '#00f0ff');
          }
          break;
        }
      }
    }

    // 5. Update Partikel
    for (const p of this.particles) {
      p.update(dt);
    }

    // 6. JALANKAN LIFECYCLE FILTERING
    this.filterLifecycle();

    // 7. Hitung FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      this.updateSidebarTelemetry();
    }
  }

  /**
   * =========================================================================
   * METODE DRAW & RENDER PIPELINE
   * =========================================================================
   */
  render() {
    this.ctx.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

    // -----------------------------------------------------------------------
    // A. RENDER BACKGROUND PARALLAX DUA LAPIS (SCREEN / RELATIVE SPACE)
    // -----------------------------------------------------------------------
    this.parallax.draw(this.ctx, this.camera);

    // -----------------------------------------------------------------------
    // B. RENDER WORLD SPACE (DENGAN TRANSLASI KAMERA)
    // -----------------------------------------------------------------------
    this.ctx.save();
    this.camera.applyTransform(this.ctx);

    // 1. Gambar Grid & Batas World (640 x 1600)
    this.drawWorldBounds(this.ctx);

    // 2. Gambar Nebula di World Space
    this.parallax.drawWorldNebulae(this.ctx);

    // 3. Reset Counter Frustum Culling
    this.drawnCount = 0;
    this.skippedCount = 0;

    // 4. Render Asteroid dengan pemeriksaan isVisible()
    for (const asteroid of this.asteroids) {
      // IMPLEMENTASI isVisible() & COUNTER DRAWN/SKIPPED SESUAI RUBRIK
      if (isVisible(asteroid, this.camera)) {
        asteroid.draw(this.ctx, this.camera, this.isDebugBoundingBox);
        this.drawnCount++;
      } else {
        this.skippedCount++;
        // Objek tidak digambar ke canvas (frustum culling aktif!)
      }
    }

    // 5. Render Partikel yang terlihat
    for (const p of this.particles) {
      if (isVisible(p, this.camera)) {
        p.draw(this.ctx);
      }
    }

    // 6. Render Laser yang terlihat
    for (const laser of this.lasers) {
      if (isVisible(laser, this.camera)) {
        laser.draw(this.ctx);
      }
    }

    // 7. Render Satu Player
    this.player.draw(this.ctx);

    this.ctx.restore(); // KELUAR DARI WORLD SPACE

    // -----------------------------------------------------------------------
    // C. RENDER HUD DI SCREEN SPACE (SESUAI RUBRIK)
    // -----------------------------------------------------------------------
    // HUD digambar LANGSUNG pada koordinat layar (0..480, 0..640)
    // TANPA translasi kamera, sehingga posisinya statis menempel di layar!
    this.drawHUD(this.ctx);
  }

  /**
   * Render garis batas World dan grid dekoratif
   */
  drawWorldBounds(ctx) {
    // Garis grid halus
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 80;

    ctx.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_WIDTH, y);
    }
    ctx.stroke();

    // Garis Batas World (World Border) dengan efek glow
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Label Penanda World
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '11px monospace';
    ctx.fillText('BATAS WORLD (0, 0)', 10, 20);
    ctx.fillText(`BATAS WORLD (${WORLD_WIDTH}, ${WORLD_HEIGHT})`, WORLD_WIDTH - 180, WORLD_HEIGHT - 12);
  }

  /**
   * =========================================================================
   * METODE DRAW HUD DI SCREEN SPACE (MEMENUHI RUBRIK)
   * =========================================================================
   */
  drawHUD(ctx) {
    ctx.save();

    // 1. Panel Atas: Header Telemetri & Status Kamera
    ctx.fillStyle = 'rgba(10, 15, 26, 0.78)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, 10, 10, SCENE_WIDTH - 20, 84, 8, true, true);

    // Judul & FPS
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 12px "Orbitron", sans-serif';
    ctx.fillText('HUD [SCREEN SPACE]', 20, 28);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`FPS: ${this.fps}`, 180, 28);

    // Parallax Badge
    const parallaxColor = this.parallax.enabled ? '#10b981' : '#64748b';
    ctx.fillStyle = parallaxColor;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`PARALLAX: ${this.parallax.enabled ? '2-LAPIS [ON]' : '[OFF]'}`, 310, 28);

    // Posisi Kamera & Player
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(
      `CAM POS : X:${Math.round(this.camera.x).toString().padStart(3, ' ')}  Y:${Math.round(this.camera.y).toString().padStart(4, ' ')}`,
      20, 46
    );
    ctx.fillText(
      `PLAYER  : X:${Math.round(this.player.x).toString().padStart(3, ' ')}  Y:${Math.round(this.player.y).toString().padStart(4, ' ')}`,
      20, 60
    );

    // Status Clamp Kamera (Visual Indication)
    const clampXStatus = this.camera.isClampedLeft ? 'CLAMP: MIN (X=0)' :
                         this.camera.isClampedRight ? `CLAMP: MAX (${WORLD_WIDTH - SCENE_WIDTH})` : 'NORMAL';
    const clampYStatus = this.camera.isClampedTop ? 'CLAMP: TOP (Y=0)' :
                         this.camera.isClampedBottom ? `CLAMP: BTM (${WORLD_HEIGHT - SCENE_HEIGHT})` : 'NORMAL';

    ctx.fillStyle = (this.camera.isClampedLeft || this.camera.isClampedRight || this.camera.isClampedTop || this.camera.isClampedBottom)
                    ? '#f59e0b' : '#38bdf8';
    ctx.fillText(`CLAMP X: ${clampXStatus} | Y: ${clampYStatus}`, 20, 78);

    // -----------------------------------------------------------------------
    // 2. Panel Bawah: Counter Frustum Culling (Drawn vs Skipped)
    // -----------------------------------------------------------------------
    ctx.fillStyle = 'rgba(10, 15, 26, 0.85)';
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    this.roundRect(ctx, 10, SCENE_HEIGHT - 65, SCENE_WIDTH - 20, 55, 8, true, true);

    // Drawn vs Skipped Counters
    ctx.font = 'bold 12px "JetBrains Mono", monospace';

    // Drawn Counter (Hijau)
    ctx.fillStyle = '#10b981';
    ctx.fillText(`DRAWN   : ${this.drawnCount}`, 24, SCENE_HEIGHT - 43);

    // Skipped Counter (Merah / Culling)
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`SKIPPED : ${this.skippedCount}`, 160, SCENE_HEIGHT - 43);

    // Total Asteroids
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`TOTAL   : ${this.asteroids.length}`, 310, SCENE_HEIGHT - 43);

    // Lifecycle Status
    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`LIFECYCLE FILTERED (Hancur): ${this.totalFilteredDestroyed}`, 24, SCENE_HEIGHT - 22);

    // -----------------------------------------------------------------------
    // 3. RADAR / MINIMAP DI POJOK SCREEN SPACE
    // -----------------------------------------------------------------------
    // Menampilkan representasi visual World secara penuh, posisi Frustum Kamera,
    // dan status setiap Asteroid (Hijau = Drawn, Merah = Skipped).
    this.drawMiniMap(ctx, SCENE_WIDTH - 85, 105, 75, 187);

    ctx.restore();
  }

  /**
   * Menggambar Radar / Mini-Map di Screen Space
   * Sangat memudahkan melihat culling dan camera clamp secara real-time!
   */
  drawMiniMap(ctx, mmX, mmY, mmW, mmH) {
    ctx.save();
    // Background Minimap
    ctx.fillStyle = 'rgba(5, 8, 15, 0.88)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, mmX, mmY, mmW, mmH, 4, true, true);

    // Header Minimap
    ctx.fillStyle = '#00f0ff';
    ctx.font = '8px monospace';
    ctx.fillText('WORLD RADAR', mmX + 8, mmY + 11);

    const scaleX = mmW / WORLD_WIDTH;
    const scaleY = mmH / WORLD_HEIGHT;

    // Gambar seluruh Asteroid pada Radar
    for (const a of this.asteroids) {
      const ax = mmX + a.x * scaleX;
      const ay = mmY + a.y * scaleY;
      const isAVisible = isVisible(a, this.camera);

      ctx.fillStyle = isAVisible ? '#10b981' : '#ef4444'; // Hijau = Terlihat, Merah = Skipped
      ctx.beginPath();
      ctx.arc(ax, ay, isAVisible ? 2.5 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gambar Frustum Viewport Kamera (Kotak Putih/Cyan Berkedip)
    const camBoxX = mmX + this.camera.x * scaleX;
    const camBoxY = mmY + this.camera.y * scaleY;
    const camBoxW = SCENE_WIDTH * scaleX;
    const camBoxH = SCENE_HEIGHT * scaleY;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(camBoxX, camBoxY, camBoxW, camBoxH);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.fillRect(camBoxX, camBoxY, camBoxW, camBoxH);

    // Gambar Player (Titik Cyan Terang)
    const px = mmX + this.player.x * scaleX;
    const py = mmY + this.player.y * scaleY;
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Update telemetri yang ditampilkan di sidebar HTML
   */
  updateSidebarTelemetry() {
    if (this.domTelDrawn) this.domTelDrawn.textContent = this.drawnCount;
    if (this.domTelSkipped) this.domTelSkipped.textContent = this.skippedCount;
    if (this.domTelTotal) this.domTelTotal.textContent = this.asteroids.length;
    if (this.domTelDestroyed) this.domTelDestroyed.textContent = this.totalFilteredDestroyed;

    if (this.domTelClampX) {
      if (this.camera.isClampedLeft) this.domTelClampX.textContent = 'MIN (0)';
      else if (this.camera.isClampedRight) this.domTelClampX.textContent = `MAX (${WORLD_WIDTH - SCENE_WIDTH})`;
      else this.domTelClampX.textContent = 'OK';
    }

    if (this.domTelClampY) {
      if (this.camera.isClampedTop) this.domTelClampY.textContent = 'TOP (0)';
      else if (this.camera.isClampedBottom) this.domTelClampY.textContent = `BTM (${WORLD_HEIGHT - SCENE_HEIGHT})`;
      else this.domTelClampY.textContent = 'OK';
    }
  }

  /**
   * Helper utility untuk menggambar rectangle dengan sudut melengkung
   */
  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  /**
   * Main Game Loop dengan delta time
   */
  gameLoop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Clamp max 0.1s dt
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// ----------------------------------------------------------------------------
// 10. ENTRY POINT - INIT SAAT WINDOW SIAP
// ----------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new Game();
});
