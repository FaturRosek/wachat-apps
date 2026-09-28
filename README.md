# WaChat AI — Personal WhatsApp AI Assistant

WaChat AI adalah aplikasi mobile cerdas yang menghubungkan nomor WhatsApp pribadi ke aplikasi smartphone Android/iOS untuk mengelola pengiriman pesan dengan bantuan AI serta antrean pengiriman pesan yang terkontrol (*controlled rate & repeat sending*).

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (UUID, Relational Models)
- **Job Queue**: Redis + BullMQ (Pause, Resume, Stop/Cancel, Progress Tracking)
- **WhatsApp Integration**: Session persistence with Pairing Code & QR Scan
- **AI Integration**: AI Smart Reply, Generator, Rewriter, and Per-chat Persona
- **Mobile App**: React Native (Expo SDK 57, Expo Router, Android/iOS)

---

## 📁 Project Structure

```text
WaChat_AI/
├── backend/
│   ├── src/
│   ├── package.json
│   └── server.js
├── mobile/
│   ├── src/
│   │   ├── api/
│   │   ├── app/
│   │   ├── components/
│   │   ├── config/
│   │   ├── context/
│   │   ├── theme/
│   │   └── utils/
│   ├── app.json
│   └── package.json
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### 1. Prasyarat
- Node.js (v18+)
- PostgreSQL (Local atau via Docker)
- Redis (Local atau via Docker)

### 2. Jalankan PostgreSQL & Redis via Docker (Opsional)
```bash
docker compose up -d
```

### 3. Konfigurasi Environment Backend
Copy file `.env.example` menjadi `.env` di dalam folder `backend/`:
```bash
cd backend
cp .env.example .env
```
Sesuaikan konfigurasi port, kredensial PostgreSQL, dan Redis sesuai kebutuhan Anda.

### 4. Install Dependencies
```bash
cd backend
npm install
```

### 5. Jalankan Database Migration
```bash
npm run migrate
```

### 6. Jalankan Server Development
```bash
npm run dev
```

Endpoint Health Check:
`GET http://localhost:5000/api/health`

---

## 📱 Menjalankan Aplikasi Mobile (Android)

```bash
cd mobile
npm start
```
- Tekan `a` untuk membuka di Emulator Android.
- Atau scan QR code di terminal menggunakan aplikasi **Expo Go** di HP Android fisik Anda.
- **Catatan IP Backend**: Jika menggunakan HP fisik, pastikan HP dan PC berada dalam 1 jaringan Wi-Fi, lalu buka ikon server di pojok layar login untuk menyetel IP LAN PC Anda (contoh: `http://192.168.1.xxx:5000`).
