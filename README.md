# SCRN — Memecoin Screener (v2)

## Cara deploy (Netlify)
1. Extract zip ini, drag folder-nya (atau isi zip-nya) ke Netlify dashboard → "Deploy manually", **atau**
2. Push ke GitHub repo lalu connect ke Netlify (build command kosong, publish directory `.`).
3. Netlify otomatis detect `netlify/functions/*.js` sebagai serverless function, `package.json` di-install otomatis, dan `scheduled-scan` jalan otomatis tiap 5 menit — tidak perlu setting tambahan untuk itu.
4. **Wajib buat fitur "Sinyal koin baru"**: di Netlify dashboard → Site settings → Environment variables, tambahkan:
   - `VAPID_PUBLIC_KEY` = `BEQfPEaOG4nI7VP-l581QvY9NH7hYQBf4Lw_qfZKA6gTBX_iG2ZJpKq4eB5QpQQ28CIs6ABAL4F1xE-Z5QyVYjk`
   - `VAPID_PRIVATE_KEY` = `Sc2jTK8Sy7VYhTbz3HKdLeyRkAKd7pbV_IwxBe9tdDs`
   - `VAPID_SUBJECT` = `mailto:emailkamu@contoh.com` (syarat protokol Web Push, boleh email apa aja)

   Tanpa ini, toggle "Aktifkan sinyal background" di Settings nggak akan berfungsi (tapi sisa app tetap jalan normal). Key di atas sudah digenerate khusus buat instance kamu — jangan dipakai bareng orang lain, dan jangan di-commit ke repo publik (bagian private key-nya). Kalau mau ganti, generate ulang pakai `npx web-push generate-vapid-keys` lalu update juga `VAPID_PUBLIC_KEY` di `app.js` (cari baris `const VAPID_PUBLIC_KEY = ...`).
5. Redeploy setelah nambahin environment variables (env var baru cuma kepakai di deploy berikutnya, nggak retroactive ke deploy yang lagi jalan).

## Fitur: Sinyal koin baru (jalan di background, tanpa tab kebuka)
- Nyala/mati lewat Settings → "Sinyal koin baru (latar belakang)"
- Cron job Netlify (`netlify/functions/scheduled-scan.js`) jalan tiap ±5 menit di server, ngecek token Solana yang baru muncul di DexScreener (`/token-profiles/latest/v1`), scoring pakai kriteria aktif kamu (Strict/Loose/Custom — ikut yang lagi dipilih di app), lalu kirim **Web Push notification** asli ke device kamu kalau ada yang lolos strict screening
- Beda dari alert watchlist biasa: ini jalan walau app/tab ditutup total, karena dikirim lewat push service browser (Google/Mozilla/Apple), bukan lewat JS yang jalan di tab
- Tap notifikasi-nya bakal buka app dan langsung auto-scan token itu (deep link `/?scan=<address>`)
- Data disimpan di Netlify Blobs (store `scrn-store`): daftar subscriber push, kriteria aktif, dan daftar token yang udah pernah dicek (biar nggak alert berulang buat token yang sama)
- **Sengaja dibatasi 15 kandidat token baru per run** biar nggak kena timeout function Netlify — jadi kalau lagi musim rame banyak token baru sekaligus, ada yang ke-cover di run berikutnya (5 menit lagi), bukan hilang
- **Catatan platform**: di Android (Chrome), push notification jalan walau browser ditutup total. Di iOS, WAJIB "Add to Home Screen" dulu (install sebagai PWA) — Safari biasa (bukan PWA) nggak dapet push notification sama sekali, ini keterbatasan dari Apple bukan dari app ini. Di desktop, browser minimal harus jalan di background (nggak perlu tab-nya kebuka, tapi proses browser-nya harus hidup).

## Fitur baru vs versi lama
- **Tab navigasi**: Scan / Watchlist / History / Settings
- **Batch scan**: extract semua CA dari satu paste text sekaligus, scan berurutan
- **Breakdown skor per kriteria asli** (bukan poin) — tiap kriteria nampilin nilai aktual vs threshold-nya (mis. "Liquidity — $32,000 · min $20k / full skor $50k")
- **Watchlist** dengan status Watching/Entered + auto re-scan berkala (selagi tab terbuka) + alert kalau liquidity anjlok, holder concentration naik, atau muncul red flag baru (toast + notifikasi browser + bunyi + getar)
- **History** 50 scan terakhir, tap untuk scan ulang
- **Riwayat paste** (5 terakhir) biar nggak perlu retype
- **Kriteria custom**: preset Strict/Loose/Custom, semua threshold bisa diedit & disimpan
- **Dark/light mode toggle**
- **Share** hasil scan (native share sheet di HP, atau copy ke clipboard)
- **Quick swap links**: Jupiter & Raydium
- **PWA**: bisa di-"Add to Home Screen", app-shell di-cache buat load lebih cepat/offline (data API tetap butuh koneksi)
- **Logo funnel**: ikon baru yang ngerepresentasiin strict filtering (banyak token masuk, satu yang lolos keluar), dipakai di header, favicon, dan PWA icon

## Update sebelumnya
- **P&L tracking**: tiap item watchlist yang ditandai "Entered" bisa diisi entry price & modal (USD) — otomatis keisi dari harga terakhir pas toggle, bisa diedit manual lewat "Entry & alert harga"
- **Price alert**: take-profit %, stop-loss %, dan alert pergerakan harga (dari baseline saat ditambahkan) — masing-masing sekali alert lalu nggak spam ulang sampai setting-nya disimpan ulang
- **History**: search box (symbol/address) + filter Pass/Warn/Fail, dan auto-dedupe (scan ulang token yang sama dalam 2 menit nge-update baris yang sama, bukan nambah baris baru)
- **Watchlist**: sortable (baru ditambah / skor tertinggi-terendah / alert dulu / P&L tertinggi), konfirmasi sebelum hapus item
- **Export CSV** untuk History maupun Watchlist
- **Fix scan**: `fetchDexScreener` sekarang cascade lewat 3 endpoint resmi (`tokens/v1` → `token-pairs/v1` → `latest/dex/tokens`) dan cuma berhenti kalau beneran dapet data — sebelumnya suka berhenti duluan pas endpoint pertama ngasih HTTP 200 tapi array kosong, jadi token yang sebenernya ada malah kebaca "tidak terindex"
- **Keamanan**: header CORS wildcard di `rugcheck-proxy.js` dihapus — function itu cuma pernah dipanggil same-origin dari app ini sendiri, jadi nggak butuh `Access-Control-Allow-Origin: *`. Sebelumnya siapa saja bisa manggil function itu langsung dari situs lain dan makan kuota Netlify kamu gratis.

## Keterbatasan yang perlu diketahui
- **Data watchlist/history/preset disimpan per-device** (localStorage), tidak sinkron antar HP/laptop kecuali kamu tambahin akun user + database sendiri.
- **Analisis wallet cluster / dev track record / "smart money"** butuh indexer on-chain berbayar (Helius, Bitquery, dll) — tidak diimplementasikan di versi ini.
- **Sumber "koin baru" buat sinyal background** pakai endpoint publik DexScreener `/token-profiles/latest/v1` (token yang baru bikin profile di DexScreener) — ini proxy yang paling deket ke "token baru muncul" yang tersedia gratis tanpa API key. Bukan berarti mencakup 100% token baru yang pernah ada di Solana; token yang nggak pernah dikasih profile DexScreener nggak akan ke-detect.
- Netlify Blobs & scheduled functions gratis di tier Netlify manapun (termasuk free tier), tapi ada limit jumlah invocation/bandwidth bulanan sesuai plan Netlify kamu — kalau trafiknya gede, cek dashboard Netlify buat monitoring.
