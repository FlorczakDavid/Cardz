import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../assets/storage.mjs';
function memory() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
test('storage round trips and isolates different project paths', () => {
  const backend = memory(), a = createStore('cardz:/a/', backend), b = createStore('cardz:/b/', backend);
  assert.ok(a.set('session', { players:['A','B'] })); assert.deepEqual(a.get('session'), { players:['A','B'] }); assert.equal(b.get('session'), null);
  a.remove('session'); assert.equal(a.get('session'), null);
});
test('denied storage never prevents a game and reports a single failure', () => {
  let warnings = 0; const denied = () => { throw new Error('Denied'); };
  const s = createStore('cardz', {getItem:denied,setItem:denied,removeItem:denied}, () => warnings++);
  assert.equal(s.get('session'), null); assert.equal(s.set('session', {}), false); assert.equal(s.remove('session'), false); assert.equal(warnings, 1);
});
test('corrupt local JSON is handled without throwing', () => {
  const backend = memory(); backend.setItem('cardz:session','{broken');
  assert.equal(createStore('cardz', backend).get('session'), null);
});
