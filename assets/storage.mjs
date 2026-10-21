/** Storage is best-effort: playing remains possible if browser storage is blocked. */
export function createStore(namespace, backend, onFailure = () => {}) {
  let warned = false;
  function fail(error) { if (!warned) { warned = true; onFailure(error); } }
  return {
    get(key) {
      try { const raw = backend.getItem(`${namespace}:${key}`); if (!raw) return null; if (raw.length > 2000000) throw new Error('Donnée locale trop volumineuse.'); return JSON.parse(raw); }
      catch (error) { fail(error); return null; }
    },
    set(key, value) { try { backend.setItem(`${namespace}:${key}`, JSON.stringify(value)); return true; } catch (error) { fail(error); return false; } },
    remove(key) { try { backend.removeItem(`${namespace}:${key}`); return true; } catch (error) { fail(error); return false; } }
  };
}
