// API Keys
const TMDB_KEY = '3fd2be6f0c70a2a598f084ddfb75487c';
const GEMINI_KEY = 'AIzaSyCaceGF0UgYdx4r_m-DmqdCgw3Wwg5pZ9A';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`;

/* ========== DOM ========== */
const searchInput = document.getElementById('search');
const suggestionsContainer = document.getElementById('suggestions');
const moviesContainer = document.getElementById('movies');
const movieDetails = document.getElementById('movieDetails');
const overlay = document.getElementById('overlay');
const personInfo = document.getElementById('personInfo');
const trendingMovies = document.getElementById('trendingMovies');
const oscarMovies = document.getElementById('oscarMovies');
const searchResults = document.getElementById('searchResults');
const defaultContent = document.getElementById('defaultContent');
const searchResultsTitle = document.querySelector('#searchResults .section-title');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const loadMoreWrapper = document.getElementById('loadMoreWrapper');
const filterGenre = document.getElementById('filterGenre');
const filterLanguage = document.getElementById('filterLanguage');
const filterYear = document.getElementById('filterYear');
const applyFiltersBtn = document.getElementById('applyFilters');
const clearFiltersBtn = document.getElementById('clearFilters');
const voiceBtn = document.getElementById('voiceBtn');
const chatBtn = document.getElementById('chatBtn');
const themeToggle = document.getElementById('themeToggle');

/* ========== STATE ========== */
let currentResults = [];
let currentPage = 1;
let currentQuery = '';
let lastAIResult = null;

/* ========== MAPS ========== */
const genres = {
  action:28, adventure:12, animation:16, comedy:35, crime:80, documentary:99,
  drama:18, family:10751, fantasy:14, history:36, horror:27, music:10402,
  mystery:9648, romance:10749, 'sci-fi':878, thriller:53, war:10752, western:37,
  romcom:10749, 'romantic comedy':10749
};
const languages = {
  hindi:'hi', english:'en', tamil:'ta', telugu:'te', malayalam:'ml', bengali:'bn', kannada:'kn', marathi:'mr',
  punjabi:'pa', gujarati:'gu', bhojpuri:'bh'
};

/* small mood mapping */
const MOOD_MAP = {
  chill:['drama','romance','music'],
  funny:['comedy','romcom'],
  intense:['thriller','crime','action'],
  action:['action','adventure'],
  emotional:['drama','family'],
  dark:['horror','thriller'],
  classic:['history','drama'],
  'sci-fi':['sci-fi','fantasy']
};

/* ========== UTIL ========== */
const escapeText = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const showDefault = ()=>{ defaultContent.style.display='block'; searchResults.style.display='none'; };
const showSearchArea = ()=>{ defaultContent.style.display='none'; searchResults.style.display='block'; };
const showSpinner = container => container.innerHTML = '<div class="spinner">Loading…</div>';
const showError = (container, msg) => container.innerHTML = `<div class="error-message">${escapeText(msg)}</div>`;

/* lightweight in-memory cache */
const memCache = new Map();
function cacheGet(k){ const e = memCache.get(k); if(!e) return null; if(e.t + e.ttl < Date.now()){ memCache.delete(k); return null;} return e.v;}
function cacheSet(k,v,ttl=1000*60){ memCache.set(k,{v,t:Date.now(),ttl}); }

/* ========== FETCH HELPERS ========== */
async function tmdbFetch(path){
  const cacheKey = `tmdb:${path}`;
  const cached = cacheGet(cacheKey);
  if(cached) return cached;
  const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('TMDB error '+res.status);
  const data = await res.json();
  cacheSet(cacheKey,data,1000*60*10);
  return data;
}

/* ========== AI INTENT (Gemini) ========== */
async function getAIMovieSuggestions(query){
  const cacheKey = `ai:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if(cached) return cached;

  const prompt = `Analyze this search query: "${query}"
Rules:
1) If it's a genre, return: GENRE: name
2) If person: PERSON: full name
3) If movie titles: MOVIES: title1 | title2
4) If language: LANGUAGE: name
Respond only one line.`;

  try{
    const res = await fetch(GEMINI_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({contents:[{parts:[{text:prompt}]}]})
    });
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const t = text.trim();
    const personMatch = t.match(/PERSON:\s*(.+)/i);
    const moviesMatch = t.match(/MOVIES:\s*(.+)/i);
    const genreMatch = t.match(/GENRE:\s*(.+)/i);
    const languageMatch = t.match(/LANGUAGE:\s*(.+)/i);
    let out;
    if(languageMatch) out = {type:'language', value:languageMatch[1].trim().toLowerCase()};
    else if(personMatch) out = {type:'person', value:personMatch[1].trim()};
    else if(genreMatch) out = {type:'genre', value:genreMatch[1].trim().toLowerCase()};
    else if(moviesMatch) out = {type:'movies', value:moviesMatch[1].split('|').map(x=>x.trim())};
    else out = {type:'unknown', value:query};
    cacheSet(cacheKey,out,1000*60*3);
    lastAIResult = out;
    return out;
  }catch(err){
    console.error('AI error',err);
    lastAIResult = {type:'unknown', value:query};
    return lastAIResult;
  }
}

/* ========== FUZZY HELPERS (Fuse.js) ========== */
function fuzzyMatchList(query, list, threshold=0.4){
  if(!list || list.length===0) return null;
  const fuse = new Fuse(list.map(s=>({name:s})), {keys:['name'], includeScore:true, threshold});
  const res = fuse.search(query);
  if(!res || res.length===0) return null;
  return res[0].score <= threshold ? res[0].item.name : null;
}

/* ========== PERSON RESOLUTION (typos + aliases) ========== */
async function resolvePersonFuzzy(query){
  if(!query) return null;
  try{
    const sr = await tmdbFetch(`/search/person?query=${encodeURIComponent(query)}`);
    const candidates = (sr.results || []).slice(0,5);
    if(candidates.length===0) return null;
    const details = await Promise.all(candidates.map(c=>tmdbFetch(`/person/${c.id}`)));
    const nameEntries = [];
    const idMap = new Map();
    for(const d of details){
      if(!d) continue;
      const primary = d.name;
      nameEntries.push({name:primary, id:d.id, canonical:primary});
      idMap.set(primary, d);
      if(Array.isArray(d.also_known_as)){
        for(const a of d.also_known_as){
          nameEntries.push({name:a, id:d.id, canonical:primary});
          idMap.set(a, d);
        }
      }
    }
    const fuse = new Fuse(nameEntries, {keys:['name'], includeScore:true, threshold:0.45});
    const found = fuse.search(query);
    if(found && found.length>0 && found[0].score <= 0.45){
      const match = found[0].item;
      const person = idMap.get(match.name) || candidates.find(c=>c.id===match.id) || null;
      if(person){ person._matched_as = match.name; person._score = found[0].score; return person; }
    }
    return candidates[0];
  }catch(err){ console.error('resolve person error', err); return null; }
}

/* ========== TMDB WRAPPERS ========== */
async function searchMoviesTitle(q, page=1){ const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(q)}&page=${page}`); return data; }
async function searchPerson(query){ const data = await tmdbFetch(`/search/person?query=${encodeURIComponent(query)}`); return data.results || []; }
async function discoverByGenre(genreId, page=1){ const data = await tmdbFetch(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc&page=${page}`); return data; }
async function discoverByLanguage(langCode, page=1){ const data = await tmdbFetch(`/discover/movie?with_original_language=${langCode}&sort_by=popularity.desc&page=${page}`); return data; }
async function getPersonDetails(personId){ const details = await tmdbFetch(`/person/${personId}`); const credits = await tmdbFetch(`/person/${personId}/movie_credits`); return {...details, movies: (credits.cast||[]).concat(credits.crew||[])}; }
async function getMovieDetailsAPI(id){ const movie = await tmdbFetch(`/movie/${id}`); const credits = await tmdbFetch(`/movie/${id}/credits`); const videos = await tmdbFetch(`/movie/${id}/videos`); const trailer = (videos.results||[]).find(v=>v.type==='Trailer'&&v.site==='YouTube'); const director = (credits.crew||[]).find(c=>c.job==='Director'); return {...movie, cast:(credits.cast||[]).slice(0,8), director: director?.name||'Unknown', trailer: trailer?`https://www.youtube.com/watch?v=${trailer.key}`:null}; }
async function getTrendingMovies(){ const data = await tmdbFetch(`/trending/movie/week`); return (data.results||[]).slice(0,10); }
async function getOscarWinningMovies(){ const pages = await Promise.all([ tmdbFetch('/discover/movie?sort_by=vote_average.desc&vote_count.gte=1000&with_keywords=156064&page=1'), tmdbFetch('/discover/movie?sort_by=popularity.desc&with_keywords=209704&page=1') ]); const all = pages.flatMap(p=>p.results||[]); const unique = Array.from(new Map(all.map(m=>[m.id,m])).values()); return unique.slice(0,20); }

/* ========== RENDER HELPERS ========== */
function buildMovieCard(movie){
  const card = document.createElement('div'); card.className='movie'; card.tabIndex=0;
  const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '';
  card.innerHTML = `
    <img loading="lazy" src="${poster}" alt="${escapeText(movie.title||'Movie')}" />
    <h3>${escapeText(movie.title||'Untitled')}</h3>
    <div class="meta"><span>${movie.vote_average ? movie.vote_average.toFixed(1)+' ⭐' : 'N/A'}</span><span>${escapeText(movie.release_date||'')}</span></div>
    <div class="movie-overview"><h4>Overview</h4><p>${escapeText(movie.overview||'No overview')}</p></div>
    <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;justify-content:center">
      <button class="shareBtn">Share</button>
      <button class="detailsBtn">Details</button>
    </div>
  `;
  const img = card.querySelector('img');
  img.onerror = ()=>img.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#373b69"/><text x="50%" y="50%" text-anchor="middle" fill="white">No Image</text></svg>';
  card.querySelector('.detailsBtn').addEventListener('click', ()=>openDetails(movie.id));
  card.querySelector('.shareBtn').addEventListener('click', ()=>shareMovie(movie));
  card.addEventListener('keydown', e=>{ if(e.key==='Enter') openDetails(movie.id); });
  return card;
}
function displayMovies(movies, container, append=false){
  if(!append) container.innerHTML='';
  const frag = document.createDocumentFragment();
  const list = (movies||[]).filter(m=>m.poster_path);
  for(const m of list) frag.appendChild(buildMovieCard(m));
  container.appendChild(frag);
}

/* open details modal */
async function openDetails(movieId){
  movieDetails.innerHTML = '<div class="spinner">Loading details…</div>';
  overlay.classList.add('active'); movieDetails.classList.add('active');
  try{
    const info = await getMovieDetailsAPI(movieId);
    const castHTML = (info.cast||[]).map(a=>`<div class="cast-member"><img class="cast-image" loading="lazy" src="${a.profile_path? 'https://image.tmdb.org/t/p/w185'+a.profile_path : ''}" alt="${escapeText(a.name)}"/><div class="cast-name">${escapeText(a.name)}</div><div class="cast-character">${escapeText(a.character||'')}</div></div>`).join('');
    movieDetails.innerHTML = `
      <h2>${escapeText(info.title)}</h2>
      <p><strong>Director:</strong> ${escapeText(info.director)}</p>
      <p><strong>Rating:</strong> ${info.vote_average?.toFixed(1) || 'N/A'} ⭐</p>
      <p>${escapeText(info.overview||'')}</p>
      <h3>Cast</h3>
      <div class="cast-container">${castHTML}</div>
      <div style="text-align:center;margin-top:14px">${info.trailer ? `<a class="trailer-link" href="${info.trailer}" target="_blank">Watch Trailer</a>` : '<p>No trailer available</p>'}</div>
    `;
  }catch(err){ movieDetails.innerHTML = '<p>Error loading details.</p>'; console.error(err); }
}
overlay.addEventListener('click', ()=>{ movieDetails.classList.remove('active'); overlay.classList.remove('active'); });

/* ========== SEARCH FLOW ========== */
let searchDebounceTimer;
function debounceSearch(fn, ms=450){ clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(fn, ms); }

searchInput.addEventListener('input', e=>{
  const val = e.target.value.trim();
  if(!val){ suggestionsContainer.textContent=''; showDefault(); return; }
  debounceSearch(()=>doTypeahead(val), 300);
});

async function doTypeahead(q){
  suggestionsContainer.textContent = 'Looking...';
  try{
    const [m,p] = await Promise.all([ tmdbFetch(`/search/movie?query=${encodeURIComponent(q)}&page=1`), tmdbFetch(`/search/person?query=${encodeURIComponent(q)}&page=1`) ]);
    const movieSuggest = (m.results||[]).slice(0,3).map(x=>x.title).filter(Boolean);
    const personSuggest = (p.results||[]).slice(0,3).map(x=>x.name).filter(Boolean);
    const suggestions = [...personSuggest, ...movieSuggest].slice(0,5);
    suggestionsContainer.textContent = suggestions.length>0 ? ('Suggestions: '+suggestions.join(' • ')) : '';
  }catch(err){ suggestionsContainer.textContent=''; console.error(err); }
}

searchInput.addEventListener('keyup', async e=>{
  if(e.key==='Enter'){ const q = e.target.value.trim(); if(!q) return; await handleSearch(q,1,false); }
});

async function handleSearch(query, page=1, append=false){
  currentQuery = query; currentPage = page;
  showSearchArea(); searchResultsTitle.style.display='block'; showSpinner(moviesContainer);
  suggestionsContainer.textContent=''; personInfo.classList.remove('active'); personInfo.innerHTML='';

  const ai = await getAIMovieSuggestions(query);
  let results = [];
  try{
    switch(ai.type){
      case 'language': {
        const lang = ai.value;
        suggestionsContainer.textContent = `Interpreted as language: ${lang}`;
        const code = languages[lang] || lang;
        const data = await discoverByLanguage(Array.isArray(code)? code[0] : code, page);
        results = data.results || data;
        break;
      }
      case 'genre': {
        const g = ai.value;
        suggestionsContainer.textContent = `Interpreted as genre: ${g}`;
        let key = Object.keys(genres).find(k=>k.toLowerCase()===g.toLowerCase());
        if(!key){ const fuzzy = fuzzyMatchList(g, Object.keys(genres),0.35); if(fuzzy) key = fuzzy; }
        if(key){ const data = await discoverByGenre(genres[key], page); results = data.results || data; }
        break;
      }
      case 'person': {
        suggestionsContainer.textContent = `Interpreted as person: ${ai.value}`;
        const person = await resolvePersonFuzzy(ai.value);
        if(person){
          const pd = await getPersonDetails(person.id);
          results = pd.movies || [];
          searchResultsTitle.textContent = `Movies featuring ${pd.name}`;
          personInfo.innerHTML = `<h3>Showing movies featuring ${escapeText(pd.name)}</h3>`; personInfo.classList.add('active');
        }
        break;
      }
      case 'movies': {
        suggestionsContainer.textContent = 'Interpreted as movie titles';
        const arrays = await Promise.all(ai.value.map(t => searchMoviesTitle(t, page)));
        results = arrays.flatMap(a => a.results || a);
        break;
      }
      default: {
        const personGuess = await resolvePersonFuzzy(query);
        if(personGuess){
          suggestionsContainer.textContent = `Matched person: ${personGuess.name}`;
          const pd = await getPersonDetails(personGuess.id);
          results = pd.movies || [];
          searchResultsTitle.textContent = `Movies featuring ${pd.name}`;
          personInfo.innerHTML = `<h3>Showing movies featuring ${escapeText(pd.name)}</h3>`; personInfo.classList.add('active');
        } else {
          suggestionsContainer.textContent = 'Searching by title';
          const d = await searchMoviesTitle(query, page);
          results = d.results || [];
        }
      }
    }

    if(!append) moviesContainer.innerHTML = '';
    if(!results || results.length===0){
      moviesContainer.innerHTML = '<p>No movies found. Try another query or spelling.</p>';
      loadMoreWrapper.style.display='none';
    } else {
      displayMovies(results, moviesContainer, append);
      loadMoreWrapper.style.display = (results.length >= 20 ? 'block' : 'none');
    }
  }catch(err){ console.error('search error',err); showError(moviesContainer,'Search failed. Try again.'); }
}

loadMoreBtn.addEventListener('click', async ()=>{
  currentPage++;
  await handleSearch(currentQuery, currentPage, true);
});

/* ========== INIT HOME ========== */
async function initializePage(){
  try{
    const [trending, award] = await Promise.all([ getTrendingMovies(), getOscarWinningMovies() ]);
    displayMovies(trending, trendingMovies);
    displayMovies(award, oscarMovies);
    populateFilters();
    showDefault();
    searchResultsTitle.style.display='none';
  }catch(err){ console.error('init error',err); }
}
initializePage();

/* ========== FILTERS ========== */
function populateFilters(){
  const gKeys = Object.keys(genres).sort();
  for(const g of gKeys){ const opt = document.createElement('option'); opt.value = g; opt.textContent = g.charAt(0).toUpperCase()+g.slice(1); filterGenre.appendChild(opt); }
  const lKeys = Object.keys(languages).sort();
  for(const l of lKeys){ const opt=document.createElement('option'); opt.value=l; opt.textContent=l.charAt(0).toUpperCase()+l.slice(1); filterLanguage.appendChild(opt); }
  const yearNow = new Date().getFullYear();
  for(let y=yearNow; y>=1950; y--){ const opt=document.createElement('option'); opt.value=y; opt.textContent=y; filterYear.appendChild(opt); if(y<=yearNow-10) break; }
}
applyFiltersBtn.addEventListener('click', async ()=>{
  const g = filterGenre.value; const lang = filterLanguage.value; const year = filterYear.value;
  let path = '/discover/movie?sort_by=popularity.desc&page=1';
  if(g) path += `&with_genres=${genres[g]}`;
  if(lang) path += `&with_original_language=${languages[lang] || lang}`;
  if(year) path += `&primary_release_year=${year}`;
  try{ showSearchArea(); showSpinner(moviesContainer); const data = await tmdbFetch(path); displayMovies(data.results || [], moviesContainer); }catch(err){ showError(moviesContainer,'Filter search failed'); }
});
clearFiltersBtn.addEventListener('click', ()=>{ filterGenre.value=''; filterLanguage.value=''; filterYear.value=''; });

/* ========== SHARE FUNCTIONALITY ========== */
function shareMovie(movie){
  const url = `${window.location.origin}${window.location.pathname}?movieId=${movie.id}`;
  if(navigator.share){
    navigator.share({title:movie.title, text: movie.overview || movie.title, url}).catch(()=>copyToClipboard(url));
  }else{
    copyToClipboard(url); showShareToast('Link copied to clipboard');
  }
}
function copyToClipboard(txt){ navigator.clipboard?.writeText(txt).catch(()=>{}); }
function showShareToast(msg){
  let t=document.querySelector('.share-toast'); if(!t){ t=document.createElement('div'); t.className='share-toast'; document.body.appendChild(t); }
  t.textContent=msg; t.style.display='block'; setTimeout(()=>t.style.display='none',2500);
}

/* ========== VOICE SEARCH (Web Speech) ========== */
let recognition = null; let listening = false;
if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e)=>{ const txt = e.results[0][0].transcript; document.getElementById('search').value = txt; handleSearch(txt,1,false); };
  recognition.onend = ()=>{ listening=false; voiceBtn.textContent='🎙️ Voice'; voiceBtn.classList.remove('listening'); };
  recognition.onerror = (ev)=>{ console.error('speech err',ev); listening=false; voiceBtn.textContent='🎙️ Voice'; voiceBtn.classList.remove('listening'); };
  voiceBtn.addEventListener('click', ()=>{ if(listening){ recognition.stop(); } else { recognition.start(); listening=true; voiceBtn.textContent='⏺️ Listening...'; voiceBtn.classList.add('listening'); } });
} else { voiceBtn.style.display='none'; }

/* ========== ASSISTANT WIDGET (Simple Chat) ========== */
const widget = document.createElement('div'); widget.id='assistantWidget'; widget.style.display='none'; widget.innerHTML = `
  <div id="assistantHeader"><div>Chanachur Assistant</div><div><button id="assistantClose">✖</button></div></div>
  <div id="assistantMessages" role="log" aria-live="polite"></div>
  <div id="assistantInput"><input id="assistantText" placeholder="Ask: recommend me an action movie..." /><button id="assistantSend">Send</button></div>
`;
document.body.appendChild(widget);
const assistantMessages = widget.querySelector('#assistantMessages');
const assistantInput = widget.querySelector('#assistantText');
const assistantSend = widget.querySelector('#assistantSend');
widget.querySelector('#assistantClose').addEventListener('click', ()=>{ widget.style.display='none'; widget.setAttribute('aria-hidden','true'); });
chatBtn.addEventListener('click', ()=>{ widget.style.display='flex'; widget.setAttribute('aria-hidden','false'); assistantInput.focus(); });
function pushAssistant(text, fromUser=false){ const div = document.createElement('div'); div.className = fromUser ? 'userMessage':'assistantMessage'; div.innerHTML = `<div>${escapeText(text)}</div>`; assistantMessages.appendChild(div); assistantMessages.scrollTop = assistantMessages.scrollHeight; }
assistantSend.addEventListener('click', async ()=>{ const q = assistantInput.value.trim(); if(!q) return; pushAssistant(q,true); assistantInput.value=''; pushAssistant('Thinking…'); try{ const ai = await getAIMovieSuggestions(q); if(ai.type==='person'){ const p = await resolvePersonFuzzy(ai.value); if(p){ const pd = await getPersonDetails(p.id); pushAssistant(`Showing movies featuring ${p.name}`); displayMovies(pd.movies.slice(0,20), moviesContainer); } else pushAssistant('Could not find that person.'); } else if(ai.type==='genre' || q.toLowerCase().includes('recommend')){ let genre = ai.type==='genre'?ai.value:null; if(!genre){ const known = Object.keys(genres); for(const k of known) if(q.toLowerCase().includes(k)) { genre=k; break; } } if(genre){ pushAssistant(`Recommended ${genre} picks:`); const gkey = Object.keys(genres).find(k=>k===genre) || genre; const data = await discoverByGenre(genres[gkey] || genres['action']); displayMovies((data.results||[]).slice(0,12), moviesContainer); } else { const data = await searchMoviesTitle(q); displayMovies((data.results||[]).slice(0,12), moviesContainer); pushAssistant('Showing matching titles'); } } else if(ai.type==='language'){ pushAssistant(`Showing movies in ${ai.value}`); const data = await discoverByLanguage(languages[ai.value]||ai.value); displayMovies((data.results||[]).slice(0,12), moviesContainer); } else { const d = await searchMoviesTitle(q); displayMovies((d.results||[]).slice(0,12), moviesContainer); pushAssistant('Here are some matches'); } }catch(err){ console.error('assistant err',err); pushAssistant('Sorry, something went wrong.'); } });

/* ========== MOOD BUTTONS ========== */
const moodsEl = document.getElementById('moodButtons');
Object.keys(MOOD_MAP).forEach(m=>{
  const btn = document.createElement('button'); btn.textContent = m.charAt(0).toUpperCase()+m.slice(1);
  btn.addEventListener('click', async ()=>{
    const g = MOOD_MAP[m][0];
    let genreKey = Object.keys(genres).find(k=>k.toLowerCase()===g.toLowerCase()) || g;
    if(genres[genreKey]){
      const data = await discoverByGenre(genres[genreKey],1);
      displayMovies((data.results||[]).slice(0,18), moviesContainer);
      showSearchArea();
      setTimeout(()=>window.scrollTo({top:moviesContainer.offsetTop-20,behavior:'smooth'}),100);
    }
  });
  moodsEl.appendChild(btn);
});

/* ========== DID YOU MEAN SUGGESTION ========== */
const suggestionEl = document.createElement('div'); suggestionEl.className='suggestions'; document.querySelector('.search-section').appendChild(suggestionEl);
function showDidYouMean(corrected){
  suggestionEl.innerHTML = `<div>Did you mean <button class="did-you-mean">${escapeText(corrected)}</button> ?</div>`;
  suggestionEl.querySelector('.did-you-mean').addEventListener('click', ()=>{ document.getElementById('search').value = corrected; handleSearch(corrected,1,false); });
  setTimeout(()=> suggestionEl.innerHTML = '', 8000);
}
searchInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    setTimeout(()=> {
      if(lastAIResult && lastAIResult.type === 'person'){
        const raw = searchInput.value.trim();
        const suggested = lastAIResult.value;
        if(suggested && suggested.toLowerCase() !== raw.toLowerCase()){
          showDidYouMean(suggested);
        }
      }
    }, 800);
  }
});

/* ========== THEME TOGGLE ========== */
themeToggle.addEventListener('change', (e)=>{
  if(e.target.value === 'light') document.body.classList.add('light'); else document.body.classList.remove('light');
});

/* ========== expose some API for debug or future enhancements ========== */
window.appAPI = {
  handleSearch, openDetails, resolvePersonFuzzy, getAIMovieSuggestions, displayMovies, getTrendingMovies, discoverByGenre, discoverByLanguage, searchMoviesTitle, movieDetailsContainer: movieDetails, moviesContainer, overlay
};
