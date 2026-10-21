/** Pure, DOM-free game rules. All content and probability bands come from JSON. */
export class ConfigurationError extends Error {
  constructor(issues) { super(issues.join('\n')); this.name = 'ConfigurationError'; this.issues = issues; }
}
export class DeckExhaustedError extends Error {
  constructor(reason = 'empty') { super('Aucune carte disponible pour cette étape.'); this.name = 'DeckExhaustedError'; this.reason = reason; }
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const text = (s, max = 1000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const id = s => typeof s === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(s);
const list = (a, max = 100) => Array.isArray(a) && a.length <= max;
const unique = a => new Set(a).size === a.length;
export function validateConfig(c) {
  const errors = [];
  const check = (condition, field, detail = 'valeur invalide') => { if (!condition) errors.push(`${field} : ${detail}`); };
  check(object(c), 'config', 'un objet JSON est attendu');
  if (!object(c)) throw new ConfigurationError(errors);
  check(c.schemaVersion === 1, 'schemaVersion', 'seule la version 1 est prise en charge');
  check(object(c.app) && text(c.app.name, 60) && text(c.app.tagline, 160) && text(c.app.intro, 1000) && c.app.language === 'fr', 'app');
  check(list(c.categories, 24) && c.categories.length > 0, 'categories');
  const categories = Array.isArray(c.categories) ? c.categories : [];
  for (const [i, cat] of categories.entries()) {
    check(object(cat) && id(cat.id) && text(cat.label, 80) && text(cat.symbol, 8) && /^#[0-9a-fA-F]{6}$/.test(cat.color) && text(cat.description, 300), `categories[${i}]`);
  }
  check(unique(categories.map(x => x?.id)), 'categories', 'les identifiants doivent être uniques');
  const ids = new Set(categories.map(x => x?.id));
  check(object(c.categoryMappings), 'categoryMappings');
  for (const [key, value] of Object.entries(c.categoryMappings ?? {})) check(id(key) && !ids.has(key) && ids.has(value), `categoryMappings.${key}`, 'la source doit être un alias et la cible un type existant');
  check(list(c.sources, 10) && c.sources.length > 0, 'sources');
  const sources = Array.isArray(c.sources) ? c.sources : [];
  for (const [i, source] of sources.entries()) {
    check(object(source) && id(source.id) && text(source.label, 100) && typeof source.required === 'boolean' && typeof source.defaultEnabled === 'boolean', `sources[${i}]`);
    check(typeof source?.path === 'string' && /^(\.\/)?[a-zA-Z0-9_./-]+\.json$/.test(source.path) && !source.path.startsWith('/') && !source.path.split('/').includes('..'), `sources[${i}].path`, 'chemin JSON relatif, dans le dossier de l’application');
  }
  check(unique(sources.map(x => x?.id)), 'sources', 'identifiants en double');
  check(sources.some(x => x?.defaultEnabled), 'sources', 'activez au moins une source par défaut');
  check(list(c.decks, 20) && c.decks.length > 0, 'decks');
  const decks = Array.isArray(c.decks) ? c.decks : [];
  for (const [i, deck] of decks.entries()) {
    check(object(deck) && id(deck.id) && text(deck.label, 80) && text(deck.eyebrow, 100) && text(deck.description, 500) && text(deck.symbol, 8), `decks[${i}]`);
    check(list(deck?.categories, 24) && deck.categories.length > 0 && unique(deck.categories) && deck.categories.every(x => ids.has(x)), `decks[${i}].categories`);
    check(list(deck?.excludedTags, 40) && deck.excludedTags.every(id), `decks[${i}].excludedTags`);
    check(integer(deck?.minPlayers, 2, 20) && integer(deck?.maxPlayers, deck.minPlayers, 20), `decks[${i}].minPlayers/maxPlayers`);
  }
  check(unique(decks.map(x => x?.id)), 'decks', 'identifiants en double');
  check(decks.some(x => x?.id === c.defaultDeck), 'defaultDeck', 'jeu inconnu');
  check(object(c.rules) && text(c.rules.title, 500) && list(c.rules.items, 30) && c.rules.items.length > 0 && c.rules.items.every(x => text(x, 1500)), 'rules');
  check(list(c.rules?.howTo, 10) && c.rules.howTo.length > 0 && c.rules.howTo.every(x => object(x) && text(x.title, 100) && text(x.text, 1000)), 'rules.howTo');
  const g = c.game ?? {};
  check(integer(g.minPlayers, 2, 20) && integer(g.maxPlayers, g.minPlayers, 20), 'game.minPlayers/maxPlayers');
  check(['first', 'random'].includes(g.firstAsker), 'game.firstAsker');
  for (const key of ['allowAdditionalResponders', 'skipAdvancesAsker', 'noRepeatText']) check(typeof g[key] === 'boolean', `game.${key}`);
  check(['repeat-last', 'stop'].includes(g.afterLastStage), 'game.afterLastStage');
  check(g.maxQuestions === null || integer(g.maxQuestions, 1, 100000), 'game.maxQuestions');
  check(list(g.targetCounts, 20) && g.targetCounts.length > 0, 'game.targetCounts');
  let previousMin = 0;
  for (const [i, entry] of (Array.isArray(g.targetCounts) ? g.targetCounts : []).entries()) {
    check(object(entry) && integer(entry.minPlayers, 2, 20) && entry.minPlayers > previousMin && integer(entry.count, 1, entry.minPlayers - 1), `game.targetCounts[${i}]`, 'seuils croissants, nombre de cibles inférieur au nombre de personnes');
    previousMin = entry?.minPlayers;
  }
  for (const deck of decks) check(deck?.minPlayers <= g.maxPlayers && deck?.maxPlayers >= g.minPlayers, `decks / ${deck?.id}`, 'les bornes doivent croiser celles de game');
  const defaultDeck = decks.find(d => d?.id === c.defaultDeck);
  check(defaultDeck?.minPlayers <= g.minPlayers && defaultDeck?.maxPlayers >= g.minPlayers, 'defaultDeck', 'ce jeu doit accepter le nombre minimum initial de personnes');
  check(g.targetCounts?.[0]?.minPlayers <= g.minPlayers, 'game.targetCounts', 'le premier seuil doit couvrir le minimum de personnes');
  check(list(c.ratioStages, 100) && c.ratioStages.length > 0, 'ratioStages');
  let next = 1;
  for (const [i, stage] of (Array.isArray(c.ratioStages) ? c.ratioStages : []).entries()) {
    check(object(stage) && stage.from === next && integer(stage.to, stage.from, 100000), `ratioStages[${i}]`, 'les plages doivent commencer à 1 et se suivre sans trou ni chevauchement');
    next = stage?.to + 1;
    check(object(stage?.weights) && Object.keys(stage.weights).every(x => ids.has(x)) && Object.values(stage.weights).every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1000000) && Object.values(stage.weights).some(x => x > 0), `ratioStages[${i}].weights`, 'poids positifs ou nuls, types connus, au moins un poids positif');
    for (const deck of decks) check(Array.isArray(deck?.categories) && deck.categories.some(x => (stage?.weights?.[x] ?? 0) > 0), `ratioStages[${i}] / ${deck?.id}`, 'ce jeu doit avoir au moins un type de poids positif');
  }
  const closure = c.closure ?? {};
  check(typeof closure.enabled === 'boolean' && integer(closure.playerCount, 2, 2) && integer(closure.delayDays, 0, 3650) && integer(closure.maxAnswerLength, 100, 12000) && text(closure.prompt, 2000), 'closure');
  if (errors.length) throw new ConfigurationError(errors.slice(0, 30));
  return c;
}
export function prepareQuestions(config, packs) {
  const issues = [], result = [], ids = new Set();
  const categories = new Set(config.categories.map(c => c.id));
  for (const { source, data } of packs) {
    if (!object(data) || data.schemaVersion !== 1 || data.origin !== source.id || !list(data.questions, 10000)) {
      issues.push(`${source.path} : version, origin ou liste de questions invalide`); continue;
    }
    for (const [index, q] of data.questions.entries()) {
      const label = `${source.path} / question ${index + 1}`;
      const resolved = config.categoryMappings[q?.category] ?? q?.category;
      if (!object(q) || !id(q.id) || ids.has(q.id) || !text(q.text, 5000) || !categories.has(resolved) || !list(q.tags, 30) || !q.tags.every(id) || !integer(q.minPlayers, 2, 20) || typeof q.enabled !== 'boolean' || (q.maxPlayers !== undefined && !integer(q.maxPlayers, q.minPlayers, 20))) {
        issues.push(`${label} : identifiant en double ou champs invalides`); continue;
      }
      ids.add(q.id);
      result.push({ ...q, categoryId: resolved, sourceId: source.id, sourceLabel: source.label });
    }
  }
  if (issues.length) throw new ConfigurationError(issues.slice(0, 30));
  return result;
}
export function questionKey(q) {
  return q.text.normalize('NFKC').toLocaleLowerCase('fr').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}
export function secureRandom() {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Ce navigateur ne fournit pas de générateur aléatoire sûr.');
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
function randomIndex(length, random) {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error('Valeur aléatoire invalide.');
  return Math.floor(n * length);
}
export function shuffled(values, random = secureRandom) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) { const j = randomIndex(i + 1, random); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export function getStage(config, number) {
  const stage = config.ratioStages.find(s => number >= s.from && number <= s.to);
  if (stage) return stage;
  return config.game.afterLastStage === 'repeat-last' ? config.ratioStages.at(-1) : null;
}
export function eligibleQuestions(config, questions, { deckId, sourceIds, players }) {
  const deck = config.decks.find(d => d.id === deckId);
  if (!deck) return [];
  const count = typeof players === 'number' ? players : players.length;
  return questions.filter(q => q.enabled && sourceIds.includes(q.sourceId) && deck.categories.includes(q.categoryId) && !q.tags.some(tag => deck.excludedTags.includes(tag)) && q.minPlayers <= count && (q.maxPlayers === undefined || q.maxPlayers >= count));
}
export function availableDistribution(config, questions, state, number = state.drawnCount + 1) {
  const stage = getStage(config, number);
  if (!stage) return [];
  const seen = new Set(state.seenKeys), used = new Set(state.usedIds);
  const pool = eligibleQuestions(config, questions, state).filter(q => !used.has(q.id) && (!config.game.noRepeatText || !seen.has(questionKey(q))));
  const groups = config.categories.map(cat => ({ categoryId: cat.id, weight: stage.weights[cat.id] ?? 0, questions: pool.filter(q => q.categoryId === cat.id) })).filter(x => x.weight > 0 && x.questions.length > 0);
  const total = groups.reduce((sum, x) => sum + x.weight, 0);
  return groups.map(x => ({ ...x, probability: x.weight / total }));
}
export function createGame(config, questions, players, deckId, sourceIds, random = secureRandom) {
  const clean = players.map(x => typeof x === 'string' ? x.trim() : '');
  const deck = config.decks.find(x => x.id === deckId);
  if (!deck || clean.length < Math.max(config.game.minPlayers, deck.minPlayers) || clean.length > Math.min(config.game.maxPlayers, deck.maxPlayers) || clean.some(x => !text(x, 32)) || !unique(clean.map(x => x.toLocaleLowerCase('fr'))) || !Array.isArray(sourceIds) || !sourceIds.length || !unique(sourceIds) || sourceIds.some(x => !config.sources.some(s => s.id === x))) throw new Error('Vérifiez les prénoms, leur nombre et le jeu choisi.');
  const state = { version: 1, players: clean, deckId, sourceIds: [...sourceIds], askerIndex: config.game.firstAsker === 'random' ? randomIndex(clean.length, random) : 0, drawnCount: 0, turnsCompleted: 0, seenKeys: [], usedIds: [], current: null };
  return drawCard(config, questions, state, 'start', random);
}
export function drawCard(config, questions, state, action = 'next', random = secureRandom) {
  if (!['start', 'next', 'skip'].includes(action)) throw new Error('Action de jeu inconnue.');
  const copy = structuredClone(state), number = copy.drawnCount + 1;
  if ((config.game.maxQuestions !== null && number > config.game.maxQuestions) || !getStage(config, number)) throw new DeckExhaustedError('limit');
  if (action === 'next' || (action === 'skip' && config.game.skipAdvancesAsker)) { copy.askerIndex = (copy.askerIndex + 1) % copy.players.length; copy.turnsCompleted++; }
  const distribution = availableDistribution(config, questions, copy, number);
  if (!distribution.length) throw new DeckExhaustedError();
  let threshold = randomIndex(1000000000, random) / 1000000000;
  let chosen = distribution.at(-1);
  for (const group of distribution) { threshold -= group.probability; if (threshold < 0) { chosen = group; break; } }
  const question = chosen.questions[randomIndex(chosen.questions.length, random)];
  const targetRule = config.game.targetCounts.filter(x => x.minPlayers <= copy.players.length).at(-1);
  const others = copy.players.map((_, i) => i).filter(i => i !== copy.askerIndex);
  const targets = shuffled(others, random).slice(0, Math.min(targetRule.count, others.length));
  copy.drawnCount = number;
  copy.usedIds.push(question.id); copy.seenKeys.push(questionKey(question));
  copy.current = { questionId: question.id, categoryId: question.categoryId, askerIndex: copy.askerIndex, targetIndices: targets, extraIndices: [] };
  return copy;
}
export function toggleResponder(config, state, index) {
  if (!config.game.allowAdditionalResponders || !integer(index, 0, state.players.length - 1) || index === state.askerIndex || state.current.targetIndices.includes(index)) return state;
  const copy = structuredClone(state), extra = copy.current.extraIndices;
  copy.current.extraIndices = extra.includes(index) ? extra.filter(x => x !== index) : [...extra, index];
  return copy;
}
export function contentSignature(config, questions) {
  // Change detection only, never an authentication or password hash.
  let hash = 2166136261;
  for (const char of JSON.stringify([config, questions])) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}
export function validateSavedGame(config, questions, state) {
  try {
    if (!object(state) || state.version !== 1 || !list(state.players, 20) || !state.players.every(p => text(p, 32)) || !unique(state.players.map(p => p.toLocaleLowerCase('fr'))) || !list(state.sourceIds, 10) || !unique(state.sourceIds) || !state.sourceIds.length || state.sourceIds.some(x => !config.sources.some(s => s.id === x))) return false;
    const deck = config.decks.find(d => d.id === state.deckId), count = state.players.length;
    if (!deck || count < Math.max(deck.minPlayers, config.game.minPlayers) || count > Math.min(deck.maxPlayers, config.game.maxPlayers) || !integer(state.askerIndex, 0, count - 1) || !integer(state.drawnCount, 1, 100000) || !integer(state.turnsCompleted, 0, state.drawnCount) || !list(state.usedIds, 10000) || state.usedIds.length !== state.drawnCount || !unique(state.usedIds) || !list(state.seenKeys, 10000) || state.seenKeys.length !== state.drawnCount || !state.seenKeys.every(k => text(k, 5000))) return false;
    const pool = eligibleQuestions(config, questions, state), map = new Map(pool.map(q => [q.id, q]));
    if (!state.usedIds.every((x, i) => map.has(x) && questionKey(map.get(x)) === state.seenKeys[i])) return false;
    if (config.game.noRepeatText && !unique(state.seenKeys)) return false;
    const current = state.current, question = map.get(current?.questionId);
    if (!question || current.questionId !== state.usedIds.at(-1) || current.categoryId !== question.categoryId || current.askerIndex !== state.askerIndex || !list(current.targetIndices, count - 1) || !current.targetIndices.length || !list(current.extraIndices, count - 1)) return false;
    const targetRule = config.game.targetCounts.filter(x => x.minPlayers <= count).at(-1);
    if (current.targetIndices.length !== Math.min(targetRule.count, count - 1) || (!config.game.allowAdditionalResponders && current.extraIndices.length)) return false;
    const all = [...current.targetIndices, ...current.extraIndices];
    return unique(all) && all.every(x => integer(x, 0, count - 1) && x !== state.askerIndex);
  } catch { return false; }
}
