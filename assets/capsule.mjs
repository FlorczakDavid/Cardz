/** Encrypted local keepsakes. A static app cannot supply a trusted time lock. */
const ITERATIONS = 310000;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
export const MIN_PASSPHRASE_LENGTH = 12;
function requireCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('Le chiffrement nécessite HTTPS (ou localhost) et un navigateur récent.');
}
function toBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(s) { return Uint8Array.from(atob(s), char => char.charCodeAt(0)); }
function validBase64(s, min, max) {
  if (typeof s !== 'string' || s.length > Math.ceil(max / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) return false;
  try { const bytes = fromBase64(s); return bytes.length >= min && bytes.length <= max && toBase64(bytes) === s; } catch { return false; }
}
export function capsuleContext(capsule, playerIndex) { return JSON.stringify([capsule.id, capsule.createdAt, capsule.unlockAt, capsule.prompt, playerIndex, capsule.players[playerIndex]]); }
async function deriveKey(passphrase, salt) {
  requireCrypto();
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function createCapsuleDraft(players, prompt, delayDays, now = Date.now()) {
  requireCrypto();
  if (!Array.isArray(players) || players.length !== 2 || players.some(p => typeof p !== 'string' || !p.trim() || p.length > 32) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000 || !Number.isSafeInteger(delayDays) || delayDays < 0 || delayDays > 3650 || !Number.isSafeInteger(now) || now < 0) throw new Error('Paramètres de capsule invalides.');
  return { version: 1, kind: 'cardz-capsule', id: crypto.randomUUID(), createdAt: now, unlockAt: now + delayDays * 86400000, prompt, players: [...players], responses: [] };
}
export async function encryptAnswer(answer, passphrase, context) {
  requireCrypto();
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 12000) throw new Error('Écrivez une réponse de 1 à 12 000 caractères.');
  if (typeof passphrase !== 'string' || passphrase.trim().length < MIN_PASSPHRASE_LENGTH || passphrase.length > 200) throw new Error('La phrase secrète doit contenir entre 12 et 200 caractères.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, key, encoder.encode(answer));
  return { algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
}
export function validateCapsule(c) {
  if (!c || c.version !== 1 || c.kind !== 'cardz-capsule' || typeof c.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(c.id) || !Number.isSafeInteger(c.createdAt) || c.createdAt < 0 || !Number.isSafeInteger(c.unlockAt) || c.unlockAt < c.createdAt || c.unlockAt - c.createdAt > 3650 * 86400000 || c.unlockAt > 8640000000000000 || typeof c.prompt !== 'string' || !c.prompt.trim() || c.prompt.length > 2000 || !Array.isArray(c.players) || c.players.length !== 2 || c.players.some(x => typeof x !== 'string' || !x.trim() || x.length > 32) || !Array.isArray(c.responses) || c.responses.length !== 2) return false;
  return c.responses.every(r => r && r.algorithm === 'AES-GCM' && r.kdf === 'PBKDF2-SHA256' && r.iterations === ITERATIONS && validBase64(r.salt, 16, 16) && validBase64(r.iv, 12, 12) && validBase64(r.ciphertext, 17, 48016));
}
export function canUnlock(capsule, now = Date.now()) { return now >= capsule.unlockAt; }
export async function decryptAnswer(capsule, index, passphrase, now = Date.now()) {
  requireCrypto();
  if (!validateCapsule(capsule) || ![0, 1].includes(index)) throw new Error('Capsule invalide ou endommagée.');
  if (!canUnlock(capsule, now)) throw new Error('Cette capsule n’est pas encore prête à être ouverte sur cet appareil.');
  if (typeof passphrase !== 'string' || passphrase.length > 200) throw new Error('Phrase secrète invalide.');
  const r = capsule.responses[index], salt = fromBase64(r.salt), key = await deriveKey(passphrase, salt);
  try {
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(r.iv), additionalData: encoder.encode(capsuleContext(capsule, index)) }, key, fromBase64(r.ciphertext));
    return decoder.decode(clear);
  } catch { throw new Error('Phrase secrète incorrecte ou capsule endommagée.'); }
}
