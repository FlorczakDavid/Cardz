import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapsuleDraft, encryptAnswer, decryptAnswer, capsuleContext, validateCapsule, canUnlock } from '../assets/capsule.mjs';
const phraseA = 'Une très longue phrase A !', phraseB = 'Une autre longue phrase B !';
const created = 1800000000000;
async function sealed() {
  const capsule = createCapsuleDraft(['David','Camille'], 'Que retiens-tu ?', 5, created);
  capsule.responses = await Promise.all([encryptAnswer('Merci pour ce moment 💛', phraseA, capsuleContext(capsule, 0)), encryptAnswer('J’ai appris à mieux te connaître.', phraseB, capsuleContext(capsule, 1))]);
  return capsule;
}

test('exported capsules contain authenticated ciphertext, not responses or phrases', async () => {
  const c = await sealed(), raw = JSON.stringify(c);
  assert.ok(validateCapsule(c)); assert.ok(!raw.includes('Merci')); assert.ok(!raw.includes(phraseA)); assert.ok(!raw.includes(phraseB));
  assert.equal(c.unlockAt - c.createdAt, 5 * 86400000);
  const imported = JSON.parse(raw);
  assert.equal(await decryptAnswer(imported, 0, phraseA, c.unlockAt), 'Merci pour ce moment 💛');
  assert.equal(await decryptAnswer(imported, 1, phraseB, c.unlockAt), 'J’ai appris à mieux te connaître.');
});
test('the interface time rule rejects early opening and allows the exact boundary', async () => {
  const c = await sealed(); assert.equal(canUnlock(c, c.unlockAt - 1), false); assert.equal(canUnlock(c, c.unlockAt), true);
  await assert.rejects(() => decryptAnswer(c, 0, phraseA, c.unlockAt - 1), /pas encore/);
});
test('wrong phrases and modified metadata cannot decrypt', async () => {
  const c = await sealed();
  await assert.rejects(() => decryptAnswer(c, 0, phraseB, c.unlockAt), /incorrecte|endommagée/);
  for (const change of [copy => copy.players[0] = 'Une autre personne',copy => copy.unlockAt = copy.createdAt,copy => copy.prompt = 'Une autre question']) {
    const modified = structuredClone(c); change(modified);
    await assert.rejects(() => decryptAnswer(modified, 0, phraseA, c.unlockAt), /incorrecte|endommagée/);
  }
});
test('fresh salt and IV make identical answers encrypt differently', async () => {
  const first = await encryptAnswer('La même réponse', phraseA, 'context');
  const second = await encryptAnswer('La même réponse', phraseA, 'context');
  assert.notEqual(first.salt, second.salt); assert.notEqual(first.iv, second.iv); assert.notEqual(first.ciphertext, second.ciphertext);
});
test('imports reject incomplete, oversized and hostile KDF envelopes', async () => {
  const c = await sealed();
  for (const modify of [x => x.responses.pop(),x => x.responses[0].iterations = 999999999,x => x.responses[0].iv = '',x => x.responses[0].salt = 'a'.repeat(100000),x => x.responses[0].ciphertext = '!!!!',x => x.unlockAt = x.createdAt - 1,x => x.players[0] = '',x => x.version = 2]) {
    const copy = structuredClone(c); modify(copy); assert.equal(validateCapsule(copy), false);
  }
  assert.equal(validateCapsule(null), false);
});
test('invalid drafts and weak phrases are rejected', async () => {
  assert.throws(() => createCapsuleDraft(['A'], 'Prompt', 5));
  assert.throws(() => createCapsuleDraft(['A','B'], 'Prompt', -1));
  await assert.rejects(() => encryptAnswer('', phraseA, 'context'));
  await assert.rejects(() => encryptAnswer('Réponse', '123', 'context'));
});
