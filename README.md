# portfolio-v2

Portfolio Muhammad Rifqi Setiawan. Situs ini menampilkan delapan studi kasus, galeri proyek, dan potret interaktif yang dibangun dengan TypeScript, Three.js, GSAP, dan Vite.

[Lihat portfolio](https://portfolio.rifqisetiawan.my.id/)

## Menjalankan secara lokal

```sh
npm ci
npm run dev
```

## Build produksi

```sh
npm run build -- --mode live
npm run preview
```

Build menghasilkan situs statis di `dist/`. Mode `live` memakai domain produksi untuk URL kanonis dan metadata berbagi.

## Konten dan aset

Edit deskripsi proyek dan profil di `src/content/`. Gambar proyek dan diagram ada di `public/media/`. Potret dan peta kedalaman yang digunakan Three.js ada di `public/scenes/`. Lisensi font Plus Jakarta Sans disertakan di `public/fonts/OFL.txt`.

## Tes

```sh
npm test
npx playwright install chromium
npm run e2e
```
