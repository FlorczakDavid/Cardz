import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateConfig, ConfigurationError, prepareQuestions, eligibleQuestions, availableDistribution, getStage, createGame, drawCard, toggleResponder, questionKey, validateSavedGame, contentSignature, DeckExhaustedError } from '../assets/engine.mjs';
const root = new URL('../', import.meta.url);
const cfg = JSON.parse(await readFile(new URL('config.json', root)));
const packs = await Promise.all(cfg.sources.map(async source => ({ source, data: JSON.parse(await readFile(new URL(source.path, root))) })));
const qs = prepareQuestions(cfg, packs), originals = qs.filter(q => q.sourceId === 'original');
const clone = () => structuredClone(cfg);
function seeded(seed = 42) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
function emptyState(deckId = 'miam') { return { deckId, sourceIds: ['original'], players: ['A', 'B'], drawnCount: 0, seenKeys: [], usedIds: [] }; }

test('the supplied release config is accepted', () => { assert.equal(validateConfig(cfg), cfg); });
test('source entries are preserved and AI additions remain separate', () => {
  assert.equal(originals.length, 204);
  assert.equal(qs.filter(q => q.sourceId === 'additional').length, 20);
  assert.equal(new Set(originals.map(questionKey)).size, 201);
  assert.deepEqual(Object.fromEntries(['ouverture', 'intermediaire', 'deep', 'miam', 'couple'].map(c => [c, originals.filter(q => q.category === c).length])), { ouverture: 34, intermediaire: 79, deep: 64, miam: 10, couple: 17 });
  assert.equal(cfg.sources.find(s => s.id === 'additional').defaultEnabled, false);
  assert.equal(originals.filter(q => q.text !== q.originalText).length, 2);
  assert.ok(originals.every(q => q.originalText && q.sourcePage >= 2 && q.sourcePage <= 6));
  assert.ok(originals.filter(q => q.text !== q.originalText).every(q => q.editorialNote));
});
test('base and miam modes exclude couple cards and keep original counts', () => {
  for (const [deckId, count] of [['base',174],['miam',184],['couple',201]]) {
    const pool = eligibleQuestions(cfg, qs, emptyState(deckId));
    assert.equal(new Set(pool.map(questionKey)).size, count);
    assert.ok(pool.every(q => q.sourceId === 'original'));
    if (deckId !== 'couple') assert.ok(pool.every(q => !q.tags.includes('couple')));
    if (deckId === 'base') assert.ok(pool.every(q => q.categoryId !== 'miam'));
  }
});
test('every ratio boundary and beyond 50 uses the intended stage', () => {
  for (const [number, index] of [[1,0],[2,1],[10,1],[11,2],[25,2],[26,3],[40,3],[41,4],[50,4],[51,4],[500,4]]) assert.equal(getStage(cfg, number), cfg.ratioStages[index]);
  const c = clone(); c.game.afterLastStage = 'stop'; assert.equal(getStage(c, 51), null);
});
test('probabilities are normalized only across available positive types', () => {
  assert.deepEqual(availableDistribution(cfg, qs, emptyState(), 1).map(x => [x.categoryId, x.probability]), [['ouverture',1]]);
  assert.deepEqual(availableDistribution(cfg, qs, emptyState(), 11).map(x => [x.categoryId, x.probability]), [['ouverture',.2],['intermediaire',.7],['deep',.1]]);
  const base = availableDistribution(cfg, qs, emptyState('base'), 26);
  assert.deepEqual(base.map(x => x.categoryId), ['intermediaire','deep']);
  assert.ok(Math.abs(base[0].probability - 70 / 90) < 1e-12);
});
test('an exhausted positive category redistributes without enabling zero types', () => {
  const state = emptyState(); state.seenKeys = originals.filter(q => q.categoryId === 'ouverture').map(questionKey);
  assert.equal(availableDistribution(cfg, qs, state, 2)[0].probability, 1);
  assert.deepEqual(availableDistribution(cfg, qs, state, 2).map(x => x.categoryId), ['intermediaire']);
  state.seenKeys.push(...originals.filter(q => q.categoryId === 'intermediaire').map(questionKey));
  assert.deepEqual(availableDistribution(cfg, qs, state, 2), []);
});
test('turns rotate clockwise; a passed card keeps the asker by default', () => {
  const random = seeded(); let game = createGame(cfg, qs, ['A','B','C'], 'base', ['original'], random);
  assert.equal(game.askerIndex, 0); assert.equal(game.current.targetIndices.length, 1);
  game = drawCard(cfg, qs, game, 'skip', random); assert.equal(game.askerIndex, 0); assert.equal(game.drawnCount, 2);
  game = drawCard(cfg, qs, game, 'next', random); assert.equal(game.askerIndex, 1);
  game = drawCard(cfg, qs, game, 'next', random); assert.equal(game.askerIndex, 2);
  game = drawCard(cfg, qs, game, 'next', random); assert.equal(game.askerIndex, 0);
});
test('skip and first-player rules can be changed through JSON', () => {
  const c = clone(); c.game.skipAdvancesAsker = true; c.game.firstAsker = 'random'; validateConfig(c);
  let game = createGame(c, qs, ['A','B','C'], 'base', ['original'], () => .8);
  assert.equal(game.askerIndex, 2);
  game = drawCard(c, qs, game, 'skip', seeded()); assert.equal(game.askerIndex, 0);
});
test('at four or more players targets are distinct and exclude the asker', () => {
  for (const count of [2,3,4,8,20]) {
    const random = seeded(count), names = Array.from({ length: count }, (_, i) => `P${i}`);
    let game = createGame(cfg, qs, names, 'miam', ['original'], random);
    for (let n = 0; n < 35; n++) {
      const targets = game.current.targetIndices;
      assert.equal(targets.length, count >= 4 ? 2 : 1);
      assert.equal(new Set(targets).size, targets.length);
      assert.ok(!targets.includes(game.askerIndex));
      assert.ok(validateSavedGame(cfg, qs, game));
      game = drawCard(cfg, qs, game, 'next', random);
    }
  }
});
test('additional responders are opt-in and cannot duplicate required roles', () => {
  const game = createGame(cfg, qs, ['A','B','C','D'], 'base', ['original'], seeded());
  const optional = [0,1,2,3].find(i => i !== game.askerIndex && !game.current.targetIndices.includes(i));
  const next = toggleResponder(cfg, game, optional); assert.deepEqual(next.current.extraIndices, [optional]);
  assert.deepEqual(toggleResponder(cfg, next, optional).current.extraIndices, []);
  assert.equal(toggleResponder(cfg, game, game.askerIndex), game);
  assert.equal(toggleResponder(cfg, game, game.current.targetIndices[0]), game);
  const c = clone(); c.game.allowAdditionalResponders = false; assert.equal(toggleResponder(c, game, optional), game);
});
test('long sessions stop cleanly with no repeated text or excluded cards', () => {
  for (const deck of ['base', 'miam', 'couple']) {
    const random = seeded(99); let game = createGame(cfg, qs, ['A','B'], deck, ['original'], random), stopped = false;
    for (let n = 0; n < 300; n++) {
      assert.equal(new Set(game.seenKeys).size, game.seenKeys.length);
      assert.ok(validateSavedGame(cfg, qs, game));
      assert.ok(game.usedIds.every(id => id.startsWith('original-')));
      try { game = drawCard(cfg, qs, game, n % 3 ? 'next' : 'skip', random); }
      catch (error) { assert.ok(error instanceof DeckExhaustedError); stopped = true; break; }
    }
    assert.ok(stopped);
  }
});
test('configured limits stop before another draw and never mutate the last card', () => {
  const c = clone(); c.game.maxQuestions = 1;
  const game = createGame(c, qs, ['A','B'], 'base', ['original'], seeded()), before = structuredClone(game);
  assert.throws(() => drawCard(c, qs, game, 'next', seeded()), error => error.reason === 'limit');
  assert.deepEqual(game, before);
});
test('changing a type and its ratios in JSON changes the game without new JS', () => {
  const c = clone(); c.categories.push({ id:'argent',label:'Argent',symbol:'€',color:'#cde0bd',description:'Parler argent.' });
  c.decks.find(d => d.id === 'base').categories.push('argent');
  c.ratioStages[0].weights = { ouverture:0, argent:1 };
  // Other decks also need a positive category in this first stage.
  for (const deck of c.decks.filter(d => d.id !== 'base')) deck.categories.push('argent');
  validateConfig(c);
  const q = { id:'argent-001', category:'argent',categoryId:'argent',text:'Votre rapport à l’argent ?',tags:[],minPlayers:2,enabled:true,sourceId:'original',sourceLabel:'Test' };
  const game = createGame(c, [...qs,q], ['A','B'], 'base', ['original'], seeded());
  assert.equal(game.current.questionId, q.id);
});
test('a saved session is rejected after corruption or content changes', () => {
  const game = createGame(cfg, qs, ['A','B','C','D'], 'base', ['original'], seeded());
  assert.ok(validateSavedGame(cfg, qs, game));
  for (const mutate of [g => g.players.push(''),g => g.current.targetIndices.push(g.askerIndex),g => g.current.questionId = 'missing',g => g.seenKeys[0] = 'tampered',g => g.usedIds = [],g => g.sourceIds = ['missing'],g => g.current.extraIndices = [...g.current.targetIndices]]) {
    const altered = structuredClone(game); mutate(altered); assert.equal(validateSavedGame(cfg, qs, altered), false);
  }
  const c = clone(); c.rules.items.push('Une nouvelle règle.'); assert.notEqual(contentSignature(cfg, qs), contentSignature(c, qs));
});
test('invalid JSON settings fail with a useful configuration error', () => {
  for (const change of [c => c.ratioStages[1].from = 3,c => c.ratioStages[0].weights.deep = -1,c => c.ratioStages[0].weights.unknown = 5,c => c.sources[0].path = '../private.json',c => c.sources[0].path = 'https://example.com/cards.json',c => c.categories[0].color = 'url(javascript:bad)',c => c.categories[1].id = c.categories[0].id,c => c.game.targetCounts[1].count = 4,c => c.decks[0].categories = ['missing'],c => c.closure.delayDays = -1,c => c.game.afterLastStage = 'whatever']) {
    const c = clone(); change(c); assert.throws(() => validateConfig(c), ConfigurationError);
  }
  for (const input of [null, [], {}, 'bad']) assert.throws(() => validateConfig(input), ConfigurationError);
});
test('question validation rejects collisions, wrong origin and unknown types', () => {
  const base = structuredClone(packs[0]);
  assert.throws(() => prepareQuestions(cfg, [base, base]), ConfigurationError);
  const bad = structuredClone(base); bad.data.origin = 'additional'; assert.throws(() => prepareQuestions(cfg, [bad]), ConfigurationError);
  const unknown = structuredClone(base); unknown.data.questions[0].category = 'unknown'; assert.throws(() => prepareQuestions(cfg, [unknown]), ConfigurationError);
});
test('names and deck constraints are checked before starting', () => {
  for (const [names, deck, sources] of [[['A'],'base',['original']],[['a','A'],'base',['original']],[['A','B','C'],'couple',['original']],[['A','B'],'base',[]],[['A','B'],'base',['missing']]]) assert.throws(() => createGame(cfg, qs, names, deck, sources, seeded()));
});
test('an empty first-stage pool stops, rather than leaking deep cards', () => {
  const noOpening = qs.filter(q => q.categoryId !== 'ouverture');
  assert.throws(() => createGame(cfg, noOpening, ['A','B'], 'base', ['original']), DeckExhaustedError);
});
