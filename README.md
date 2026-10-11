# Tugas Grafika Game: 2D Camera, Culling & Parallax

Implementasi lengkap menggunakan **HTML5 Canvas** dan **Vanilla JavaScript** sesuai rubrik tugas:

> **C. TUGAS IMPLEMENTASI (12)**  
> Scene 480×640 dengan world ≥ 480×1200, satu Player, ≥ 30 Asteroid.  
> Implementasikan camera follow, clamp kamera, `isVisible()`, counter drawn/skipped, lifecycle filtering, dan HUD di screen space. Tambahkan opsi mengaktifkan/menonaktifkan parallax dua lapis.

---

## 📋 Pemetaan Rubrik & Implementasi

| No | Persyaratan Rubrik | Implementasi Kode | Keterangan / Lokasi Kode |
|---|---|---|---|
| 1 | **Scene 480×640** | `SCENE_WIDTH = 480`, `SCENE_HEIGHT = 640` | Canvas berukuran tepat 480×640 piksel (`index.html` & `game.js:24-25`). |
| 2 | **World ≥ 480×1200** | `WORLD_WIDTH = 640`, `WORLD_HEIGHT = 1600` | Memenuhi syarat &ge; 480×1200 (`game.js:26-27`). Batas world divisualisasikan dengan garis merah tebal. |
| 3 | **Satu Player** | `class Player` | Pesawat antariksa dengan kontrol WASD/Panah, inersia, rotasi, thruster partikel, dan tembakan laser (`game.js:264-367`). |
| 4 | **≥ 30 Asteroid** | `class Asteroid` (Default 35 Asteroid) | Spawning awal 35 asteroid prosedural dengan bentuk poligon unik, kawah, rotasi, dan ukuran variatif (`game.js:372-478`). |
| 5 | **Camera Follow** | `camera.follow(player)` | Kamera berpusat pada posisi Player secara halus (`smoothFactor: 0.12`) di koordinat layar (`game.js:125-141`). |
| 6 | **Clamp Kamera** | `camera.clamp()` | Mengunci koordinat kamera agar tidak keluar dari `[0..worldWidth - sceneWidth, 0..worldHeight - sceneHeight]` (`game.js:146-163`). |
| 7 | **`isVisible()`** | `isVisible(entity, camera)` | Frustum culling dengan memeriksa perpotongan AABB/lingkaran objek terhadap viewport kamera (`game.js:447-463` & `494-506`). |
| 8 | **Counter Drawn / Skipped** | `drawnCount`, `skippedCount` | Penghitung real-time objek yang dirender vs objek di luar viewport kamera (`game.js:688-698`). |
| 9 | **Lifecycle Filtering** | `filterLifecycle()` | Array filtering otomatis: membersihkan entitas yang mati (`isAlive === false`) dari memori (`game.js:568-580`). Terdapat tombol demo dan tembakan laser. |
| 10 | **HUD di Screen Space** | `drawHUD(ctx)` | Digambar setelah `ctx.restore()` sehingga koordinatnya statis di layar (0..480, 0..640), dilengkapi radar/minimap mini (`game.js:731-825`). |
| 11 | **Parallax Dua Lapis** | `class ParallaxBackground` | Lapis 1 (Bintang Jauh: faktor 0.15×) dan Lapis 2 (Bintang Dekat: faktor 0.40×) dengan opsi ON/OFF via checkbox atau tombol shortcut `[P]` (`game.js:174-245`). |

---

## 🎮 Panduan Kontrol & Uji Coba

- **Gerakan Pesawat**: <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> atau Tombol Panah (&uarr; &larr; &darr; &rarr;)
- **Menembak Laser**: <kbd>SPACE</kbd> atau Klik Mouse (untuk menguji kehancuran asteroid & lifecycle filtering)
- **Toggle Parallax 2 Lapis**: Tombol <kbd>P</kbd> atau checkbox di sidebar
- **Toggle Bounding Box Debug**: Tombol <kbd>B</kbd> atau checkbox di sidebar
- **Toggle Audio FX**: Tombol <kbd>M</kbd>
- **Tombol Uji Lifecycle**:
  - `Hancurkan 1 Asteroid Acak`: Menandai asteroid menjadi `isAlive = false`, memicu ledakan partikel, dan lifecycle filtering langsung menghapusnya dari array.
  - `Reset & Respawn 35 Asteroid`: Memunculkan kembali 35 asteroid baru.
  - `+ Tambah 10 Asteroid Baru`: Menambahkan 10 asteroid ke dalam world.

---

## 📁 Struktur Berkas

```
Game640.800/
├── index.html    # Dokumen HTML5, canvas 480x640, kontrol panel, HUD mirror
├── style.css     # Styling modern Dark Sci-Fi UI, glassmorphic panels
├── game.js       # Seluruh logika Game Engine, Camera, Culling, Lifecycle, HUD
└── README.md     # Dokumentasi rubrik dan penggunaan
```

## 🚀 Cara Menjalankan

Buka berkas `index.html` langsung di browser web apa saja (Google Chrome, Microsoft Edge, Firefox). Tidak memerlukan instalasi server atau dependensi tambahan.
