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

const st = Object.assign({amin:10, amax:30, share:50, area:0, drain:'all'}, store.get('filters', {}));
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
let data = [], byId = new Map(), kk = {}, filtered = [], selected = null, updated = '';
const age = f => YEAR - f[1];
const col = a => a <= 15 ? C.c1 : a <= 20 ? C.c2 : a <= 25 ? C.c3 : C.c4;
const cls = a => a <= 15 ? 'c1' : a <= 20 ? 'c2' : a <= 25 ? 'c3' : 'c4';
const nf = (x, d=0) => x.toLocaleString('et-EE', {minimumFractionDigits:d, maximumFractionDigits:d});

function pass(f){
  const a = age(f);
  return a >= st.amin && a <= st.amax && f[3] >= st.share && f[4] >= st.area &&
    (st.drain === 'all' || (st.drain === 'y') === (f[5] === 1));
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
  L.circleMarker(ll, {renderer:rend, radius:8, color:'#fff', weight:3, fillColor:C.me, fillOpacity:1, interactive:false}).addTo(meLayer);
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
  const sub = [nf(f[4], 2) + ' ha', f[5] ? 'kuivendatud' : '', f[8]].filter(Boolean).join(' · ');
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
  ['near', 'fav', 'filt'].forEach(p => $('pane-' + p).hidden = p !== t);
  $('pane-stand').hidden = true;
  $('sheet').classList.remove('stand-open', 'collapsed');
  if (t === 'fav') renderFavs();
}
$('tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); };
$('grip').onclick = () => $('sheet').classList.toggle('collapsed');
new ResizeObserver(() => document.documentElement.style.setProperty('--sheet-h', $('sheet').offsetHeight + 'px')).observe($('sheet'));

function sheetPad(){ return window.innerWidth >= 900 ? [400, 20] : [0, $('sheet').offsetHeight]; }

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
      ${f[5] ? '<span class="chip">kuivendatud</span>' : ''}<span class="chip dist" id="distChip" hidden></span></div>
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
  ['near', 'fav', 'filt'].forEach(x => $('pane-' + x).hidden = true);
  p.hidden = false; p.scrollTop = 0;
  $('sheet').classList.add('stand-open'); $('sheet').classList.remove('collapsed');
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
}
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
  kk = d.kk; updated = d.updated;
  d.f.forEach(prep); data = d.f;
  const [y, m, dd] = updated.split('-'); $('upd').textContent = `${dd}.${m}.${y}`;
  applyFilters(); renderFavs();
  $('splash').classList.add('gone'); setTimeout(() => $('splash').hidden = true, 400);
}).catch(() => { $('splashMsg').textContent = 'Andmete laadimine ebaõnnestus. Kontrolli internetiühendust ja ava rakendus uuesti.'; });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
