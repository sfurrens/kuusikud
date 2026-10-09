'use strict';
/* Kuusikud – riigimetsa noored kuusikud kaardil.
   Andmed: data/kuusikud.json, kirje kuju:
   [polügoonid, kuuse sünniaasta, kõrgus, kuuse osakaal, pindala, kuivendatud(0/1), kasvukoht, arenguklass,
    "kvartal eraldis", inventeerimisaasta, "50KU 30KS ...", [lat, lon] punkt alal, eraldise id] */

const YEAR = new Date().getFullYear();
const SP = {KU:'kuusk',KS:'kask',MA:'mänd',HB:'haab',LV:'hall lepp',LM:'sanglepp',SA:'saar',TA:'tamm',VA:'vaher',PN:'pärn',
  RE:'remmelgas',PI:'pihlakas',TM:'toomingas',LH:'lehis',JA:'jalakas',NU:'nulg',PP:'pappel',TL:'teised lehtpuud',TO:'teised okaspuud'};
const SPC = {KU:'#2f8458',KS:'#d8c25a',MA:'#a7745a',HB:'#9bbf6a',LV:'#8fa39a',LM:'#6f8a7c'};
const AK = {N:'Noorendik', L:'Latimets'};
const DIRS = ['põhjas','kirdes','idas','kagus','lõunas','edelas','läänes','loodes'];
const $ = id => document.getElementById(id);

const store = {
  get(k, d){ try{ const v = localStorage.getItem('kuusikud.'+k); return v ? JSON.parse(v) : d }catch(e){ return d } },
  set(k, v){ try{ localStorage.setItem('kuusikud.'+k, JSON.stringify(v)) }catch(e){} }
};

const st = Object.assign({amin:10, amax:30, share:50, area:0, drain:'all', hideCut:true}, store.get('filters', {}));
let favs = store.get('favs', {});          // id -> {note, t}
let base = store.get('base', 'foto');
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = {c1:css('--c1'), c2:css('--c2'), c3:css('--c3'), c4:css('--c4'), sel:css('--sel'), me:css('--me')};

/* ---------- kaart ---------- */
const v0 = store.get('view', [58.65, 25.0, 7]);
const map = L.map('map', {zoomControl:false, attributionControl:false, minZoom:6, maxZoom:19, preferCanvas:true,
  maxBounds:[[57.2,20.5],[60.2,29.0]], maxBoundsViscosity:.8}).setView([v0[0], v0[1]], v0[2]);
const T = 'https://tiles.maaamet.ee/tm/tms/1.0.0/';
const tileOpt = {tms:true, maxNativeZoom:18, maxZoom:19, crossOrigin:true, keepBuffer:3};
const foto  = L.tileLayer(T+'foto@GMC/{z}/{x}/{y}.jpg', tileOpt);
const hyb   = L.tileLayer(T+'hybriid@GMC/{z}/{x}/{y}.png', tileOpt);
const kaart = L.tileLayer(T+'kaart@GMC/{z}/{x}/{y}.png', tileOpt);
const rend = L.canvas({padding:.3, tolerance:8});
const pointLayer = L.layerGroup();
const polyLayer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);

function setBase(b){
  base = b; store.set('base', b);
  [foto, hyb, kaart].forEach(l => l.remove());
  if (b === 'foto'){ foto.addTo(map); hyb.addTo(map); } else kaart.addTo(map);
  $('layerLbl').textContent = b === 'foto' ? 'Foto' : 'Kaart';
  if (data.length) render();
}
$('layerBtn').onclick = () => setBase(base === 'foto' ? 'kaart' : 'foto');

/* ---------- andmed ---------- */
let data = [], byId = new Map(), kk = {}, RC = {}, filtered = [], selected = null, updated = '';
const fmtDate = d => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${+dd}.${+m}.${y}`; };
function cutText(f, long){
  const r = f[13]; if (!r) return '';
  const what = RC[r[1]] || 'raie', y = r[2].slice(0, 4);
  if (r[0] === 'raie') return long ? `${what[0].toUpperCase() + what.slice(1)} registreeritud ${fmtDate(r[2])}. Ala võib olla raiutud.` : `${what} ${y}`;
  return long ? `${what[0].toUpperCase() + what.slice(1)} registreeritud ${fmtDate(r[2])}.` : `${what} ${y}`;
}
const age = f => YEAR - f[1];
const col = a => a <= 15 ? C.c1 : a <= 20 ? C.c2 : a <= 25 ? C.c3 : C.c4;
const cls = a => a <= 15 ? 'c1' : a <= 20 ? 'c2' : a <= 25 ? 'c3' : 'c4';
const nf = (x, d=0) => x.toLocaleString('et-EE', {minimumFractionDigits:d, maximumFractionDigits:d});

function pass(f){
  const a = age(f);
  return a >= st.amin && a <= st.amax && f[3] >= st.share && f[4] >= st.area &&
    (st.drain === 'all' || (st.drain === 'y') === (f[5] === 1)) &&
    !(st.hideCut && f[13] && f[13][0] === 'raie');
}

function applyFilters(){
  filtered = data.filter(pass);
  const ha = filtered.reduce((s, f) => s + f[4], 0);
  $('count').textContent = nf(filtered.length);
  $('countLbl').textContent = 'kuusikut · ' + nf(Math.round(ha)) + ' ha';
  pointLayer.clearLayers();
  for (const f of filtered){
    L.circleMarker(f[11], {renderer:rend, radius:3.5, stroke:false, fillColor:col(age(f)), fillOpacity:.95})
      .on('click', () => openStand(f, true)).addTo(pointLayer);
  }
  render();
  updateNear();
}

const POLY_ZOOM = 11;
function render(){
  polyLayer.clearLayers();
  const z = map.getZoom();
  if (z < POLY_ZOOM){
    if (!map.hasLayer(pointLayer)) pointLayer.addTo(map);
    pointLayer.eachLayer(m => m.setRadius(z < 9 ? 2.5 : 3.5));
    if (selected) L.circleMarker(selected[11], {renderer:rend, radius:7, color:C.sel, weight:3, fill:false, interactive:false}).addTo(polyLayer);
    return;
  }
  pointLayer.remove();
  const b = map.getBounds().pad(.3), s = b.getSouth(), w = b.getWest(), n = b.getNorth(), e = b.getEast();
  const fo = base === 'foto' ? .28 : .5;
  for (const f of filtered){
    const bb = f.bb;
    if (bb[2] < s || bb[0] > n || bb[3] < w || bb[1] > e) continue;
    const c = col(age(f)), isSel = selected && selected[12] === f[12];
    L.polygon(f.ll, {renderer:rend, color:isSel ? C.sel : c, weight:isSel ? 4 : 2, fillColor:c, fillOpacity:fo})
      .on('click', () => openStand(f, false)).addTo(polyLayer);
  }
}

let mt;
map.on('moveend', () => {
  clearTimeout(mt);
  mt = setTimeout(() => {
    render();
    const c = map.getCenter(); store.set('view', [+c.lat.toFixed(5), +c.lng.toFixed(5), map.getZoom()]);
    if (!me) updateNear();
  }, 60);
});

/* ---------- asukoht ---------- */
let me = null, watchId = null, follow = false;
function locState(){
  const b = $('locBtn');
  b.classList.toggle('on', !!me);
  b.classList.toggle('follow', !!me && follow);
}
function startLoc(){
  if (!('geolocation' in navigator)){ toast('See brauser ei toeta asukoha määramist.'); return; }
  $('locBtn').classList.add('wait');
  follow = true;
  watchId = navigator.geolocation.watchPosition(onPos, onErr, {enableHighAccuracy:true, maximumAge:5000, timeout:20000});
}
function onPos(p){
  const first = !me;
  me = {lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy};
  $('locBtn').classList.remove('wait');
  meLayer.clearLayers();
  const ll = [me.lat, me.lon];
  if (me.acc < 2000) L.circle(ll, {renderer:rend, radius:me.acc, color:C.me, weight:1, fillColor:C.me, fillOpacity:.12, interactive:false}).addTo(meLayer);
  L.marker(ll, {icon:L.divIcon({className:'', html:'<div class="me-dot"></div>', iconSize:[18, 18]}), interactive:false, keyboard:false, zIndexOffset:1000}).addTo(meLayer);
  if (follow) map.setView(ll, first ? Math.max(map.getZoom(), 14) : map.getZoom(), {animate:!first});
  locState();
  updateNear();
  if (selected) refreshDist();
}
function onErr(e){
  $('locBtn').classList.remove('wait');
  if (e.code === 1){
    toast('Asukoha luba puudub. Luba asukoht telefoni seadetes (Safari või brauser) ja proovi uuesti.', 6000);
    navigator.geolocation.clearWatch(watchId); watchId = null; follow = false;
  } else if (!me) toast('Asukohta ei õnnestunud leida. Proovi uuesti, lagedal leitakse see kiiremini.', 5000);
  locState();
}
$('locBtn').onclick = () => {
  if (watchId === null) return startLoc();
  if (me && !follow){ follow = true; map.setView([me.lat, me.lon], Math.max(map.getZoom(), 14)); }
  else follow = false;
  locState();
};
map.on('dragstart', () => { if (follow){ follow = false; locState(); } });

function dist(a, b){ // meetrites
  const R = 6371000, toR = Math.PI/180;
  const dLat = (b[0]-a[0])*toR, dLon = (b[1]-a[1])*toR;
  const x = Math.sin(dLat/2)**2 + Math.cos(a[0]*toR)*Math.cos(b[0]*toR)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function dir(a, b){
  const toR = Math.PI/180, y = Math.sin((b[1]-a[1])*toR)*Math.cos(b[0]*toR);
  const x = Math.cos(a[0]*toR)*Math.sin(b[0]*toR) - Math.sin(a[0]*toR)*Math.cos(b[0]*toR)*Math.cos((b[1]-a[1])*toR);
  const brg = (Math.atan2(y, x)/toR + 360) % 360;
  return DIRS[Math.round(brg/45) % 8];
}
const fmtDist = m => m < 1000 ? nf(Math.round(m/10)*10) + ' m' : m < 10000 ? nf(m/1000, 1) + ' km' : nf(Math.round(m/1000)) + ' km';

/* ---------- lähedal ---------- */
function itemHtml(f, ref){
  const a = age(f);
  const d = ref ? dist(ref, f[11]) : null;
  const nFinds = finds.filter(x => x.standId === f[12]).length;
  const sub = [nf(f[4], 2) + ' ha', f[5] ? 'kuivendatud' : '', cutText(f), nFinds ? `${nFinds} ${nFinds === 1 ? 'leid' : 'leidu'}` : '', f[8]].filter(Boolean).join(' · ');
  return `<button class="item" data-id="${f[12]}"><i class="sw ${cls(a)}"></i>
    <span class="t">${AK[f[7]] || 'Kuusik'} · ${a} a · ${nf(f[2], f[2] % 1 ? 1 : 0)} m</span>
    <span class="d">${d !== null ? fmtDist(d) + `<small>${dir(ref, f[11])}</small>` : ''}</span>
    <span class="s">${sub}</span></button>`;
}
function updateNear(){
  if (!data.length) return;
  const ref = me ? [me.lat, me.lon] : [map.getCenter().lat, map.getCenter().lng];
  $('nearHint').innerHTML = me ? 'Lähimad kuusikud sinu asukohast.'
    : 'Lähimad kuusikud kaardi keskpunktist.<br><button type="button" id="useLoc">Kasuta minu asukohta</button>';
  const ul = $('useLoc'); if (ul) ul.onclick = () => { if (watchId === null) startLoc(); };
  const top = filtered.map(f => [dist(ref, f[11]), f]).sort((a, b) => a[0] - b[0]).slice(0, 20);
  $('nearList').innerHTML = top.map(([, f]) => `<li>${itemHtml(f, ref)}</li>`).join('') ||
    '<li class="hint">Ühtegi kuusikut ei vasta filtritele.</li>';
}
function listClick(e){
  const b = e.target.closest('button.item'); if (!b) return;
  const f = byId.get(+b.dataset.id); if (f) openStand(f, true);
}
$('nearList').onclick = listClick; $('favList').onclick = listClick;

/* ---------- lemmikud ---------- */
function saveFavs(){ store.set('favs', favs); renderFavs(); }
function renderFavs(){
  const ids = Object.keys(favs).map(Number).filter(id => byId.has(id));
  $('favCount').textContent = ids.length ? ids.length : '';
  const ref = me ? [me.lat, me.lon] : null;
  const list = ids.map(id => byId.get(id)).sort((a, b) => ref ? dist(ref, a[11]) - dist(ref, b[11]) : (favs[b[12]].t - favs[a[12]].t));
  $('favList').innerHTML = list.map(f => `<li>${itemHtml(f, ref)}${favs[f[12]].note ? `<p class="hint" style="margin:-4px 0 10px 24px">${escapeHtml(favs[f[12]].note)}</p>` : ''}</li>`).join('');
  $('favEmpty').hidden = list.length > 0;
}
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- paneel ---------- */
let tab = 'near';
function showTab(t){
  tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  ['near', 'fav', 'finds', 'filt'].forEach(p => $('pane-' + p).hidden = p !== t);
  $('pane-stand').hidden = true;
  $('sheet').classList.remove('stand-open'); ensureOpen();
  if (t === 'fav') renderFavs();
  if (t === 'finds') renderFinds();
}
$('tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); };
new ResizeObserver(() => {
  const h = $('sheet').offsetHeight;
  document.documentElement.style.setProperty('--sheet-h', h + 'px');
  $('locBtn').parentElement.classList.toggle('hide', h > window.innerHeight * .62);
}).observe($('sheet'));

/* ---------- lohistatav paneel ---------- */
const sheet = $('sheet');
let snap = store.get('snap', 'half'), drag = null, dragged = false;
const wide = () => window.innerWidth >= 900;
function snapHeights(){
  const H = window.innerHeight;
  const cs = getComputedStyle(sheet);
  const head = sheet.classList.contains('stand-open') ? sheet.querySelector('.stand-head') : $('tabs');
  const peek = $('grip').offsetHeight + (head ? head.offsetHeight + 12 : 50) + parseFloat(cs.paddingBottom);
  const top = $('searchForm').getBoundingClientRect().bottom + 10;
  const full = Math.max(peek + 200, H - top);
  const half = Math.min(Math.max(peek + 160, Math.round(H * .45)), full);
  return {peek:Math.round(peek), half, full:Math.round(full)};
}
function setSnap(name, animate = true){
  if (wide()){ sheet.style.height = ''; return; }
  snap = name; store.set('snap', name === 'full' ? 'half' : name);
  if (!animate) sheet.classList.add('dragging');
  sheet.style.height = snapHeights()[name] + 'px';
  if (!animate) requestAnimationFrame(() => sheet.classList.remove('dragging'));
}
function ensureOpen(showMap){ if (snap === 'peek' || (showMap && snap === 'full')) setSnap('half'); else setSnap(snap); }
$('grip').onclick = () => { if (!dragged) setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek'); };
function visiblePane(){ return [...sheet.querySelectorAll('.pane')].find(p => !p.hidden); }

sheet.addEventListener('touchstart', e => {
  if (wide() || e.touches.length !== 1) return;
  const t = e.target;
  if (t.closest('input, textarea, select, .dual')) return;
  const fromPane = !t.closest('.grip, .tabs, .stand-head');
  const y = e.touches[0].clientY, now = performance.now();
  drag = {y0:y, h0:sheet.offsetHeight, last:y, lt:now, v:0, active:false, fromPane, pane:visiblePane()};
}, {passive:true});

sheet.addEventListener('touchmove', e => {
  if (!drag) return;
  const y = e.touches[0].clientY, dy = y - drag.y0;
  if (!drag.active){
    if (Math.abs(dy) < 8) return;
    if (drag.fromPane){
      const atTop = !drag.pane || drag.pane.scrollTop <= 0;
      const pullDown = dy > 0 && atTop, pullUp = dy < 0 && snap !== 'full';
      if (!pullDown && !pullUp){ drag = null; return; }
    }
    drag.active = true; drag.y0 = y; drag.h0 = sheet.offsetHeight;
    sheet.classList.add('dragging');
  }
  e.preventDefault();
  const now = performance.now();
  drag.v = (y - drag.last) / Math.max(1, now - drag.lt); drag.last = y; drag.lt = now;
  const S = snapHeights();
  let h = drag.h0 - (y - drag.y0);
  if (h > S.full) h = S.full + (h - S.full) * .25;      // kerge vastupanu servades
  if (h < S.peek) h = S.peek - (S.peek - h) * .25;
  sheet.style.height = Math.round(h) + 'px';
}, {passive:false});

function endDrag(){
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.active) return;
  sheet.classList.remove('dragging');
  dragged = true; setTimeout(() => dragged = false, 80);
  const S = snapHeights(), h = sheet.offsetHeight;
  const order = ['peek', 'half', 'full'];
  let target;
  if (d.v < -.45) target = order.find(n => S[n] > h + 8) || 'full';
  else if (d.v > .45) target = [...order].reverse().find(n => S[n] < h - 8) || 'peek';
  else target = order.reduce((a, b) => Math.abs(S[b] - h) < Math.abs(S[a] - h) ? b : a);
  setSnap(target);
}
sheet.addEventListener('touchend', endDrag);
sheet.addEventListener('touchcancel', endDrag);
sheet.addEventListener('click', e => { if (dragged){ e.stopPropagation(); e.preventDefault(); } }, true);

/* hiirega lohistamine käepidemest (arvutis kitsas aknas) */
$('grip').addEventListener('mousedown', e => {
  if (wide()) return;
  const y0 = e.clientY, h0 = sheet.offsetHeight; let moved = false;
  sheet.classList.add('dragging');
  const mv = ev => { if (Math.abs(ev.clientY - y0) > 4) moved = true; sheet.style.height = Math.max(snapHeights().peek, Math.min(snapHeights().full, h0 - (ev.clientY - y0))) + 'px'; };
  const up = () => {
    document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
    sheet.classList.remove('dragging');
    if (!moved) return;
    dragged = true; setTimeout(() => dragged = false, 80);
    const S = snapHeights(), h = sheet.offsetHeight;
    setSnap(['peek', 'half', 'full'].reduce((a, b) => Math.abs(S[b] - h) < Math.abs(S[a] - h) ? b : a));
  };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
});
window.addEventListener('resize', () => setSnap(snap, false));
setSnap(snap, false);

function sheetPad(){ return window.innerWidth >= 900 ? [400, 20] : [0, snapHeights()[snap]]; }

function openStand(f, zoom){
  selected = f;
  const a = age(f), [lat, lon] = f[11];
  const comp = f[10].split(' ').filter(Boolean).map(s => [+s.match(/\d+/)[0], s.replace(/\d+/, '')]);
  const kh = kk[f[6]] ? `${kk[f[6]][0].toUpperCase() + kk[f[6]].slice(1)} (${f[6]})` : (f[6] || '–');
  const fav = favs[f[12]];
  const p = $('pane-stand');
  p.innerHTML = `
    <div class="stand-head">
      <button class="back" id="back" aria-label="Tagasi"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <h2>${AK[f[7]] || 'Kuusik'} <span class="val">${nf(f[4], 2)} ha</span></h2>
      <button class="heart ${fav ? 'on' : ''}" id="heart" aria-label="${fav ? 'Eemalda lemmikutest' : 'Lisa lemmikutesse'}" aria-pressed="${!!fav}">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.3 5c2 0 3.2 1.1 3.9 2.2h3.6C14.5 6.1 15.7 5 17.7 5 21 5 22.7 8.4 21.2 11.4 19 15.6 12 20 12 20Z"/></svg>
      </button>
    </div>
    <div class="big"><i class="sw ${cls(a)}" style="display:inline-block"></i>Kuusk ${a} a · ${nf(f[2], f[2] % 1 ? 1 : 0)} m
      ${f[5] ? '<span class="chip">kuivendatud</span>' : ''}${f[13] && f[13][0] !== 'raie' ? `<span class="chip info">${cutText(f)}</span>` : ''}<span class="chip dist" id="distChip" hidden></span></div>
    ${f[13] && f[13][0] === 'raie' ? `<p class="warnbox">${cutText(f, true)}</p>` : ''}
    ${(() => { const h = finds.filter(x => x.standId === f[12]); if (!h.length) return '';
        const last = h.reduce((a, b) => a.t > b.t ? a : b);
        return `<p class="finds-here">Sinu leiud siin: ${h.length} · viimati ${fmtDate(new Date(last.t).toISOString())}</p>`; })()}
    <div class="comp">${comp.map(([o, s]) => `<span style="width:${o}%;background:${SPC[s] || '#9aa59c'}"></span>`).join('')}</div>
    <p class="ctxt">${comp.map(([o, s]) => `${SP[s] || s} ${o}%`).join(', ')}</p>
    <dl><dt>Kasvukohatüüp</dt><dd>${kh}</dd><dt>Kvartal ja eraldis</dt><dd>${f[8]}</dd>
      <dt>Kuuse sünniaasta</dt><dd>${f[1]}</dd><dt>Inventeeritud</dt><dd>${f[9]}</dd></dl>
    <div class="nav">
      <a class="primary" href="https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d" target="_blank" rel="noopener">Apple Maps</a>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" rel="noopener">Google</a>
      <a href="https://waze.com/ul?ll=${lat},${lon}&navigate=yes" target="_blank" rel="noopener">Waze</a>
    </div>
    <div class="coords"><span id="coTxt">${lat.toFixed(5)}, ${lon.toFixed(5)}</span><button id="copy">Kopeeri</button></div>
    <div class="note"><label for="note">Minu märkmed</label>
      <textarea id="note" placeholder="Näiteks: head kohad põhjaservas kraavi ääres. Märkme lisamine salvestab metsa lemmikuks."></textarea></div>`;
  $('note').value = fav ? fav.note || '' : '';
  cancelDraft();
  ['near', 'fav', 'finds', 'filt'].forEach(x => $('pane-' + x).hidden = true);
  p.hidden = false; p.scrollTop = 0;
  $('sheet').classList.add('stand-open'); ensureOpen(true);
  $('back').onclick = () => { selected = null; showTab(tab); render(); };
  $('heart').onclick = () => {
    if (favs[f[12]]) delete favs[f[12]]; else favs[f[12]] = {note:$('note').value, t:Date.now()};
    const on = !!favs[f[12]];
    $('heart').classList.toggle('on', on); $('heart').setAttribute('aria-pressed', on);
    toast(on ? 'Lisatud lemmikutesse' : 'Eemaldatud lemmikutest'); saveFavs();
  };
  let nt;
  $('note').oninput = () => {
    clearTimeout(nt);
    nt = setTimeout(() => {
      const v = $('note').value;
      if (!favs[f[12]] && v.trim()){ favs[f[12]] = {note:v, t:Date.now()}; $('heart').classList.add('on'); $('heart').setAttribute('aria-pressed', true); }
      else if (favs[f[12]]) favs[f[12]].note = v;
      saveFavs();
    }, 400);
  };
  $('copy').onclick = () => {
    const t = $('coTxt').textContent;
    const sel = () => { const r = document.createRange(); r.selectNodeContents($('coTxt')); getSelection().removeAllRanges(); getSelection().addRange(r); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Koordinaadid kopeeritud'), sel); else sel();
  };
  refreshDist();
  requestAnimationFrame(() => {
    const [pl, pb] = sheetPad();
    if (zoom){
      const bb = f.bb;
      follow = false; locState();
      map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], {paddingTopLeft:[pl + 30, 90], paddingBottomRight:[30, pb + 30], maxZoom:16});
    }
    render();
  });
}
function refreshDist(){
  const c = $('distChip'); if (!c || !selected) return;
  if (me){ c.hidden = false; c.textContent = fmtDist(dist([me.lat, me.lon], selected[11])) + ' ' + dir([me.lat, me.lon], selected[11]); }
  else c.hidden = true;
}

/* ---------- filtrid ---------- */
function syncFilterUI(){
  $('ageMin').value = st.amin; $('ageMax').value = st.amax; $('share').value = st.share; $('area').value = st.area;
  $('ageV').textContent = `${st.amin}–${st.amax} a`;
  $('ageFill').style.left = ((st.amin - 10) / 20 * 100) + '%';
  $('ageFill').style.width = ((st.amax - st.amin) / 20 * 100) + '%';
  $('shareV').textContent = st.share + '%';
  $('areaV').textContent = nf(st.area, st.area % 1 ? 1 : 0) + ' ha';
  document.querySelectorAll('#drain button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === st.drain));
  $('hideCut').checked = st.hideCut;
}
$('hideCut').onchange = () => { st.hideCut = $('hideCut').checked; filtersChanged(); };
let ft;
function filtersChanged(){ syncFilterUI(); store.set('filters', st); clearTimeout(ft); ft = setTimeout(applyFilters, 150); }
$('ageMin').oninput = $('ageMax').oninput = () => {
  let a = +$('ageMin').value, b = +$('ageMax').value; if (a > b) [a, b] = [b, a];
  st.amin = a; st.amax = b; filtersChanged();
};
$('share').oninput = () => { st.share = +$('share').value; filtersChanged(); };
$('area').oninput = () => { st.area = +$('area').value; filtersChanged(); };
$('drain').onclick = e => { const b = e.target.closest('button'); if (b){ st.drain = b.dataset.v; filtersChanged(); } };

/* ---------- otsing ---------- */
let qt, qCtl;
const results = $('results');
function hideResults(){ results.hidden = true; results.innerHTML = ''; }
$('q').addEventListener('input', () => {
  const q = $('q').value.trim(); $('qClear').hidden = !q;
  clearTimeout(qt); if (q.length < 2){ hideResults(); return; }
  qt = setTimeout(() => search(q), 300);
});
$('qClear').onclick = () => { $('q').value = ''; $('qClear').hidden = true; hideResults(); $('q').focus(); };
$('searchForm').onsubmit = e => { e.preventDefault(); const first = results.querySelector('button'); if (first) first.click(); };
async function search(q){
  const items = [];
  const qq = q.toUpperCase().replace(/\s+/g, ' ');
  if (/^[A-ZÕÄÖÜ]{2}\d{1,3}/.test(qq)){
    for (const f of data){ if (f[8].toUpperCase().startsWith(qq)){ items.push({t:'Eraldis ' + f[8], s:`Kuusk ${age(f)} a · ${nf(f[4], 2)} ha`, f}); if (items.length >= 5) break; } }
  }
  try{
    if (qCtl) qCtl.abort(); qCtl = new AbortController();
    const r = await fetch('https://inaadress.maaamet.ee/inaadress/gazetteer?results=8&address=' + encodeURIComponent(q), {signal:qCtl.signal});
    const j = await r.json();
    for (const a of (j.addresses || [])){
      const parts = a.ipikkaadress ? a.ipikkaadress.split(', ') : [a.pikkaadress];
      items.push({t:parts[0], s:parts.slice(1).join(', '), lat:+a.viitepunkt_b, lon:+a.viitepunkt_l, box:a.g_boundingbox});
    }
  }catch(e){
    if (e.name === 'AbortError') return;
    if (!items.length) items.push({t:'Otsing vajab internetiühendust', s:'Kaardil olevad kuusikud töötavad ka ilma.', none:true});
  }
  if ($('q').value.trim() !== q) return;
  if (!items.length) items.push({t:'Midagi ei leitud', s:'Proovi küla, valla või tänava nime.', none:true});
  results.innerHTML = items.map((it, i) => `<li><button type="button" data-i="${i}">${escapeHtml(it.t)}<small>${escapeHtml(it.s || '')}</small></button></li>`).join('');
  results.hidden = false;
  results.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const it = items[+b.dataset.i]; if (it.none) return;
    hideResults(); $('q').blur(); follow = false; locState();
    if (it.f) return openStand(it.f, true);
    const box = (it.box || '').split(' ').map(p => p.split(',').map(Number)).filter(p => p.length === 2 && !isNaN(p[0]));
    if (box.length >= 3){
      const la = box.map(p => p[0]), lo = box.map(p => p[1]);
      map.fitBounds([[Math.min(...la), Math.min(...lo)], [Math.max(...la), Math.max(...lo)]], {maxZoom:14, paddingBottomRight:[0, sheetPad()[1]]});
    } else map.setView([it.lat, it.lon], 14);
  };
}
map.on('click', () => { hideResults(); $('q').blur(); });

/* ---------- leiud ---------- */
let finds = store.get('finds', []);          // {id, lat, lon, t, amount(0-2), note, standId, acc}
const AMT = ['Vähe', 'Parajalt', 'Palju'];
const findLayer = L.layerGroup().addTo(map);
const pinIcon = cls => L.divIcon({className:'', html:`<div class="find-pin ${cls || ''}"></div>`, iconSize:cls ? [26, 26] : [18, 18]});
let draft = null;

function saveFinds(){ store.set('finds', finds); renderFinds(); drawFinds(); updateNear(); }
function drawFinds(){
  findLayer.clearLayers();
  for (const x of finds){
    L.marker([x.lat, x.lon], {icon:pinIcon(), zIndexOffset:500, title:fmtDate(new Date(x.t).toISOString())})
      .on('click', () => openFind(x, false)).addTo(findLayer);
  }
}
function standAt(lat, lon){
  let best = null, bestD = 60; // meetrit; kui punkt pole üheski kuusikus, võta lähim kuni 60 m kaugusel
  for (const f of data){
    const b = f.bb;
    if (lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3]){
      for (const poly of f.ll){
        const ring = poly[0]; let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
          const [yi, xi] = ring[i], [yj, xj] = ring[j];
          if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return f[12];
      }
    }
    if (lat > b[0] - .001 && lat < b[2] + .001 && lon > b[1] - .002 && lon < b[3] + .002){
      const d = dist([lat, lon], f[11]);
      if (d < bestD){ bestD = d; best = f[12]; }
    }
  }
  return best;
}

$('findBtn').onclick = () => {
  if (me && me.acc < 150) return startFind(me.lat, me.lon, me.acc);
  if (!('geolocation' in navigator)) return startFind(map.getCenter().lat, map.getCenter().lng, null);
  toast('Otsin asukohta…', 8000);
  navigator.geolocation.getCurrentPosition(
    p => { toast('Asukoht leitud', 1200); startFind(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
    () => { toast('Asukohta ei leitud. Lohista täpp õigesse kohta.', 4000); startFind(map.getCenter().lat, map.getCenter().lng, null); },
    {enableHighAccuracy:true, timeout:10000, maximumAge:15000});
};

function cancelDraft(){ if (draft){ draft.marker.remove(); draft = null; } }

function findForm(x, isNew){
  const p = $('pane-stand');
  const st0 = x.standId && byId.get(x.standId);
  p.innerHTML = `
    <div class="stand-head">
      <button class="back" id="back" aria-label="Tagasi"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <h2>${isNew ? 'Uus leid' : 'Leid ' + fmtDate(new Date(x.t).toISOString())}</h2>
    </div>
    <p class="hint" id="findWhere"></p>
    <span class="lbl">Kogus</span>
    <div class="amount" id="amount">${AMT.map((a, i) => `<button type="button" data-a="${i}" aria-pressed="${x.amount === i}">${a}</button>`).join('')}</div>
    <div class="note"><label for="findNote">Märkus</label>
      <textarea id="findNote" placeholder="Näiteks: kuuseriisikad, kraavi ääres samblas"></textarea></div>
    <div class="actions">
      ${isNew ? '<button type="button" id="fCancel">Tühista</button><button type="button" class="primary" id="fSave">Salvesta leid</button>'
              : `${st0 ? '<button type="button" id="fStand">Ava kuusik</button>' : ''}<button type="button" class="danger" id="fDel">Kustuta</button>`}
    </div>`;
  $('findNote').value = x.note || '';
  const where = () => {
    const s = x.standId && byId.get(x.standId);
    $('findWhere').textContent = (s ? `Kuusikus ${s[8]} (kuusk ${age(s)} a). ` : 'Väljaspool kaardil olevaid kuusikuid. ') +
      (isNew ? (x.acc ? `Asukoha täpsus ±${Math.round(x.acc)} m. ` : '') + 'Vajadusel lohista täpp kaardil õigesse kohta.' : '');
  };
  where();
  ['near', 'fav', 'finds', 'filt'].forEach(t => $('pane-' + t).hidden = true);
  p.hidden = false; p.scrollTop = 0;
  $('sheet').classList.add('stand-open'); ensureOpen(true);
  $('amount').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    x.amount = +b.dataset.a;
    $('amount').querySelectorAll('button').forEach(z => z.setAttribute('aria-pressed', z === b));
    if (!isNew) saveFinds();
  };
  let nt;
  $('findNote').oninput = () => { x.note = $('findNote').value; if (!isNew){ clearTimeout(nt); nt = setTimeout(saveFinds, 400); } };
  $('back').onclick = () => { cancelDraft(); showTab(isNew ? tab : 'finds'); };
  if (isNew){
    $('fCancel').onclick = () => { cancelDraft(); showTab(tab); };
    $('fSave').onclick = () => {
      finds.push(x); cancelDraft(); saveFinds();
      toast('Leid salvestatud'); showTab('finds');
    };
    draft.marker.on('dragend', () => {
      const ll = draft.marker.getLatLng(); x.lat = +ll.lat.toFixed(6); x.lon = +ll.lng.toFixed(6); x.acc = null;
      x.standId = standAt(x.lat, x.lon); where();
    });
  } else {
    if ($('fStand')) $('fStand').onclick = () => openStand(byId.get(x.standId), true);
    $('fDel').onclick = () => {
      const b = $('fDel');
      if (!b.classList.contains('confirm')){ b.classList.add('confirm'); b.textContent = 'Kinnita kustutamine'; return; }
      finds = finds.filter(z => z.id !== x.id); saveFinds(); toast('Leid kustutatud'); showTab('finds');
    };
  }
}

function startFind(lat, lon, acc){
  cancelDraft(); selected = null; render();
  const x = {id:Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lat:+lat.toFixed(6), lon:+lon.toFixed(6),
    t:Date.now(), amount:1, note:'', acc:acc ? Math.round(acc) : null, standId:null};
  x.standId = standAt(x.lat, x.lon);
  draft = {x, marker:L.marker([x.lat, x.lon], {icon:pinIcon('new'), draggable:true, zIndexOffset:2000}).addTo(map)};
  follow = false; locState();
  map.setView([x.lat, x.lon], Math.max(map.getZoom(), 16));
  findForm(x, true);
}
function openFind(x, fly){
  cancelDraft();
  if (fly) map.setView([x.lat, x.lon], Math.max(map.getZoom(), 15));
  findForm(x, false);
}

function renderFinds(){
  $('findCount').textContent = finds.length ? finds.length : '';
  const list = [...finds].sort((a, b) => b.t - a.t);
  $('findList').innerHTML = list.map(x => {
    const s = x.standId && byId.get(x.standId);
    const ref = me ? [me.lat, me.lon] : null;
    return `<li><button class="item" data-find="${x.id}"><i class="sw" style="background:#8a4b1f;border-radius:50%"></i>
      <span class="t">${fmtDate(new Date(x.t).toISOString())} · ${AMT[x.amount].toLowerCase()}</span>
      <span class="d">${ref ? fmtDist(dist(ref, [x.lat, x.lon])) : ''}</span>
      <span class="s">${[s ? s[8] : 'väljaspool kuusikuid', x.note ? escapeHtml(x.note) : ''].filter(Boolean).join(' · ')}</span></button></li>`;
  }).join('');
  $('findEmpty').hidden = list.length > 0;
}
$('findList').onclick = e => {
  const b = e.target.closest('button[data-find]'); if (!b) return;
  const x = finds.find(z => z.id === b.dataset.find); if (x) openFind(x, true);
};

/* varukoopia */
async function giveFile(name, text, type){
  const file = new File([text], name, {type});
  try{
    if (navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:name}); return; }
  }catch(e){ if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
$('exportBtn').onclick = () => giveFile(`kuusikud-varukoopia-${stamp()}.json`, JSON.stringify({app:'kuusikud', v:1, saved:new Date().toISOString(), finds, favs}, null, 1), 'application/json');
$('gpxBtn').onclick = () => {
  const esc = s => escapeHtml(s || '');
  const wpts = finds.map(x => `  <wpt lat="${x.lat}" lon="${x.lon}"><time>${new Date(x.t).toISOString()}</time><name>Leid ${fmtDate(new Date(x.t).toISOString())} (${AMT[x.amount].toLowerCase()})</name>${x.note ? `<desc>${esc(x.note)}</desc>` : ''}</wpt>`).join('\n');
  giveFile(`kuusikud-leiud-${stamp()}.gpx`, `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kuusikud" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts}\n</gpx>\n`, 'application/gpx+xml');
};
$('importFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try{
    const d = JSON.parse(await file.text());
    if (d.app !== 'kuusikud' || !Array.isArray(d.finds)) throw new Error('vale fail');
    const have = new Set(finds.map(x => x.id)); let nF = 0, nV = 0;
    for (const x of d.finds) if (x && x.id && !have.has(x.id) && isFinite(x.lat) && isFinite(x.lon)){ finds.push(x); nF++; }
    for (const [k, v] of Object.entries(d.favs || {})) if (!favs[k]){ favs[k] = v; nV++; }
    saveFinds(); saveFavs();
    toast(`Taastatud: ${nF} leidu, ${nV} lemmikut`, 3500);
  }catch(err){ toast('Seda faili ei saanud lugeda. Vali Kuusikute varukoopia (.json).', 4000); }
};

/* ---------- muu ---------- */
let tt;
function toast(msg, ms = 2200){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, ms); }

function prep(f){
  let s = 90, w = 180, n = -90, e = -180;
  f.ll = f[0].map(poly => poly.map(ring => ring.map(c => {
    if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
    return [c[1], c[0]];
  })));
  f.bb = [s, w, n, e];
  f[11] = [f[11][0], f[11][1]];
  byId.set(f[12], f);
}

setBase(base);
syncFilterUI();
fetch('data/kuusikud.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
  kk = d.kk; updated = d.updated; RC = d.raie_codes || {};
  d.f.forEach(prep); data = d.f;
  $('upd').textContent = fmtDate(updated);
  const nCut = data.filter(f => f[13] && f[13][0] === 'raie').length;
  $('cutInfo').textContent = `${nf(nCut)} kuusikut, kus pärast inventeerimist on registreeritud lageraie, raadamine või muu uuendusraie.`;
  applyFilters(); renderFavs(); renderFinds(); drawFinds();
  $('splash').classList.add('gone'); setTimeout(() => $('splash').hidden = true, 400);
}).catch(() => { $('splashMsg').textContent = 'Andmete laadimine ebaõnnestus. Kontrolli internetiühendust ja ava rakendus uuesti.'; });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
