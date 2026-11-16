/* MiniVault — app a sola lettura.
   I dati stanno in data/miniature.json e data/colori.json: si modificano a mano (VS Code). */
(() => {
  'use strict';

  /* ------------------------------------------------------------ utilità */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const cmp = (a, b) => String(a).localeCompare(String(b), 'it', { sensitivity: 'base' });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage non disponibile */ } },
  };

  const DIR = { miniature: 'img/miniature/', colori: 'img/colori/', pdf: 'pdf/' };
  const src = (dir, file) => (file ? DIR[dir] + encodeURIComponent(file) : '');

  const ICON = {
    zoom: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5M11 8v6M8 11h6"/></svg>',
    play: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 9.5v5l4.2-2.5z"/></svg>',
    pdf: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>',
    tool: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5a4 4 0 0 0 4.9 4.9L21 13l-8 8-3.5-3.5 8-8zM3 21l5-5"/></svg>',
  };

  /* ------------------------------------------------------------ stato */
  const S = {
    mini: [],
    colori: [],
    byId: new Map(),
    cById: new Map(),
    usedIn: new Map(),
    suggest: [],
    view: store.get('mv-view') === 'grid' ? 'grid' : 'list',
    gruppo: '',
    sort: 'nome',
    linea: '',
    query: '',
    tab: 'miniature',
    fromList: false,
    prevRoute: null,
    openerEl: null,
  };

  /* ------------------------------------------------------------ caricamento */
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  }

  async function init() {
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    applyView();
    bindUi();
    try {
      const [m, c] = await Promise.all([fetchJson('data/miniature.json'), fetchJson('data/colori.json')]);
      S.mini = m.miniature || [];
      S.colori = c.colori || [];
    } catch (err) {
      console.error(err);
      $('#status').innerHTML =
        '<strong>Non riesco a leggere i dati.</strong><br>Se hai aperto <code>index.html</code> con doppio clic, il browser blocca la lettura dei file JSON: ' +
        'avvia un piccolo server (in VS Code, estensione <em>Live Server</em>, oppure <code>python -m http.server</code> nella cartella del progetto) e riprova. ' +
        'Se invece sei online, controlla che <code>data/miniature.json</code> e <code>data/colori.json</code> siano validi.';
      return;
    }
    indexData();
    fillFilters();
    renderList();
    renderColors();
    window.addEventListener('hashchange', route);
    route();
    registerSw();
  }

  function colorOf(id) {
    return S.cById.get(id) || { id, nome: id, marca: '', linea: '', hex: '#777777', immagini: {}, _missing: true };
  }

  function indexData() {
    S.byId.clear(); S.cById.clear(); S.usedIn.clear();
    for (const c of S.colori) { c.immagini = c.immagini || {}; S.cById.set(c.id, c); }
    const sug = new Map();
    const addSug = (txt, kind) => { const k = norm(txt); if (k && !sug.has(k)) sug.set(k, { text: txt, kind }); };

    for (const m of S.mini) {
      S.byId.set(m.id, m);
      m.parti = m.parti || [];
      const tags = new Set();
      const colors = new Set(m.colori || []);
      let steps = 0;
      for (const p of m.parti) {
        for (const s of p.passaggi || []) {
          steps++;
          (s.tag || []).forEach((t) => tags.add(t));
          if (s.tecnica) tags.add(s.tecnica);
          if (s.colore) colors.add(s.colore);
          if (s.mix && S.cById.has(s.mix.con)) colors.add(s.mix.con);
        }
      }
      m._steps = steps;
      m._colors = colors;
      m._terms = [m.nome, m.gruppo, ...m.parti.map((p) => p.nome), ...[...colors].map((id) => colorOf(id).nome), ...tags]
        .filter(Boolean).map(norm);
      colors.forEach((id) => {
        if (!S.usedIn.has(id)) S.usedIn.set(id, []);
        S.usedIn.get(id).push(m);
      });
      tags.forEach((t) => addSug(t, 'tag'));
      m.parti.forEach((p) => addSug(p.nome, 'parte'));
      addSug(m.gruppo, 'gruppo');
    }
    for (const c of S.colori) addSug(c.nome, 'colore');
    S.suggest = [...sug.entries()].map(([key, v]) => ({ key, ...v }));
  }

  /* ------------------------------------------------------------ filtri, ordine, ricerca */
  function fillFilters() {
    const gruppi = new Map();
    S.mini.forEach((m) => gruppi.set(m.gruppo, (gruppi.get(m.gruppo) || 0) + 1));
    const sel = $('#filter-gruppo');
    sel.innerHTML = `<option value="">Tutti i gruppi (${S.mini.length})</option>` +
      [...gruppi.keys()].sort(cmp).map((g) => `<option value="${esc(g)}">${esc(g)} (${gruppi.get(g)})</option>`).join('');
    sel.value = S.gruppo;

    const linee = [...new Set(S.colori.map((c) => lineaLabel(c)))].sort(cmp);
    const sl = $('#filter-linea');
    sl.innerHTML = '<option value="">Tutte le linee</option>' +
      linee.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    sl.value = S.linea;
  }

  const lineaLabel = (c) => [c.marca, c.linea].filter(Boolean).join(' · ') || 'Altro';

  const parseQuery = (q) => [...new Set(q.split(',').map((t) => norm(t)).filter(Boolean))];

  function getMini() {
    const terms = parseQuery(S.query);
    let rows = S.mini.map((m) => ({
      m,
      hit: terms.filter((t) => m._terms.some((x) => x.includes(t))),
    }));
    if (terms.length) rows = rows.filter((r) => r.hit.length);
    if (S.gruppo) rows = rows.filter((r) => r.m.gruppo === S.gruppo);
    const byOrder = (a, b) => {
      if (S.sort === 'nome-desc') return cmp(b.nome, a.nome);
      if (S.sort === 'gruppo') return cmp(a.gruppo, b.gruppo) || cmp(a.nome, b.nome);
      return cmp(a.nome, b.nome);
    };
    rows.sort((a, b) => b.hit.length - a.hit.length || byOrder(a.m, b.m));
    return { rows, terms };
  }

  /* ------------------------------------------------------------ lista miniature */
  function renderList() {
    const { rows, terms } = getMini();
    const box = $('#mini-list');
    box.className = `mini-list is-${S.view}`;

    const info = $('#result-info');
    if (terms.length) {
      info.textContent = `${rows.length} su ${S.mini.length} miniature per «${S.query.trim()}»`;
    } else {
      info.textContent = S.gruppo ? `${plural(rows.length, 'miniatura', 'miniature')} nel gruppo ${S.gruppo}` : plural(rows.length, 'miniatura', 'miniature');
    }

    if (!rows.length) {
      box.innerHTML = `<div class="empty"><strong>Nessuna miniatura trovata</strong>Prova con meno tag, oppure togli il filtro sul gruppo.</div>`;
      return;
    }
    box.innerHTML = rows.map(({ m, hit }) => `
      <a class="card" href="#/m/${encodeURIComponent(m.id)}" data-id="${esc(m.id)}">
        <span class="card-thumb"><img src="${src('miniature', m.immagine)}" alt="" loading="lazy" decoding="async"></span>
        <span class="card-body">
          <span class="card-title">${esc(m.nome)}</span>
          <span class="card-group">${esc(m.gruppo)}</span>
          <span class="card-meta">${plural(m.parti.length, 'parte', 'parti')} · ${plural(m._steps, 'passaggio', 'passaggi')} · ${plural(m._colors.size, 'colore', 'colori')}</span>
          ${hit.length ? `<span class="card-hit">Corrisponde a: ${esc(hit.join(', '))}</span>` : ''}
        </span>
      </a>`).join('');
  }

  /* ------------------------------------------------------------ pagina colori */
  function swatchInk(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#111';
    const n = parseInt(m[1], 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#111' : '#fff';
  }

  const IMG_KINDS = [['colore', 'Colore'], ['boccetta', 'Boccetta'], ['sample', 'Esempio']];

  function renderColors() {
    const terms = parseQuery(S.query);
    let list = S.colori.slice();
    if (terms.length) {
      list = list.filter((c) => {
        const hay = norm([c.nome, c.marca, c.linea].join(' '));
        return terms.some((t) => hay.includes(t));
      });
    }
    if (S.linea) list = list.filter((c) => lineaLabel(c) === S.linea);

    $('#color-info').textContent = terms.length
      ? `${list.length} su ${S.colori.length} colori per «${S.query.trim()}»`
      : plural(list.length, 'colore', 'colori');

    if (!list.length) {
      $('#color-list').innerHTML = '<div class="empty"><strong>Nessun colore trovato</strong>Prova con un altro nome o togli il filtro sulla linea.</div>';
      return;
    }
    const groups = new Map();
    list.forEach((c) => {
      const k = lineaLabel(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    });
    $('#color-list').innerHTML = [...groups.keys()].sort(cmp).map((k) => `
      <section class="color-section">
        <h2>${esc(k)}<small>${plural(groups.get(k).length, 'colore', 'colori')}</small></h2>
        <div class="color-grid">${groups.get(k).sort((a, b) => cmp(a.nome, b.nome)).map(colorCard).join('')}</div>
      </section>`).join('');
  }

  function colorCard(c) {
    const has = IMG_KINDS.some(([k]) => c.immagini[k]);
    const imgs = has
      ? `<div class="color-imgs">${IMG_KINDS.map(([k, label]) => c.immagini[k]
        ? `<button type="button" class="color-img" data-kind="${k}" data-color="${esc(c.id)}" aria-label="Ingrandisci: ${label} di ${esc(c.nome)}"><img src="${src('colori', c.immagini[k])}" alt="${label}" loading="lazy" decoding="async"><span class="color-img-label">${label}</span></button>`
        : `<span class="color-img" style="background:${esc(c.hex)}"><span class="color-img-label">${label}</span></span>`).join('')}</div>`
      : `<div class="color-noimg" style="--sw:${esc(c.hex)};--ink:${swatchInk(c.hex)}">Immagini non ancora caricate</div>`;
    const used = (S.usedIn.get(c.id) || []);
    return `
      <article class="color-card" id="color-${esc(c.id)}">
        ${imgs}
        <div class="color-info">
          <h3>${esc(c.nome)}${c.posseduto ? '<span class="owned">Posseduto</span>' : ''}</h3>
          <p class="muted">${esc(lineaLabel(c))}</p>
          <p class="color-used muted">${used.length
            ? 'Usato in: ' + used.map((m) => `<a href="#/m/${encodeURIComponent(m.id)}">${esc(m.nome)}</a>`).join(', ')
            : 'Non usato in nessuna miniatura'}</p>
        </div>
      </article>`;
  }

  /* ------------------------------------------------------------ scheda di dettaglio */
  function hexHtml(c) {
    const sample = c.immagini && c.immagini.sample;
    return sample
      ? `<span class="hex"><img src="${src('colori', sample)}" alt="" loading="lazy" decoding="async"></span>`
      : `<span class="hex" style="--sw:${esc(c.hex)}"></span>`;
  }

  function mixText(mx) {
    const known = S.cById.get(mx.con);
    const nome = known ? known.nome : mx.con;
    const r = String(mx.rapporto || '').trim();
    if (/^\d/.test(r)) return `Mix ${r} con ${nome}`;
    return `${cap(r)} ${nome}`.trim();
  }

  function stepHtml(s) {
    const c = s.colore ? colorOf(s.colore) : null;
    const swatch = c
      ? `<button type="button" class="step-swatch" data-color="${esc(c.id)}" aria-label="Mostra le immagini di ${esc(c.nome)}">${hexHtml(c)}<span class="step-level">${s.livello}</span></button>`
      : `<span class="step-swatch"><span class="hex tool">${ICON.tool}</span><span class="step-level">${s.livello}</span></span>`;
    const pills = [];
    if (s.tecnica) pills.push(`<span class="pill">${esc(cap(s.tecnica))}</span>`);
    if (s.mix) pills.push(`<span class="pill pill-mix">${esc(mixText(s.mix))}</span>`);
    if (c) pills.push(`<span class="pill">${plural(s.passate || 1, 'passata', 'passate')}</span>`);
    return `
      <li class="step">
        ${swatch}
        <div>
          <div class="step-name">${c ? esc(c.nome) : esc(cap(s.tecnica || 'Operazione'))}</div>
          ${c ? `<div class="step-line">${esc(lineaLabel(c))}</div>` : ''}
          <div class="pills">${pills.join('')}</div>
          ${s.nota ? `<p class="step-note">${esc(s.nota)}</p>` : ''}
          ${(s.tag || []).length ? `<div class="tags">${s.tag.map((t) => `<button type="button" class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
        </div>
      </li>`;
  }

  function detailHtml(m) {
    const correlati = (m.correlati || []).map((id) => S.byId.get(id)).filter(Boolean);
    const video = m.video
      ? `<a class="btn btn-primary" href="${esc(m.video)}" target="_blank" rel="noopener noreferrer">${ICON.play}Guarda il video</a>`
      : `<span class="btn is-disabled" aria-disabled="true">${ICON.play}Video non ancora disponibile</span>`;
    const pdf = m.pdf
      ? `<a class="btn" href="${src('pdf', m.pdf)}" download="${esc(m.pdf)}">${ICON.pdf}Scarica il PDF</a>`
      : `<span class="btn is-disabled" aria-disabled="true">${ICON.pdf}PDF non disponibile</span>`;
    return `
      <article class="detail-grid">
        <div class="detail-media">
          <button type="button" class="zoomable" data-zoom-mini aria-label="Ingrandisci la foto di ${esc(m.nome)}">
            <img src="${src('miniature', m.immagine)}" alt="${esc(m.nome)}">
            <span class="zoom-hint">${ICON.zoom}Ingrandisci</span>
          </button>
        </div>
        <div class="detail-info">
          <p class="eyebrow">Gruppo: <button type="button" data-group="${esc(m.gruppo)}">${esc(m.gruppo)}</button></p>
          <h2 id="detail-title">${esc(m.nome)}</h2>
          <div class="actions">${video}${pdf}</div>
          <p class="facts">${plural(m.parti.length, 'parte', 'parti')} · ${plural(m._steps, 'passaggio', 'passaggi')} · ${plural(m._colors.size, 'colore', 'colori')} · ID: ${esc(m.id)}</p>

          <h3>Colori necessari<small>${m.colori && m.colori.length ? m.colori.length : m._colors.size}</small></h3>
          <ul class="palette">
            ${[...(m.colori && m.colori.length ? m.colori : m._colors)].map((id) => {
              const c = colorOf(id);
              return `<li><button type="button" class="pal" data-color="${esc(c.id)}">${hexHtml(c)}<span><span class="pal-name">${esc(c.nome)}</span><span class="pal-sub">${esc(lineaLabel(c))}</span></span></button></li>`;
            }).join('')}
          </ul>

          <h3>Passaggi<small>per parte, in ordine</small></h3>
          ${m.parti.map((p) => `
            <details class="part" open>
              <summary><span>${esc(p.nome)}</span><span class="part-count">${plural((p.passaggi || []).length, 'passaggio', 'passaggi')}</span></summary>
              <ol class="steps">${(p.passaggi || []).map(stepHtml).join('')}</ol>
            </details>`).join('')}

          ${correlati.length ? `
            <h3>Tutorial collegati</h3>
            <ul class="related">${correlati.map((r) => `<li><a href="#/m/${encodeURIComponent(r.id)}"><img src="${src('miniature', r.immagine)}" alt=""><span><strong>${esc(r.nome)}</strong><br><span class="muted">${esc(r.gruppo)}</span></span></a></li>`).join('')}</ul>` : ''}
        </div>
      </article>`;
  }

  function showDetail(m) {
    const det = $('#detail');
    const wasHidden = det.hidden;
    $('#detail-body').innerHTML = detailHtml(m);
    det.hidden = false;
    $('#app').inert = true;
    document.body.classList.add('no-scroll');
    $('.detail-panel', det).scrollTop = 0;
    document.title = `${m.nome} · MiniVault`;
    if (wasHidden) $('#detail-close').focus({ preventScroll: true });
  }

  function hideDetailUi() {
    const det = $('#detail');
    if (det.hidden) return;
    det.hidden = true;
    $('#app').inert = false;
    document.body.classList.remove('no-scroll');
    document.title = 'MiniVault';
    if (S.openerEl && document.contains(S.openerEl)) S.openerEl.focus({ preventScroll: true });
    S.openerEl = null;
  }

  function closeDetail() {
    if (S.fromList) { S.fromList = false; history.back(); }
    else location.hash = S.tab === 'colori' ? '#/colori' : '#/';
  }

  /* ------------------------------------------------------------ routing */
  function route() {
    let h = location.hash.replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch { /* lascia com'è */ }
    const [a, b] = h.split('/');
    const prev = S.prevRoute;
    S.prevRoute = a === 'm' ? 'detail' : 'list';

    if (a === 'm' && b && S.byId.has(b)) {
      if (!$('#detail').hidden && prev === 'detail') S.fromList = false;
      else if (prev === 'list') S.fromList = true;
      setTab('miniature', true);
      showDetail(S.byId.get(b));
      return;
    }
    hideDetailUi();
    if (a === 'colori') setTab('colori');
    else setTab('miniature');
  }

  function setTab(tab, keepView) {
    S.tab = tab;
    $$('.tabs a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (keepView) return;
    $('#view-miniature').hidden = tab !== 'miniature';
    $('#view-colori').hidden = tab !== 'colori';
    const input = $('#search-input');
    input.placeholder = tab === 'colori' ? 'Cerca un colore: malignant, speedpaint' : 'Cerca per tag: verde, chiaro, pelle';
  }

  /* ------------------------------------------------------------ tema e vista */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#eef1ec' : '#16201c');
    const btn = $('#btn-theme');
    btn.setAttribute('aria-label', t === 'light' ? 'Passa al tema scuro' : 'Passa al tema chiaro');
  }

  function applyView() {
    const b = $('#btn-view');
    b.dataset.view = S.view;
    const toGrid = S.view === 'list';
    b.setAttribute('aria-label', toGrid ? 'Passa alla vista a griglia' : 'Passa alla vista a lista');
    $('.view-toggle-label', b).textContent = toGrid ? 'Griglia' : 'Lista';
  }

  /* ------------------------------------------------------------ ricerca: pannello e suggerimenti */
  function setSearchOpen(open) {
    const p = $('#search-panel');
    p.hidden = !open;
    $('#btn-search').setAttribute('aria-expanded', String(open));
    if (open) $('#search-input').focus();
    else hideSuggest();
  }

  function runSearch(q) {
    S.query = q;
    $('#search-clear').hidden = !q;
    renderList();
    renderColors();
  }

  function lastSegment(v) {
    const i = v.lastIndexOf(',');
    return { head: i < 0 ? '' : v.slice(0, i + 1), seg: (i < 0 ? v : v.slice(i + 1)).trim() };
  }

  let suggestItems = [];
  let suggestIdx = -1;

  function updateSuggest() {
    const input = $('#search-input');
    const { seg } = lastSegment(input.value);
    const used = new Set(parseQuery(input.value));
    const q = norm(seg);
    if (!q) { hideSuggest(); return; }
    suggestItems = S.suggest
      .filter((s) => s.key.includes(q) && !used.has(s.key))
      .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || cmp(a.text, b.text))
      .slice(0, 8);
    if (!suggestItems.length) { hideSuggest(); return; }
    suggestIdx = -1;
    const ul = $('#search-suggest');
    ul.innerHTML = suggestItems.map((s, i) =>
      `<li role="presentation"><button type="button" role="option" aria-selected="false" data-i="${i}"><span>${esc(s.text)}</span><span class="kind">${s.kind}</span></button></li>`).join('');
    ul.hidden = false;
  }

  function hideSuggest() {
    const ul = $('#search-suggest');
    ul.hidden = true;
    ul.innerHTML = '';
    suggestItems = [];
    suggestIdx = -1;
  }

  function pickSuggest(i) {
    const input = $('#search-input');
    const s = suggestItems[i];
    if (!s) return;
    const { head } = lastSegment(input.value);
    input.value = (head ? head + ' ' : '') + s.text.toLowerCase() + ', ';
    hideSuggest();
    runSearch(input.value);
    input.focus();
  }

  function highlightSuggest(delta) {
    if (!suggestItems.length) return;
    suggestIdx = (suggestIdx + delta + suggestItems.length) % suggestItems.length;
    $$('#search-suggest button').forEach((b, i) => b.setAttribute('aria-selected', String(i === suggestIdx)));
  }

  function searchFor(text) {
    const input = $('#search-input');
    input.value = text;
    setSearchOpen(true);
    runSearch(text);
    hideSuggest();
  }

  /* ------------------------------------------------------------ eventi dell'interfaccia */
  function bindUi() {
    $('#btn-search').addEventListener('click', () => setSearchOpen($('#search-panel').hidden));
    $('#btn-theme').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      store.set('mv-theme', next);
    });
    $('#btn-view').addEventListener('click', () => {
      S.view = S.view === 'list' ? 'grid' : 'list';
      store.set('mv-view', S.view);
      applyView();
      renderList();
    });
    $('#filter-gruppo').addEventListener('change', (e) => { S.gruppo = e.target.value; renderList(); });
    $('#sort').addEventListener('change', (e) => { S.sort = e.target.value; renderList(); });
    $('#filter-linea').addEventListener('change', (e) => { S.linea = e.target.value; renderColors(); });

    const input = $('#search-input');
    let timer = 0;
    input.addEventListener('input', () => {
      updateSuggest();
      clearTimeout(timer);
      timer = setTimeout(() => runSearch(input.value), 120);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); highlightSuggest(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlightSuggest(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestIdx >= 0) pickSuggest(suggestIdx); else { hideSuggest(); runSearch(input.value); }
      } else if (e.key === 'Escape') {
        if (!$('#search-suggest').hidden) hideSuggest(); else setSearchOpen(false);
      }
    });
    $('#search-suggest').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) pickSuggest(Number(b.dataset.i));
    });
    $('#search-clear').addEventListener('click', () => { input.value = ''; runSearch(''); hideSuggest(); input.focus(); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-panel') && !e.target.closest('#btn-search')) hideSuggest();
    });

    // schede: ricordo l'elemento che ha aperto il dettaglio, per restituire il focus
    $('#main').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (card) S.openerEl = card;
      const img = e.target.closest('.color-img[data-color]');
      if (img) openColorViewer(img.dataset.color, img.dataset.kind);
    });

    // dettaglio
    $('#detail-close').addEventListener('click', closeDetail);
    $('#detail').addEventListener('click', (e) => {
      if (e.target.closest('[data-close-detail]')) { closeDetail(); return; }
      if (e.target.closest('[data-zoom-mini]')) {
        const m = currentDetail();
        if (m) lbOpen([{ src: src('miniature', m.immagine), caption: m.nome }], 0);
        return;
      }
      const sw = e.target.closest('[data-color]');
      if (sw) { openColorViewer(sw.dataset.color, 'sample'); return; }
      const tag = e.target.closest('[data-tag]');
      if (tag) { goSearch(tag.dataset.tag); return; }
      const grp = e.target.closest('[data-group]');
      if (grp) { goGroup(grp.dataset.group); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (LB.open) { lbClose(); return; }
      if (!$('#detail').hidden) closeDetail();
    });

    // immagini che non si caricano: le nascondo e lascio il riquadro
    document.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-broken');
    }, true);

    bindLightbox();
  }

  function currentDetail() {
    const id = decodeURIComponent(location.hash.replace(/^#\/?m\//, ''));
    return S.byId.get(id);
  }

  function goSearch(text) {
    S.fromList = false;
    history.replaceState(null, '', '#/');
    hideDetailUi();
    setTab('miniature');
    S.gruppo = '';
    $('#filter-gruppo').value = '';
    searchFor(text);
  }

  function goGroup(g) {
    S.fromList = false;
    history.replaceState(null, '', '#/');
    hideDetailUi();
    setTab('miniature');
    S.gruppo = g;
    $('#filter-gruppo').value = g;
    searchFor('');
    setSearchOpen(false);
  }

  /* ------------------------------------------------------------ visualizzatore con zoom */
  const LB = {
    open: false, items: [], i: 0, s: 1, x: 0, y: 0, MAX: 8,
    ptr: new Map(), pan: null, pinch: null, moved: false, lastTap: 0, lastX: 0, lastY: 0,
  };
  let lbEl, lbStage, lbImg;

  function placeholderSrc(c) {
    const ink = swatchInk(c.hex);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="${c.hex}"/><text x="400" y="390" text-anchor="middle" font-family="Georgia,serif" font-size="56" fill="${ink}">${esc(c.nome)}</text><text x="400" y="450" text-anchor="middle" font-family="sans-serif" font-size="28" fill="${ink}" opacity=".8">Immagini non ancora caricate</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function openColorViewer(id, kind) {
    const c = colorOf(id);
    const items = [];
    IMG_KINDS.forEach(([k, label]) => {
      if (c.immagini[k]) items.push({ kind: k, src: src('colori', c.immagini[k]), caption: `${c.nome} · ${label}` });
    });
    if (!items.length) items.push({ kind: 'none', src: placeholderSrc(c), caption: c.nome });
    const start = Math.max(0, items.findIndex((it) => it.kind === kind));
    lbOpen(items, start);
  }

  function lbOpen(items, start) {
    LB.items = items;
    LB.open = true;
    lbEl.hidden = false;
    $('#app').inert = true;
    $('#detail').inert = true;
    document.body.classList.add('no-scroll');
    history.pushState({ lb: 1 }, '', location.href);
    lbShow(start || 0);
    $('#lb-close').focus({ preventScroll: true });
  }

  function lbClose(fromPop) {
    if (!LB.open) return;
    LB.open = false;
    lbEl.hidden = true;
    LB.ptr.clear(); LB.pan = null; LB.pinch = null;
    $('#detail').inert = false;
    const detailOpen = !$('#detail').hidden;
    $('#app').inert = detailOpen;
    if (!detailOpen) document.body.classList.remove('no-scroll');
    if (!fromPop && history.state && history.state.lb) history.back();
  }

  function lbShow(i) {
    LB.i = i;
    const it = LB.items[i];
    lbImg.src = it.src;
    lbImg.alt = it.caption;
    $('#lb-caption').textContent = it.caption;
    const multi = LB.items.length > 1;
    $('#lb-prev').hidden = !multi;
    $('#lb-next').hidden = !multi;
    const th = $('#lb-thumbs');
    th.hidden = !multi;
    th.innerHTML = multi ? LB.items.map((x, n) =>
      `<button type="button" data-n="${n}" aria-label="${esc(x.caption)}" ${n === i ? 'aria-current="true"' : ''}><img src="${x.src}" alt=""></button>`).join('') : '';
    LB.s = 1; LB.x = 0; LB.y = 0;
    lbApply();
  }

  const lbNext = () => lbShow((LB.i + 1) % LB.items.length);
  const lbPrev = () => lbShow((LB.i - 1 + LB.items.length) % LB.items.length);

  function lbClamp() {
    const w = lbImg.clientWidth * LB.s, h = lbImg.clientHeight * LB.s;
    const mx = Math.max(0, (w - lbStage.clientWidth) / 2);
    const my = Math.max(0, (h - lbStage.clientHeight) / 2);
    LB.x = Math.min(mx, Math.max(-mx, LB.x));
    LB.y = Math.min(my, Math.max(-my, LB.y));
  }

  function lbApply() {
    if (LB.s <= 1.001) { LB.s = 1; LB.x = 0; LB.y = 0; } else lbClamp();
    lbImg.style.transform = `translate(${LB.x}px, ${LB.y}px) scale(${LB.s})`;
    $('#lb-zoom-level').textContent = Math.round(LB.s * 100) + '%';
    lbStage.classList.toggle('is-zoomed', LB.s > 1.01);
  }

  function lbAnimate() {
    lbImg.classList.add('is-animating');
    clearTimeout(lbAnimate.t);
    lbAnimate.t = setTimeout(() => lbImg.classList.remove('is-animating'), 220);
  }

  // cx, cy: punto di zoom rispetto al centro dell'area immagine
  function lbZoomTo(next, cx = 0, cy = 0) {
    next = Math.min(LB.MAX, Math.max(1, next));
    const k = next / LB.s;
    LB.x = cx - (cx - LB.x) * k;
    LB.y = cy - (cy - LB.y) * k;
    LB.s = next;
    lbApply();
  }

  function stagePoint(clientX, clientY) {
    const r = lbStage.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  }

  function bindLightbox() {
    lbEl = $('#lightbox'); lbStage = $('#lb-stage'); lbImg = $('#lb-img');

    $('#lb-close').addEventListener('click', () => lbClose());
    $('#lb-prev').addEventListener('click', lbPrev);
    $('#lb-next').addEventListener('click', lbNext);
    $('#lb-zoom-in').addEventListener('click', () => { lbAnimate(); lbZoomTo(LB.s * 1.5); });
    $('#lb-zoom-out').addEventListener('click', () => { lbAnimate(); lbZoomTo(LB.s / 1.5); });
    $('#lb-reset').addEventListener('click', () => { lbAnimate(); LB.s = 1; lbApply(); });
    $('#lb-thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-n]');
      if (b) lbShow(Number(b.dataset.n));
    });
    lbImg.addEventListener('load', lbApply);

    window.addEventListener('popstate', () => {
      if (LB.open && !(history.state && history.state.lb)) lbClose(true);
    });

    document.addEventListener('keydown', (e) => {
      if (!LB.open) return;
      if (e.key === '+' || e.key === '=') { lbAnimate(); lbZoomTo(LB.s * 1.5); }
      else if (e.key === '-' || e.key === '_') { lbAnimate(); lbZoomTo(LB.s / 1.5); }
      else if (e.key === '0') { lbAnimate(); LB.s = 1; lbApply(); }
      else if (e.key === 'ArrowRight' && LB.items.length > 1) lbNext();
      else if (e.key === 'ArrowLeft' && LB.items.length > 1) lbPrev();
    });

    lbStage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = stagePoint(e.clientX, e.clientY);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      lbZoomTo(LB.s * f, p.x, p.y);
    }, { passive: false });

    lbStage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      lbStage.setPointerCapture(e.pointerId);
      LB.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (LB.ptr.size === 1) {
        LB.moved = false;
        LB.pan = { sx: e.clientX, sy: e.clientY, ox: LB.x, oy: LB.y };
      } else if (LB.ptr.size === 2) {
        const [a, b] = [...LB.ptr.values()];
        const m = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        LB.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: LB.s, ux: (m.x - LB.x) / LB.s, uy: (m.y - LB.y) / LB.s };
        LB.pan = null;
        LB.moved = true;
      }
    });

    lbStage.addEventListener('pointermove', (e) => {
      const p = LB.ptr.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (LB.ptr.size === 2 && LB.pinch) {
        const [a, b] = [...LB.ptr.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        LB.s = Math.min(LB.MAX, Math.max(1, LB.pinch.s0 * d / LB.pinch.d0));
        LB.x = m.x - LB.pinch.ux * LB.s;
        LB.y = m.y - LB.pinch.uy * LB.s;
        lbApply();
      } else if (LB.ptr.size === 1 && LB.pan) {
        const dx = e.clientX - LB.pan.sx, dy = e.clientY - LB.pan.sy;
        if (Math.hypot(dx, dy) > 6) { LB.moved = true; lbStage.classList.add('is-dragging'); }
        if (LB.s > 1.01) { LB.x = LB.pan.ox + dx; LB.y = LB.pan.oy + dy; lbApply(); }
      }
    });

    const end = (e) => {
      if (!LB.ptr.has(e.pointerId)) return;
      LB.ptr.delete(e.pointerId);
      lbStage.classList.remove('is-dragging');
      if (LB.ptr.size === 0 && LB.pan && e.type === 'pointerup') {
        const dx = e.clientX - LB.pan.sx, dy = e.clientY - LB.pan.sy;
        if (!LB.moved) {
          const now = Date.now();
          if (now - LB.lastTap < 320 && Math.hypot(e.clientX - LB.lastX, e.clientY - LB.lastY) < 30) {
            const p = stagePoint(e.clientX, e.clientY);
            lbAnimate();
            if (LB.s > 1.01) { LB.s = 1; lbApply(); } else lbZoomTo(3, p.x, p.y);
            LB.lastTap = 0;
          } else { LB.lastTap = now; LB.lastX = e.clientX; LB.lastY = e.clientY; }
        } else if (LB.s <= 1.01 && LB.items.length > 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) lbNext(); else lbPrev();
        }
        LB.pan = null;
      } else if (LB.ptr.size === 1) {
        // è rimasto un solo dito dopo un pizzico: riparto da lì senza salti
        const [p] = [...LB.ptr.values()];
        LB.pan = { sx: p.x, sy: p.y, ox: LB.x, oy: LB.y };
        LB.pinch = null;
        LB.moved = true;
      } else if (LB.ptr.size === 0) {
        LB.pan = null; LB.pinch = null;
      }
    };
    lbStage.addEventListener('pointerup', end);
    lbStage.addEventListener('pointercancel', end);
  }

  /* ------------------------------------------------------------ PWA */
  function registerSw() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker non registrato', err));
    }
  }

  init();
})();
