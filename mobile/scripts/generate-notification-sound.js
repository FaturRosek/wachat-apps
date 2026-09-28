/**
 * Generator aset suara notifikasi (chime 2 nada: G5 784Hz lalu E6 1318.5Hz).
 * Meniru bunyi notificationHelper versi web (Web Audio API oscillator).
 * Pemakaian: node scripts/generate-notification-sound.js
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT = path.join(__dirname, '..', 'assets', 'notification.wav');

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(samples) {
  const ab = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(ab);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return Buffer.from(ab);
}

function tone(freq, startSec, durationSec, peak) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float64Array(start + len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.03);
    const decay = Math.exp(-t * 9);
    out[start + i] = Math.sin(2 * Math.PI * freq * t) * peak * attack * decay;
  }
  return out;
}

function mix(...parts) {
  const total = Math.max(...parts.map((p) => p.length));
  const out = new Float64Array(total);
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) out[i] += p[i];
  }
  return out;
}

const samples = mix(
  tone(784, 0, 0.18, 0.55),
  tone(1318.51, 0.08, 0.38, 0.65)
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodeWav(samples));
console.log('OK ->', OUT, `(${samples.length} samples, ~${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
