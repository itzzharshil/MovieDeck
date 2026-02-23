const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";
const BACK = "https://image.tmdb.org/t/p/w1280"; 
const KEY = "4803cc94c4172a32fc2851dda48d254f"; 

let modalZIndex = 5000;
let currentModalItem = null;
let searchActive = false;
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

function toggleSearch() {
    const input = document.getElementById("search-input");
    searchActive = !searchActive;
    if (searchActive) {
        input.classList.add("active");
        input.focus();
    } else {
        input.classList.remove("active");
        input.value = "";
        loadContent("home");
    }
}

function setActiveNav(id) {
    document
        .querySelectorAll(".nav-link")
        .forEach((b) => b.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

async function loadContent(type) {
    // Show Loader
    const loader = document.getElementById("global-loader");
    if(loader) loader.classList.remove("hidden");
    
    const container = document.getElementById("main-content");
    document.getElementById("hero").style.display = "flex";
    container.innerHTML = "";
    
    // Start the hero fetch concurrently
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
        let promises = [];
        if (heroPromise) promises.push(heroPromise);

        if (type === "home") {
            promises.push(createRow("Trending Now", "/trending/all/day"));
            loadRecentlyViewed();
            promises.push(createRow("Top Rated", "/movie/top_rated", "movie"));
            promises.push(createRow("Action", "/discover/movie?with_genres=28", "movie"));
            promises.push(createRow("Sci-Fi", "/discover/movie?with_genres=878", "movie"));
            promises.push(createRow("Horror", "/discover/movie?with_genres=27", "movie"));
            promises.push(createRow("Animation", "/discover/movie?with_genres=16", "movie"));
            promises.push(createRow("Romance", "/discover/movie?with_genres=10749", "movie"));
            promises.push(createRow("Documentary", "/discover/movie?with_genres=99", "movie"));
        } else if (type === "tv") {
            promises.push(createRow("Popular Series", "/tv/popular", "tv"));
            loadRecentlyViewed();
            promises.push(createRow("Top Rated TV", "/tv/top_rated", "tv"));
            promises.push(createRow("Sci-Fi & Fantasy", "/discover/tv?with_genres=10765", "tv"));
            promises.push(createRow("Reality", "/discover/tv?with_genres=10764", "tv"));
        } else if (type === "movie") {
            promises.push(createRow("Popular Movies", "/movie/popular", "movie"));
            loadRecentlyViewed();
            promises.push(createRow("Comedy", "/discover/movie?with_genres=35", "movie"));
            promises.push(createRow("Family", "/discover/movie?with_genres=10751", "movie"));
        }
        
        await Promise.all(promises);
    
        const mainContainer = document.getElementById("main-content");
        if (mainContainer) {
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
    
    const list = JSON.parse(localStorage.getItem("wishlist") || "[]");
    if (list.find(i => i.id === m.id)) {
        const badge = document.createElement("div");
        badge.className = "list-badge";
        badge.innerHTML = '<i class="fas fa-check"></i>';
        wrapper.appendChild(badge);
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
}

async function loadMoreGrid() {
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
        document.getElementById("grid-loader").style.display = "none";
    }
}

async function createRow(title, endpoint, forcedType = null) {
    const container = document.getElementById("main-content");
    const section = document.createElement("div");
    section.className = "category-row";
    
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.paddingRight = "4%";
    
    header.innerHTML = `<h2>${title}</h2>`;
    
    const seeAll = document.createElement("span");
    seeAll.innerText = "See All >";
    seeAll.style.color = "#999";
    seeAll.style.fontSize = "0.9rem";
    seeAll.style.fontWeight = "bold";
    seeAll.style.cursor = "pointer";
    seeAll.onclick = () => loadGrid(title, endpoint, forcedType);
    
    header.appendChild(seeAll);
    section.appendChild(header);
    
    const postersDiv = document.createElement("div");
    postersDiv.className = "row-posters";
    section.appendChild(postersDiv);
    
    container.appendChild(section);
    


    try {
        const url = endpoint.includes("?")
            ? `${BASE}${endpoint}&api_key=${KEY}`
            : `${BASE}${endpoint}?api_key=${KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        postersDiv.innerHTML = "";
        
        data.results.forEach((m) => {
            if (m.poster_path) {
                const el = createPosterElement(m, forcedType);
                postersDiv.appendChild(el);
            }
        });
    } catch (e) {
        postersDiv.innerHTML = "<p style='padding-left:20px; color:#555'>Could not load content.</p>";
    }
}

function addToHistory(item, type) {
    let hist = JSON.parse(
        localStorage.getItem(getHistoryKey()) || "[]",
    );
    hist = hist.filter((i) => i.id !== item.id);
    hist.unshift({
        id: item.id,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        title: item.title || item.name,
        overview: item.overview,
        release_date: item.release_date || item.first_air_date,
        vote_average: item.vote_average,
        media_type: type || "movie",
    });
    if (hist.length > 20) hist.pop();
    localStorage.setItem(getHistoryKey(), JSON.stringify(hist));
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
    let hist = JSON.parse(
        localStorage.getItem(getHistoryKey()) || "[]",
    );
    if (hist.length === 0) section.style.display = "none";
    else {
        section.style.display = "block";
        hist.forEach((m) => {
            let type = m.media_type || (m.title ? "movie" : "tv");
            const el = createPosterElement(m, type);
            postersDiv.appendChild(el);
        });
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
        row.appendChild(el);
    });
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
    addToHistory(m, type);
    currentModalItem = m;
    currentModalItem.media_type = type;
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
            data.genres.map((g) => g.name).join(", ") || "N/A";

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
            div.onclick = () => playEpisode(window.currentTvId, num, ep.episode_number);
            div.innerHTML = `
                <div class="ep-index">${ep.episode_number}</div>
                <div class="ep-thumb-container">
                    <img src="${ep.still_path ? IMG + ep.still_path : ""}" class="ep-thumb" loading="lazy" onerror="this.style.backgroundColor='#333'">
                    <div style="position:absolute; inset:0; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.3);">
                        <i class="fas fa-play" style="color:white; opacity:0.8;"></i>
                    </div>
                </div>
                <div class="ep-text">
                    <div class="ep-title">${ep.name}</div>
                    <div class="ep-desc">${ep.overview || "No description available."}</div>
                </div>
                <div class="ep-duration">${ep.runtime ? ep.runtime + "m" : ""}</div>
            `;
            list.appendChild(div);
        });
    } else {
        list.innerHTML =
            '<p style="color:#777; padding:20px;">No episodes found.</p>';
    }
}

function closeModal(e) {
    if (e.target.id === "modal" || e.target.closest(".modal-close")) {
        document.getElementById("modal").style.display = "none";
        document.body.style.overflow = "auto";
        document.title = "MovieDeck - Premium Streaming Experience"; // Reset Title
        const searchInput = document.getElementById("search-input");
        if (
            document.getElementById("nav-home").classList.contains("active") &&
            (!searchInput.value || searchInput.value.length < 3)
        ) {
            loadRecentlyViewed();
        }
    }
}

document.getElementById("search-input").addEventListener("input", (e) => {
    const q = e.target.value;
    if (q.length > 2) {
        document.title = `MovieDeck - Search: ${q}`; // SEO Title Update
        const container = document.getElementById("main-content");
        container.style.marginTop = "80px";
        container.innerHTML =
            '<div class="category-row" style="margin-top: 20px;"><h2>Results</h2><div class="row-posters" id="res" style="flex-wrap:wrap; overflow:visible"></div></div>';
        document.getElementById("hero").style.display = "none";
        fetch(`${BASE}/search/multi?api_key=${KEY}&query=${q}`)
            .then((r) => r.json())
            .then((d) => {
                d.results.forEach((m) => {
                    if (m.poster_path || m.profile_path) {
                        const type = m.media_type;
                        if (type === "person") {
                             const el = createPosterElement(m, type);
                             el.style.margin = "10px";
                             el.onclick = () => openPerson(m.id);
                             document.getElementById("res").appendChild(el);
                        } else if (type === "movie" || type === "tv") {
                            const el = createPosterElement(m, type);
                            el.style.margin = "10px";
                            document.getElementById("res").appendChild(el);
                        }
                    }
                });
            });
    } else if (q.length === 0) {
        init();
        document.getElementById("hero").style.display = "flex";
    }
});

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

let playbackState = {
    type: 'movie',
    id: null,
    season: 1,
    episode: 1,
    server: 'vidsrc',
    title: ''
};


function getEmbedUrl() {
    const { type, id, season, episode, server } = playbackState;
    if (server === 'vidsrc') {
        return type === 'movie' 
            ? `https://vidsrc.vip/embed/movie/${id}`
            : `https://vidsrc.vip/embed/tv/${id}/${season}/${episode}`;
    } else if (server === 'vidsrc2') {
        return type === 'movie'
            ? `https://vidsrc.to/embed/movie/${id}`
            : `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
    } else if (server === 'superembed') {
        return type === 'movie'
             ? `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`
             : `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${season}&e=${episode}`;
    }
    return "";
}

function updateVideoControls() {
    const { type, season, episode } = playbackState;
    const nav = document.getElementById("episode-nav");
    const info = document.getElementById("current-ep-info");
    
    if (type === 'movie') {
        nav.style.display = "none";
    } else {
        nav.style.display = "flex";
        info.innerText = `S${season} E${episode}`;
    }
}

async function playMedia(item) {
    if (!item || !item.id) return;
    let type = item.media_type || (item.title ? "movie" : "tv");
    
    playbackState = {
        type: type,
        id: item.id,
        season: 1,
        episode: 1,
        season: 1,
        episode: 1,
        server: 'vidsrc',
        title: item.title || item.name
    };

    const overlay = document.getElementById("video-overlay");
    const iframe = document.getElementById("video-frame");
    const title = document.getElementById("video-title");

    if(title) title.innerText = playbackState.title;
    
    updateVideoControls();
    
    const epNav = document.getElementById("episode-nav");
    if (type === 'movie') {
        if(epNav) epNav.style.display = 'none';
    } else {
        if(epNav) epNav.style.display = 'flex';
    }
    
    iframe.src = getEmbedUrl();
    overlay.style.display = "flex";
}

function playEpisode(tvId, season, episode) {
    playbackState = {
        type: 'tv',
        id: tvId,
        season: parseInt(season),
        episode: parseInt(episode),
        server: 'vidsrc',
        title: '' 
    };
    
    const overlay = document.getElementById("video-overlay");
    const iframe = document.getElementById("video-frame");
    const title = document.getElementById("video-title");
    
    // Set title
    if(title) title.innerText = `${playbackState.title} - S${season} E${episode}`;
    
    updateVideoControls();
    const epNav = document.getElementById("episode-nav");
    if(epNav) epNav.style.display = 'flex';
    
    iframe.src = getEmbedUrl();
    overlay.style.display = "flex";
}

function closeVideo() {
    const overlay = document.getElementById("video-overlay");
    const iframe = document.getElementById("video-frame");
    overlay.style.display = "none";
    iframe.src = ""; // Stop video
}

function nextEpisode() {
    playbackState.episode++;
    updateVideoControls();
    document.getElementById("video-frame").src = getEmbedUrl();
}

function prevEpisode() {
    if(playbackState.episode > 1) {
        playbackState.episode--;
        updateVideoControls();
        document.getElementById("video-frame").src = getEmbedUrl();
    }
}

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
    setActiveNav("nav-explore");
    const container = document.getElementById("main-content");
    container.style.marginTop = "80px";
    document.getElementById("hero").style.display = "none";
    
    // Reset state
    exploreState = { page: 1, genre: '', year: '', type: 'movie', loading: false };
    
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
    applyFilters(); // Load initial data
    
    // Add scroll listener for explore
    window.removeEventListener("scroll", handleExploreScroll);
    window.addEventListener("scroll", handleExploreScroll);
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
    exploreState.page = 1;
    exploreState.type = document.getElementById("filter-type").value;
    exploreState.genre = document.getElementById("filter-genre").value;
    exploreState.year = document.getElementById("filter-year").value;
    exploreState.loading = false;
    
    document.getElementById("explore-grid").innerHTML = "";
    document.getElementById("explore-heading").innerText = 
        `Explore ${exploreState.type === 'movie' ? 'Movies' : 'TV Series'}`;
        
    await loadMoreExplore();
}

async function loadMoreExplore() {
    if (exploreState.loading) return;
    exploreState.loading = true;
    document.getElementById("explore-loader").style.display = "block";
    
    try {
        let url = `${BASE}/discover/${exploreState.type}?api_key=${KEY}&page=${exploreState.page}`;
        
        if (exploreState.genre) url += `&with_genres=${exploreState.genre}`;
        if (exploreState.year) {
            if (exploreState.type === 'movie') url += `&primary_release_year=${exploreState.year}`;
            else url += `&first_air_date_year=${exploreState.year}`;
        }
        
        // Sort by popularity by default
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
    
    // Fetch video data
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

async function openPerson(id) {
    if(!id) return;
    
    document.getElementById("modal").style.display = "none";
    
    const pModal = document.getElementById("person-modal");
    modalZIndex++;
    pModal.style.zIndex = modalZIndex;
    pModal.style.display = "flex";
    document.body.style.overflow = "hidden";
    
    
    resetPersonModalLayout();
    
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
        
        const seen = new Set();
        const cast = (data.cast || [])
            .filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            })
            .sort((a,b) => b.popularity - a.popularity)
            .slice(0, 100);
        
        cast.forEach(m => {
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
                         openPerson(c.id);
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

function shareContent() {
    if (!currentModalItem) return;
    
    const type = currentModalItem.media_type || (currentModalItem.title ? "movie" : "tv");
    const name = currentModalItem.title || currentModalItem.name;
    const url = `${window.location.origin}${window.location.pathname}#${type}/${currentModalItem.id}`;
    
    if (navigator.share) {
        navigator.share({
            title: `${name} - MovieDeck`,
            text: `Check out ${name} on MovieDeck!`,
            url: url
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast("Link Copied!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast("Failed to copy link");
        });
    }
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

    if(window.location.hash) {
        const hash = window.location.hash.substring(1);
        const [type, id] = hash.split("/");
        
        if((type === 'movie' || type === 'tv') && id) {
            try {
                const res = await fetch(`${BASE}/${type}/${id}?api_key=${KEY}`);
                const data = await res.json();
                if(data && !data.success === false) {
                   data.media_type = type;
                   openModal(data);
                }
            } catch(e) {
                console.error("Error loading shared content", e);
            }
        }
    }
});

const legalContent = {
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