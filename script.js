// --- ANTI-DEBUGGING AND PROTECTION ---
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', function (e) {
    if (e.key === 'F12' || 
       (e.ctrlKey && e.shiftKey && e.key === 'I') || 
       (e.ctrlKey && e.shiftKey && e.key === 'J') || 
       (e.ctrlKey && e.key === 'U') || 
       (e.ctrlKey && e.shiftKey && e.key === 'C')) {
        e.preventDefault();
    }
});
setInterval(function() {
    (function () {
        return false;
    }
    ['constructor']('debugger')
    ());
}, 50);
// -----------------------------------

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";
const BACK = "https://image.tmdb.org/t/p/w1280"; 
const KEY = "4803cc94c4172a32fc2851dda48d254f"; 

let modalZIndex = 5000;
let currentModalItem = null;
let heroInterval;

const currentProfileId = 'user_default'; 

window.onload = () => {
    if (!sessionStorage.getItem("fixed_v1")) {
        sessionStorage.setItem("fixed_v1", "true");
    }
    init();
    setTimeout(showAdblockMsg, 2000); 
};

function showAdblockMsg() {
    const msg = document.getElementById("adblock-msg");
    if(msg) {
        msg.style.display = "flex";
    }
}

function closeAdblockMsg() {
    const msg = document.getElementById("adblock-msg");
    if(msg) {
        msg.style.opacity = "0";
        setTimeout(() => {
            msg.style.display = "none";
        }, 300);
    }
}

function clearHistory() {
    if(confirm("Clear your watch history?")) {
        localStorage.removeItem(getHistoryKey());
        loadRecentlyViewed();
        showToast("History Cleared");
    }
}

function clearWishlist() {
    if(confirm("Clear your Watchlist?")) {
        localStorage.removeItem(getWishlistKey());
        if(document.getElementById("nav-list").classList.contains("active")) {
            loadWishlist();
        }
        showToast("List Cleared");
    }
}

function resetApp() {
    if (confirm("Logout and Reset App?")) {
        localStorage.clear();
        location.reload();
    }
}

function getHistoryKey() {
    return `history_${currentProfileId}`;
}
function getWishlistKey() {
    return `wishlist_${currentProfileId}`;
}

function init() {
    loadContent("home");
}

// The search icon expands the search box in the navbar and opens the Search
// page (trending until you type). Clicking it again with an empty box closes
// search and goes back home.
let searchActive = false;

function expandSearch(focus = true) {
    const input = document.getElementById("search-input");
    searchActive = true;
    input.classList.add("active");
    if (focus) input.focus({ preventScroll: true });
}

function collapseSearch() {
    const input = document.getElementById("search-input");
    searchActive = false;
    input.classList.remove("active");
    input.value = "";
    input.blur();
}

function toggleSearch() {
    const input = document.getElementById("search-input");
    if (searchActive && !input.value.trim()) {
        collapseSearch();
        loadContent("home");
        return;
    }
    openSearchPage();
}

function setActiveNav(id) {
    document
        .querySelectorAll(".nav-link")
        .forEach((b) => b.classList.remove("active"));
    const el = id && document.getElementById(id);
    if (el) el.classList.add("active");
}

// Recent South Indian releases (last two years, already out), so this row
// doesn't repeat the all-time blockbusters in "Pan-India Hits".
function southIndianRecentEndpoint() {
    const day = 864e5;
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 730 * day).toISOString().slice(0, 10);
    return `/discover/movie?with_original_language=ta|te|ml|kn&sort_by=popularity.desc&vote_count.gte=20&primary_release_date.gte=${since}&primary_release_date.lte=${today}`;
}

// Bumped whenever the main view changes, so a page that is still loading
// (e.g. the homepage rows) doesn't paint over the page the user moved to.
let viewSeq = 0;

async function loadContent(type) {
    const seq = ++viewSeq;
    if (searchActive && type !== undefined) collapseSearch();
    clearSearchUrl();
    gridState.active = false;
    if (rowObserver) rowObserver.disconnect();
    const loader = document.getElementById("global-loader");
    if(loader) loader.classList.remove("hidden");
    
    const container = document.getElementById("main-content");
    document.getElementById("hero").style.display = "flex";
    container.innerHTML = "";
    
    let heroPromise;
    if (type === "home") {
        document.title = "MovieDeck - Home";
        setActiveNav("nav-home");
        heroPromise = setupHeroSlideshow("/trending/all/day");
    } else if (type === "tv") {
        document.title = "MovieDeck - TV Series";
        setActiveNav("nav-tv");
        heroPromise = setupHeroSlideshow("/trending/tv/day");
    } else if (type === "movie") {
        document.title = "MovieDeck - Movies";
        setActiveNav("nav-movie");
        heroPromise = setupHeroSlideshow("/trending/movie/day");
    }

    setTimeout(async () => {
        if (seq !== viewSeq) { if (loader) loader.classList.add("hidden"); return; }
        let promises = [];
        if (heroPromise) promises.push(heroPromise);

        // The first rows load right away; the rest as you scroll to them.
        const rows = [];
        const add = (title, endpoint, rowType) => rows.push([title, endpoint, rowType]);

        // About eight rows per page; every other genre is one tap away in Explore.
        if (type === "home") {
            add("Trending Now", "/trending/all/day");
            add("Bollywood", "/discover/movie?with_original_language=hi&sort_by=popularity.desc&vote_count.gte=50", "movie");
            add("South Indian", southIndianRecentEndpoint(), "movie");
            add("Pan-India Hits", "/discover/movie?with_original_language=ta|te|ml|kn&sort_by=popularity.desc&vote_count.gte=150", "movie");
            add("Popular Series", "/tv/popular", "tv");
            add("Action", genreRow('movie', 28), "movie");
            add("Sci-Fi", genreRow('movie', 878), "movie");
            add("Comedy", genreRow('movie', 35), "movie");
            add("Horror", genreRow('movie', 27), "movie");
        } else if (type === "tv") {
            add("Popular Series", "/tv/popular", "tv");
            add("Airing This Week", "/tv/on_the_air", "tv");
            add("Indian Web Series", "/discover/tv?with_original_language=hi|ta|te|ml|kn&sort_by=vote_count.desc", "tv");
            add("K-Drama", "/discover/tv?with_original_language=ko&with_genres=18&sort_by=popularity.desc&vote_count.gte=30", "tv");
            add("Anime", "/discover/tv?with_original_language=ja&with_genres=16&sort_by=popularity.desc&vote_count.gte=30", "tv");
            add("Crime", genreRow('tv', 80), "tv");
            add("Comedy", genreRow('tv', 35), "tv");
            add("Sci-Fi & Fantasy", genreRow('tv', 10765), "tv");
        } else if (type === "movie") {
            add("Popular Movies", "/movie/popular", "movie");
            add("Now Playing", "/movie/now_playing", "movie");
            add("Bollywood", "/discover/movie?with_original_language=hi&sort_by=popularity.desc&vote_count.gte=50", "movie");
            add("Top Rated Movies", "/movie/top_rated", "movie");
            add("Action", genreRow('movie', 28), "movie");
            add("Comedy", genreRow('movie', 35), "movie");
            add("Thriller", genreRow('movie', 53), "movie");
            add("Sci-Fi", genreRow('movie', 878), "movie");
        }

        rows.forEach(([title, endpoint, rowType], i) => {
            promises.push(createRow(title, endpoint, rowType, { lazy: i >= 4 }));
            if (i === 0) loadRecentlyViewed(); // Continue Watching sits under the first row
        });

        await Promise.all(promises);
    
        const mainContainer = document.getElementById("main-content");
        if (mainContainer && seq === viewSeq) {
            mainContainer.style.marginTop = "";
        }

        if(loader) loader.classList.add("hidden");
    }, 100);
}

async function setupHeroSlideshow(endpoint) {
    clearInterval(heroInterval);
    const heroTitle = document.getElementById("hero-title");
    const heroDesc = document.getElementById("hero-desc");
    const heroButtons = document.getElementById("hero-buttons");
    
    heroTitle.innerText = "Loading...";
    heroTitle.className = "hero-title";
    heroTitle.style.width = "";
    
    heroDesc.innerText = "";
    heroDesc.className = "hero-desc";
    heroDesc.style.width = "80%";
    heroDesc.style.height = "60px";
    
    heroButtons.style.display = "none";

    try {
        const url = endpoint.includes("?")
            ? `${BASE}${endpoint}&api_key=${KEY}`
            : `${BASE}${endpoint}?api_key=${KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        heroTitle.classList.remove("skeleton", "skeleton-text");
        heroTitle.style.width = "";
        heroDesc.classList.remove("skeleton", "skeleton-text");
        heroDesc.style.width = "";
        heroDesc.style.height = "";

        if (data.results && data.results.length > 0) {
            let items = data.results.slice(0, 5);

            const logoPromises = items.map(async (m) => {
                try {
                    const type = m.media_type || (endpoint.includes("tv") ? "tv" : "movie");
                    const logoUrl = `${BASE}/${type}/${m.id}/images?api_key=${KEY}&include_image_language=en,null`;
                    const logoRes = await fetch(logoUrl);
                    const logoData = await logoRes.json();
                    if (logoData.logos && logoData.logos.length > 0) {
                        m.logo_path = logoData.logos[0].file_path;
                    }
                } catch (e) {
                    console.error("Logo fetch error", e);
                }
                return m;
            });

            items = await Promise.all(logoPromises);

            let index = 0;
            const updateHero = () => {
                const m = items[index];
                window.currentHeroItem = m;
                document.getElementById("hero").style.backgroundImage =
                    `url(${BACK}${m.backdrop_path})`;
                
                if (m.logo_path) {
                    heroTitle.innerHTML = `<img src="${IMG}${m.logo_path}" class="hero-logo" loading="lazy" alt="${m.title || m.name}">`;
                } else {
                    heroTitle.innerText = m.title || m.name;
                }
                
                heroDesc.innerText = m.overview;
                heroButtons.style.display = "flex";
                // Backdrop filter hack not needed since we are using transparent ghost buttons natively
            };
            updateHero();
            heroInterval = setInterval(() => {
                index = (index + 1) % items.length;
                updateHero();
            }, 5000);
        }
    } catch (e) {
         heroTitle.innerText = "Error Loading";
    }
}
// --- "NOT OUT YET" ---------------------------------------------------------
// A title (or episode) whose release date is still in the future can't be
// streamed yet, so we label it and keep people from trying every server.
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatReleaseDate(iso, withYear) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear || !sameYear ? { year: 'numeric' } : {}) });
}

// Returns null if it's out, else { date, short: "Out 12 Dec", long: "Releases 12 Dec 2026" }.
function releaseStatus(m, dateField) {
    const date = dateField || (m && (m.release_date || m.first_air_date)) || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= todayISO()) return null;
    return { date, short: `Out ${formatReleaseDate(date)}`, long: `Releases ${formatReleaseDate(date, true)}` };
}

function createPosterElement(m, type, className = "poster-card") {
    const wrapper = document.createElement("div");
    wrapper.className = "poster-wrapper";
    if (className === "rec-card") wrapper.style.width = "100%";
    
    const img = document.createElement("img");
    let src = "";
    if (m.poster_path) src = `${IMG}${m.poster_path}`;
    else if (m.profile_path) src = `${IMG}${m.profile_path}`;
    else src = "https://via.placeholder.com/300x450?text=No+Image";
    
    img.src = src;
    img.className = className;
    img.alt = m.title || m.name || "Movie Poster";
    img.loading = "lazy";
    img.width = 200; // Hint for browser
    img.height = 300; // Hint for browser
    
    img.onclick = () => {
        if (type === 'person') openPerson(m.id);
        else openModal(m, type);
    };
    
    wrapper.appendChild(img);
    
    const list = readJsonKey(getWishlistKey(), []);
    if (list.find(i => i.id === m.id)) {
        const badge = document.createElement("div");
        badge.className = "list-badge";
        badge.innerHTML = '<i class="fas fa-check"></i>';
        wrapper.appendChild(badge);
    }
    
    const upcoming = type !== 'person' && releaseStatus(m);
    if (upcoming) {
        const badge = document.createElement("div");
        badge.className = "soon-badge";
        badge.textContent = upcoming.short;
        badge.title = `${upcoming.long} – not streaming yet`;
        wrapper.appendChild(badge);
    }

    if (m.vote_average && localStorage.getItem('show_ratings') === 'true' && type !== 'person') {
        const ratingBadge = document.createElement("div");
        ratingBadge.className = "poster-rating-badge";
        ratingBadge.innerHTML = `<i class="fas fa-star" style="color: #f5c518; margin-right: 4px;"></i>${m.vote_average.toFixed(1)}`;
        wrapper.appendChild(ratingBadge);
    }
    
    return wrapper;
}


let gridState = {
    active: false,
    page: 1,
    endpoint: null,
    loading: false,
    type: null,
    title: ''
};

async function loadGrid(title, endpoint, type) {
    viewSeq++;
    clearSearchUrl();
    const loader = document.getElementById("global-loader");
    if(loader) loader.classList.remove("hidden");

    gridState = {
        active: true,
        page: 1,
        endpoint: endpoint,
        loading: false,
        type: type,
        title: title
    };
    
    document.title = `MovieDeck - ${title}`;
    
    const container = document.getElementById("main-content");
    container.style.marginTop = "80px";
    document.getElementById("hero").style.display = "none";
    
    container.innerHTML = `
        <div class="category-row">
            <h2>${title}</h2>
            <div class="row-posters" id="grid-posters" style="flex-wrap:wrap; overflow:visible;"></div>
            <div id="grid-loader" class="loader-container" style="display:none;">
               <div class="loader"></div>
            </div>
        </div>
    `;
    
    await loadMoreGrid();

    setTimeout(() => {
        if(loader) loader.classList.add("hidden");
    }, 100);
}

async function loadMoreGrid() {
    // The grid may be gone (user went to another page); stop infinite scroll.
    if (!document.getElementById("grid-posters")) { gridState.active = false; return; }
    if (gridState.loading) return;
    gridState.loading = true;
    document.getElementById("grid-loader").style.display = "block";
    
    try {
        const url = gridState.endpoint.includes("?")
            ? `${BASE}${gridState.endpoint}&api_key=${KEY}&page=${gridState.page}`
            : `${BASE}${gridState.endpoint}?api_key=${KEY}&page=${gridState.page}`;
            
        const res = await fetch(url);
        const data = await res.json();
        
        const grid = document.getElementById("grid-posters");
        
        if (data.results) {
            data.results.forEach(m => {
                if (m.poster_path) {
                    let type = gridState.type;
                    if (!type) type = m.media_type || (m.title ? "movie" : "tv");
                    
                    const el = createPosterElement(m, type);
                    el.style.margin = "10px";
                    grid.appendChild(el);
                }
            });
            gridState.page++;
        }
    } catch (e) {
        console.error(e);
    } finally {
        gridState.loading = false;
        const gridLoader = document.getElementById("grid-loader");
        if (gridLoader) gridLoader.style.display = "none";
    }
}

// Rows below the first few load when they're about to scroll into view,
// so a page with 20 rows doesn't make 20 requests up front.
const rowObserver = window.IntersectionObserver
    ? new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            rowObserver.unobserve(e.target);
            const load = e.target._loadRow;
            if (load) load();
        });
    }, { rootMargin: '600px 0px' })
    : null;

function createRow(title, endpoint, forcedType = null, { lazy = false } = {}) {
    const container = document.getElementById("main-content");
    const section = document.createElement("div");
    section.className = "category-row";

    const header = document.createElement("div");
    header.className = "row-header";
    const h2 = document.createElement("h2");
    h2.textContent = title;
    const seeAll = document.createElement("button");
    seeAll.type = "button";
    seeAll.className = "see-all";
    seeAll.innerHTML = 'See All <i class="fas fa-chevron-right"></i>';
    seeAll.setAttribute('aria-label', `See all ${title}`);
    seeAll.onclick = () => loadGrid(title, endpoint, forcedType);
    header.append(h2, seeAll);
    section.appendChild(header);

    const postersDiv = document.createElement("div");
    postersDiv.className = "row-posters";
    section.appendChild(postersDiv);
    container.appendChild(section);

    const load = async () => {
        try {
            const url = endpoint.includes("?")
                ? `${BASE}${endpoint}&api_key=${KEY}`
                : `${BASE}${endpoint}?api_key=${KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            postersDiv.innerHTML = "";
            const items = (data.results || []).filter(m => m.poster_path);
            if (!items.length) { section.remove(); return; }
            items.forEach((m) => postersDiv.appendChild(createPosterElement(m, forcedType)));
        } catch (e) {
            postersDiv.innerHTML = "<p style='padding-left:20px; color:#555'>Could not load content.</p>";
        }
    };

    if (lazy && rowObserver) {
        section._loadRow = load;
        rowObserver.observe(section);
        return Promise.resolve();
    }
    return load();
}

// Discover endpoint for a genre, skipping unrated / unreleased titles.
function genreRow(type, genreId, minVotes = type === 'movie' ? 100 : 30) {
    return `/discover/${type}?with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=${minVotes}`;
}

function readHistory() {
    try { return JSON.parse(localStorage.getItem(getHistoryKey()) || '[]'); } catch (e) { return []; }
}

function writeHistory(hist) {
    try { localStorage.setItem(getHistoryKey(), JSON.stringify(hist.slice(0, 20))); } catch (e) {}
}

function getHistoryEntry(id) {
    return readHistory().find(i => i.id === id) || null;
}

// Adds or refreshes a title at the front of history, keeping saved progress.
function addToHistory(item, type, extra = {}) {
    const hist = readHistory();
    const old = hist.find(i => i.id === item.id) || {};
    const entry = {
        ...old,
        id: item.id,
        poster_path: item.poster_path || old.poster_path,
        backdrop_path: item.backdrop_path || old.backdrop_path,
        title: item.title || item.name || old.title,
        overview: item.overview || old.overview,
        release_date: item.release_date || item.first_air_date || old.release_date,
        vote_average: item.vote_average || old.vote_average,
        media_type: type || old.media_type || 'movie',
        updated: Date.now(),
        ...extra,
    };
    writeHistory([entry, ...hist.filter(i => i.id !== item.id)]);
}

function removeFromHistory(id) {
    writeHistory(readHistory().filter(i => i.id !== id));
    loadRecentlyViewed();
}

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Saved position for what's playing now, if it's worth resuming.
function savedPosition(entry, type, season, episode) {
    if (!entry) return null;
    const p = type === 'tv' ? (entry.eps || {})[`s${season}e${episode}`] : entry.progress;
    if (!p || p.done || !(p.d > 0)) return null;
    if (p.t < 30 || p.t > p.d - 60) return null;
    return p;
}

function loadRecentlyViewed() {
    const container = document.getElementById("main-content");
    let section = document.getElementById("history-section");
    if (section)
        section.innerHTML = `<h2>Continue Watching</h2><div class="row-posters" id="history-posters"></div>`;
    else {
        section = document.createElement("div");
        section.id = "history-section";
        section.className = "category-row";
        section.innerHTML = `<h2>Continue Watching</h2><div class="row-posters" id="history-posters"></div>`;
        container.appendChild(section);
    }
    const postersDiv = section.querySelector(".row-posters");
    // Finished movies and finished shows drop out of the row.
    const hist = readHistory().filter(m => !m.done);
    if (hist.length === 0) {
        section.style.display = "none";
        return;
    }
    section.style.display = "block";
    hist.forEach((m) => {
        const type = m.media_type || (m.title ? "movie" : "tv");
        const el = createPosterElement(m, type);
        el.classList.add('cw-card');
        const tick = el.querySelector('.list-badge');
        if (tick) tick.remove();
        const img = el.querySelector('img');
        img.onclick = () => resumeFromHistory(m.id);
        img.title = 'Resume';

        const p = type === 'tv' ? (m.eps || {})[`s${m.season}e${m.episode}`] : m.progress;
        const pct = p && p.d > 0 ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0;
        const label = type === 'tv' && m.season
            ? `S${m.season} · E${m.episode}`
            : (p && p.d ? `${Math.max(1, Math.round((p.d - p.t) / 60))} min left` : '');

        const meta = document.createElement('div');
        meta.className = 'cw-meta';
        meta.innerHTML = `
            ${label ? `<span class="cw-label">${label}</span>` : ''}
            <div class="cw-bar"><span style="width:${pct}%"></span></div>`;
        meta.onclick = () => resumeFromHistory(m.id);
        el.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'cw-actions';
        actions.innerHTML = `
            <button type="button" class="cw-btn" title="Details" aria-label="Details"><i class="fas fa-info"></i></button>
            <button type="button" class="cw-btn" title="Remove from Continue Watching" aria-label="Remove"><i class="fas fa-xmark"></i></button>`;
        const [infoBtn, removeBtn] = actions.querySelectorAll('button');
        infoBtn.onclick = (e) => { e.stopPropagation(); openModal(m, type); };
        removeBtn.onclick = (e) => { e.stopPropagation(); removeFromHistory(m.id); };
        el.appendChild(actions);

        postersDiv.appendChild(el);
    });
}

function resumeFromHistory(id) {
    const m = getHistoryEntry(id);
    if (!m) return;
    if (m.media_type === 'tv' && m.season) {
        playbackState.title = m.title;
        playEpisode(m.id, m.season, m.episode);
    } else {
        playMedia(m);
    }
}

function addToWishlist(item, type) {
    let list = JSON.parse(localStorage.getItem(getWishlistKey()) || "[]");
    if (!list.find((i) => i.id === item.id)) {
        let safeType =
            type || item.media_type || (item.title ? "movie" : "tv");
        list.push({
            id: item.id,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            title: item.title || item.name,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date,
            vote_average: item.vote_average,
            media_type: safeType,
        });
        localStorage.setItem(getWishlistKey(), JSON.stringify(list));
        alert("Added to Watchlist!");
        
        const currentPage = document.querySelector(".nav-link.active").id;
        if(currentPage === 'nav-home' || currentPage === 'nav-movie' || currentPage === 'nav-tv') {
              updateBadges();
         }
    } else alert("Already in list");
}

function updateBadges() {
    const active = document.querySelector(".nav-link.active");
    if(active) {
        if(active.id === 'nav-home') loadContent('home');
        else if(active.id === 'nav-tv') loadContent('tv');
        else if(active.id === 'nav-movie') loadContent('movie');
    }
}

function addToWishlistModal() {
    let type =
        currentModalItem.media_type ||
        (currentModalItem.title ? "movie" : "tv");
    addToWishlist(currentModalItem, type);
}
function addToWishlistHero() {
    if (window.currentHeroItem) {
        let type =
            window.currentHeroItem.media_type ||
            (window.currentHeroItem.title ? "movie" : "tv");
        addToWishlist(window.currentHeroItem, type);
    }
}

function loadWishlist() {
    viewSeq++;
    if (searchActive) collapseSearch();
    clearSearchUrl();
    setActiveNav("nav-list");
    const container = document.getElementById("main-content");
    container.style.marginTop = "80px";
    document.getElementById("hero").style.display = "none";
    container.innerHTML =
        '<div class="category-row" style="margin-top: 20px;"><h2>Watchlist</h2><div class="row-posters" id="list-row" style="flex-wrap:wrap; overflow:visible;"></div></div>';

    const list = JSON.parse(localStorage.getItem(getWishlistKey()) || "[]");
    const row = document.getElementById("list-row");
    if (list.length === 0)
        row.innerHTML =
            '<p style="padding-left:20px; color:#777">List is empty.</p>';
    list.forEach((m) => {
        const el = createPosterElement(m, m.media_type);
        el.style.margin = "10px";
        el.style.position = "relative";
        
        // Everything here is in the watchlist, so no tick; just a remove button.
        el.classList.add('wl-card');
        const badge = el.querySelector('.list-badge');
        if (badge) badge.remove();

        const actions = document.createElement('div');
        actions.className = 'cw-actions';
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'cw-btn wl-remove';
        removeBtn.title = 'Remove from Watchlist';
        removeBtn.setAttribute('aria-label', `Remove ${m.title || m.name} from Watchlist`);
        removeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFromWishlist(m.id);
        };
        actions.appendChild(removeBtn);

        el.appendChild(actions);
        row.appendChild(el);
    });
}

function removeFromWishlist(id) {
    let list = JSON.parse(localStorage.getItem(getWishlistKey()) || "[]");
    list = list.filter(item => item.id !== id);
    localStorage.setItem(getWishlistKey(), JSON.stringify(list));
    
    const currentPage = document.querySelector(".nav-link.active").id;
    if(currentPage === 'nav-home' || currentPage === 'nav-movie' || currentPage === 'nav-tv') {
        updateBadges();
    }
    
    loadWishlist();
}


function switchModalTab(tab) {
    const recs = document.getElementById("rec-section");
    const reviews = document.getElementById("reviews-section");
    const tabs = document.querySelectorAll(".modal-tab");

    tabs.forEach(t => {
        t.classList.remove("active");
        if(tab === 'reviews' && t.innerText.includes("Reviews")) t.classList.add("active");
        if(tab === 'more-like-this' && t.innerText.includes("More")) t.classList.add("active");
    });

    if (tab === 'reviews') {
        reviews.style.display = "block";
        recs.style.display = "none";
    } else {
        reviews.style.display = "none";
        recs.style.display = "block";
    }
}

async function openModal(m, forcedType = null) {
    let type = forcedType;
    if (!type) {
        if (m.media_type) type = m.media_type;
        else if (m.first_air_date || m.name) type = "tv";
        else type = "movie";
    }
    currentModalItem = m;
    currentModalItem.media_type = type;
    if (!routing) {
        const sameTitle = history.state && history.state.layer === 'details' &&
            new URLSearchParams(location.search).get(type) === String(m.id);
        setUrl({ [type]: m.id }, sameTitle ? 'replace' : 'push', { layer: 'details' });
    }
    document.title = `${m.title || m.name} - MovieDeck`;

    const modal = document.getElementById("modal");
    modalZIndex++;
    modal.style.zIndex = modalZIndex;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    document.getElementById("m-bg").style.backgroundImage =
        `url(${BACK}${m.backdrop_path})`;
    document.getElementById("m-title").innerText = m.title || m.name;
    document.getElementById("m-desc").innerText = m.overview;
    document.getElementById("m-date").innerText = (
        m.release_date ||
        m.first_air_date ||
        ""
    ).substring(0, 4);
    updateModalPlayLabel(m, type); // after the date: unreleased titles show the full date
    const vote = m.vote_average || 7;
    document.getElementById("m-imdb").innerText = `IMDb ${vote.toFixed(1)}`;

    document.getElementById("m-genres").innerText = "Loading...";
    
    switchModalTab('more-like-this');
    loadReviews(type, m.id);

    const res = await fetch(
        `${BASE}/${type}/${m.id}?api_key=${KEY}&append_to_response=credits,recommendations`,
    );
    const data = await res.json();

    if (data.genres)
        document.getElementById("m-genres").innerText =
            data.genres.slice(0, 2).map((g) => g.name).join(", ") || "N/A";

    const extraInfo = document.getElementById("m-extra-info");
    if (type === "movie") {
        let director = "N/A";
        if (data.credits && data.credits.crew) {
            const dirObj = data.credits.crew.find((c) => c.job === "Director");
            if (dirObj) director = dirObj.name;
        }
        document.getElementById("m-director").innerText = director;
        document.getElementById("m-budget").innerText = data.budget ? `$${data.budget.toLocaleString()}` : "N/A";
        document.getElementById("m-revenue").innerText = data.revenue ? `$${data.revenue.toLocaleString()}` : "N/A";
        if(extraInfo) extraInfo.style.display = "block";
    } else {
        if(extraInfo) extraInfo.style.display = "none";
    }

    const grid = document.getElementById("rec-grid");
    grid.innerHTML = "";
    let hasRecs = false;
    if (data.recommendations && data.recommendations.results) {
        data.recommendations.results.slice(0, 12).forEach((rm) => {
            if (rm.poster_path) {
                const el = createPosterElement(rm, type, "rec-card");
                grid.appendChild(el);
                hasRecs = true;
            }
        });
    }
    if (!hasRecs) {
         grid.innerHTML = "<p style='color:#777; font-size: 0.9rem;'>No recommendations available.</p>";
    }

    const tvSection = document.getElementById("tv-section");
    if (type === "tv") {
        tvSection.style.display = "block";
        const sSelect = document.getElementById("season-select");
        sSelect.innerHTML = "";
        if (data.seasons) {
            data.seasons.forEach((s) => {
                if (s.season_number > 0) {
                    const opt = document.createElement("option");
                    opt.value = s.season_number;
                    opt.innerText = `Season ${s.season_number} (${s.episode_count} Ep)`;
                    sSelect.appendChild(opt);
                }
            });
            window.currentTvId = m.id;
            if (data.seasons.length > 0) changeSeason(1);
        }
    } else {
        tvSection.style.display = "none";
    }
}

function updateModalPlayLabel(m, type) {
    const label = document.getElementById('m-play-text');
    if (!label) return;
    const playBtn = label.parentElement;
    const upcoming = releaseStatus(m);
    playBtn.disabled = !!upcoming;
    playBtn.title = upcoming ? `${upcoming.long} – not streaming yet` : '';
    const dateEl = document.getElementById('m-date');
    if (dateEl) {
        dateEl.classList.toggle('m-date-soon', !!upcoming);
        if (upcoming) dateEl.textContent = upcoming.long;
    }
    if (upcoming) {
        label.textContent = 'Not out yet';
        watchModalButtons();
        requestAnimationFrame(fitModalButtons);
        return;
    }
    const saved = getHistoryEntry(m.id);
    // The detail part is hidden on small screens, where buttons are narrow.
    if (type === 'tv' && saved && saved.season && !saved.done) {
        label.innerHTML = `Resume<span class="play-detail"> S${saved.season} · E${saved.episode}</span>`;
    } else if (type === 'movie' && savedPosition(saved, 'movie')) {
        label.innerHTML = `Resume<span class="play-detail"> ${formatTime(saved.progress.t)}</span>`;
    } else {
        label.textContent = 'Play';
    }
    watchModalButtons();
    requestAnimationFrame(fitModalButtons);
}

// Keep the popup's buttons on one line: icons-only for the secondary buttons
// first, then a shorter Resume label, only as far as needed.
function fitModalButtons() {
    const row = document.querySelector('#modal .modal-buttons');
    if (!row || !row.offsetParent) return;
    row.classList.remove('is-compact', 'is-tight');
    // Tooltips/labels so icon-only buttons still say what they do.
    row.querySelectorAll('.btn').forEach(b => {
        const t = b.querySelector('.btn-text');
        if (t && !b.title) { b.title = t.textContent.trim(); b.setAttribute('aria-label', b.title); }
    });
    const overflows = () => row.scrollWidth > row.clientWidth + 1;
    if (overflows()) row.classList.add('is-compact');
    if (overflows()) row.classList.add('is-tight');
}

let modalButtonsObserver = null;
function watchModalButtons() {
    const row = document.querySelector('#modal .modal-buttons');
    if (!row || modalButtonsObserver || !window.ResizeObserver) return;
    let lastWidth = 0;
    modalButtonsObserver = new ResizeObserver(entries => {
        const w = Math.round(entries[0].contentRect.width);
        if (w !== lastWidth) { lastWidth = w; fitModalButtons(); }
    });
    modalButtonsObserver.observe(row);
}

async function changeSeason(num) {
    const list = document.getElementById("episode-list");
    list.innerHTML =
        '<p style="color:#777; padding:20px;">Loading episodes...</p>';
    const res = await fetch(
        `${BASE}/tv/${window.currentTvId}/season/${num}?api_key=${KEY}`,
    );
    const data = await res.json();
    list.innerHTML = "";

    if (data.episodes) {
        data.episodes.forEach((ep) => {
            const div = document.createElement("div");
            div.className = "episode-row";
            const epSoon = releaseStatus(null, ep.air_date);
            div.onclick = epSoon
                ? () => showToast(`Episode ${ep.episode_number} isn't out yet. Airs ${formatReleaseDate(ep.air_date, true)}.`)
                : () => playEpisode(window.currentTvId, num, ep.episode_number);
            if (epSoon) div.classList.add('ep-upcoming');
            const saved = getHistoryEntry(window.currentTvId);
            const prog = saved && saved.eps ? saved.eps[`s${num}e${ep.episode_number}`] : null;
            div.innerHTML = `
                <div class="ep-index">${ep.episode_number}</div>
                <div class="ep-thumb-container">
                    <img src="${ep.still_path ? IMG + ep.still_path : ""}" class="ep-thumb" loading="lazy" onerror="this.style.backgroundColor='#333'">
                    <div style="position:absolute; inset:0; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.3);">
                        <i class="fas fa-play" style="color:white; opacity:0.8;"></i>
                    </div>
                    ${prog ? `<div class="ep-progress${prog.done ? ' is-done' : ''}" title="${prog.done ? 'Watched' : formatTime(prog.t) + ' watched'}"><span style="width:${prog.done ? 100 : Math.min(100, Math.round(prog.t / prog.d * 100))}%"></span></div>` : ''}
                </div>
                <div class="ep-text">
                    <div class="ep-title">${ep.name}</div>
                    <div class="ep-desc">${ep.overview || "No description available."}</div>
                </div>
                <div class="ep-duration">${epSoon ? `<span class="ep-soon">Airs ${formatReleaseDate(ep.air_date)}</span>` : (ep.runtime ? ep.runtime + "m" : "")}</div>
            `;
            list.appendChild(div);
        });
    } else {
        list.innerHTML =
            '<p style="color:#777; padding:20px;">No episodes found.</p>';
    }
}

// --- LINKS & BACK BUTTON ---------------------------------------------------
// ?movie=ID / ?tv=ID           details popup
// ?tv=ID&s=2&e=3               that episode in the player
// ?movie=ID&play=1             the movie in the player
// ?q=text                      search
// #movie/ID                    old share links, still supported
let routing = false;

function setUrl(params, mode = 'replace', state = {}) {
    const clean = {};
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') clean[k] = v; });
    const qs = new URLSearchParams(clean).toString();
    const url = location.pathname + (qs ? `?${qs}` : '');
    const same = url === location.pathname + location.search && !location.hash;
    if (mode === 'push' && !same) history.pushState(state, '', url);
    else history.replaceState(state, '', url);
}

// The homepage starts loading before the first route() reads the link, so
// don't touch the URL until that first route has run.
let firstRouteDone = false;

function clearSearchUrl() {
    if (!firstRouteDone || routing) return;
    const p = new URLSearchParams(location.search);
    if (p.has('q') || p.has('search')) setUrl({}, 'replace');
}

async function route() {
    routing = true;
    try {
        const params = new URLSearchParams(location.search);
        let type = params.has('movie') ? 'movie' : params.has('tv') ? 'tv' : null;
        let id = type ? parseInt(params.get(type), 10) : null;

        // Old share links: #movie/123 or #tv/456
        const legacy = location.hash.match(/^#(movie|tv)\/(\d+)/);
        if (!type && legacy) {
            type = legacy[1];
            id = parseInt(legacy[2], 10);
            history.replaceState({ layer: 'details' }, '', `${location.pathname}?${type}=${id}`);
        }

        const season = parseInt(params.get('s'), 10);
        const episode = parseInt(params.get('e'), 10);
        const wantPlayer = type === 'tv' ? season > 0 && episode > 0 : type === 'movie' && params.get('play') === '1';

        if (!wantPlayer && playerOpen()) closePlayerUI();

        if (!type || !id) {
            if (detailsOpen()) hideDetails();
            const person = document.getElementById('person-modal');
            if (person && person.style.display === 'flex') person.style.display = 'none';
            const q = params.get('q');
            if (q) {
                const input = document.getElementById('search-input');
                if (!(searchPageOpen() && input && input.value === q)) openSearchPage({ q, focus: false });
            } else if (params.has('search')) {
                if (!searchPageOpen()) openSearchPage({ focus: false });
            }
            return;
        }

        if (!detailsOpen() || !currentModalItem || currentModalItem.id !== id || currentModalItem.media_type !== type) {
            const res = await fetch(`${BASE}/${type}/${id}?api_key=${KEY}`);
            const data = await res.json();
            if (!data || data.success === false || !data.id) {
                showToast("That title couldn't be found");
                setUrl({}, 'replace');
                return;
            }
            data.media_type = type;
            await openModal(data, type);
        }

        if (wantPlayer) {
            const same = playerOpen() && playbackState.id === id &&
                (type === 'movie' || (playbackState.season === season && playbackState.episode === episode));
            if (!same) {
                if (type === 'tv') await playEpisode(id, season, episode);
                else await playMedia(currentModalItem);
            }
        }
    } catch (e) {
        console.error('Could not open link', e);
    } finally {
        routing = false;
        firstRouteDone = true;
    }
}

window.addEventListener('popstate', () => { route(); });

// Menu links use href="#" as a placeholder; don't let them touch the URL.
document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href="#"]');
    if (a) e.preventDefault();
});

function closeModal(e) {
    if (e.target.id === "modal" || e.target.closest(".modal-close")) {
        closeDetails();
    }
}

function detailsOpen() {
    return document.getElementById("modal").style.display === "flex";
}

// Close the details popup. If we opened it with a history entry, step back
// (the popstate router then hides it) so the back button and this stay in sync.
// Runs once per close even though the ✕ click also reaches the backdrop
// (both have close handlers): a second history.back() would leave the site.
function closeDetails() {
    if (!detailsOpen()) return;
    const pushed = history.state && history.state.layer === 'details';
    hideDetails();
    if (pushed) history.back();
    else setUrl({}, 'replace');
}

function hideDetails() {
    {
        document.getElementById("modal").style.display = "none";
        document.body.style.overflow = "auto";
        document.title = "MovieDeck - Premium Streaming Experience";
        if (document.getElementById("nav-home").classList.contains("active") && !searchPageOpen()) {
            loadRecentlyViewed();
        }
    }
}

// --- SEARCH --------------------------------------------------------------
// Case-insensitive and typo-tolerant. TMDB's own search handles case, but not
// misspellings ("avngers", "intersteller"), so when it comes back empty or weak
// we fuzzy-match against a cached index of popular titles and search again
// with the corrected title.

const SEARCH_INDEX_KEY = 'search_index_v2';
const SEARCH_INDEX_TTL = 24 * 60 * 60 * 1000;
let searchIndex = null;
let searchIndexPromise = null;
let searchSeq = 0;
let searchTimer = null;

function normalizeText(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Optimal string alignment distance (Levenshtein + adjacent swaps).
function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                v = Math.min(v, prev2[j - 2] + 1);
            }
            cur.push(v);
        }
        prev2 = prev;
        prev = cur;
    }
    return prev[b.length];
}

// 0..1, how well a (normalized) query matches a (normalized) title.
function titleSimilarity(q, title) {
    if (!q || !title) return 0;
    if (title === q) return 1;
    // Spacing differences: "ironman" vs "iron man", "spiderman" vs "spider man".
    const qc = q.replace(/ /g, '');
    const tc = title.replace(/ /g, '');
    if (tc === qc) return 0.98;
    if (title.startsWith(q) || (' ' + title).includes(' ' + q) || tc.startsWith(qc)) return 0.95;
    const whole = 1 - editDistance(q, title) / Math.max(q.length, title.length);
    // The user may have typed only the start of a long title.
    let prefix = 0;
    for (let len = q.length - 1; len <= q.length + 1; len++) {
        if (len < 3 || len > title.length) continue;
        const d = editDistance(q, title.slice(0, len));
        prefix = Math.max(prefix, 1 - d / Math.max(q.length, len));
    }
    // Word by word, so "dark knigt" still finds "The Dark Knight".
    const qWords = q.split(' ');
    const tWords = title.split(' ');
    let words = 0;
    if (qWords.length > 1 || tWords.length > 1) {
        let sum = 0;
        for (const w of qWords) {
            let best = 0;
            for (const t of tWords) {
                best = Math.max(best, 1 - editDistance(w, t) / Math.max(w.length, t.length));
            }
            sum += best;
        }
        words = (sum / qWords.length) * 0.92;
    }
    return Math.max(whole, prefix * 0.97, words);
}

function bestSimilarity(q, item) {
    const names = [item.title, item.name, item.original_title, item.original_name];
    let best = 0;
    for (const n of names) if (n) best = Math.max(best, titleSimilarity(q, normalizeText(n)));
    return best;
}

function loadSearchIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    if (searchIndexPromise) return searchIndexPromise;
    try {
        const cached = JSON.parse(localStorage.getItem(SEARCH_INDEX_KEY) || 'null');
        if (cached && Date.now() - cached.t < SEARCH_INDEX_TTL && cached.items.length) {
            searchIndex = cached.items;
            return Promise.resolve(searchIndex);
        }
    } catch (e) {}

    const sources = [];
    for (let page = 1; page <= 10; page++) {
        sources.push(['movie', `/movie/popular?page=${page}`]);
        sources.push(['tv', `/tv/popular?page=${page}`]);
    }
    for (let page = 1; page <= 5; page++) {
        sources.push(['movie', `/movie/top_rated?page=${page}`]);
        sources.push(['tv', `/tv/top_rated?page=${page}`]);
    }
    // Hindi titles have many English spellings ("Pathan" / "Pathaan").
    for (let page = 1; page <= 5; page++) {
        sources.push(['movie', `/discover/movie?with_original_language=hi&sort_by=vote_count.desc&page=${page}`]);
    }
    searchIndexPromise = Promise.all(sources.map(([type, path]) =>
        fetch(`${BASE}${path}&api_key=${KEY}`)
            .then(r => r.json())
            .then(d => (d.results || []).map(m => ({
                n: m.title || m.name,
                o: m.original_title || m.original_name,
                t: type,
                p: m.popularity || 0,
            })))
            .catch(() => [])
    )).then(lists => {
        const seen = new Set();
        const items = [];
        lists.flat().forEach(it => {
            const key = it.t + ':' + normalizeText(it.n);
            if (it.n && !seen.has(key)) { seen.add(key); items.push(it); }
        });
        searchIndex = items;
        try { localStorage.setItem(SEARCH_INDEX_KEY, JSON.stringify({ t: Date.now(), items })); } catch (e) {}
        return items;
    }).finally(() => { searchIndexPromise = null; });
    return searchIndexPromise;
}

async function suggestTitle(q) {
    const index = await loadSearchIndex();
    let best = null;
    for (const it of index) {
        const score = Math.max(
            titleSimilarity(q, normalizeText(it.n)),
            it.o ? titleSimilarity(q, normalizeText(it.o)) : 0
        );
        // Prefer the more popular title when two match about as well.
        const ranked = score + Math.min(it.p, 500) / 50000;
        if (!best || ranked > best.ranked) best = { ...it, score, ranked };
    }
    return best && best.score >= 0.6 ? best : null;
}

// Fix only the words the user typed, using the matched title's spelling:
// "avngers" + "Avengers: Doomsday" -> "Avengers" (not the whole title).
function correctWords(q, title) {
    const tokens = title.split(/\s+/)
        .map(t => ({ raw: t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''), norm: normalizeText(t) }))
        .filter(t => t.norm);
    if (!tokens.length) return title;
    return q.split(' ').map(w => {
        let best = null;
        for (const t of tokens) {
            const sim = 1 - editDistance(w, t.norm) / Math.max(w.length, t.norm.length);
            if (!best || sim > best.sim) best = { sim, raw: t.raw };
        }
        return best && best.sim >= 0.5 ? best.raw : w;
    }).join(' ');
}

function keepSearchResult(m) {
    return (m.media_type === 'movie' || m.media_type === 'tv' || m.media_type === 'person') &&
        (m.poster_path || m.profile_path);
}

async function tmdbFetch(path, query, page = 1) {
    const res = await fetch(`${BASE}${path}?api_key=${KEY}&include_adult=false&page=${page}&query=${encodeURIComponent(query)}`);
    return (await res.json()).results || [];
}

// TMDB's mixed search buries exact titles behind popular series
// ("welcome" -> 20 "Welcome to…" shows before Welcome (2007)), so also ask the
// movie and TV searches directly and read a second page.
async function tmdbSearch(query, { light = false } = {}) {
    const [multi1, movies, shows, multi2] = await Promise.all([
        tmdbFetch('/search/multi', query, 1),
        tmdbFetch('/search/movie', query, 1).then(r => r.map(m => ({ ...m, media_type: 'movie' }))),
        tmdbFetch('/search/tv', query, 1).then(r => r.map(m => ({ ...m, media_type: 'tv' }))),
        light ? [] : tmdbFetch('/search/multi', query, 2).catch(() => []),
    ]);
    const seen = new Set();
    return [...multi1, ...movies, ...shows, ...multi2].filter(m => {
        const key = m.media_type + ':' + m.id;
        if (seen.has(key) || !keepSearchResult(m)) return false;
        seen.add(key);
        return true;
    });
}

function compactText(str) {
    return normalizeText(str).replace(/ /g, '');
}

// "ironman" -> "iro nman", "iron man": TMDB treats a joined word as one token,
// so try the likely splits and keep only titles that match with spaces removed.
async function searchJoinedWords(q) {
    if (q.includes(' ') || q.length < 5 || q.length > 16) return [];
    const target = q.replace(/ /g, '');
    const splits = [];
    for (let i = 3; i <= q.length - 3; i++) splits.push(q.slice(0, i) + ' ' + q.slice(i));
    const lists = await Promise.all(splits.map(v =>
        tmdbFetch('/search/multi', v, 1).catch(() => [])
    ));
    return lists.flat().filter(m => {
        if (!keepSearchResult(m) || m.media_type === 'person') return false;
        const c = compactText(m.title || m.name);
        return c === target || c.startsWith(target);
    });
}

function mergeResults(first, rest) {
    const seen = new Set(first.map(m => m.media_type + ':' + m.id));
    return first.concat(rest.filter(m => !seen.has(m.media_type + ':' + m.id)));
}

// Visitors in India get a small boost for Indian-language titles, so close
// ties like "Welcome" (2007, Hindi) vs "Welcome" (2009, French) go their way.
const LOCAL_LANGUAGES = (() => {
    const langs = navigator.languages || [navigator.language || ''];
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    const inIndia = langs.some(l => /-IN$/i.test(l)) || /^Asia\/(Kolkata|Calcutta)$/.test(tz);
    return new Set(inIndia ? ['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'] : []);
})();

// Order: titles named exactly like the query or starting with it, ranked by
// how well-known they are (votes + popularity, exact names get a boost), then
// close fuzzy matches, then everything else in TMDB's relevance order.
function rankResults(results, query) {
    // Ignore a leading article so "godfather" matches "The Godfather".
    const dropArticle = (t) => t.replace(/^(the|a|an) /, '');
    const q = dropArticle(normalizeText(query));
    const qc = q.replace(/ /g, '');
    const scoreOf = (m) => {
        const names = [m.title, m.name, m.original_title, m.original_name].filter(Boolean);
        let match = 0; // 2 exact, 1 starts with
        let close = false;
        for (const n of names) {
            const t = dropArticle(normalizeText(n));
            const tc = t.replace(/ /g, '');
            if (t === q || tc === qc) match = 2;
            else if (t.startsWith(q) || tc.startsWith(qc)) match = Math.max(match, 1);
            else if (titleSimilarity(q, t) >= 0.9) close = true;
        }
        if (m.media_type === 'person') match = Math.min(match, 1);
        const fame = Math.log1p(m.vote_count || 0) + Math.log1p(m.popularity || 0);
        const local = LOCAL_LANGUAGES.has(m.original_language) ? 1 : 0;
        return { group: match ? 2 : close ? 1 : 0, score: fame + local + (match === 2 ? 4 : 0) };
    };
    return results
        .map((m, i) => ({ m, i, ...scoreOf(m) }))
        .sort((a, b) => (b.group - a.group) || (a.group === 2 ? b.score - a.score : a.i - b.i))
        .map(x => x.m);
}

// --- SEARCH PAGE -----------------------------------------------------------
// Big search box at the top; before you type it shows what's trending,
// while you type it shows results (same typo-tolerant engine).
let searchTimer2 = null;

function searchPageOpen() {
    return !!document.getElementById('search-page');
}

function openSearchPage({ q = '', focus = true } = {}) {
    expandSearch(focus);
    if (!searchPageOpen()) {
        viewSeq++;
        if (rowObserver) rowObserver.disconnect();
        gridState.active = false;
        setActiveNav(null);
        const container = document.getElementById('main-content');
        container.style.marginTop = '80px';
        document.getElementById('hero').style.display = 'none';
        container.innerHTML = `
            <section class="search-page is-entering" id="search-page">
                <div id="search-default"></div>
                <div id="search-results-wrap" class="category-row" hidden>
                    <div class="search-head">
                        <h2 id="search-heading">Results</h2>
                        <p id="search-note" class="search-note" hidden></p>
                    </div>
                    <div class="row-posters" id="search-results" style="flex-wrap:wrap; overflow:visible"></div>
                </div>
            </section>`;
        const seq = viewSeq;
        const defaults = document.getElementById('search-default');
        // One mixed row of what's trending (movies and series).
        // createRow appends to #main-content; build the row there, then move it.
        [
            ['Trending Now', '/trending/all/week', null],
        ].forEach(([title, endpoint, type]) => {
            createRow(title, endpoint, type);
            if (seq !== viewSeq) return;
            const row = container.lastElementChild;
            if (row && row.classList.contains('category-row')) defaults.appendChild(row);
        });
        document.title = 'MovieDeck - Search';
        window.scrollTo({ top: 0, behavior: 'instant' });
        // Commit the starting style, then remove it so the page eases in.
        // (No requestAnimationFrame: it pauses in background tabs.)
        const page = document.getElementById('search-page');
        void page.offsetWidth;
        page.classList.remove('is-entering');
    }
    const input = document.getElementById('search-input');
    if (q && (input.value !== q || document.getElementById('search-results-wrap').hidden)) {
        input.value = q;
        runSearch(q);
    } else if (!q && !input.value.trim()) {
        if (!routing) setUrl({ search: 1 }, 'replace');
    }
}

// Swap which part of the Search page is visible, with a short fade.
function showSearchPart(part) {
    const def = document.getElementById('search-default');
    const res = document.getElementById('search-results-wrap');
    if (!def || !res) return;
    const show = part === 'results' ? res : def;
    const hide = part === 'results' ? def : res;
    if (!show.hidden) return;
    hide.hidden = true;
    show.hidden = false;
    show.classList.remove('search-fade');
    void show.offsetWidth; // restart the animation
    show.classList.add('search-fade');
}

function showSearchDefault() {
    searchSeq++;
    clearTimeout(searchTimer2);
    if (!searchPageOpen()) return;
    showSearchPart('default');
    document.title = 'MovieDeck - Search';
    setUrl({ search: 1 }, 'replace');
}

// Navbar search box: typing shows results on the Search page.
(function bindSearchField() {
    const input = document.getElementById('search-input');
    input.addEventListener('focus', () => loadSearchIndex());
    input.addEventListener('input', () => {
        clearTimeout(searchTimer2);
        const raw = input.value;
        if (normalizeText(raw).length >= 2) {
            if (!searchPageOpen()) openSearchPage({ focus: false });
            searchTimer2 = setTimeout(() => runSearch(raw), 350);
        } else if (!raw.trim()) {
            showSearchDefault();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(searchTimer2);
            if (normalizeText(input.value).length >= 2) runSearch(input.value);
            input.blur(); // closes the phone keyboard so results are visible
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (input.value) { input.value = ''; showSearchDefault(); }
            else { collapseSearch(); loadContent('home'); }
        }
    });
})();

function renderSearchShell(raw) {
    if (!searchPageOpen()) openSearchPage({ focus: false });
    expandSearch(false);
    showSearchPart('results');
    document.getElementById('search-heading').textContent = `Results for “${raw}”`;
}

function renderSearchState(kind, text) {
    const grid = document.getElementById('search-results');
    if (!grid) return;
    grid.innerHTML = kind === 'loading'
        ? '<div class="search-empty"><div class="player-spinner"></div></div>'
        : `<div class="search-empty"><i class="fas fa-magnifying-glass"></i><p>${text}</p></div>`;
}

function renderSearchResults(items) {
    const grid = document.getElementById('search-results');
    grid.innerHTML = '';
    items.forEach(m => {
        const el = createPosterElement(m, m.media_type);
        el.style.margin = '10px';
        grid.appendChild(el);
    });
}

function setSearchNote(html) {
    const note = document.getElementById('search-note');
    if (!note) return;
    note.hidden = !html;
    note.innerHTML = html || '';
}

// The search engine shared by the results page and the suggestions dropdown.
// Returns null if a newer search started meanwhile (isStale).
const searchCache = new Map();

async function findResults(raw, { exact = false, light = false, isStale = () => false } = {}) {
    const q = normalizeText(raw);
    const cacheKey = `${exact ? 'x' : ''}${light ? 'l' : ''}:${q}`;
    if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);

    const [direct, joined] = await Promise.all([
        tmdbSearch(raw.trim(), { light }),
        exact ? [] : searchJoinedWords(q),
    ]);
    if (isStale()) return null;
    let results = mergeResults(joined, direct);

    const topScore = results.length ? Math.max(...results.slice(0, 5).map(m => bestSimilarity(q, m))) : 0;
    let corrected = null;
    if (!exact && (results.length === 0 || topScore < 0.7)) {
        const suggestion = await suggestTitle(q);
        if (isStale()) return null;
        const fixedQuery = suggestion ? correctWords(q, suggestion.n) : null;
        if (fixedQuery && normalizeText(fixedQuery) !== q) {
            const fixed = await tmdbSearch(fixedQuery, { light });
            if (isStale()) return null;
            if (fixed.length) {
                corrected = fixedQuery;
                results = mergeResults(fixed, results);
            }
        }
    }
    results = rankResults(results, corrected || raw);

    // A close spelling of a well-known title that TMDB missed
    // ("pathan" -> "Pathaan"): show it first.
    let alsoShowing = null;
    if (!exact && !corrected && q.length >= 5) {
        const suggestion = await suggestTitle(q);
        if (isStale()) return null;
        const target = suggestion && compactText(suggestion.n);
        const qc = q.replace(/ /g, '');
        // Only for real misspellings, not titles that already contain the query.
        if (suggestion && suggestion.score >= 0.85 && !target.includes(qc)) {
            const isHit = m => compactText(m.title || m.name) === target;
            let hits = results.filter(isHit);
            if (!hits.length) {
                hits = (await tmdbSearch(suggestion.n, { light })).filter(isHit);
                if (isStale()) return null;
            }
            if (hits.length) {
                alsoShowing = suggestion.n;
                results = mergeResults(rankResults(hits, suggestion.n), results);
            }
        }
    }

    const out = { results, corrected, alsoShowing };
    searchCache.set(cacheKey, out);
    if (searchCache.size > 60) searchCache.delete(searchCache.keys().next().value);
    return out;
}

async function runSearch(raw, { exact = false } = {}) {
    const seq = ++searchSeq;
    const q = normalizeText(raw);
    if (q.length < 2) return;

    document.title = `MovieDeck - Search: ${raw}`;
    if (!routing) setUrl({ q: raw.trim() }, 'replace');
    renderSearchShell(raw);
    renderSearchState('loading');
    setSearchNote('');
    loadSearchIndex(); // warm up in the background

    try {
        const found = await findResults(raw, { exact, isStale: () => seq !== searchSeq });
        if (!found || seq !== searchSeq) return;
        const { results, corrected, alsoShowing } = found;

        if (alsoShowing) {
            setSearchNote(`Also showing <strong>${escapeHtml(alsoShowing)}</strong>.`);
        }
        if (corrected) {
            document.getElementById('search-heading').textContent = `Results for “${corrected}”`;
            setSearchNote(`Showing results for <strong>${escapeHtml(corrected)}</strong>. <button class="link-btn" onclick="searchExactly()">Search for “${escapeHtml(raw.trim())}” instead</button>`);
        }

        if (results.length) renderSearchResults(results);
        else renderSearchState('empty', `No matches for “${escapeHtml(raw.trim())}”. Try a shorter title or check the spelling.`);
    } catch (e) {
        if (seq === searchSeq) renderSearchState('empty', 'Search is unavailable right now. Check your connection and try again.');
    }
}

function searchExactly() {
    runSearch(document.getElementById('search-input').value, { exact: true });
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

window.addEventListener("scroll", () => {
    const nav = document.getElementById("navbar");
    if (window.scrollY > 50) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
    
    if (gridState.active && !gridState.loading) {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
           loadMoreGrid();
        }
    }
});

// --- PLAYER & SERVERS ---------------------------------------------------
// Only servers verified to load inside an iframe (Nov 2026). All take TMDB ids.
// Sources: the same providers StreamEx and CineHD use.
const SERVERS = [
    {
        key: 'vidfast',
        host: 'VidFast',
        movie: (id) => `https://vidfast.vc/movie/${id}?autoPlay=true`,
        tv: (id, s, e) => `https://vidfast.vc/tv/${id}/${s}/${e}?autoPlay=true`,
        startAt: (url, t) => `${url}&startAt=${t}`,
        reportsProgress: true,
    },
    {
        key: 'vidlink',
        host: 'VidLink',
        movie: (id) => `https://vidlink.pro/movie/${id}?autoplay=true&primaryColor=ff007f`,
        tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?autoplay=true&primaryColor=ff007f`,
        resumesItself: true, // VidLink remembers the position on its own
        reportsProgress: true,
    },
    {
        key: 'xpass',
        host: 'Xpass',
        movie: (id) => `https://play.xpass.top/e/movie/${id}`,
        tv: (id, s, e) => `https://play.xpass.top/e/tv/${id}/${s}/${e}`,
    },
    {
        key: 'vidrock',
        host: 'VidRock',
        movie: (id) => `https://vidrock.net/embed/movie/${id}?autoplay=true`,
        tv: (id, s, e) => `https://vidrock.net/embed/tv/${id}/${s}/${e}?autoplay=true&nextbutton=false&episodeselector=false`,
    },
    {
        key: 'vidnest',
        host: 'VidNest',
        movie: (id) => `https://vidnest.fun/movie/${id}`,
        tv: (id, s, e) => `https://vidnest.fun/tv/${id}/${s}/${e}`,
    },
    {
        key: 'primesrc',
        host: 'PrimeSrc',
        movie: (id) => `https://primesrc.me/embed/movie?tmdb=${id}`,
        tv: (id, s, e) => `https://primesrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
    },
];

const SERVER_PREF_KEY = 'preferred_server';

function loadPreferredServer() {
    try {
        const saved = localStorage.getItem(SERVER_PREF_KEY);
        if (SERVERS.some(s => s.key === saved)) return saved;
    } catch (e) {}
    return SERVERS[0].key;
}

function savePreferredServer(key) {
    try { localStorage.setItem(SERVER_PREF_KEY, key); } catch (e) {}
}

let playbackState = {
    type: 'movie',
    id: null,
    season: 1,
    episode: 1,
    server: loadPreferredServer(),
    title: '',
    seasons: null, // [{season_number, episode_count}] for TV, used by next/prev
};

function serverIndex(key = playbackState.server) {
    const i = SERVERS.findIndex(s => s.key === key);
    return i === -1 ? 0 : i;
}

function currentResumePoint() {
    const { type, id, season, episode } = playbackState;
    return savedPosition(getHistoryEntry(id), type, season, episode);
}

function getEmbedUrl() {
    const { type, id, season, episode } = playbackState;
    const server = SERVERS[serverIndex()];
    const url = type === 'movie' ? server.movie(id) : server.tv(id, season, episode);
    const resume = currentResumePoint();
    return resume && server.startAt ? server.startAt(url, Math.floor(resume.t)) : url;
}

function renderServerMenu() {
    const menu = document.getElementById('src-menu');
    if (!menu) return;
    const active = serverIndex();
    menu.innerHTML = SERVERS.map((s, i) => `
        <button class="src-option${i === active ? ' is-active' : ''}" role="option"
                aria-selected="${i === active}" onclick="switchServer('${s.key}')">
            <span class="src-num">${i + 1}</span>
            <span class="src-name">Server ${i + 1}${i === 0 ? '<em>Recommended</em>' : ''}</span>
            <span class="src-host">${s.host}</span>
        </button>`).join('');
    const current = document.getElementById('src-current');
    if (current) current.textContent = active + 1;
}

function toggleServerMenu(force) {
    const picker = document.getElementById('src-picker');
    const trigger = document.getElementById('src-trigger');
    if (!picker) return;
    const open = typeof force === 'boolean' ? force : !picker.classList.contains('is-open');
    picker.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
        const activeOpt = picker.querySelector('.src-option.is-active');
        if (activeOpt) activeOpt.focus({ preventScroll: true });
    }
}

document.addEventListener('click', (e) => {
    const picker = document.getElementById('src-picker');
    if (picker && picker.classList.contains('is-open') && !picker.contains(e.target)) {
        toggleServerMenu(false);
    }
});


let veilTimer = null;

function showVeil() {
    const veil = document.getElementById('player-veil');
    const text = document.getElementById('player-veil-text');
    const server = SERVERS[serverIndex()];
    const resume = currentResumePoint();
    const resuming = resume && (server.startAt || server.resumesItself);
    if (text) text.textContent = resuming
        ? `Resuming at ${formatTime(resume.t)} on Server ${serverIndex() + 1}…`
        : `Connecting to Server ${serverIndex() + 1}…`;
    if (veil) veil.classList.remove('is-hidden');
}

function hideVeil() {
    const veil = document.getElementById('player-veil');
    if (veil) veil.classList.add('is-hidden');
}

// Changing an iframe's src adds a step to the browser's back history, so
// swap in a fresh iframe instead: the back button then closes the player
// rather than rewinding the video frame.
function freshVideoFrame(url) {
    const old = document.getElementById('video-frame');
    if (!old) return null;
    const frame = old.cloneNode(false);
    frame.onload = null;
    if (url) frame.src = url;
    else frame.removeAttribute('src');
    old.replaceWith(frame);
    return frame;
}

function updateIframeSource() {
    const url = getEmbedUrl();
    const iframe = freshVideoFrame(null);
    if (iframe) {
        showVeil();
        // Some providers fire `load` late (they keep streaming resources), so
        // never keep the veil over a usable player for more than a few seconds.
        clearTimeout(veilTimer);
        veilTimer = setTimeout(hideVeil, 4000);
        iframe.onload = () => { if (iframe.src && iframe.src !== 'about:blank') hideVeil(); };
        iframe.src = url; // a fresh, never-navigated frame: no history entry
    }
    const extLink = document.getElementById('video-external-link');
    if (extLink) extLink.href = url;
    renderServerMenu();
}

function episodeCount(season) {
    const s = (playbackState.seasons || []).find(x => x.season_number === season);
    return s ? s.episode_count : null;
}

function updateVideoControls() {
    const { type, season, episode, title } = playbackState;
    const nav = document.getElementById('episode-nav');
    const info = document.getElementById('current-ep-info');
    const titleEl = document.getElementById('video-title');
    const subEl = document.getElementById('video-subtitle');

    if (titleEl) titleEl.textContent = title;

    if (type === 'movie') {
        nav.hidden = true;
        if (subEl) subEl.textContent = '';
        return;
    }
    nav.hidden = false;
    info.textContent = `S${season} · E${episode}`;
    if (subEl) subEl.textContent = `Season ${season}, Episode ${episode}`;

    const seasons = (playbackState.seasons || []).map(s => s.season_number);
    const lastSeason = seasons.length ? Math.max(...seasons) : null;
    const count = episodeCount(season);
    document.getElementById('btn-prev-ep').disabled = season <= 1 && episode <= 1;
    document.getElementById('btn-next-ep').disabled =
        count !== null && episode >= count && lastSeason !== null && season >= lastSeason;
}

async function fetchSeasons(tvId) {
    try {
        const res = await fetch(`${BASE}/tv/${tvId}?api_key=${KEY}`);
        const data = await res.json();
        return (data.seasons || [])
            .filter(s => s.season_number > 0)
            .map(s => ({ season_number: s.season_number, episode_count: s.episode_count }));
    } catch (e) {
        return null;
    }
}

function playerParams() {
    const { type, id, season, episode } = playbackState;
    return type === 'tv' ? { tv: id, s: season, e: episode } : { movie: id, play: 1 };
}

function openPlayer() {
    const overlay = document.getElementById('video-overlay');
    const wasOpen = overlay.classList.contains('is-open');
    if (!routing) setUrl(playerParams(), wasOpen ? 'replace' : 'push', { layer: 'player' });
    overlay.classList.add('is-open');
    document.body.classList.add('player-open');
    updateVideoControls();
    updateIframeSource();
}

async function playMedia(item) {
    if (!item || !item.id) return;
    const upcoming = releaseStatus(item);
    if (upcoming) {
        showToast(`${item.title || item.name} isn't out yet. ${upcoming.long}.`);
        return;
    }
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    const saved = getHistoryEntry(item.id);

    // Series: pick up at the episode you were on (or the next one).
    if (type === 'tv' && saved && saved.season) {
        playbackState.title = item.title || item.name || saved.title || '';
        addToHistory(item, type);
        return playEpisode(item.id, saved.season, saved.episode);
    }
    // A finished movie starts over.
    addToHistory(item, type, type === 'movie' && saved && saved.done ? { done: false, progress: null } : {});

    playbackState = {
        ...playbackState,
        type,
        id: item.id,
        season: 1,
        episode: 1,
        title: item.title || item.name || '',
        seasons: null,
    };
    if (type === 'tv') addToHistory(item, type, { season: 1, episode: 1, done: false });
    openPlayer();

    if (type === 'tv') {
        playbackState.seasons = await fetchSeasons(item.id);
        updateVideoControls();
    }
}

async function playEpisode(tvId, season, episode) {
    season = parseInt(season, 10);
    episode = parseInt(episode, 10);
    const known = (currentModalItem && currentModalItem.id === tvId) ? currentModalItem : getHistoryEntry(tvId);
    if (known) addToHistory(known, 'tv', { season, episode, done: false });
    const sameShow = playbackState.id === tvId && playbackState.type === 'tv';
    playbackState = {
        ...playbackState,
        type: 'tv',
        id: tvId,
        season,
        episode,
        title: (currentModalItem && currentModalItem.id === tvId)
            ? (currentModalItem.name || currentModalItem.title || '')
            : (playbackState.id === tvId || !known ? playbackState.title : (known.title || known.name || '')),
        seasons: sameShow ? playbackState.seasons : null,
    };
    openPlayer();

    if (!playbackState.seasons) {
        playbackState.seasons = await fetchSeasons(tvId);
        updateVideoControls();
    }
}

// Close the player; like the popup, step back through history when we pushed it.
function closeVideo() {
    if (!playerOpen()) return;
    if (history.state && history.state.layer === 'player') {
        closePlayerUI();
        history.back();
        return;
    }
    closePlayerUI();
    setUrl(detailsOpen() && currentModalItem ? { [currentModalItem.media_type]: currentModalItem.id } : {}, 'replace',
        detailsOpen() ? { layer: 'details' } : {});
}

function playerOpen() {
    const overlay = document.getElementById('video-overlay');
    return overlay && overlay.classList.contains('is-open');
}

function closePlayerUI() {
    const overlay = document.getElementById('video-overlay');
    overlay.classList.remove('is-open');
    document.body.classList.remove('player-open');
    if (document.getElementById('history-section')) loadRecentlyViewed();
    toggleServerMenu(false);
    clearTimeout(veilTimer);
    freshVideoFrame(null); // stop playback without a history entry
    const extLink = document.getElementById('video-external-link');
    if (extLink) extLink.href = '#';
}

function switchServer(key) {
    playbackState.server = key;
    savePreferredServer(key);
    toggleServerMenu(false);
    updateIframeSource();
}

function nextServer() {
    const next = SERVERS[(serverIndex() + 1) % SERVERS.length];
    switchServer(next.key);
}

function nextEpisode() {
    const count = episodeCount(playbackState.season);
    if (count !== null && playbackState.episode >= count) {
        const hasNextSeason = (playbackState.seasons || []).some(s => s.season_number === playbackState.season + 1);
        if (!hasNextSeason) return;
        playbackState.season++;
        playbackState.episode = 1;
    } else {
        playbackState.episode++;
    }
    rememberEpisode();
    updateVideoControls();
    updateIframeSource();
}

function prevEpisode() {
    if (playbackState.episode > 1) {
        playbackState.episode--;
    } else if (playbackState.season > 1) {
        playbackState.season--;
        playbackState.episode = episodeCount(playbackState.season) || 1;
    } else {
        return;
    }
    rememberEpisode();
    updateVideoControls();
    updateIframeSource();
}

function syncPlayerUrl() {
    if (playerOpen() && !routing) setUrl(playerParams(), 'replace', { layer: 'player' });
}

function rememberEpisode() {
    syncPlayerUrl();
    const entry = getHistoryEntry(playbackState.id);
    if (entry) addToHistory(entry, 'tv', { season: playbackState.season, episode: playbackState.episode, done: false });
}

// --- Watch progress -------------------------------------------------------
// VidLink and VidFast post PLAYER_EVENT messages (currentTime, duration,
// season, episode) to the page; we store them so Continue Watching can resume.
const PROGRESS_ORIGINS = ['https://vidlink.pro', 'https://vidfast.vc'];
let lastProgressSave = 0;

function nextEpisodeAfter(season, episode) {
    const seasons = playbackState.seasons;
    if (!seasons || !seasons.length) return { season, episode: episode + 1 };
    const cur = seasons.find(s => s.season_number === season);
    if (cur && episode < cur.episode_count) return { season, episode: episode + 1 };
    const later = seasons.filter(s => s.season_number > season && s.episode_count > 0)
        .sort((a, b) => a.season_number - b.season_number)[0];
    return later ? { season: later.season_number, episode: 1 } : null;
}

function saveProgress(t, dur, ended) {
    const { type, id, season, episode } = playbackState;
    const hist = readHistory();
    const entry = hist.find(i => i.id === id);
    if (!entry || !(dur > 0)) return;
    const done = ended || t / dur >= 0.92;
    const p = { t: Math.round(t), d: Math.round(dur), done };

    if (type === 'movie') {
        entry.progress = p;
        entry.done = done;
    } else {
        entry.eps = entry.eps || {};
        delete entry.eps[`s${season}e${episode}`];
        entry.eps[`s${season}e${episode}`] = p;
        const keys = Object.keys(entry.eps);
        if (keys.length > 150) delete entry.eps[keys[0]];
        entry.season = season;
        entry.episode = episode;
        entry.done = false;
        if (done) {
            // Point Continue Watching at the next episode.
            const next = nextEpisodeAfter(season, episode);
            if (next) { entry.season = next.season; entry.episode = next.episode; }
            else entry.done = true;
        }
    }
    entry.updated = Date.now();
    writeHistory([entry, ...hist.filter(i => i !== entry)]);
}

window.addEventListener('message', (e) => {
    if (!PROGRESS_ORIGINS.includes(e.origin)) return;
    const msg = e.data;
    if (!msg || msg.type !== 'PLAYER_EVENT' || !msg.data) return;
    const d = msg.data;
    const overlay = document.getElementById('video-overlay');
    if (!overlay || !overlay.classList.contains('is-open')) return;
    if (Number(d.tmdbId || d.mtmdbId) !== Number(playbackState.id)) return;

    // The provider may move to the next episode by itself; follow it.
    if (playbackState.type === 'tv' && d.season && d.episode &&
        (Number(d.season) !== playbackState.season || Number(d.episode) !== playbackState.episode)) {
        playbackState.season = Number(d.season);
        playbackState.episode = Number(d.episode);
        updateVideoControls();
        syncPlayerUrl();
    }

    const now = Date.now();
    const important = d.event === 'pause' || d.event === 'ended' || d.event === 'seeked';
    if (!important && now - lastProgressSave < 5000) return;
    if (!(d.duration > 0) || !(d.currentTime >= 0)) return;
    lastProgressSave = now;
    saveProgress(Number(d.currentTime), Number(d.duration), d.event === 'ended');
});

function toggleMobileMenu() {
    const menu = document.getElementById("mobile-menu");
    menu.classList.toggle("active");
}


let exploreState = {
    page: 1,
    genre: '',
    year: '',
    type: 'movie',
    loading: false
};

async function loadExplore() {
    viewSeq++;
    if (searchActive) collapseSearch();
    clearSearchUrl();
    setActiveNav("nav-explore");
    const container = document.getElementById("main-content");
    container.style.marginTop = "80px";
    document.getElementById("hero").style.display = "none";
    
    exploreState = { page: 1, genre: '', year: '', language: '', type: 'movie', loading: false };
    
    container.innerHTML = `
        <div class="filter-container">
            <select id="filter-type" class="filter-select" onchange="updateGenreOptions(); applyFilters()">
                <option value="movie">Movies</option>
                <option value="tv">TV Series</option>
            </select>
            <select id="filter-genre" class="filter-select" onchange="applyFilters()">
                <option value="">All Genres</option>
            </select>
            <select id="filter-year" class="filter-select" onchange="applyFilters()">
                <option value="">All Years</option>
                ${generateYearOptions()}
            </select>
            <select id="filter-language" class="filter-select" onchange="applyFilters()" aria-label="Language">
                ${generateLanguageOptions()}
            </select>
        </div>
        <div class="category-row">
            <h2 id="explore-heading">Explore Movies</h2>
            <div class="row-posters" id="explore-grid" style="flex-wrap:wrap; overflow:visible; min-height: 50vh;"></div>
             <div id="explore-loader" style="text-align:center; padding:20px; display:none;">
               <div class="skeleton" style="width:50px; height:50px; border-radius:50%; margin:auto;"></div>
            </div>
        </div>
    `;
    
    updateGenreOptions(); // Populate genres
    applyFilters(); 
    
    window.removeEventListener("scroll", handleExploreScroll);
    window.addEventListener("scroll", handleExploreScroll);
}

// TMDB original-language codes. "|" means any of them.
const EXPLORE_LANGUAGES = [
    { code: '', name: 'All Languages' },
    { code: 'hi|ta|te|ml|kn|bn|mr|pa|gu', name: 'All Indian' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'kn', name: 'Kannada' },
    { code: 'bn', name: 'Bengali' },
    { code: 'mr', name: 'Marathi' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'en', name: 'English' },
    { code: 'ko', name: 'Korean' },
    { code: 'ja', name: 'Japanese' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
];

function generateLanguageOptions() {
    return EXPLORE_LANGUAGES.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
}

function generateYearOptions() {
    let options = "";
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 1950; i--) {
        options += `<option value="${i}">${i}</option>`;
    }
    return options;
}

const genres = {
    movie: [
        {id: 28, name: "Action"}, {id: 12, name: "Adventure"}, {id: 16, name: "Animation"},
        {id: 35, name: "Comedy"}, {id: 80, name: "Crime"}, {id: 99, name: "Documentary"},
        {id: 18, name: "Drama"}, {id: 10751, name: "Family"}, {id: 14, name: "Fantasy"},
        {id: 36, name: "History"}, {id: 27, name: "Horror"}, {id: 10402, name: "Music"},
        {id: 9648, name: "Mystery"}, {id: 10749, name: "Romance"}, {id: 878, name: "Science Fiction"},
        {id: 10770, name: "TV Movie"}, {id: 53, name: "Thriller"}, {id: 10752, name: "War"},
        {id: 37, name: "Western"}
    ],
    tv: [
        {id: 10759, name: "Action & Adventure"}, {id: 16, name: "Animation"}, {id: 35, name: "Comedy"},
        {id: 80, name: "Crime"}, {id: 99, name: "Documentary"}, {id: 18, name: "Drama"},
        {id: 10751, name: "Family"}, {id: 10762, name: "Kids"}, {id: 9648, name: "Mystery"},
        {id: 10763, name: "News"}, {id: 10764, name: "Reality"}, {id: 10765, name: "Sci-Fi & Fantasy"},
        {id: 10766, name: "Soap"}, {id: 10767, name: "Talk"}, {id: 10768, name: "War & Politics"},
        {id: 37, name: "Western"}
    ]
};

function updateGenreOptions() {
    const type = document.getElementById("filter-type").value;
    const genreSelect = document.getElementById("filter-genre");
    const currentList = genres[type] || [];
    
    let html = '<option value="">All Genres</option>';
    currentList.forEach(g => {
        html += `<option value="${g.id}">${g.name}</option>`;
    });
    genreSelect.innerHTML = html;
}

async function applyFilters() {
    const loader = document.getElementById("global-loader");
    if(loader) loader.classList.remove("hidden");

    exploreState.page = 1;
    exploreState.type = document.getElementById("filter-type").value;
    exploreState.genre = document.getElementById("filter-genre").value;
    exploreState.year = document.getElementById("filter-year").value;
    exploreState.language = document.getElementById("filter-language").value;
    exploreState.loading = false;
    
    document.getElementById("explore-grid").innerHTML = "";
    const lang = EXPLORE_LANGUAGES.find(l => l.code === exploreState.language);
    document.getElementById("explore-heading").innerText =
        `Explore ${lang && lang.code ? lang.name + ' ' : ''}${exploreState.type === 'movie' ? 'Movies' : 'TV Series'}`;
        
    await loadMoreExplore();

    setTimeout(() => {
        if(loader) loader.classList.add("hidden");
    }, 100);
}

async function loadMoreExplore() {
    if (exploreState.loading) return;
    exploreState.loading = true;
    document.getElementById("explore-loader").style.display = "block";
    
    try {
        let url = `${BASE}/discover/${exploreState.type}?api_key=${KEY}&page=${exploreState.page}`;
        
        if (exploreState.genre) url += `&with_genres=${exploreState.genre}`;
        if (exploreState.language) {
            // Smaller languages: skip titles nobody has rated yet.
            url += `&with_original_language=${exploreState.language}&vote_count.gte=5`;
        }
        if (exploreState.year) {
            if (exploreState.type === 'movie') url += `&primary_release_year=${exploreState.year}`;
            else url += `&first_air_date_year=${exploreState.year}`;
        }
        
        url += "&sort_by=popularity.desc";

        const res = await fetch(url);
        const data = await res.json();
        
        const grid = document.getElementById("explore-grid");
        
        if (data.results) {
            data.results.forEach(m => {
                if (m.poster_path) {
                    const el = createPosterElement(m, exploreState.type);
                    el.style.margin = "10px";
                    grid.appendChild(el);
                }
            });
            exploreState.page++;
            if (exploreState.page === 2 && !grid.children.length) {
                grid.innerHTML = '<div class="search-empty"><i class="fas fa-film"></i><p>Nothing matches these filters. Try another year or genre.</p></div>';
            }
        }
    } catch (e) {
        console.error("Explore Load Error", e);
    } finally {
        exploreState.loading = false;
        const loader = document.getElementById("explore-loader");
        if(loader) loader.style.display = "none";
    }
}

function handleExploreScroll() {
    const nav = document.getElementById("navbar");
    if (window.scrollY > 50) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
    
    if (document.getElementById("nav-explore").classList.contains("active")) {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
           loadMoreExplore();
        }
    }
}

async function playTrailer(item) {
    if (!item || !item.id) return;
    
    let type = item.media_type || (item.title ? "movie" : "tv");
    
    try {
        const res = await fetch(`${BASE}/${type}/${item.id}/videos?api_key=${KEY}`);
        const data = await res.json();
        
        let trailer = null;
        if(data.results && data.results.length > 0) {
            trailer = data.results.find(v => v.site === "YouTube" && v.type === "Trailer");
            if(!trailer) trailer = data.results.find(v => v.site === "YouTube");
        }
        
        if(trailer) {
            const overlay = document.getElementById("trailer-overlay");
            const iframe = document.getElementById("trailer-frame");
            iframe.src = `https://www.youtube.com/embed/${trailer.key}?autoplay=1`;
            overlay.style.display = "flex";
        } else {
            alert("Sorry, no trailer available for this title.");
        }
    } catch(e) {
        console.error(e);
        alert("Error loading trailer.");
    }
}

function closeTrailer() {
    const overlay = document.getElementById("trailer-overlay");
    const iframe = document.getElementById("trailer-frame");
    overlay.style.display = "none";
    iframe.src = ""; // Stop video
}

function goBackToMovie() {
    document.getElementById("person-modal").style.display = "none";
    document.getElementById("modal").style.display = "flex";
}

async function openPerson(id, from = null) {
    if(!id) return;
    
    document.getElementById("modal").style.display = "none";
    
    const pModal = document.getElementById("person-modal");
    modalZIndex++;
    pModal.style.zIndex = modalZIndex;
    pModal.style.display = "flex";
    document.body.style.overflow = "hidden";
    
    
    resetPersonModalLayout();
    
    if (from === 'cast' && currentModalItem) {
        const backBtn = document.getElementById("p-back-btn");
        backBtn.style.display = "flex";
        backBtn.onclick = () => showCast(currentModalItem);
    }
    
    document.getElementById("p-img").src = "";
    document.getElementById("p-name").innerText = "Loading...";
    document.getElementById("p-bio").innerText = "";
    document.getElementById("p-birth").innerText = "Born: -";
    document.getElementById("p-place").innerText = "Place: -";
    document.getElementById("p-credits-grid").innerHTML = "";
    document.getElementById("p-known-for").style.display = "block";


    try {
        const res = await fetch(`${BASE}/person/${id}?api_key=${KEY}`);
        const p = await res.json();
        
        document.getElementById("p-img").src = p.profile_path ? `${IMG}${p.profile_path}` : "https://via.placeholder.com/300x450?text=No+Image";
        document.getElementById("p-name").innerText = p.name;
        document.getElementById("p-bio").innerText = p.biography || "No biography available.";
        document.getElementById("p-birth").innerText = `Born: ${p.birthday || "N/A"}`;
        document.getElementById("p-place").innerText = `Place: ${p.place_of_birth || "N/A"}`;
        
        const res2 = await fetch(`${BASE}/person/${id}/combined_credits?api_key=${KEY}`);
        const data = await res2.json();
        
        const grid = document.getElementById("p-credits-grid");
        
        const allCredits = [...(data.cast || []), ...(data.crew || [])];
        const seen = new Set();
        const credits = allCredits
            .filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            })
            .sort((a,b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 100);
        
        credits.forEach(m => {
            if(m.poster_path) {
                let type = m.media_type || (m.title ? "movie" : "tv");
                const el = createPosterElement(m, type, "rec-card");
                const img = el.querySelector('img');
                if (img) {
                    img.onclick = (e) => {
                        e.stopPropagation();
                        document.getElementById("person-modal").style.display = "none";
                        document.body.style.overflow = "auto";
                        resetPersonModalLayout();
                        openModal(m, type);
                    };
                }

                grid.appendChild(el);
            }
        });
        
    } catch(e) {
        console.error(e);
        document.getElementById("p-name").innerText = "Error Loading";
    }
}

function closePersonModal(e) {
    if (!e || !e.target) return;
    if (e.target.id === "person-modal" || (typeof e.target.closest === "function" && e.target.closest(".modal-close")) || e.target.id === 'close-btn') {
        document.getElementById("person-modal").style.display = "none";
        document.body.style.overflow = "auto";
        
        resetPersonModalLayout();
    }
}

async function showCast(item) {
    if(!item || !item.id) return;
    
    document.getElementById("modal").style.display = "none";
    const pModal = document.getElementById("person-modal");
    modalZIndex++;
    pModal.style.zIndex = modalZIndex;
    pModal.style.display = "flex";
    document.body.style.overflow = "hidden";
    
    document.getElementById("p-back-btn").style.display = "flex";
    document.getElementById("p-back-btn").onclick = goBackToMovie;
    document.getElementById("p-img-container").style.display = "none"; 
    document.getElementById("p-known-for").style.display = "none"; 
    
    document.getElementById("p-bio").style.display = "none";
    document.getElementById("p-meta").style.display = "none";
    document.getElementById("p-known-for-container").style.marginTop = "0";
    
    const pName = document.getElementById("p-name");
    pName.innerText = `Cast of ${item.title || item.name}`;
    pName.style.marginTop = "50px";
    pName.style.marginBottom = "20px";
    
    document.getElementById("p-credits-grid").innerHTML = "Loading...";
    
    let type = item.media_type || (item.title ? "movie" : "tv");
    
    try {
        const res = await fetch(`${BASE}/${type}/${item.id}/credits?api_key=${KEY}`);
        const data = await res.json();
        
        const grid = document.getElementById("p-credits-grid");
        grid.innerHTML = "";
        
        if(data.cast && data.cast.length > 0) {
            data.cast.slice(0, 20).forEach(c => {
                if(c.profile_path) {
                    const wrapper = document.createElement("div");
                    wrapper.className = "poster-wrapper";
                    wrapper.style.textAlign = "center";
                   
                    const img = document.createElement("img");
                    img.src = `${IMG}${c.profile_path}`;
                    img.className = "rec-card cast-card"; 
                    img.onclick = () => {
                         resetPersonModalLayout();
                         openPerson(c.id, 'cast');
                    };
                    
                    const name = document.createElement("div");
                    name.innerText = c.name;
                    name.className = "cast-name";
                    
                    wrapper.appendChild(img);
                    wrapper.appendChild(name);
                    wrapper.className = "poster-wrapper cast-wrapper";
                    
                    grid.appendChild(wrapper);
                }
            });
        } else {
             grid.innerHTML = "<p>No cast information available.</p>";
        }
    } catch(e) {
        console.error(e);
        document.getElementById("p-credits-grid").innerText = "Error loading cast.";
    }
}

function resetPersonModalLayout() {
    document.getElementById("p-back-btn").style.display = "none";
    document.getElementById("p-img-container").style.display = "block"; 
    document.getElementById("p-known-for").style.display = "block"; 
    
    document.getElementById("p-bio").style.display = "block";
    document.getElementById("p-meta").style.display = "flex";
    document.getElementById("p-known-for-container").style.marginTop = "30px";
    
    const pName = document.getElementById("p-name");
    pName.style.marginTop = "0";
    pName.style.marginBottom = "20px";
}

async function loadReviews(type, id) {
    const list = document.getElementById("reviews-list");
    list.innerHTML = "<p style='color:#777'>Loading reviews...</p>";

    try {
        const res = await fetch(`${BASE}/${type}/${id}/reviews?api_key=${KEY}`);
        const data = await res.json();
        
        list.innerHTML = "";
        if(data.results && data.results.length > 0) {
            data.results.slice(0, 5).forEach(r => {
                const card = document.createElement("div");
                card.className = "review-card";
                
                let avatar = "https://ui-avatars.com/api/?background=random&name=" + encodeURIComponent(r.author);
                if(r.author_details && r.author_details.avatar_path) {
                    if(r.author_details.avatar_path.startsWith("/http")) {
                        avatar = r.author_details.avatar_path.substring(1);
                    } else if (r.author_details.avatar_path.startsWith("/")) {
                        avatar = `${IMG}${r.author_details.avatar_path}`;
                    } else {
                        avatar = r.author_details.avatar_path;
                    }
                }
                
                const rating = r.author_details.rating ? `<span class="review-rating">★ ${r.author_details.rating}</span>` : "";
                const date = new Date(r.created_at).toLocaleDateString();
                
                card.innerHTML = `
                    <div class="review-header">
                        <img src="${avatar}" class="review-avatar" onerror="this.src='https://ui-avatars.com/api/?background=random&name=${r.author}'">
                        <div class="review-meta">
                            <div class="review-author-line">
                                <span class="review-author-name">${r.author}</span>
                                ${rating}
                            </div>
                            <span class="review-date">${date}</span>
                        </div>
                    </div>
                    <div class="review-content" id="review-${r.id}">${r.content.trim()}</div>
                `;
                
                if(r.content.length > 300) { 
                    const btn = document.createElement("span");
                    btn.className = "read-more-btn";
                    btn.innerText = "Read More";
                    btn.onclick = (e) => {
                        const content = document.getElementById(`review-${r.id}`);
                        content.classList.toggle("expanded");
                        e.target.innerText = content.classList.contains("expanded") ? "Show Less" : "Read More";
                    };
                    card.appendChild(btn);
                }
                
                list.appendChild(card);
            });
        } else {
            list.innerHTML = "<p style='color:#777'>No reviews yet.</p>";
        }
    } catch(e) {
        console.error(e);
        list.innerHTML = "<p style='color:#777'>Error loading reviews.</p>";
    }
}

function shareUrl(params) {
    return `${location.origin}${location.pathname}?${new URLSearchParams(params)}`;
}

function shareLink(url, name) {
    if (navigator.share) {
        navigator.share({ title: `${name} - MovieDeck`, text: `Watch ${name} on MovieDeck`, url })
            .catch(() => {});
        return;
    }
    navigator.clipboard.writeText(url)
        .then(() => showToast("Link copied"))
        .catch(() => showToast("Couldn't copy the link"));
}

function shareContent() {
    if (!currentModalItem) return;
    const type = currentModalItem.media_type || (currentModalItem.title ? "movie" : "tv");
    shareLink(shareUrl({ [type]: currentModalItem.id }), currentModalItem.title || currentModalItem.name);
}

// From the player: link straight to this episode (or the movie, playing).
function sharePlaying() {
    const { type, season, episode, title } = playbackState;
    const name = type === 'tv' ? `${title} S${season} E${episode}` : title;
    shareLink(shareUrl(playerParams()), name);
}

// --- BACKUP & RESTORE ------------------------------------------------------
// Everything lives in this browser's storage; a backup file lets people keep
// their watchlist and Continue Watching when they clear data or switch device.
const BACKUP_SETTINGS = ['app_theme', 'show_ratings', 'preferred_server', 'surprise_prefs'];

function readJsonKey(key, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        return v === null ? fallback : v;
    } catch (e) { return fallback; }
}

function exportBackup() {
    const settings = {};
    BACKUP_SETTINGS.forEach(k => {
        const v = localStorage.getItem(k);
        if (v !== null) settings[k] = v;
    });
    const data = {
        app: 'MovieDeck',
        version: 1,
        exported: new Date().toISOString(),
        watchlist: readJsonKey(getWishlistKey(), []),
        history: readHistory(),
        settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moviedeck-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Backup saved: ${data.watchlist.length} in watchlist, ${data.history.length} in history`);
}

function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            restoreBackup(data);
        } catch (e) {
            showToast("That file isn't a MovieDeck backup");
        }
    };
    input.click();
}

function isTitleEntry(x) {
    return x && typeof x === 'object' && Number.isFinite(Number(x.id)) && (x.title || x.name);
}

// Merges a backup into what's already here, so restoring never loses anything.
function restoreBackup(data) {
    if (!data || data.app !== 'MovieDeck' || !Array.isArray(data.watchlist) || !Array.isArray(data.history)) {
        showToast("That file isn't a MovieDeck backup");
        return;
    }
    const key = (x) => `${x.media_type || 'movie'}:${x.id}`;

    const list = readJsonKey(getWishlistKey(), []);
    const have = new Set(list.map(key));
    let addedList = 0;
    data.watchlist.filter(isTitleEntry).forEach(x => {
        if (!have.has(key(x))) { list.push(x); have.add(key(x)); addedList++; }
    });
    localStorage.setItem(getWishlistKey(), JSON.stringify(list));

    const byId = new Map(readHistory().map(x => [x.id, x]));
    let addedHist = 0;
    data.history.filter(isTitleEntry).forEach(x => {
        const cur = byId.get(x.id);
        if (!cur) addedHist++;
        if (!cur || (x.updated || 0) > (cur.updated || 0)) byId.set(x.id, x);
    });
    writeHistory([...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)));

    if (data.settings && typeof data.settings === 'object') {
        BACKUP_SETTINGS.forEach(k => {
            if (typeof data.settings[k] === 'string') localStorage.setItem(k, data.settings[k]);
        });
        const theme = localStorage.getItem('app_theme');
        if (theme) applyTheme(theme);
        playbackState.server = loadPreferredServer();
    }

    loadRecentlyViewed();
    if (document.getElementById('nav-list').classList.contains('active')) loadWishlist();
    showToast(`Restored: ${addedList} new in watchlist, ${addedHist} new in history`);
}

function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast-message";
    toast.innerText = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add("show"), 100);
    
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.addEventListener("load", async () => {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/sw.js")
          .then(res => console.log("service worker registered"))
          .catch(err => console.log("service worker not registered", err));
    }

    route();
});

const legalContent = {
    shortcuts: {
        title: "Keyboard shortcuts",
        body: `<table class="kbd-table">
                 <tr><td><kbd>/</kbd></td><td>Search</td></tr>
                 <tr><td><kbd>Esc</kbd></td><td>Close the player, popup or menu</td></tr>
                 <tr><td><kbd>N</kbd></td><td>Next episode (in the player)</td></tr>
                 <tr><td><kbd>P</kbd></td><td>Previous episode (in the player)</td></tr>
                 <tr><td><kbd>?</kbd></td><td>Show this list</td></tr>
               </table>
               <p class="kbd-note">Shortcuts pause while the video itself has focus. Click the bar under the video to use them again.</p>`
    },
    privacy: {
        title: "Privacy Policy",
        body: `<p>At MovieDeck, we prioritize your privacy. This policy outlines how we collect, use, and protect your information.</p>
               <h3>1. Information We Collect</h3>
               <p>We do not collect personal data. Your watch history and list are stored locally on your device.</p>
               <h3>2. How We Use Information</h3>
               <p>Local data is used solely to enhance your experience, such as remembering where you left off.</p>
               <h3>3. Third-Party Services</h3>
               <p>We use TMDB for movie data. Please refer to their privacy policy for more details.</p>`
    },
    terms: {
        title: "Terms of Service",
        body: `<p>By using MovieDeck, you agree to the following terms:</p>
               <h3>1. Usage License</h3>
               <p>MovieDeck is a portfolio project for educational purposes. Content is provided by third-party APIs.</p>
               <h3>2. Disclaimer</h3>
               <p>The materials on MovieDeck are provided on an 'as is' basis. We make no warranties, expressed or implied.</p>`
    },
    cookie: {
        title: "Cookie Policy",
        body: `<p>We use local storage to save your preferences. No tracking cookies are used.</p>`
    },
    dmca: {
        title: "DMCA Notice",
        body: `<p>MovieDeck does not host any content. All media is provided by third-party services. If you believe your content is being infringed, please contact the source directly.</p>`
    },
    'profile-stub': {
        title: "Profile",
        body: `<p>Profile management is coming soon! For now, your data is stored locally.</p>`
    },
    'settings-stub': {
        title: "Settings",
        body: `<p>Settings panel is under development. Stay tuned for updates!</p>`
    }
};

function showTextModal(type) {
    const modal = document.getElementById("text-modal");
    const title = document.getElementById("tm-title");
    const body = document.getElementById("tm-body");

    const content = legalContent[type];
    if (content) {
        title.innerText = content.title;
        body.innerHTML = content.body;
        modalZIndex++;
        modal.style.zIndex = modalZIndex;
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

function closeTextModal(e) {
    if (e.target.id === "text-modal" || e.target.closest(".modal-close-btn")) {
        document.getElementById("text-modal").style.display = "none";
        document.body.style.overflow = "auto";
    }
}

window.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.profile-dropdown');
    if (e.target.closest('.profile-icon')) {
        dropdown.classList.toggle('show');
    } else if (!e.target.closest('.profile-dropdown')) {
        dropdown.classList.remove('show');
    }
});

// ------ Theme Switcher Logic ------
const themes = {
    default: {
        primary: "#00f2ff",
        secondary: "#bd00ff",
        bg: "#050510"
    },
    netflix: {
        primary: "#e50914",
        secondary: "#b20710",
        bg: "#0e0e0e"
    },
    hulu: {
        primary: "#1ce783",
        secondary: "#00b05b",
        bg: "#000000"
    },
    cyberpunk: {
        primary: "#ff007f",
        secondary: "#7900ff",
        bg: "#090911"
    },
    amoled: {
        primary: "#ffffff",
        secondary: "#888888",
        bg: "#000000"
    }
};

function initTheme() {
    const saved = localStorage.getItem("app_theme") || "cyberpunk";
    applyTheme(saved);
}

function setTheme(themeName, elTarget) {
    applyTheme(themeName);
    localStorage.setItem("app_theme", themeName);
    
    if (elTarget) {
        document.querySelectorAll('.theme-dot').forEach(el => {
            el.style.border = "2px solid transparent";
            el.style.boxShadow = "none";
        });
        elTarget.style.border = "2px solid white";
        elTarget.style.boxShadow = `0 0 10px ${themes[themeName].primary}`;
    }
}

// Dark text on light theme colours (cyan, green, white), white text on dark
// ones (pink, red), so buttons filled with the theme colour stay readable.
function readableTextOn(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    // Keep the site's white button text unless it would be hard to read
    // (contrast under 3:1), as on cyan, green or white themes.
    return 1.05 / (L + 0.05) >= 3 ? '#ffffff' : '#0b0b12';
}

function applyTheme(themeName) {
    const theme = themes[themeName];
    if (theme) {
        document.documentElement.style.setProperty('--on-primary', readableTextOn(theme.primary));
        document.documentElement.style.setProperty('--primary', theme.primary);
        document.documentElement.style.setProperty('--secondary', theme.secondary);
        document.documentElement.style.setProperty('--bg-color', theme.bg);
    }
}

initTheme();
initSettings();
// ----------------------------------

// ------ Settings Switcher Logic ---
function initSettings() {
    const show = localStorage.getItem("show_ratings") === "true";
    const textEl = document.getElementById("rating-toggle-text");
    if (textEl) {
        textEl.innerText = show ? "ON" : "OFF";
    }
}

function toggleRatings() {
    let show = localStorage.getItem("show_ratings") === "true";
    show = !show;
    localStorage.setItem("show_ratings", show);
    
    const textEl = document.getElementById("rating-toggle-text");
    if (textEl) {
        textEl.innerText = show ? "ON" : "OFF";
    }
    
    location.reload();
}
// ----------------------------------

// ------ Surprise Me Logic ---------
// TMDB uses different genre ids for movies and series; null = not available.
const SURPRISE_GENRES = [
    { name: 'Action', movie: 28, tv: 10759 },
    { name: 'Adventure', movie: 12, tv: 10759 },
    { name: 'Comedy', movie: 35, tv: 35 },
    { name: 'Drama', movie: 18, tv: 18 },
    { name: 'Thriller', movie: 53, tv: null },
    { name: 'Crime', movie: 80, tv: 80 },
    { name: 'Mystery', movie: 9648, tv: 9648 },
    { name: 'Horror', movie: 27, tv: null },
    { name: 'Sci-Fi', movie: 878, tv: 10765 },
    { name: 'Fantasy', movie: 14, tv: 10765 },
    { name: 'Romance', movie: 10749, tv: null },
    { name: 'Animation', movie: 16, tv: 16 },
    { name: 'Family', movie: 10751, tv: 10751 },
    { name: 'Documentary', movie: 99, tv: 99 },
    { name: 'War', movie: 10752, tv: 10768 },
];
const SURPRISE_PREF_KEY = 'surprise_prefs';

let surprisePrefs = (() => {
    try {
        const p = JSON.parse(localStorage.getItem(SURPRISE_PREF_KEY) || 'null');
        if (p && ['any', 'movie', 'tv'].includes(p.type) && Array.isArray(p.genres)) return p;
    } catch (e) {}
    return { type: 'any', genres: [] };
})();

function saveSurprisePrefs() {
    try { localStorage.setItem(SURPRISE_PREF_KEY, JSON.stringify(surprisePrefs)); } catch (e) {}
}

function genreAvailable(g, type) {
    return type === 'any' ? true : g[type] !== null;
}

function renderSurprisePanel() {
    const { type, genres } = surprisePrefs;
    document.querySelectorAll('.sp-segment button').forEach(btn => {
        const on = btn.dataset.type === type;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-checked', String(on));
    });
    const chips = document.getElementById('sp-chips');
    chips.innerHTML = SURPRISE_GENRES.map(g => {
        const available = genreAvailable(g, type);
        const on = genres.includes(g.name) && available;
        return `<button type="button" class="sp-chip${on ? ' is-active' : ''}" aria-pressed="${on}"
            ${available ? '' : 'disabled title="Not available for series"'}
            onclick="toggleSurpriseGenre('${g.name}')">${g.name}</button>`;
    }).join('');
    document.getElementById('sp-clear').hidden = genres.length === 0;
}

function setSurpriseType(type) {
    surprisePrefs.type = type;
    saveSurprisePrefs();
    renderSurprisePanel();
}

function toggleSurpriseGenre(name) {
    const i = surprisePrefs.genres.indexOf(name);
    if (i === -1) surprisePrefs.genres.push(name);
    else surprisePrefs.genres.splice(i, 1);
    saveSurprisePrefs();
    renderSurprisePanel();
}

function clearSurpriseGenres() {
    surprisePrefs.genres = [];
    saveSurprisePrefs();
    renderSurprisePanel();
}

function startSurprise() {
    const { type, genres } = surprisePrefs;
    // Use only the genres shown as selected (greyed-out ones don't apply).
    const active = genres.filter(name => {
        const g = SURPRISE_GENRES.find(x => x.name === name);
        return g && genreAvailable(g, type);
    });
    toggleSurprise();
    playRandom(type === 'any' ? null : type, active);
}

function discoverUrl(type, genreNames, page) {
    const ids = SURPRISE_GENRES
        .filter(g => genreNames.includes(g.name) && g[type] !== null)
        .map(g => g[type]);
    const unique = [...new Set(ids)];
    const params = new URLSearchParams({
        api_key: KEY,
        sort_by: 'popularity.desc',
        'vote_average.gte': '7',
        'vote_count.gte': '300',
        include_adult: 'false',
        page: String(page),
    });
    if (unique.length) params.set('with_genres', unique.join('|')); // any of the picked genres
    return `${BASE}/discover/${type}?${params}`;
}

async function pickRandomTitle(forcedType, genreNames) {
    let types = forcedType ? [forcedType] : ['movie', 'tv'];
    // Drop a type when none of the picked genres exist for it (e.g. Horror series).
    if (genreNames.length) {
        types = types.filter(t => SURPRISE_GENRES.some(g => genreNames.includes(g.name) && g[t] !== null));
    }
    if (!types.length) return null;
    const type = types[Math.floor(Math.random() * types.length)];

    const first = await (await fetch(discoverUrl(type, genreNames, 1))).json();
    const totalPages = Math.min(first.total_pages || 1, 20);
    const page = Math.floor(Math.random() * totalPages) + 1;
    const data = page === 1 ? first : await (await fetch(discoverUrl(type, genreNames, page))).json();
    const pool = (data.results || []).filter(m => m.poster_path);
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    pick.media_type = type;
    return pick;
}

async function playRandom(forcedType = null, genreNames = []) {
    const overlay = document.getElementById('surprise-overlay');
    const inner = document.getElementById('surprise-inner');
    const img = document.getElementById('surprise-img');
    const text = document.getElementById('surprise-text');

    img.style.opacity = 0;
    inner.style.transition = 'none';
    inner.style.transform = 'rotateY(0deg)';
    void inner.offsetWidth; // force reflow

    img.src = '';
    text.innerText = genreNames.length ? `Finding something ${genreNames.slice(0, 2).join(' / ')}…` : 'Get ready!';
    overlay.classList.add('show');

    inner.style.transition = 'transform 3.5s cubic-bezier(0.1, 0.9, 0.2, 1)';
    inner.style.transform = 'rotateY(3600deg)';

    try {
        const pick = await pickRandomTitle(forcedType, genreNames);
        if (!pick) {
            overlay.classList.remove('show');
            showToast('Nothing found for that mix. Try fewer genres.');
            return;
        }
        img.src = `${IMG}${pick.poster_path}`;

        setTimeout(() => {
            img.style.opacity = 1;
            text.innerText = pick.title || pick.name || "You're watching:";
            inner.style.transition = 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)';
            inner.style.transform = 'rotateY(3780deg)';

            if (window.confetti) {
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: [getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#ff007f', '#ffffff'] });
            }
            setTimeout(() => {
                overlay.classList.remove('show');
                openModal(pick, pick.media_type);
            }, 2200);
        }, 3500);
    } catch (e) {
        console.error('Surprise me error: ', e);
        overlay.classList.remove('show');
        showToast('Could not reach the movie database. Check your connection.');
    }
}

function toggleProfile(e) {
    if (e) e.stopPropagation();
    const surprisePanel = document.getElementById('surprise-dropdown');
    if (surprisePanel) surprisePanel.classList.remove('show');
    const profileDropdown = document.querySelector('.profile-container .profile-dropdown');
    if (profileDropdown) {
        profileDropdown.classList.toggle('show');
    }
}

function toggleSurprise(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('surprise-dropdown');
    if (!panel) return;
    const opening = !panel.classList.contains('show');
    document.querySelectorAll('.profile-dropdown.show').forEach(d => d.classList.remove('show'));
    if (opening) renderSurprisePanel();
    panel.classList.toggle('show', opening);
}

document.addEventListener('click', function() {
    const dropdowns = document.querySelectorAll('.profile-dropdown, .surprise-panel');
    dropdowns.forEach(dropdown => {
        if (dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    });
});
// ----------------------------------
// --- KEYBOARD SHORTCUTS ----------------------------------------------------
//   /      search            Esc   close the topmost thing
//   N / P  next / previous episode in the player          ?   this list
function isTypingTarget(el) {
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function isShown(id) {
    const el = document.getElementById(id);
    return el && el.style.display === 'flex';
}

function closeTopmost() {
    const menus = document.querySelectorAll('.profile-dropdown.show, .surprise-panel.show');
    if (menus.length) { menus.forEach(d => d.classList.remove('show')); return true; }
    const picker = document.getElementById('src-picker');
    if (picker && picker.classList.contains('is-open')) {
        toggleServerMenu(false);
        document.getElementById('src-trigger').focus();
        return true;
    }
    if (isShown('text-modal')) { document.getElementById('text-modal').style.display = 'none'; document.body.style.overflow = 'auto'; return true; }
    if (playerOpen()) { closeVideo(); return true; }
    if (isShown('trailer-overlay')) { closeTrailer(); return true; }
    if (isShown('person-modal')) { closePersonModal({ target: { id: 'person-modal' } }); return true; }
    if (detailsOpen()) { closeDetails(); return true; }

    return false;
}

document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape') {
        if (closeTopmost()) e.preventDefault();
        return;
    }
    if (isTypingTarget(e.target)) return;

    if (e.key === '/') {
        e.preventDefault();
        if (playerOpen()) closeVideo();
        if (detailsOpen()) closeDetails();
        openSearchPage();
    } else if ((e.key === 'n' || e.key === 'N') && playerOpen() && playbackState.type === 'tv') {
        e.preventDefault();
        if (!document.getElementById('btn-next-ep').disabled) {
            nextEpisode();
            showToast(`Next: S${playbackState.season} · E${playbackState.episode}`);
        }
    } else if ((e.key === 'p' || e.key === 'P') && playerOpen() && playbackState.type === 'tv') {
        e.preventDefault();
        if (!document.getElementById('btn-prev-ep').disabled) {
            prevEpisode();
            showToast(`Previous: S${playbackState.season} · E${playbackState.episode}`);
        }
    } else if (e.key === '?') {
        e.preventDefault();
        showTextModal('shortcuts');
    }
});
