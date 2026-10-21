import { validateConfig, prepareQuestions, createGame, drawCard, toggleResponder, eligibleQuestions, questionKey, getStage, contentSignature, validateSavedGame, DeckExhaustedError } from './engine.mjs';
import { createStore } from './storage.mjs';
import { createCapsuleDraft, encryptAnswer, decryptAnswer, capsuleContext, validateCapsule, canUnlock, MIN_PASSPHRASE_LENGTH } from './capsule.mjs';

const main = document.querySelector('#main'), dialog = document.querySelector('#modal');
let config, questions = [], sourcePacks = [], unavailableSources = new Set(), loadWarnings = [];
let game = null, savedGame = null, signature, capsules = [], setup, store, exhausted = null;
let dialogEpoch = 0, toastTimer, drawLocked = false;
const date = timestamp => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(timestamp);
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

/** JSON text is always inserted as text nodes, never HTML. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), event => {
      try { const result = value(event); if (result?.catch) result.catch(error => notify(error.message || 'Une erreur est survenue.')); }
      catch (error) { notify(error.message || 'Une erreur est survenue.'); }
    });
    else if (key === 'class') node.className = value;
    else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'open'].includes(key)) node[key] = value;
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function button(label, onClick, className = 'btn btn-primary', attrs = {}) { return el('button', { type: 'button', class: className, onClick, ...attrs }, label); }
function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
}
function announce(message) { document.querySelector('#announcer').textContent = message; }
function render(content, focus = false) { main.replaceChildren(content); if (focus) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); } }
let modalInstance, modalReturnFocus;
const isDialogOpen = () => dialog.classList.contains('show');
function hideDialog() { if (isDialogOpen()) modalInstance.hide(); }
function focusDialog() {
  const target = dialog.querySelector('.modal-body').querySelector('input:not([type="hidden"]), textarea, select, button') ?? dialog.querySelector('.btn-close');
  target?.focus();
}
function showDialog(title, content, { wide = false } = {}) {
  dialogEpoch++;
  const panel = dialog.querySelector('.modal-dialog');
  panel.classList.toggle('modal-xl', wide);
  panel.classList.toggle('modal-lg', !wide);
  dialog.querySelector('#modal-title').textContent = title;
  dialog.querySelector('.modal-body').replaceChildren(...(Array.isArray(content) ? content : [content]));
  if (isDialogOpen()) { modalInstance.handleUpdate(); focusDialog(); }
  else { modalReturnFocus = document.activeElement; modalInstance.show(); }
  dialog.querySelector('.modal-body').scrollTop = 0;
  return dialogEpoch;
}
// No fade class: replacing a modal screen never races a Bootstrap hide transition.
dialog.addEventListener('shown.bs.modal', focusDialog);
dialog.addEventListener('hide.bs.modal', () => { dialogEpoch++; });
dialog.addEventListener('hidden.bs.modal', () => {
  dialog.querySelector('.modal-body').replaceChildren();
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  else main.focus({ preventScroll: true });
});
function selectedSourceIds() { return setup.sourceIds.filter(id => !unavailableSources.has(id)); }
function uniqueCount(deckId, sourceIds = selectedSourceIds(), count = setup.players.length) { return new Set(eligibleQuestions(config, questions, { deckId, sourceIds, players: count }).map(questionKey)).size; }
function saveGame() { if (game) { savedGame = game; store.set('session', { signature, state: game }); } }
function clearGame() { store.remove('session'); savedGame = null; game = null; exhausted = null; }
function countCardLabel(n) { return `${n} question${n === 1 ? '' : 's'} différente${n === 1 ? '' : 's'}`; }

function hero() {
  return el('section', { class: 'mb-4' }, el('h1', { class: 'h2 mb-2' }, config.app.name), el('p', { class: 'lead mb-2' }, config.app.tagline), el('p', { class: 'text-body-secondary mb-2' }, config.app.intro), el('div', { class: 'd-flex flex-wrap gap-2' }, el('span', { class: 'badge text-bg-secondary' }, `${questions.filter(q => q.sourceId === 'original').length} cartes originales`), el('span', { class: 'badge text-bg-secondary' }, `${config.game.minPlayers} à ${config.game.maxPlayers} personnes`), el('span', { class: 'badge text-bg-secondary' }, 'Un écran partagé')));
}
function renderHome(focus = false, focusPlayer = null) {
  game = null; exhausted = null;
  const formError = el('p', { class: 'text-danger small field-error', role: 'alert', id: 'setup-error' });
  const chosen = config.decks.find(d => d.id === setup.deckId);
  if (!chosen || setup.players.length > chosen.maxPlayers || setup.players.length < chosen.minPlayers) setup.deckId = config.defaultDeck;
  const list = el('ol', { class: 'list-unstyled mb-0', 'aria-label': 'Personnes dans l’ordre du tour' }, setup.players.map((value, index) =>
    el('li', { class: 'mb-2' }, el('div', { class: 'input-group' }, el('span', { class: 'input-group-text', 'aria-hidden': 'true' }, index + 1), el('input', { class: 'form-control', id: `player-${index}`, 'aria-label': `Prénom de la personne ${index + 1}`, 'aria-describedby': 'order-help', placeholder: `Prénom ${index + 1}`, autocomplete: 'off', maxlength: '32', value, required: '', onInput: event => { setup.players[index] = event.target.value; formError.textContent = ''; } }),
      button('↑', () => { [setup.players[index - 1], setup.players[index]] = [setup.players[index], setup.players[index - 1]]; renderHome(false, index - 1); }, 'btn btn-outline-secondary', { 'aria-label': `Monter la personne ${index + 1}`, disabled: index === 0 }), button('↓', () => { [setup.players[index + 1], setup.players[index]] = [setup.players[index], setup.players[index + 1]]; renderHome(false, index + 1); }, 'btn btn-outline-secondary', { 'aria-label': `Descendre la personne ${index + 1}`, disabled: index === setup.players.length - 1 }), button('×', () => { setup.players.splice(index, 1); renderHome(false, Math.max(0, index - 1)); }, 'btn btn-outline-danger', { 'aria-label': `Retirer la personne ${index + 1}`, disabled: setup.players.length <= config.game.minPlayers })))));
  const playerPanel = el('div', { class: 'col-lg-4' }, el('section', { class: 'card' }, el('div', { class: 'card-header' }, el('h2', { class: 'h5 mb-0' }, '1. Les participants')), el('div', { class: 'card-body' }, el('p', { class: 'small text-body-secondary' }, 'Entrez vos prénoms dans le sens des aiguilles d’une montre.'), list, button('Ajouter une personne', () => { setup.players.push(''); renderHome(false, setup.players.length - 1); }, 'btn btn-outline-primary w-100 mt-2', { disabled: setup.players.length >= config.game.maxPlayers }), el('p', { class: 'form-text mb-0', id: 'order-help' }, 'Utilisez ↑ et ↓ pour changer l’ordre des personnes.'))));
  const deckOptions = el('fieldset', { class: 'mb-4' }, el('legend', { class: 'visually-hidden' }, 'Choisir le jeu de cartes'), el('div', { class: 'row row-cols-1 row-cols-xl-3 g-3' }, config.decks.map(deck => {
    const allowed = setup.players.length >= deck.minPlayers && setup.players.length <= deck.maxPlayers;
    return el('div', { class: 'col' }, el('div', { class: `card h-100${setup.deckId === deck.id ? ' border-primary' : ''}${allowed ? '' : ' opacity-50'}` }, el('div', { class: 'card-body' }, el('div', { class: 'form-check mb-2' }, el('input', { class: 'form-check-input', type: 'radio', name: 'deck', id: `deck-${deck.id}`, value: deck.id, checked: setup.deckId === deck.id, disabled: !allowed, onChange: () => { setup.deckId = deck.id; renderHome(); document.querySelector(`#deck-${deck.id}`)?.focus(); } }), el('label', { class: 'form-check-label fw-semibold', for: `deck-${deck.id}` }, deck.label)), el('p', { class: 'small text-body-secondary mb-2' }, deck.eyebrow), el('p', { class: 'small mb-2' }, deck.description), el('p', { class: 'small fw-semibold mb-0' }, allowed ? countCardLabel(uniqueCount(deck.id)) : `${deck.minPlayers === deck.maxPlayers ? deck.minPlayers : `${deck.minPlayers} à ${deck.maxPlayers}`} personnes uniquement`))));
  })));
  const sources = el('fieldset', { class: 'border rounded p-3 mb-3' }, el('legend', { class: 'float-none w-auto px-2 fs-6' }, 'Les cartes à mettre dans la pioche'), el('p', { class: 'small text-body-secondary' }, 'Les ajouts sont séparés des questions originales et portent leur propre étiquette.'), config.sources.map(source => {
    const absent = unavailableSources.has(source.id), count = questions.filter(q => q.sourceId === source.id && q.enabled).length;
    return el('div', { class: 'form-check mb-2' }, el('input', { class: 'form-check-input', type: 'checkbox', id: `source-${source.id}`, checked: selectedSourceIds().includes(source.id), disabled: absent, onChange: event => { setup.sourceIds = event.target.checked ? [...new Set([...setup.sourceIds, source.id])] : setup.sourceIds.filter(x => x !== source.id); renderHome(); document.querySelector(`#source-${source.id}`)?.focus(); } }), el('label', { class: 'form-check-label', for: `source-${source.id}` }, source.label), el('div', { class: 'form-text' }, absent ? 'Fichier indisponible : cette source n’est pas utilisée.' : `${count} entrées${source.id === 'additional' ? ' · propositions IA, hors document original' : ''}`));
  }));
  const form = el('form', { onSubmit: event => {
    event.preventDefault();
    try {
      const pending = createGame(config, questions, setup.players, setup.deckId, selectedSourceIds());
      showRules(() => { hideDialog(); game = pending; exhausted = null; saveGame(); renderGame(true); });
    } catch (error) { formError.textContent = error instanceof DeckExhaustedError ? 'Aucune carte n’est disponible pour la première étape. Activez une source contenant les types prévus par le premier ratio.' : error.message; }
  } }, el('div', { class: 'row g-4' }, playerPanel, el('div', { class: 'col-lg-8' }, el('section', { class: 'card' }, el('div', { class: 'card-header' }, el('h2', { class: 'h5 mb-0' }, '2. Le jeu de cartes')), el('div', { class: 'card-body' }, deckOptions, sources, formError, el('div', { class: 'd-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3' }, el('p', { class: 'small text-body-secondary mb-0' }, 'Les règles vous seront rappelées avant de commencer.'), el('button', { class: 'btn btn-primary', type: 'submit' }, 'Commencer la partie')))))));
  const resume = savedGame ? el('div', { class: 'alert alert-info d-flex flex-column flex-md-row align-items-md-center gap-3' }, el('div', { class: 'flex-grow-1' }, el('strong', {}, 'Partie enregistrée'), el('div', {}, `${savedGame.players.join(', ')} · carte ${savedGame.drawnCount}`)), el('div', { class: 'd-flex gap-2' }, button('Reprendre', () => { game = savedGame; renderGame(true); }, 'btn btn-primary btn-sm'), button('Effacer', () => confirmDialog('Effacer cette partie ?', 'Les prénoms et la progression de cette partie seront supprimés de ce navigateur. Vos capsules restent conservées.', () => { clearGame(); renderHome(); }), 'btn btn-outline-danger btn-sm'))) : null;
  render(el('div', {}, hero(), ...loadWarnings.map(warning => el('p', { class: 'alert alert-warning' }, warning)), resume, form), focus);
  if (focusPlayer !== null) document.querySelector(`#player-${focusPlayer}`)?.focus();
}
function showRules(onStart = null) {
  showDialog('Les règles', [el('h2', { class: 'h4' }, config.rules.title), el('ul', { class: 'list-group mb-4' }, config.rules.items.map(item => el('li', { class: 'list-group-item' }, item))), el('div', { class: 'row g-3 mb-4' }, config.rules.howTo.map((step, index) => el('div', { class: 'col-md-4' }, el('div', { class: 'card h-100' }, el('div', { class: 'card-body' }, el('span', { class: 'badge text-bg-primary mb-2' }, index + 1), el('h3', { class: 'h6' }, step.title), el('p', { class: 'small text-body-secondary mb-0' }, step.text)))))), el('p', { class: 'small text-body-secondary' }, 'Le numéro de carte avance à chaque tirage, y compris lorsque vous passez. Les chances de tirage suivent les règles du jeu choisi.'), el('div', { class: 'd-flex justify-content-end gap-2 mt-4' }, button(onStart ? 'Commencer' : 'Fermer', onStart ?? hideDialog))]);
}

function confirmDialog(title, description, action) { showDialog('À vous de choisir', [el('h2', {}, title), el('p', {}, description), el('div', { class: 'd-flex flex-wrap justify-content-end gap-2 mt-4' }, button('Annuler', hideDialog, 'btn btn-outline-secondary'), button('Confirmer', () => { hideDialog(); action(); }))]); }
function renderGame(focus = false) {
  if (!game) return renderHome(focus);
  if (exhausted) return renderExhausted(focus);
  const q = questions.find(x => x.id === game.current.questionId), cat = config.categories.find(x => x.id === q.categoryId), deck = config.decks.find(x => x.id === game.deckId);
  const categoryBadge = el('span', { class: 'badge text-dark border' }, `${cat.symbol} ${cat.label}`);
  categoryBadge.style.backgroundColor = cat.color;
  const questionCard = el('article', { class: 'card shadow-sm', 'aria-labelledby': 'question-text' }, el('div', { class: 'card-header d-flex flex-wrap justify-content-between align-items-center gap-2' }, categoryBadge, el('span', { class: 'small text-body-secondary' }, `Carte ${game.drawnCount}`)), el('div', { class: 'card-body py-5' }, el('h2', { class: 'h3 lh-base mb-0 question-text', id: 'question-text' }, q.text)), el('div', { class: 'card-footer d-flex flex-wrap justify-content-between align-items-center gap-2 small' }, el('span', {}, config.app.name), el('span', { class: q.sourceId === 'original' ? 'badge text-bg-primary' : 'badge text-bg-secondary' }, q.sourceId === 'original' ? 'Le jeu original' : `Ajout · ${q.sourceLabel}`)));
  const turnPanel = el('div', { class: 'col-md-4' }, el('aside', { class: 'card', 'aria-label': 'Le tour de parole' }, el('div', { class: 'card-header' }, 'Le tour de parole'), el('div', { class: 'card-body' }, el('p', { class: 'small text-body-secondary mb-1' }, 'Pose la question'), el('p', { class: 'h4 text-break mb-3' }, game.players[game.askerIndex]), el('p', { class: 'small text-body-secondary mb-2' }, game.current.targetIndices.length > 1 ? 'Répondent' : 'Répond'), el('div', { class: 'd-flex flex-wrap gap-2' }, game.current.targetIndices.map(i => el('span', { class: 'badge text-bg-primary text-wrap' }, game.players[i])))), el('ul', { class: 'list-group list-group-flush', 'aria-label': 'Ordre des personnes' }, game.players.map((name, index) => el('li', { class: `list-group-item text-break${index === game.askerIndex ? ' active' : ''}`, ...(index === game.askerIndex ? { 'aria-current': 'step' } : {}) }, `${index + 1}. ${name}`)))));
  const candidates = game.players.map((name, index) => ({ name, index })).filter(x => x.index !== game.askerIndex && !game.current.targetIndices.includes(x.index));
  const extras = config.game.allowAdditionalResponders && candidates.length ? el('section', { class: 'card mt-3' }, el('div', { class: 'card-body' }, el('h3', { class: 'h6' }, 'Quelqu’un d’autre veut répondre ?'), el('div', { class: 'd-flex flex-wrap gap-2' }, candidates.map(({ name, index }) => button(`${game.current.extraIndices.includes(index) ? '✓ ' : ''}${name}`, () => { game = toggleResponder(config, game, index); saveGame(); renderGame(); }, game.current.extraIndices.includes(index) ? 'btn btn-secondary btn-sm' : 'btn btn-outline-secondary btn-sm', { 'aria-pressed': String(game.current.extraIndices.includes(index)) }))))) : null;
  const stage = getStage(config, game.drawnCount), stageIndex = config.ratioStages.indexOf(stage);
  const progressBar = el('div', { class: 'progress-bar' });
  progressBar.style.width = `${(stageIndex + 1) / config.ratioStages.length * 100}%`;
  render(el('section', {}, el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-4' }, el('div', {}, el('h1', { class: 'h3 mb-1' }, 'La partie'), el('p', { class: 'text-body-secondary mb-0' }, deck.label)), el('div', { class: 'd-flex gap-2' }, button('Pause', () => { saveGame(); renderHome(true); }, 'btn btn-outline-secondary'), button('Clôturer', showEndingChoices, 'btn btn-outline-secondary'))), el('div', { class: 'row g-4' }, turnPanel, el('div', { class: 'col-md-8' }, questionCard, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mt-3' }, button('Passer cette carte', () => advance('skip'), 'btn btn-outline-secondary'), button('Carte suivante →', () => advance('next'))), extras)), el('div', { class: 'mt-4' }, el('p', { class: 'small text-body-secondary mb-2' }, `Étape ${stageIndex + 1} / ${config.ratioStages.length} · carte ${game.drawnCount} · prenez votre temps`), el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progression entre les étapes de tirage', 'aria-valuenow': stageIndex + 1, 'aria-valuemin': 0, 'aria-valuemax': config.ratioStages.length }, progressBar), el('p', { class: 'small text-body-secondary mt-2' }, 'Raccourci clavier : flèche droite pour la carte suivante.'))), focus);
  announce(`Carte ${game.drawnCount}. ${game.players[game.askerIndex]} demande à ${game.current.targetIndices.map(i => game.players[i]).join(' et ')} : ${q.text}`);
}

function advance(action) {
  if (!game || isDialogOpen() || drawLocked || exhausted) return;
  drawLocked = true; setTimeout(() => { drawLocked = false; }, 250);
  try { game = drawCard(config, questions, game, action); saveGame(); renderGame(); }
  catch (error) { if (error instanceof DeckExhaustedError) { exhausted = error.reason; renderExhausted(true); } else notify(error.message); }
}
function renderExhausted(focus = false) {
  render(el('section', { class: 'card card-body text-center py-5' }, el('span', { class: 'd-none', 'aria-hidden': 'true' }, '✳'), el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'LA PIOCHE FAIT UNE PAUSE'), el('h1', {}, exhausted === 'limit' ? 'Chaque chose en son temps.' : 'Vous avez fait le tour.'), el('p', {}, exhausted === 'limit' ? 'La limite définie dans les règles est atteinte.' : 'Il ne reste plus de carte inédite dans les catégories prévues à cette étape. Les types à 0 % restent à 0 %.'), el('div', { class: 'd-flex justify-content-center flex-wrap gap-2' }, button('Clôturer ce moment', showEndingChoices), button('Revoir la dernière carte', () => { exhausted = null; renderGame(); }, 'btn btn-outline-secondary'))), focus);
}
function showEndingChoices() {
  if (!game) return;
  const allowCapsule = config.closure.enabled && game.players.length === config.closure.playerCount;
  showDialog('Clôturer', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'ON S’ARRÊTE ICI ?'), el('h2', {}, 'Gardez quelque chose de ce moment.'), el('p', {}, allowCapsule ? 'À deux, vous pouvez écrire chacun·e une dernière réponse et la retrouver plus tard dans une capsule chiffrée.' : 'Prenez un instant pour vous dire ce que vous retenez de cette conversation.'), allowCapsule ? el('p', { class: 'small text-body-secondary' }, `La capsule s’ouvre dans ${config.closure.delayDays} jour${config.closure.delayDays === 1 ? '' : 's'}, sur cet appareil ou depuis son fichier exporté. Chaque personne choisit sa propre phrase secrète.`) : null, el('div', { class: 'd-flex flex-wrap justify-content-end gap-2 mt-4' }, button('Continuer à parler', hideDialog, 'btn btn-outline-secondary'), button('Terminer simplement', () => { hideDialog(); finishGame(); }, 'btn btn-outline-secondary'), allowCapsule ? button('Créer notre capsule →', beginCapsule) : null)]);
}
function finishGame(capsuleCreated = false, persisted = true) {
  const summary = { count: game?.drawnCount ?? 0, names: game?.players ?? [] };
  clearGame();
  render(el('section', { class: 'card card-body text-center py-5' }, el('span', { class: 'd-none', 'aria-hidden': 'true' }, '✷'), el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'CE N’ÉTAIT QU’UN DÉBUT'), el('h1', {}, 'La suite, c’est vous.'), el('p', {}, `${summary.count} carte${summary.count > 1 ? 's' : ''}, ${summary.names.length} personnes, et des choses à garder pour soi.`), capsuleCreated ? el('p', { class: 'alert alert-info' }, persisted ? 'Votre capsule chiffrée est conservée dans ce navigateur. Pensez à en exporter une copie.' : 'La capsule reste disponible pour export pendant cette session. Ce navigateur n’a pas pu l’enregistrer.') : null, el('div', { class: 'd-flex justify-content-center flex-wrap gap-2' }, button('Une autre conversation →', () => renderHome(true)), capsuleCreated ? button('Voir les capsules', showCapsules, 'btn btn-outline-secondary') : null)), true);
}
function showCards() {
  let category = 'all', source = 'all', search = '';
  const results = el('div'), count = el('p', { class: 'small text-body-secondary', role: 'status' });
  const update = () => {
    const filtered = questions.filter(q => (category === 'all' || q.categoryId === category) && (source === 'all' || q.sourceId === source) && normalize(q.text).includes(normalize(search)));
    count.textContent = `${filtered.length} entrées · les doublons du document sont conservés ici et évités pendant la partie.`;
    results.replaceChildren(...config.sources.map(s => {
      const group = filtered.filter(q => q.sourceId === s.id);
      if (!group.length) return null;
      return el('section', { class: 'mb-4' }, el('h3', { class: 'h5' }, `${s.label} · ${group.length}`), s.id !== 'original' ? el('p', { class: 'alert alert-info small' }, 'Hors document original. Ce paquet est séparé et son activation est facultative.') : null, el('ul', { class: 'list-group' }, group.map(q => el('li', { class: 'list-group-item' }, el('div', { class: 'small text-body-secondary mb-1' }, `${config.categories.find(c => c.id === q.categoryId).label}${q.tags.includes('couple') ? ' · Couple' : ''}${q.enabled ? '' : ' · Désactivée'}${q.sourcePage ? ` · PDF p. ${q.sourcePage}` : ''}`), el('p', { class: 'mb-1' }, q.text), q.editorialNote ? el('small', { class: 'text-body-secondary' }, q.editorialNote) : null))));
    }).filter(Boolean));
    if (!filtered.length) results.append(el('p', { class: 'alert alert-secondary' }, 'Aucune carte ne correspond à cette recherche.'));
  };
  const categorySelect = el('select', { class: 'form-select', 'aria-label': 'Filtrer par type', onChange: event => { category = event.target.value; update(); } }, el('option', { value: 'all' }, 'Tous les types'), config.categories.map(c => el('option', { value: c.id }, c.label)));
  const sourceSelect = el('select', { class: 'form-select', 'aria-label': 'Filtrer par provenance', onChange: event => { source = event.target.value; update(); } }, el('option', { value: 'all' }, 'Toutes les provenances'), config.sources.map(s => el('option', { value: s.id }, s.label)));
  update();
  showDialog('Les cartes', [el('p', { class: 'text-body-secondary' }, 'Le jeu original et les questions ajoutées sont présentés séparément.'), el('div', { class: 'row g-2 mb-3' }, el('div', { class: 'col-12' }, el('input', { class: 'form-control', type: 'search', placeholder: 'Rechercher une question…', 'aria-label': 'Rechercher dans les questions', maxlength: '100', onInput: event => { search = event.target.value; update(); } })), el('div', { class: 'col-sm-6' }, categorySelect), el('div', { class: 'col-sm-6' }, sourceSelect)), count, results], { wide: true });
}

function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = el('a', { href: url, download: filename }); document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function persistCapsules() { return store.set('capsules', capsules); }
function exportCapsule(capsule) { downloadJSON(capsule, `cardz-capsule-${capsule.id}.json`); }
function showCapsules() {
  const importInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Importer une capsule chiffrée', onChange: async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Le fichier dépasse la taille maximale de 1 Mo.');
      const data = JSON.parse(await file.text());
      if (!validateCapsule(data)) throw new Error('Ce fichier n’est pas une capsule cardz valide.');
      if (capsules.some(c => c.id === data.id)) throw new Error('Cette capsule est déjà présente.');
      if (capsules.length >= 20) throw new Error('Vous avez déjà 20 capsules. Exportez puis supprimez-en une avant d’en importer une autre.');
      capsules = [...capsules, data]; const ok = persistCapsules(); showCapsules(); notify(ok ? 'La capsule chiffrée a été importée.' : 'Importée pour cette session seulement : le stockage local est indisponible.');
    } catch (error) { notify(error instanceof SyntaxError ? 'Le fichier n’est pas un JSON valide.' : error.message); }
  } });
  const list = capsules.length ? el('ul', { class: 'list-group mb-3' }, [...capsules].sort((a, b) => b.createdAt - a.createdAt).map(c => el('li', { class: 'list-group-item py-3' }, el('h3', {}, c.players.join(' & ')), el('p', {}, `Créée le ${date(c.createdAt)}. ${canUnlock(c) ? 'Prête à être ouverte.' : `À retrouver le ${date(c.unlockAt)}.`}`), el('div', { class: 'd-flex flex-wrap gap-2' }, button(canUnlock(c) ? 'Ouvrir →' : 'Voir la capsule', () => showCapsule(c), 'btn btn-primary btn-sm'), button('Exporter', () => exportCapsule(c), 'btn btn-outline-secondary btn-sm'), button('Supprimer', () => confirmDialog('Supprimer cette capsule ?', 'Sans copie exportée, les réponses seront perdues. Les phrases secrètes ne permettent pas de recréer le fichier.', () => { capsules = capsules.filter(x => x.id !== c.id); persistCapsules(); showCapsules(); }), 'btn btn-outline-danger btn-sm'))))) : el('div', { class: 'border rounded p-4 text-center text-body-secondary my-3' }, el('span', { 'aria-hidden': 'true' }, '◷'), el('p', {}, 'Les conversations passent. Certaines réponses méritent de rester.'), el('p', { class: 'small' }, 'Créez votre première capsule à la fin d’une partie à deux.'));
  showDialog('Les capsules', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'POUR UN AUTRE JOUR'), el('h2', {}, 'Un petit rendez-vous avec plus tard.'), el('p', { class: 'text-body-secondary' }, 'Les réponses restent chiffrées dans ce navigateur. Exportez vos capsules pour les garder ou changer d’appareil. Les phrases secrètes ne sont jamais enregistrées.'), list, el('p', { class: 'small text-body-secondary' }, 'Le délai dépend de l’horloge de votre appareil. Effacer les données du navigateur efface les capsules qui n’ont pas été exportées.'), el('div', { class: 'd-flex flex-wrap justify-content-end gap-2 mt-4' }, button('Actualiser', showCapsules, 'btn btn-outline-secondary'), button('Importer une capsule', () => importInput.click(), 'btn btn-outline-secondary')), importInput]);
}
function beginCapsule() {
  if (!game) return;
  if (capsules.length >= 20) { notify('Vous avez déjà 20 capsules. Exportez puis supprimez-en une depuis « Les capsules ».'); return; }
  const draft = createCapsuleDraft(game.players, config.closure.prompt, config.closure.delayDays);
  writeCapsuleResponse(draft, 0);
}
function writeCapsuleResponse(draft, index) {
  const answer = el('textarea', { class: 'form-control answer-input', id: 'capsule-answer', required: '', maxlength: String(config.closure.maxAnswerLength), placeholder: 'Ce que tu aimerais garder de ce moment…', autocomplete: 'off' });
  const phrase = el('input', { class: 'form-control', id: 'capsule-phrase', type: 'password', required: '', minlength: String(MIN_PASSPHRASE_LENGTH), maxlength: '200', autocomplete: 'new-password' });
  const confirmation = el('input', { class: 'form-control', id: 'capsule-confirm', type: 'password', required: '', maxlength: '200', autocomplete: 'new-password' });
  const count = el('div', { class: 'small text-body-secondary text-end mt-1' }, `0 / ${config.closure.maxAnswerLength}`);
  answer.addEventListener('input', () => { count.textContent = `${answer.value.length} / ${config.closure.maxAnswerLength}`; });
  const error = el('p', { class: 'text-danger small field-error', role: 'alert' }), submit = el('button', { class: 'btn btn-primary w-100', type: 'submit' }, index === 0 ? 'Sceller ma réponse →' : 'Fermer notre capsule →');
  const epoch = showDialog('Notre capsule', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, `UNE DERNIÈRE QUESTION · ${index + 1} / 2`), el('h2', {}, `À toi, ${draft.players[index]}.`), el('p', { class: 'small text-body-secondary' }, 'Garde l’écran pour toi le temps d’écrire, puis passe-le à l’autre personne.'), el('p', { class: 'alert alert-secondary' }, draft.prompt), el('form', { onSubmit: async event => {
    event.preventDefault(); error.textContent = '';
    if (phrase.value !== confirmation.value) { error.textContent = 'Les deux phrases secrètes ne correspondent pas.'; confirmation.focus(); return; }
    submit.disabled = true; submit.textContent = 'Chiffrement de ta réponse…';
    try {
      const encrypted = await encryptAnswer(answer.value, phrase.value, capsuleContext(draft, index));
      if (epoch !== dialogEpoch || !isDialogOpen()) return;
      draft.responses[index] = encrypted;
      answer.value = ''; phrase.value = ''; confirmation.value = '';
      if (index === 0) {
        showDialog('Passez le relais', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'LA PREMIÈRE RÉPONSE EST SCELLÉE'), el('h2', {}, `À ${draft.players[1]}, maintenant.`), el('p', {}, 'La première réponse est chiffrée et n’est plus visible. La capsule sera conservée une fois les deux réponses écrites.'), button('J’ai récupéré l’écran →', () => writeCapsuleResponse(draft, 1), 'btn btn-primary w-100')]);
      } else {
        if (!validateCapsule(draft)) throw new Error('La capsule n’a pas pu être finalisée.');
        capsules = [...capsules, draft]; const persisted = persistCapsules();
        hideDialog(); finishGame(true, persisted);
        showDialog('La capsule est scellée', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'À BIENTÔT, VOUS DEUX'), el('h2', {}, 'On se retrouve plus tard.'), el('p', {}, `À ouvrir à partir du ${date(draft.unlockAt)}.`), el('p', { class: persisted ? 'alert alert-info' : 'alert alert-danger' }, persisted ? 'Les deux réponses chiffrées sont conservées dans ce navigateur. Gardez chacun·e votre phrase secrète et exportez une copie.' : 'Le navigateur n’a pas pu conserver cette capsule. Exportez-la maintenant, avant de quitter la page.'), el('p', { class: 'small text-body-secondary' }, 'Le délai repose sur l’horloge locale. Cette capsule n’est pas un coffre à ouverture différée garanti.'), el('div', { class: 'd-flex flex-wrap justify-content-end gap-2 mt-4' }, button('Exporter la capsule', () => exportCapsule(draft)), button('C’est noté', hideDialog, 'btn btn-outline-secondary'))]);
      }
    } catch (e) { if (epoch === dialogEpoch) error.textContent = e.message; }
    finally { phrase.value = ''; confirmation.value = ''; submit.disabled = false; submit.textContent = index === 0 ? 'Sceller ma réponse →' : 'Fermer notre capsule →'; }
  } }, el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: 'capsule-answer' }, 'Ta réponse'), answer, count), el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: 'capsule-phrase' }, 'Ta phrase secrète personnelle'), phrase, el('span', { class: 'small' }, 'Au moins 12 caractères, idéalement plusieurs mots. Note-la ailleurs : elle ne pourra pas être récupérée.')), el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: 'capsule-confirm' }, 'Encore une fois, pour être sûr·e'), confirmation), error, submit), el('p', { class: 'small text-body-secondary' }, 'Fermer cette fenêtre avant la fin annule la création. Les brouillons et les phrases secrètes ne sont pas sauvegardés.')]);
}
function showCapsule(capsule) {
  const ready = canUnlock(capsule);
  showDialog('Ouvrir une capsule', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'UN MOMENT À RETROUVER'), el('h2', {}, capsule.players.join(' & ')), el('p', { class: 'alert alert-secondary' }, capsule.prompt), el('p', {}, ready ? 'Votre rendez-vous est arrivé. Chaque personne peut ouvrir sa propre réponse avec sa phrase secrète.' : `Vos réponses seront disponibles le ${date(capsule.unlockAt)}.`), ready ? capsule.players.map((name, index) => button(`Ouvrir la réponse de ${name}`, () => unlockCapsule(capsule, index), 'btn btn-outline-secondary w-100')) : el('p', { class: 'alert alert-info' }, 'La date est calculée à partir de l’horloge de cet appareil ; le délai ne constitue pas une protection inviolable.'), el('div', { class: 'd-flex flex-wrap justify-content-end gap-2 mt-4' }, button('Exporter', () => exportCapsule(capsule), 'btn btn-outline-secondary'), button('Retour aux capsules', showCapsules, 'btn btn-outline-secondary'))]);
}
function unlockCapsule(capsule, index) {
  const pass = el('input', { class: 'form-control', id: 'unlock-phrase', type: 'password', required: '', maxlength: '200', autocomplete: 'off' });
  const error = el('p', { class: 'text-danger small field-error', role: 'alert' }), submit = el('button', { class: 'btn btn-primary w-100', type: 'submit' }, 'Retrouver ma réponse →');
  const epoch = showDialog('Retrouver sa réponse', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, 'CE QUE TU AVAIS ÉCRIT'), el('h2', {}, `À toi, ${capsule.players[index]}.`), el('p', { class: 'small text-body-secondary' }, 'Garde l’écran pour toi si tu préfères lire ta réponse en privé.'), el('form', { onSubmit: async event => {
    event.preventDefault(); error.textContent = ''; submit.disabled = true;
    try {
      const answer = await decryptAnswer(capsule, index, pass.value);
      if (epoch !== dialogEpoch || !isDialogOpen()) return;
      showDialog('Un moment retrouvé', [el('span', { class: 'small text-uppercase text-body-secondary fw-semibold d-block mb-2' }, date(capsule.createdAt)), el('h2', {}, `${capsule.players[index]}, tu avais écrit…`), el('p', { class: 'alert alert-secondary' }, capsule.prompt), el('div', { class: 'border rounded bg-body p-3 revealed-answer' }, answer), el('p', { class: 'small text-body-secondary' }, 'Cette réponse sera masquée lorsque tu fermeras cette fenêtre.'), el('div', { class: 'd-flex flex-wrap justify-content-end gap-2 mt-4' }, button('Masquer la réponse', () => showCapsule(capsule)))]);
    } catch (e) { if (epoch === dialogEpoch) error.textContent = e.message; }
    finally { pass.value = ''; submit.disabled = false; }
  } }, el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: 'unlock-phrase' }, 'Ta phrase secrète'), pass), error, submit)]);
}
async function fetchJSON(path, limit = 2000000) {
  const url = new URL(path, document.baseURI), base = new URL('./', document.baseURI);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error(`Le fichier ${path} doit rester dans le dossier du jeu.`);
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: abort.signal });
    if (!response.ok) throw new Error(`${path} : fichier introuvable ou inaccessible (HTTP ${response.status}).`);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > limit) throw new Error(`${path} : fichier trop volumineux.`);
    const raw = await response.text(); if (raw.length > limit) throw new Error(`${path} : fichier trop volumineux.`);
    try { return JSON.parse(raw); } catch { throw new Error(`${path} : JSON invalide. Vérifiez les virgules et les guillemets.`); }
  } catch (error) { if (error.name === 'AbortError') throw new Error(`${path} : le chargement a pris trop de temps.`); throw error; }
  finally { clearTimeout(timer); }
}
async function boot() {
  if (!globalThis.bootstrap?.Modal) throw new Error('Bootstrap n’a pas pu être chargé. Vérifiez le dossier assets/vendor/bootstrap.');
  modalInstance = new bootstrap.Modal(dialog);
  if (location.protocol === 'file:') throw new Error('Ouvrez ce jeu sur GitHub Pages ou avec un serveur local : le navigateur bloque la lecture des JSON depuis file://.');
  config = validateConfig(await fetchJSON('./config.json', 512000));
  const loads = await Promise.allSettled(config.sources.map(async source => {
    const data = await fetchJSON(source.path); prepareQuestions(config, [{ source, data }]); return { source, data };
  }));
  loads.forEach((load, index) => {
    const source = config.sources[index];
    if (load.status === 'fulfilled') sourcePacks.push(load.value);
    else if (source.required) throw load.reason;
    else { unavailableSources.add(source.id); loadWarnings.push(`${source.label} n’a pas pu être chargé. Le jeu continue sans ce paquet. ${load.reason.message}`); }
  });
  questions = prepareQuestions(config, sourcePacks);
  if (!questions.some(q => q.enabled)) throw new Error('Aucune question active n’a été chargée.');
  signature = contentSignature(config, questions);
  let backend;
  try { backend = window.localStorage; }
  catch { backend = { getItem() { throw new Error('Stockage indisponible.'); }, setItem() { throw new Error('Stockage indisponible.'); }, removeItem() { throw new Error('Stockage indisponible.'); } }; }
  store = createStore(`cardz:v1:${new URL('./', document.baseURI).pathname}`, backend, () => notify('Le stockage local est indisponible ou endommagé. Vous pouvez jouer, mais la progression peut être perdue. Exportez toute nouvelle capsule.'));
  const stored = store.get('session');
  if (stored?.signature === signature && validateSavedGame(config, questions, stored.state)) savedGame = stored.state;
  else if (stored) loadWarnings.push('Une ancienne progression ne correspond plus aux règles ou aux cartes actuelles. Commencez une nouvelle partie. Les capsules sont indépendantes.');
  const loadedCapsules = store.get('capsules');
  if (Array.isArray(loadedCapsules)) { capsules = loadedCapsules.filter(validateCapsule).slice(0, 20); if (capsules.length !== loadedCapsules.length) loadWarnings.push('Certaines capsules locales sont invalides et ne sont pas affichées. Conservez vos copies exportées.'); }
  setup = { players: Array.from({ length: config.game.minPlayers }, () => ''), deckId: config.defaultDeck, sourceIds: config.sources.filter(s => s.defaultEnabled && !unavailableSources.has(s.id)).map(s => s.id) };
  document.title = `${config.app.name} — ${config.app.tagline}`;
  document.documentElement.lang = config.app.language;
  document.querySelector('#home-button').addEventListener('click', () => { if (game) saveGame(); renderHome(true); });
  document.querySelector('#rules-button').addEventListener('click', () => showRules());
  document.querySelector('#cards-button').addEventListener('click', showCards);
  document.querySelector('#capsules-button').addEventListener('click', showCapsules);
  for (const id of ['rules-button', 'cards-button', 'capsules-button']) document.querySelector(`#${id}`).disabled = false;
  document.addEventListener('keydown', event => { if (event.key === 'ArrowRight' && !event.repeat && game && !isDialogOpen() && !event.target.closest('input,textarea,select,button,a,[contenteditable]')) { event.preventDefault(); advance('next'); } });
  renderHome();
}
boot().catch(error => {
  render(el('section', { class: 'card card-body p-5 text-center' }, el('span', { class: 'd-none', 'aria-hidden': 'true' }, '✳'), el('h1', {}, 'La boîte ne s’ouvre pas.'), el('p', {}, 'Un fichier de règles ou de questions n’a pas pu être lu. Aucune partie n’a été modifiée.'), el('p', { class: 'alert alert-danger' }, error.message), button('Réessayer', () => location.reload()), el('p', { class: 'small' }, el('a', { href: './guide.html' }, 'Consulter le guide de configuration'))));
});
