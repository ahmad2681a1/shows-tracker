const TMDB_API_KEY = 'e7be99b2666a862f16f0a6b5441c150b';
        const OMDB_API_KEY = '75583472'; 
        const TRAKT_CLIENT_ID = '7357626e48140b10327a133e653fda5d2c73fd27ab8af345c3c9a18584c171ad';  
        const BASE_URL = 'https://api.themoviedb.org/3';
        const IMG_URL = 'https://image.tmdb.org/t/p/w500';

        // --- Search Suggestions Logic ---
        let searchTimeout = null;
        async function handleSearchInput(query) {
            const suggestionsBox = document.getElementById('search-suggestions');
            if (!query || query.trim().length < 2) {
                suggestionsBox.style.display = 'none';
                return;
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                try {
                    const response = await fetch(`${BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US`);
                    const data = await response.json();
                    
                    if (data.results && data.results.length > 0) {
                        displaySuggestions(data.results.slice(0, 6)); // Top 6 results
                    } else {
                        suggestionsBox.style.display = 'none';
                    }
                } catch (error) {
                    console.error("Error fetching suggestions:", error);
                }
            }, 300);
        }

        function displaySuggestions(results) {
            const suggestionsBox = document.getElementById('search-suggestions');
            suggestionsBox.innerHTML = results.map(show => `
                <div class="suggestion-item" onclick="selectSuggestion('${show.name.replace(/'/g, "\\'")}')">
                    <img src="${show.poster_path ? IMG_URL + show.poster_path : 'https://via.placeholder.com/40x60?text=N/A'}" class="suggestion-poster" onerror="this.src='https://via.placeholder.com/40x60?text=N/A'">
                    <div class="suggestion-info">
                        <span class="suggestion-name">${show.name}</span>
                        <span class="suggestion-meta">${show.first_air_date ? show.first_air_date.split('-')[0] : 'N/A'} • ⭐ ${show.vote_average.toFixed(1)}</span>
                    </div>
                </div>
            `).join('');
            suggestionsBox.style.display = 'block';
        }

        function selectSuggestion(name) {
            const searchInput = document.getElementById('search-input');
            searchInput.value = name;
            document.getElementById('search-suggestions').style.display = 'none';
            performSearch();
        }

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                const box = document.getElementById('search-suggestions');
                if (box) box.style.display = 'none';
            }
        });
        // ---------------------------------

        const themeToggleBtn = document.getElementById('theme-toggle');
        const currentTheme = localStorage.getItem('theme') || 'light';
        
        if (currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggleBtn.innerHTML = '<span class="material-symbols-outlined theme-icon">light_mode</span>';
        } else {
            themeToggleBtn.innerHTML = '<span class="material-symbols-outlined theme-icon">dark_mode</span>';
        }

        themeToggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            themeToggleBtn.style.transform = 'scale(0.8) rotate(45deg)';
            
            setTimeout(() => {
                if (theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'light');
                    localStorage.setItem('theme', 'light');
                    themeToggleBtn.innerHTML = '<span class="material-symbols-outlined theme-icon">dark_mode</span>';
                } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                    themeToggleBtn.innerHTML = '<span class="material-symbols-outlined theme-icon">light_mode</span>';
                }
                themeToggleBtn.style.transform = 'scale(1) rotate(0deg)';
            }, 150);
        });

        const grid = document.getElementById('shows-grid');
        const modal = document.getElementById('show-modal');

        let currentPage = 1;
        let currentMode = 'network';
        let currentNetwork = '213';
        let currentSearchQuery = '';
        let currentTrackerStatus = 'watching';
        let currentOpenedShow = null;
        let isLoading = false;
        let hasMorePages = true;
        let imdbCache = JSON.parse(sessionStorage.getItem('imdbCache')) || {};
        let traktCache = JSON.parse(sessionStorage.getItem('traktCache')) || {};

        function formatVotes(votesStr) {
            if (!votesStr || votesStr === "N/A") return "";
            const votes = parseInt(votesStr.toString().replace(/,/g, ''));
            if (isNaN(votes)) return "";
            if (votes >= 1000000) return (votes / 1000000).toFixed(1) + 'M';
            if (votes >= 1000) return (votes / 1000).toFixed(1).replace('.0', '') + 'K';
            return votes.toString();
        }

        async function fetchGenres() {
            try {
                const response = await fetch(`${BASE_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=en-US`);
                const data = await response.json();
                const genreSelect = document.getElementById('genre-select');
                const customGenreMenu = document.getElementById('genre-menu');
                data.genres.forEach(genre => {
                    const option = document.createElement('option');
                    option.value = genre.id;
                    option.textContent = genre.name;
                    genreSelect.appendChild(option);

                    // Also add to custom menu
                    const customOption = document.createElement('div');
                    customOption.className = 'custom-option';
                    customOption.innerText = genre.name;
                    customOption.onclick = () => selectCustomOption('genre', genre.id, genre.name);
                    customGenreMenu.appendChild(customOption);
                });
            } catch (error) { console.error("Error loading genres", error); }
        }
        fetchGenres();

        function applyFilters() {
            if (currentMode === 'network') fetchShows(currentNetwork, document.querySelector('.filters button.active'), 1);
            else if (currentMode === 'search') performSearch(1);
            else if (currentMode === 'favorites') showFavorites(document.querySelector('.fav-filter-btn'));
            else if (currentMode === 'watched') showWatched(document.querySelector('.watched-filter-btn'));
        }

        function showSkeletons(count = 20, clearGrid = false) {
            if (clearGrid) grid.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const skeleton = document.createElement('div');
                skeleton.className = 'skeleton-card skeleton-item';
                skeleton.innerHTML = `
                    <div class="skeleton-img skeleton"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-text skeleton"></div>
                        <div class="skeleton-text-small skeleton"></div>
                    </div>
                `;
                grid.appendChild(skeleton);
            }
        }

        function removeSkeletons() {
            const skeletons = document.querySelectorAll('.skeleton-item');
            skeletons.forEach(s => s.remove());
        }

        async function fetchShows(networkId, btnElement, page = 1) {
            document.getElementById('tracker-sub-nav').style.display = 'none';
            document.getElementById('stats-container').style.display = 'none';
            document.getElementById('shows-grid').style.display = 'grid';
            if (isLoading) return;
            isLoading = true;
            currentMode = 'network';
            currentNetwork = networkId;
            currentPage = page;

            if (page === 1) {
                document.getElementById('search-input').value = '';
                hasMorePages = true;
                showSkeletons(20, true);
            } else {
                showSkeletons(8, false);
            }
            
            if (btnElement) {
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
            }

            if (page === 1) grid.scrollIntoView({ behavior: 'smooth' });

            const sortValue = document.getElementById('sort-select').value;
            const genreValue = document.getElementById('genre-select').value;
            
            let extraParams = '';
            if (sortValue === 'vote_average.desc') extraParams = '&vote_count.gte=200';
            else if (sortValue === 'first_air_date.desc') extraParams = '&vote_count.gte=5';
            if (genreValue) extraParams += `&with_genres=${genreValue}`;

            try {
                const response = await fetch(`${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&sort_by=${sortValue}${extraParams}&with_networks=${networkId}&page=${page}`);
                if (!response.ok) throw new Error('Connection error.');
                const data = await response.json();
                
                removeSkeletons();
                displayShows(data.results);
                
                hasMorePages = data.page < data.total_pages;
                if (data.results.length === 0 && page === 1) grid.innerHTML = '<div class="loading-message">No shows found for this filter.</div>';
            } catch (error) {
                removeSkeletons();
                if (page === 1) grid.innerHTML = `<div class="loading-message" style="color: var(--accent-red);">${error.message}</div>`;
            }
            isLoading = false;
        }

        async function performSearch(page = 1) {
            document.getElementById('tracker-sub-nav').style.display = 'none';
            if (isLoading) return;
            isLoading = true;
            currentMode = 'search';
            currentPage = page;

            if (page === 1) {
                currentSearchQuery = document.getElementById('search-input').value.trim();
                hasMorePages = true;
                showSkeletons(20, true);
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
            } else {
                showSkeletons(8, false);
            }

            if (page === 1) grid.scrollIntoView({ behavior: 'smooth' });

            if (!currentSearchQuery) { isLoading = false; removeSkeletons(); return; }

            try {
                const response = await fetch(`${BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(currentSearchQuery)}&page=${page}`);
                const data = await response.json();
                
                removeSkeletons();
                if (page === 1 && data.results.length === 0) {
                    grid.innerHTML = '<div class="loading-message">No shows found. Try another name!</div>';
                    isLoading = false; return;
                }

                let sortedResults = data.results;
                const genreValue = document.getElementById('genre-select').value;
                if (genreValue) sortedResults = sortedResults.filter(show => show.genre_ids && show.genre_ids.includes(parseInt(genreValue)));

                const sortValue = document.getElementById('sort-select').value;
                if (sortValue === 'first_air_date.desc') sortedResults.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
                else if (sortValue === 'vote_average.desc') sortedResults.sort((a, b) => b.vote_average - a.vote_average);
                else sortedResults.sort((a, b) => b.popularity - a.popularity);

                if (sortedResults.length === 0 && page === 1) {
                    grid.innerHTML = '<div class="loading-message">No results match this genre.</div>';
                } else {
                    displayShows(sortedResults);
                }
                hasMorePages = data.page < data.total_pages;
            } catch (error) {
                removeSkeletons();
                if (page === 1) grid.innerHTML = `<div class="loading-message" style="color: var(--accent-red);">${error.message}</div>`;
            }
            isLoading = false;
        }

        function handleKeyPress(event) { if (event.key === 'Enter') performSearch(1); }

        function showFavorites(btnElement) {
            document.getElementById('tracker-sub-nav').style.display = 'none';
            document.getElementById('stats-container').style.display = 'none';
            document.getElementById('shows-grid').style.display = 'grid';
            currentMode = 'favorites';
            document.getElementById('search-input').value = '';
            hasMorePages = false; 
            
            if (btnElement) {
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
            }

            grid.scrollIntoView({ behavior: 'smooth' });

            grid.innerHTML = '';
            let favorites = JSON.parse(localStorage.getItem('my_favorite_shows')) || [];
            
            const genreValue = document.getElementById('genre-select').value;
            if (genreValue) favorites = favorites.filter(show => show.genre_ids && show.genre_ids.includes(parseInt(genreValue)));

            if (favorites.length === 0) {
                grid.innerHTML = '<div class="loading-message">No favorite shows found here. ⭐</div>';
                return;
            }

            const sortValue = document.getElementById('sort-select').value;
            if (sortValue === 'first_air_date.desc') favorites.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
            else if (sortValue === 'vote_average.desc') favorites.sort((a, b) => b.vote_average - a.vote_average);
            else favorites.sort((a, b) => b.popularity - a.popularity);

            displayShows(favorites);
        }

        function filterTracker(status, btnElement) {
            currentTrackerStatus = status;
            document.querySelectorAll('.sub-filter-btn').forEach(btn => btn.classList.remove('active'));
            if (btnElement) btnElement.classList.add('active');
            
            // Show sort dropdown specifically for downloaded section as requested
            const sortWrapper = document.getElementById('tracker-sort-wrapper');
            if (sortWrapper) {
                sortWrapper.style.display = (status === 'downloaded') ? 'flex' : 'none';
            }

            document.getElementById('stats-container').style.display = 'none';
            document.getElementById('shows-grid').style.display = 'grid';
            
            applyFilters();
        }

        window.toggleTrackerSortMenu = function() {
            const menu = document.getElementById('tracker-sort-menu');
            menu.classList.toggle('show');
        };

        window.applyTrackerSort = function(type) {
            const menu = document.getElementById('tracker-sort-menu');
            if (menu) menu.classList.remove('show');
            
            // Re-use currentTrackerSort logic
            window.currentTrackerSortValue = type;
            showWatched();
        };

        window.toggleCustomDropdown = function(menuId, event) {
            event.stopPropagation();
            const menus = document.querySelectorAll('.custom-dropdown-menu');
            menus.forEach(menu => {
                if (menu.id !== menuId) menu.classList.remove('show');
            });
            document.getElementById(menuId).classList.toggle('show');
        };

        window.selectCustomOption = function(type, value, label) {
            const select = document.getElementById(type + '-select');
            const labelSpan = document.getElementById(type + '-label');
            const menu = document.getElementById(type + '-menu');
            
            select.value = value;
            labelSpan.innerText = label;
            menu.classList.remove('show');
            
            // Trigger the original filter logic
            applyFilters();
        };

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-dropdown-menu').forEach(menu => {
                menu.classList.remove('show');
            });
        });

        function showWatched(btnElement) {
            document.getElementById('tracker-sub-nav').style.display = 'flex';
            currentMode = 'watched';
            document.getElementById('search-input').value = '';
            hasMorePages = false; 
            
            if (btnElement) {
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
            }

            grid.scrollIntoView({ behavior: 'smooth' });

            grid.innerHTML = '';
            let watched = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            
            watched = watched.filter(show => (show.watch_status || 'watching') === currentTrackerStatus);
            
            const genreValue = document.getElementById('genre-select').value;
            if (genreValue) watched = watched.filter(show => show.genre_ids && show.genre_ids.includes(parseInt(genreValue)));

            if (watched.length === 0) {
                const statusNames = { 'watching': 'Watching', 'downloaded': 'Downloaded', 'plan': 'Watchlist', 'completed': 'Completed', 'dropped': 'Dropped' };
                grid.innerHTML = `<div class="loading-message">No shows found in "${statusNames[currentTrackerStatus]}". 📺</div>`;
                return;
            }

            // Apply sorting logic
            if (currentMode === 'watched' && currentTrackerStatus === 'downloaded') {
                const trackerSort = window.currentTrackerSortValue || 'newest';
                if (trackerSort === 'newest') {
                    // Newest first: larger timestamp (b) should come before smaller (a)
                    watched.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                } else if (trackerSort === 'oldest') {
                    // Oldest first: smaller timestamp (a) should come before larger (b)
                    watched.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
                }
            } else {
                const sortValue = document.getElementById('sort-select').value;
                if (sortValue === 'first_air_date.desc') watched.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
                else if (sortValue === 'vote_average.desc') watched.sort((a, b) => b.vote_average - a.vote_average);
                else watched.sort((a, b) => b.popularity - a.popularity);
            }

            displayShows(watched);
        }

        window.addEventListener('scroll', () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                if (!isLoading && hasMorePages) {
                    if (currentMode === 'network') fetchShows(currentNetwork, null, currentPage + 1);
                    else if (currentMode === 'search') performSearch(currentPage + 1);
                }
            }
        });

        async function fetchIMDbForCard(tmdbId) {
            const span = document.getElementById(`card-imdb-${tmdbId}`);
            if (!span) return;
            
            if (imdbCache[tmdbId]) {
                span.innerText = imdbCache[tmdbId];
                return;
            }

            try {
                const extRes = await fetch(`${BASE_URL}/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`);
                const extData = await extRes.json();
                const imdbId = extData.imdb_id;
                
                if (!imdbId) {
                    imdbCache[tmdbId] = "N/A";
                    if(document.getElementById(`card-imdb-${tmdbId}`)) document.getElementById(`card-imdb-${tmdbId}`).innerText = "N/A";
                    return;
                }
                
                const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
                const omdbData = await omdbRes.json();
                
                let rating = "N/A";
                if (omdbData.Response === "True" && omdbData.imdbRating && omdbData.imdbRating !== "N/A") {
                    rating = omdbData.imdbRating;
                }
                
                imdbCache[tmdbId] = rating;
                sessionStorage.setItem('imdbCache', JSON.stringify(imdbCache));
                
                if(document.getElementById(`card-imdb-${tmdbId}`)) {
                    document.getElementById(`card-imdb-${tmdbId}`).innerText = rating;
                }
            } catch (error) { }
        }

        async function fetchTraktForCard(tmdbId) {
            const span = document.getElementById(`card-trakt-${tmdbId}`);
            if (!span) return;
            
            if (traktCache[tmdbId]) {
                span.innerText = traktCache[tmdbId];
                return;
            }

            try {
                const extRes = await fetch(`${BASE_URL}/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`);
                const extData = await extRes.json();
                const imdbId = extData.imdb_id;
                
                if (!imdbId) {
                    traktCache[tmdbId] = "N/A";
                    if(document.getElementById(`card-trakt-${tmdbId}`)) document.getElementById(`card-trakt-${tmdbId}`).innerText = "N/A";
                    return;
                }
                
                const traktRes = await fetch(`https://api.trakt.tv/shows/${imdbId}/ratings`, {
                    headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
                });
                const traktData = await traktRes.json();
                
                let rating = "N/A";
                if (traktData && traktData.rating) {
                    rating = traktData.rating.toFixed(1);
                }
                
                traktCache[tmdbId] = rating;
                sessionStorage.setItem('traktCache', JSON.stringify(traktCache));
                
                if(document.getElementById(`card-trakt-${tmdbId}`)) {
                    document.getElementById(`card-trakt-${tmdbId}`).innerText = rating;
                }
            } catch (error) { 
                traktCache[tmdbId] = "N/A";
                if(document.getElementById(`card-trakt-${tmdbId}`)) document.getElementById(`card-trakt-${tmdbId}`).innerText = "N/A";
            }
        }

        async function loadUpcomingEpisodes(show) {
            try {
                const res = await fetch(`https://api.themoviedb.org/3/tv/${show.id}?api_key=${TMDB_API_KEY}`);
                const data = await res.json();
                
                if (data.next_episode_to_air) {
                    // Check for New Season notification in Watchlist
                    let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                    let existingShow = watchedList.find(w => w.id === show.id);
                    if (existingShow && existingShow.watch_status === 'plan_to_watch') {
                        if (data.next_episode_to_air.episode_number === 1) {
                            const card = document.getElementById(`card-${show.id}`);
                            if (card && !card.querySelector('.new-season-badge')) {
                                const badge = document.createElement('div');
                                badge.className = 'new-season-badge';
                                badge.innerText = 'New Season';
                                card.appendChild(badge);
                            }
                        }
                    }

                    const seasonNum = data.next_episode_to_air.season_number;
                    const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${show.id}/season/${seasonNum}?api_key=${TMDB_API_KEY}`);
                    const seasonData = await seasonRes.json();
                    
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    
                    const upcomingEps = seasonData.episodes.filter(ep => {
                        if (!ep.air_date) return false;
                        return new Date(ep.air_date) >= today;
                    });
                    
                    if (upcomingEps.length > 0) {
                        const container = document.getElementById(`upcoming-${show.id}`);
                        if (container) {
                            let listHTML = upcomingEps.map(ep => {
                                const epDate = new Date(ep.air_date);
                                const timeDiff = epDate.getTime() - today.getTime();
                                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                                let countdownText = '';
                                if (daysDiff === 0) {
                                    countdownText = 'Today';
                                } else if (daysDiff === 1) {
                                    countdownText = 'Tomorrow';
                                } else {
                                    countdownText = `${daysDiff} Days`;
                                }
                                
                                return `
                                <li>
                                    <span class="ep-number">S${ep.season_number} E${ep.episode_number}</span>
                                    <span class="ep-countdown">${countdownText}</span>
                                </li>
                                `;
                            }).join('');
                            
                            container.innerHTML = `
                                <div class="upcoming-badge">
                                    <span class="material-symbols-outlined">priority_high</span>
                                </div>
                                <div class="upcoming-tooltip">
                                    <h4>Upcoming Episodes</h4>
                                    <ul class="upcoming-ep-list">
                                        ${listHTML}
                                    </ul>
                                </div>
                            `;
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load upcoming episodes for", show.name, error);
            }
        }

        function displayShows(showsToDisplay) {
            let watchedShows = JSON.parse(localStorage.getItem('my_watched_shows')) || [];

            showsToDisplay.forEach(show => {
                const card = document.createElement('div');
                card.className = 'show-card';
                card.id = `card-${show.id}`;
                card.onclick = () => openModal(show);
                
                const posterPath = show.poster_path ? IMG_URL + show.poster_path : 'https://via.placeholder.com/500x750?text=No+Image';
                const releaseYear = show.first_air_date ? show.first_air_date.substring(0,4) : 'N/A';
                const tmdbRating = show.vote_average ? show.vote_average.toFixed(1) : 'NR';
                
                const savedWatched = watchedShows.find(w => w.id === show.id);
                let statusBarHTML = '';
                
                if (savedWatched) {
                    let statusClass = '';
                    let width = '100%';
                    const isEnded = savedWatched.status === 'Ended' || savedWatched.watch_status === 'completed';

                    if (savedWatched.watch_status === 'completed') {
                        statusClass = 'status-ended';
                    } else if (savedWatched.watched_seasons && savedWatched.watched_seasons.length > 0) {
                        if (savedWatched.number_of_seasons && savedWatched.watched_seasons.length >= savedWatched.number_of_seasons) {
                            statusClass = isEnded ? 'status-ended' : 'status-completed';
                        } else {
                            statusClass = 'status-in-progress';
                            if (savedWatched.number_of_seasons) {
                                width = ((savedWatched.watched_seasons.length / savedWatched.number_of_seasons) * 100) + '%';
                            } else {
                                width = '50%';
                            }
                        }
                    } else if (savedWatched.watch_status === 'downloaded') {
                        statusClass = 'status-downloaded';
                        width = '100%';
                    } else if (savedWatched.watch_status === 'watching') {
                        statusClass = 'status-in-progress';
                        width = '50%';
                    } else if (savedWatched.watch_status === 'dropped') {
                        statusClass = 'status-dropped';
                        width = '100%';
                    }
                    
                    if (statusClass) {
                        statusBarHTML = `
                            <div class="card-status-track"></div>
                            <div class="card-status-bar ${statusClass}" style="width: ${width}"></div>
                        `;
                    }
                }

                card.innerHTML = `
                    ${statusBarHTML}
                    <button class="card-options-btn" title="More Options">⋮</button>
                    <div class="card-options-menu" id="menu-${show.id}"></div>
                    <div id="upcoming-${show.id}" class="upcoming-badge-container"></div>
                    <img src="${posterPath}" alt="${show.name}" class="show-image" loading="lazy">
                    <div class="show-info">
                        <h3 class="show-title">${show.name} <span class="card-year">(${releaseYear})</span></h3>
                        <div class="card-meta-footer">
                            <div class="rating-pill">
                                <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg" alt="TMDB" class="icon-tmdb">
                                <span>${tmdbRating}</span>
                            </div>
                            <div class="rating-pill">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" alt="IMDb" class="icon-imdb">
                                <span id="card-imdb-${show.id}">${imdbCache[show.id] || '⏳'}</span>
                            </div>
                            <div class="rating-pill">
                                <img src="https://cdn.simpleicons.org/trakt/ed1c24" alt="Trakt" class="icon-tmdb" style="height: 10px;">
                                <span id="card-trakt-${show.id}">${traktCache[show.id] || '⏳'}</span>
                            </div>
                        </div>
                    </div>
                `;
                
                const btn = card.querySelector('.card-options-btn');
                btn.onclick = (e) => {
                    e.stopPropagation();
                    toggleCardMenu(e, show);
                };
                
                grid.appendChild(card);
                
                if (!imdbCache[show.id]) fetchIMDbForCard(show.id);
                if (!traktCache[show.id]) fetchTraktForCard(show.id);
                
                if (currentMode === 'watched' && currentTrackerStatus === 'plan') {
                    loadUpcomingEpisodes(show);
                }
            });
        }

        async function openModal(show) {
            currentOpenedShow = show;
            document.getElementById('modal-title').innerText = show.name;
            document.getElementById('modal-date').innerText = '📅 ' + (show.first_air_date || 'N/A');
            document.getElementById('modal-overview').innerText = show.overview ? show.overview : 'Overview not available.';
            document.getElementById('modal-status').innerText = 'Status: Loading...';
            document.getElementById('modal-seasons').innerText = 'Seasons: Loading...';

            const countryCode = (show.origin_country && show.origin_country.length > 0) ? show.origin_country[0] : null;
            if (countryCode) {
                const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode);
                const flagUrl = `https://flagcdn.com/20x15/${countryCode.toLowerCase()}.png`;
                document.getElementById('modal-country').innerHTML = `<img src="${flagUrl}" alt="${countryCode}" style="vertical-align: middle; border-radius: 2px; margin-right: 5px;"> ${countryName}`;
            } else {
                document.getElementById('modal-country').innerHTML = `🌍 Unknown`;
            }
            
            // --- تصفير وتعبئة التقييمات ---
            document.getElementById('modal-tmdb-rating').innerText = show.vote_average ? show.vote_average.toFixed(1) + ' / 10' : 'N/A';
            document.getElementById('modal-tmdb-votes').innerText = show.vote_count ? formatVotes(show.vote_count) : '';

            document.getElementById('modal-imdb-rating').innerText = imdbCache[show.id] ? imdbCache[show.id] + ' / 10' : '⏳';
            document.getElementById('modal-imdb-votes').innerText = '';

            document.getElementById('modal-trakt-rating').innerText = '⏳';
            document.getElementById('modal-trakt-votes').innerText = '';

            const stremioBtn = document.getElementById('stremio-btn');
            stremioBtn.style.display = 'none'; // نخفيه حتى نجد الـ ID

            // جلب المعرفات مرة واحدة فقط (لتخفيف الضغط على السيرفرات)
            fetch(`${BASE_URL}/tv/${show.id}/external_ids?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(extData => {
                const imdbId = extData.imdb_id;
                
                if (imdbId) {
                    // تفعيل زر Stremio
                    stremioBtn.href = `stremio:///detail/series/${imdbId}/${imdbId}`;
                    stremioBtn.style.display = 'inline-flex';

                    // 1. جلب تقييم Trakt
                    fetch(`https://api.trakt.tv/shows/${imdbId}/ratings`, {
                        headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.rating) {
                            document.getElementById('modal-trakt-rating').innerText = data.rating.toFixed(1) + ' / 10';
                            document.getElementById('modal-trakt-votes').innerText = data.votes ? formatVotes(data.votes) : '';
                        } else {
                            document.getElementById('modal-trakt-rating').innerText = 'N/A';
                        }
                    }).catch(err => document.getElementById('modal-trakt-rating').innerText = 'Error');
                    
                    // 2. جلب تقييم IMDb
                    fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`)
                    .then(res => res.json())
                    .then(omdbData => {
                        if (omdbData.Response === "True" && omdbData.imdbRating && omdbData.imdbRating !== "N/A") {
                            document.getElementById('modal-imdb-rating').innerText = omdbData.imdbRating + ' / 10';
                            document.getElementById('modal-imdb-votes').innerText = omdbData.imdbVotes ? formatVotes(omdbData.imdbVotes) : '';
                            
                            // تحديث الكاش والكرت الخارجي
                            imdbCache[show.id] = omdbData.imdbRating;
                            sessionStorage.setItem('imdbCache', JSON.stringify(imdbCache));
                            const cardImdbSpan = document.getElementById(`card-imdb-${show.id}`);
                            if(cardImdbSpan) cardImdbSpan.innerText = omdbData.imdbRating;
                        } else {
                            document.getElementById('modal-imdb-rating').innerText = 'N/A';
                        }

                        // جلب تقييم Rotten Tomatoes من OMDB
                        const ratings = omdbData.Ratings || [];
                        const rtRating = ratings.find(r => r.Source === "Rotten Tomatoes" || r.Source.includes("Tomatoes"));
                        const rtContainer = document.getElementById('rt-rating-item');
                        
                        if (rtContainer) {
                            if (rtRating && rtRating.Value) {
                                document.getElementById('modal-rt-rating').innerText = rtRating.Value;
                                rtContainer.style.display = 'flex';
                            } else {
                                rtContainer.style.display = 'none';
                            }
                        }
                    }).catch(err => {
                        console.error("OMDB Fetch Error:", err);
                        document.getElementById('modal-imdb-rating').innerText = 'N/A';
                        const rtContainer = document.getElementById('rt-rating-item');
                        if (rtContainer) rtContainer.style.display = 'none';
                    });

                } else {
                    document.getElementById('modal-trakt-rating').innerText = 'N/A';
                    document.getElementById('modal-imdb-rating').innerText = 'N/A';
                    const rtContainer = document.getElementById('rt-rating-item');
                    if (rtContainer) rtContainer.style.display = 'none';
                }
            });
            
            document.getElementById('modal-genres').innerHTML = '';
            const posterPath = show.poster_path ? IMG_URL + show.poster_path : 'https://via.placeholder.com/500x750?text=No+Image';
            document.getElementById('modal-img').src = posterPath;
            
            const trailerBtn = document.getElementById('trailer-btn');
            trailerBtn.style.display = 'none';
            document.getElementById('rec-section').style.display = 'none';
            document.getElementById('rec-container').innerHTML = '';

            const backdropUrl = show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : '';
            const modalContentBox = document.getElementById('modal-content-box');
            if (backdropUrl) {
                modalContentBox.style.backgroundImage = `linear-gradient(var(--modal-overlay), var(--modal-overlay)), url('${backdropUrl}')`;
            } else {
                modalContentBox.style.backgroundImage = 'none';
            }

            let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            let trackedShow = watchedList.find(s => s.id === show.id);
            


            modal.style.display = 'flex';
            document.querySelector('.modal-content').scrollTop = 0;
            document.body.style.overflow = 'hidden';
            
            fetch(`${BASE_URL}/tv/${show.id}?api_key=${TMDB_API_KEY}&language=en-US`)
                .then(res => res.json())
                .then(details => {
                    document.getElementById('modal-status').innerText = 'Status: ' + (details.status || 'Unknown');
                    document.getElementById('modal-seasons').innerText = 'Seasons: ' + (details.number_of_seasons || 'N/A');
                    
                    const genresContainer = document.getElementById('modal-genres');
                    if (details.genres && details.genres.length > 0) {
                        genresContainer.innerHTML = details.genres.map(g => 
                             `<span class="genre-pill">${g.name}</span>`
                        ).join('');
                    }

                    const seasonsTrackerContainer = document.getElementById('seasons-tracker-container');
                    const seasonsList = document.getElementById('seasons-list');
                    seasonsList.innerHTML = '';
                    let validSeasons = details.seasons ? details.seasons.filter(s => s.episode_count > 0 && s.season_number > 0) : [];
                    if (validSeasons.length > 0) {
                        seasonsTrackerContainer.style.display = 'block';
                        let list = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                        let existingShow = list.find(w => w.id === show.id);
                        
                        if (existingShow && details.status) {
                            existingShow.status = details.status;
                            localStorage.setItem('my_watched_shows', JSON.stringify(list));
                        }
                        
                        // Sync seasons if show is marked as completed via Quick Actions
                        if (existingShow && existingShow.watch_status === 'completed' && (!existingShow.watched_seasons || existingShow.watched_seasons.length < validSeasons.length)) {
                            existingShow.watched_seasons = validSeasons.map(s => s.season_number);
                            existingShow.number_of_seasons = details.number_of_seasons;
                            localStorage.setItem('my_watched_shows', JSON.stringify(list));
                        }

                        let watchedSeasons = existingShow && existingShow.watched_seasons ? existingShow.watched_seasons : [];
                        validSeasons.forEach(season => {
                            const poster = season.poster_path ? IMG_URL + season.poster_path : (show.poster_path ? IMG_URL + show.poster_path : 'https://via.placeholder.com/130x195?text=No+Poster');
                            const isWatched = watchedSeasons.includes(season.season_number);
                            const seasonCard = document.createElement('div');
                            seasonCard.className = 'season-card';
                            seasonCard.innerHTML = `
                                 <div class="season-poster-box">
                                    <img src="${poster}" class="season-poster" alt="${season.name}" loading="lazy">
                                    <div class="season-action-bar">
                                        <button class="season-check-btn ${isWatched ? 'watched' : ''}" data-season="${season.season_number}" title="Mark Season as Watched">
                                            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${isWatched ? '1' : '0'}; font-size: 22px;">check_circle</span>
                                        </button>
                                        <span class="season-ep-count">${season.episode_count} Ep</span>
                                    </div>
                                </div>
                                <div class="season-info">
                                     <p class="season-name">${season.name}</p>
                                </div>
                            `;
                            seasonsList.appendChild(seasonCard);
                        });

                        seasonsList.querySelectorAll('.season-check-btn').forEach(btn => {
                            btn.onclick = (e) => {
                                const seasonNum = parseInt(btn.getAttribute('data-season'));
                                const isCurrentlyWatched = btn.classList.contains('watched');
                                if (isCurrentlyWatched) {
                                    watchedSeasons = watchedSeasons.filter(s => s !== seasonNum);
                                    btn.classList.remove('watched');
                                    btn.querySelector('span').style.fontVariationSettings = "'FILL' 0";
                                } else {
                                    watchedSeasons.push(seasonNum);
                                    btn.classList.add('watched');
                                    btn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
                                    
                                    let unwatchedPrev = validSeasons.filter(s => s.season_number > 0 && s.season_number < seasonNum && !watchedSeasons.includes(s.season_number));
                                    if (unwatchedPrev.length > 0) {
                                        document.querySelectorAll('.watch-all-prompt').forEach(el => el.remove());
                                        const prompt = document.createElement('div');
                                        prompt.className = 'watch-all-prompt';
                                        prompt.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">done_all</span> Watch All`;
                                        btn.parentElement.style.position = 'relative';
                                        btn.parentElement.appendChild(prompt);
                                        const timeout = setTimeout(() => { if (prompt.parentElement) prompt.remove(); }, 4000);
                                        prompt.onclick = (ev) => {
                                            ev.stopPropagation();
                                            clearTimeout(timeout);
                                            unwatchedPrev.forEach(s => {
                                                watchedSeasons.push(s.season_number);
                                                const prevBtn = seasonsList.querySelector('.season-check-btn[data-season="' + s.season_number + '"]');
                                                if (prevBtn) {
                                                    prevBtn.classList.add('watched');
                                                    prevBtn.querySelector('span').style.fontVariationSettings = "'FILL' 1";
                                                }
                                            });
                                            prompt.remove();
                                            updateShowState();
                                            if (window.showToast) window.showToast('All previous seasons marked as watched!');
                                        };
                                    }
                                }
                                
                                const updateShowState = () => {
                                    let currentList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                                    let idx = currentList.findIndex(w => w.id === show.id);
                                    show.watched_seasons = watchedSeasons;
                                    show.number_of_seasons = details.number_of_seasons;
                                    if (watchedSeasons.length > 0) {
                                        // Auto-manage watch_status
                                        if (show.number_of_seasons && watchedSeasons.length >= show.number_of_seasons) {
                                            if (details.status === 'Returning Series') {
                                                show.watch_status = 'watching';
                                            } else {
                                                show.watch_status = 'completed';
                                            }
                                        } else {
                                            show.watch_status = 'watching';
                                        }
                                        // Ensure select reflects this
                                        const select = document.getElementById('modal-watch-status');
                                        if (select && show.watch_status) select.value = show.watch_status;

                                        if (idx > -1) currentList[idx] = show;
                                        else currentList.push(show);
                                    } else {
                                        currentList = currentList.filter(w => w.id !== show.id);
                                    }
                                    localStorage.setItem('my_watched_shows', JSON.stringify(currentList));
                                    const card = document.getElementById('card-' + show.id);
                                    if (card) {
                                        let oldBar = card.querySelector('.card-status-bar');
                                        let oldTrack = card.querySelector('.card-status-track');
                                        if (oldBar) oldBar.remove();
                                        if (oldTrack) oldTrack.remove();
                                        
                                        if (watchedSeasons.length > 0) {
                                            let statusClass = 'status-in-progress';
                                            let width = '100%';
                                            
                                            if (show.number_of_seasons && watchedSeasons.length >= show.number_of_seasons) {
                                                statusClass = 'status-completed';
                                            } else {
                                                if (show.number_of_seasons) {
                                                    width = ((watchedSeasons.length / show.number_of_seasons) * 100) + '%';
                                                } else {
                                                    width = '50%';
                                                }
                                            }
                                            
                                            let track = document.createElement('div');
                                            track.className = 'card-status-track';
                                            
                                            let bar = document.createElement('div');
                                            bar.className = 'card-status-bar ' + statusClass;
                                            bar.style.width = width;
                                            
                                            card.insertBefore(bar, card.firstChild);
                                            card.insertBefore(track, card.firstChild);
                                        } else if (currentMode === 'watched') {
                                            card.style.display = 'none';
                                        }
                                    }
                                };
                                updateShowState();
                            };
                        });
                    } else {
                        seasonsTrackerContainer.style.display = 'none';
                    }
                })
                .catch((err) => {
                    console.error("Error fetching details:", err);
                    document.getElementById('modal-status').innerText = 'Status: N/A';
                    document.getElementById('modal-seasons').innerText = 'Seasons: N/A';
                });
            
            fetch(`${BASE_URL}/tv/${show.id}/videos?api_key=${TMDB_API_KEY}`) 
                .then(res => res.json())
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        let trailer = data.results.find(vid => vid.site === 'YouTube' && vid.type === 'Trailer') || 
                                      data.results.find(vid => vid.site === 'YouTube' && vid.type === 'Teaser') || 
                                      data.results.find(vid => vid.site === 'YouTube');
                        if (trailer) {
                            trailerBtn.onclick = (e) => {
                                e.preventDefault();
                                openTrailerModal(trailer.key);
                            };
                            trailerBtn.style.display = 'inline-flex';
                        }
                    }
                });
                
            fetch(`${BASE_URL}/tv/${show.id}/recommendations?api_key=${TMDB_API_KEY}&language=en-US`)
                .then(res => res.json())
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        const recContainer = document.getElementById('rec-container');
                        recContainer.innerHTML = '';
                        data.results.slice(0, 10).forEach(recShow => {
                            if (!recShow.poster_path) return;
                            const recCard = document.createElement('div');
                            recCard.className = 'rec-card';
                            recCard.onclick = () => { closeModal(); openModal(recShow); };
                            recCard.innerHTML = `
                                <img class="rec-img" src="${IMG_URL + recShow.poster_path}" alt="${recShow.name}" loading="lazy">
                                <div class="rec-title">${recShow.name}</div>
                            `;
                            recContainer.appendChild(recCard);
                        });
                        if (recContainer.innerHTML !== '') document.getElementById('rec-section').style.display = 'block';
                    }
                });

            fetch(`${BASE_URL}/tv/${show.id}/credits?api_key=${TMDB_API_KEY}&language=en-US`)
                .then(res => res.json())
                .then(data => {
                    const castSection = document.getElementById('cast-section');
                    const castContainer = document.getElementById('cast-container');
                    castContainer.innerHTML = '';
                    if (data.cast && data.cast.length > 0) {
                        castSection.style.display = 'block';
                        data.cast.slice(0, 15).forEach(person => {
                            const img = person.profile_path ? IMG_URL + person.profile_path : 'https://via.placeholder.com/80?text=No+Photo';
                            const castCard = document.createElement('div');
                            castCard.className = 'cast-card';
                            castCard.style.cursor = 'pointer';
                            castCard.onclick = () => { closeModal(); fetchShowsByActor(person.id, person.name); };
                            castCard.innerHTML = `
                                <img src="${img}" class="cast-img" alt="${person.name}" loading="lazy">
                                <div class="cast-name">${person.name}</div>
                                <div class="cast-character">${person.character}</div>
                            `;
                            castContainer.appendChild(castCard);
                        });
                    } else {
                        castSection.style.display = 'none';
                    }
                });
        }

        async function fetchShowsByActor(personId, personName) {
            if (isLoading) return;
            isLoading = true;
            currentMode = 'actor';
            grid.innerHTML = '';
            document.getElementById('tracker-sub-nav').style.display = 'none';
            document.querySelectorAll('.network-btn, .fav-filter-btn, .watched-filter-btn').forEach(b => b.classList.remove('active'));
            
            showSkeletons(10, true);
            
            try {
                const response = await fetch(`${BASE_URL}/person/${personId}/tv_credits?api_key=${TMDB_API_KEY}&language=en-US`);
                const data = await response.json();
                removeSkeletons();
                
                let shows = data.cast || [];
                // Filter out Talk (10767) and Documentary (99) shows
                shows = shows.filter(show => {
                    if (!show.genre_ids) return true;
                    return !show.genre_ids.includes(10767) && !show.genre_ids.includes(99);
                });
                
                // Sort by popularity or date?
                shows.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                
                if (shows.length === 0) {
                    grid.innerHTML = `<div class="loading-message">No shows found for "${personName}". 📺</div>`;
                } else {
                    // Store the current show before closing modal to allow "Back"
                    const lastShow = currentOpenedShow;
                    
                    // Display header message with Back button and Sorting options
                    const headerRow = document.createElement('div');
                    headerRow.className = 'loading-message';
                    headerRow.style.gridColumn = '1/-1';
                    headerRow.style.display = 'flex';
                    headerRow.style.flexDirection = 'column';
                    headerRow.style.alignItems = 'center';
                    headerRow.style.gap = '10px';
                    headerRow.style.paddingBottom = '30px';
                    
                    let backBtnHTML = '';
                    if (lastShow) {
                        backBtnHTML = `<button id="actor-back-btn" class="header-btn" style="background: var(--accent-blue); color: white; border: none; padding: 6px 15px; font-size: 0.85rem; margin-bottom: 5px;">⬅️ Back to ${lastShow.name}</button>`;
                    }
                    
                    headerRow.innerHTML = `
                        ${backBtnHTML}
                        <div>Shows featuring <strong>${personName}</strong>:</div>
                        <div class="actor-sort-options" style="display: flex; gap: 12px; margin-top: 10px;">
                            <button id="sort-pop" class="actor-sort-btn active">
                                <span class="material-symbols-outlined">trending_up</span> Popular
                            </button>
                            <button id="sort-date" class="actor-sort-btn">
                                <span class="material-symbols-outlined">new_releases</span> Latest
                            </button>
                        </div>
                    `;
                    grid.appendChild(headerRow);
                    
                    const btn = headerRow.querySelector('#actor-back-btn');
                    if (btn) btn.onclick = () => openModal(lastShow);
                    
                    const renderActorShows = (sortedShows, activeBtnId) => {
                        // Clear existing cards but keep header
                        const cards = grid.querySelectorAll('.show-card');
                        cards.forEach(c => c.remove());
                        
                        headerRow.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                        headerRow.querySelector(`#${activeBtnId}`).classList.add('active');
                        
                        displayShows(sortedShows.slice(0, 40));
                    };

                    headerRow.querySelector('#sort-pop').onclick = () => {
                        shows.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                        renderActorShows(shows, 'sort-pop');
                    };
                    
                    headerRow.querySelector('#sort-date').onclick = () => {
                        shows.sort((a, b) => {
                            const dateA = new Date(a.first_air_date || '1900-01-01');
                            const dateB = new Date(b.first_air_date || '1900-01-01');
                            return dateB - dateA;
                        });
                        renderActorShows(shows, 'sort-date');
                    };

                    // Initial display (Popular)
                    displayShows(shows.slice(0, 40));
                }
            } catch (error) {
                console.error("Error fetching actor shows:", error);
                grid.innerHTML = `<div class="loading-message">Error loading shows. Please try again.</div>`;
            } finally {
                isLoading = false;
            }
        }

        function closeModal() {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            
            // Clear contents if needed
            document.getElementById('seasons-tracker-container').style.display = 'none';
            document.getElementById('rec-section').style.display = 'none';
            document.getElementById('cast-section').style.display = 'none';
        }

        function openTrailerModal(videoKey) {
            const trailerModal = document.getElementById('trailer-modal');
            const trailerIframe = document.getElementById('trailer-iframe');
            trailerIframe.src = `https://www.youtube.com/embed/${videoKey}?autoplay=1`;
            trailerModal.style.display = 'flex';
        }

        function closeTrailerModal() {
            const trailerModal = document.getElementById('trailer-modal');
            const trailerIframe = document.getElementById('trailer-iframe');
            trailerIframe.src = '';
            trailerModal.style.display = 'none';
        }

        window.onclick = function(event) { 
            if (event.target == modal) closeModal(); 
            if (event.target == document.getElementById('trailer-modal')) closeTrailerModal();
        }

        fetchShows('213', document.querySelector('.filters button.active'), 1);

        function setWatchStatus(status) {
            if (!currentOpenedShow) return;

            if (status === 'completed') {
                const statusText = document.getElementById('modal-status').innerText;
                if (statusText.includes('Returning')) {
                    status = 'watching';
                    if (window.showToast) window.showToast('<span class="material-symbols-outlined" style="color:#f59e0b">info</span> Show is returning, moved to Watching instead.');
                    const select = document.getElementById('modal-watch-status');
                    if (select) select.value = 'watching';
                }
            }

            let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            let showIndex = watchedList.findIndex(s => s.id === currentOpenedShow.id);
            
            if (showIndex > -1) {
                watchedList[showIndex].watch_status = status;
                watchedList[showIndex].updatedAt = Date.now();
            } else {
                currentOpenedShow.watch_status = status;
                currentOpenedShow.addedAt = Date.now();
                currentOpenedShow.updatedAt = Date.now();
                watchedList.push(currentOpenedShow);
            }
            
            localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
            
            if (currentMode === 'watched') {
                const card = document.getElementById(`card-${currentOpenedShow.id}`);
                if (card && currentTrackerStatus !== status) card.style.display = 'none';
            }
        }

        window.showToast = function(message) {
            let toast = document.getElementById('custom-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'custom-toast';
                toast.className = 'toast-msg';
                document.body.appendChild(toast);
            }
            toast.innerHTML = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        };

        window.toggleCardMenu = function(e, show) {
            e.stopPropagation();
            const menu = document.getElementById(`menu-${show.id}`);
            const isShowing = menu.classList.contains('show');
            
            document.querySelectorAll('.card-options-menu').forEach(m => m.classList.remove('show'));
            
            if (!isShowing) {
                let favorites = JSON.parse(localStorage.getItem('my_favorite_shows')) || [];
                const isFav = favorites.findIndex(f => f.id === show.id) !== -1;
                
                let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                const watchedShow = watchedList.find(s => s.id === show.id);
                const currentStatus = watchedShow ? watchedShow.watch_status : null;

                let favText = isFav ? '<span class="material-symbols-outlined" style="color:var(--accent-red)">heart_minus</span> Remove Favorite' : '<span class="material-symbols-outlined">favorite</span> Add to Favorites';
                let favAction = isFav ? 'remove_favorite' : 'favorite';

                let compText = currentStatus === 'completed' ? '<span class="material-symbols-outlined">remove_done</span> Remove Watched' : '<span class="material-symbols-outlined" style="color:#10b981">done_all</span> Mark Watched';
                let compAction = currentStatus === 'completed' ? 'remove_status' : 'completed';

                let planText = currentStatus === 'plan' ? '<span class="material-symbols-outlined">playlist_remove</span> Remove Watchlist' : '<span class="material-symbols-outlined" style="color:#facc15">playlist_add</span> Add to Watchlist';
                let planAction = currentStatus === 'plan' ? 'remove_status' : 'plan';

                let dropText = currentStatus === 'dropped' ? '<span class="material-symbols-outlined">remove_done</span> Undo Drop' : '<span class="material-symbols-outlined" style="color:#ef4444">cancel</span> Drop the Show';
                let dropAction = currentStatus === 'dropped' ? 'remove_status' : 'dropped';

                let downText = currentStatus === 'downloaded' ? '<span class="material-symbols-outlined">file_download_off</span> Remove Downloaded' : '<span class="material-symbols-outlined" style="color:#0066FF">download_for_offline</span> Mark Downloaded';
                let downAction = currentStatus === 'downloaded' ? 'remove_status' : 'downloaded';

                menu.innerHTML = `
                    <button id="btn-comp-${show.id}">${compText}</button>
                    <button id="btn-down-${show.id}">${downText}</button>
                    <button id="btn-drop-${show.id}">${dropText}</button>
                    <button id="btn-fav-${show.id}">${favText}</button>
                    <button id="btn-plan-${show.id}">${planText}</button>
                `;
                
                document.getElementById(`btn-comp-${show.id}`).onclick = (ev) => quickAction(ev, compAction, show);
                document.getElementById(`btn-down-${show.id}`).onclick = (ev) => quickAction(ev, downAction, show);
                document.getElementById(`btn-drop-${show.id}`).onclick = (ev) => quickAction(ev, dropAction, show);
                document.getElementById(`btn-fav-${show.id}`).onclick = (ev) => quickAction(ev, favAction, show);
                document.getElementById(`btn-plan-${show.id}`).onclick = (ev) => quickAction(ev, planAction, show);
                
                menu.classList.add('show');
            }
        };

        window.quickAction = function(e, action, show) {
            e.stopPropagation();
            document.querySelectorAll('.card-options-menu').forEach(m => m.classList.remove('show'));
            
            if (action === 'favorite' || action === 'remove_favorite') {
                let favorites = JSON.parse(localStorage.getItem('my_favorite_shows')) || [];
                const index = favorites.findIndex(f => f.id === show.id);
                
                if (action === 'favorite') {
                    if (index === -1) {
                        favorites.push(show);
                        localStorage.setItem('my_favorite_shows', JSON.stringify(favorites));
                        showToast('<span class="material-symbols-outlined" style="color:var(--accent-red)">favorite</span> Added to Favorites');
                    }
                } else {
                    if (index !== -1) {
                        favorites.splice(index, 1);
                        localStorage.setItem('my_favorite_shows', JSON.stringify(favorites));
                        showToast('<span class="material-symbols-outlined" style="color:var(--text-muted)">heart_broken</span> Removed from Favorites');
                        if (currentMode === 'favorites') {
                            const card = document.getElementById(`card-${show.id}`);
                            if (card) card.style.display = 'none';
                        }
                    }
                }
            } else {
                let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                let showIndex = watchedList.findIndex(s => s.id === show.id);
                
                if (action === 'remove_status') {
                    if (showIndex > -1) {
                        watchedList.splice(showIndex, 1);
                        localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                        showToast('<span class="material-symbols-outlined" style="color:var(--text-muted)">delete</span> Status Removed');
                    }
                } else {
                    if (action === 'completed') {
                        // Handle Returning Series dynamically when marking as completed from Quick Actions
                        fetch(`https://api.themoviedb.org/3/tv/${show.id}?api_key=${TMDB_API_KEY}`)
                            .then(res => res.json())
                            .then(details => {
                                if (details.status) show.status = details.status;
                                
                                let finalAction = 'completed';
                                if (details.status === 'Returning Series') {
                                    finalAction = 'watching';
                                    showToast('<span class="material-symbols-outlined" style="color:#f59e0b">info</span> Show is returning, moved to Watching instead.');
                                } else {
                                    showToast('<span class="material-symbols-outlined" style="color:#10b981">done_all</span> Marked as Completed');
                                }
                                
                                let validSeasons = details.seasons ? details.seasons.filter(s => s.episode_count > 0 && s.season_number > 0) : [];
                                
                                if (showIndex > -1) {
                                    watchedList[showIndex].watch_status = finalAction;
                                    watchedList[showIndex].watched_seasons = validSeasons.map(s => s.season_number);
                                    watchedList[showIndex].number_of_seasons = details.number_of_seasons;
                                } else {
                                    show.watch_status = finalAction;
                                    show.watched_seasons = validSeasons.map(s => s.season_number);
                                    show.number_of_seasons = details.number_of_seasons;
                                    watchedList.push(show);
                                }
                                localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                                
                                // Instantly update the DOM of the card
                                const card = document.getElementById(`card-${show.id}`);
                                if (card) {
                                    let oldBar = card.querySelector('.card-status-bar');
                                    let oldTrack = card.querySelector('.card-status-track');
                                    if (oldBar) oldBar.remove();
                                    if (oldTrack) oldTrack.remove();
                                    
                                    let statusClass = (details.status === 'Ended' || finalAction === 'completed') ? 'status-ended' : 'status-completed';
                                    
                                    let track = document.createElement('div');
                                    track.className = 'card-status-track';
                                    let bar = document.createElement('div');
                                    bar.className = `card-status-bar ${statusClass}`;
                                    bar.style.width = '100%';
                                    
                                    card.insertBefore(bar, card.firstChild);
                                    card.insertBefore(track, card.firstChild);
                                }
                                
                                // Refresh current view if needed
                                if (currentMode === 'watched') showWatched(document.querySelector('.filters button.active'));
                            });
                        return; // Exit here since it's async
                    }

                    if (showIndex > -1) {
                        watchedList[showIndex].watch_status = action;
                        watchedList[showIndex].updatedAt = Date.now();
                    } else {
                        show.watch_status = action;
                        show.addedAt = Date.now();
                        show.updatedAt = Date.now();
                        watchedList.push(show);
                    }
                    localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                    if (action === 'completed') showToast('<span class="material-symbols-outlined" style="color:#10b981">done_all</span> Marked as Watched');
                    if (action === 'downloaded') showToast('<span class="material-symbols-outlined" style="color:#0066FF">download_done</span> Marked as Downloaded');
                    if (action === 'plan') showToast('<span class="material-symbols-outlined" style="color:#facc15">playlist_add_check</span> Added to Watchlist');
                    if (action === 'dropped') showToast('<span class="material-symbols-outlined" style="color:#ef4444">cancel</span> Marked as Dropped');
                }

                // Instantly update the DOM of the card
                const card = document.getElementById(`card-${show.id}`);
                if (card) {
                    let oldBar = card.querySelector('.card-status-bar');
                    let oldTrack = card.querySelector('.card-status-track');
                    if (oldBar) oldBar.remove();
                    if (oldTrack) oldTrack.remove();

                    if (action === 'completed' || action === 'watching' || action === 'downloaded' || action === 'dropped' || (showIndex > -1 && watchedList[showIndex] && watchedList[showIndex].watched_seasons && watchedList[showIndex].watched_seasons.length > 0)) {
                        let statusClass = action === 'completed' ? 'status-completed' : (action === 'downloaded' ? 'status-downloaded' : (action === 'dropped' ? 'status-dropped' : 'status-in-progress'));
                        let width = action === 'completed' || action === 'downloaded' || action === 'dropped' ? '100%' : '50%';
                        
                        if (showIndex > -1 && watchedList[showIndex] && watchedList[showIndex].watched_seasons && watchedList[showIndex].number_of_seasons && action !== 'completed') {
                            width = ((watchedList[showIndex].watched_seasons.length / watchedList[showIndex].number_of_seasons) * 100) + '%';
                        }
                        
                        let track = document.createElement('div');
                        track.className = 'card-status-track';
                        let bar = document.createElement('div');
                        bar.className = `card-status-bar ${statusClass}`;
                        bar.style.width = width;
                        
                        card.insertBefore(bar, card.firstChild);
                        card.insertBefore(track, card.firstChild);
                    }
                }
                
                // Refresh grid if needed
                if (currentMode === 'watched') {
                    const activeBtn = document.querySelector('.sub-filter-btn.active');
                    if (activeBtn) {
                        const statusToFilter = activeBtn.getAttribute('onclick').match(/'([^']+)'/)[1];
                        filterTracker(statusToFilter, activeBtn);
                    }
                }
            }
            
            // Try to refresh the main grid to update the status badges on the cards
            if (currentMode === 'network' && currentNetwork) {
                 // We could fully refetch, or we can just let it be until they reload.
                 // The easiest way to update the badge is to just call a function that updates the badges.
                 // But since we have pagination, letting the user refresh is fine, or we could update the DOM directly.
            }
        };

        window.showStats = async function(btnElement) {
            document.querySelectorAll('.sub-filter-btn').forEach(btn => btn.classList.remove('active'));
            if(btnElement) btnElement.classList.add('active');

            document.getElementById('shows-grid').style.display = 'none';
            document.getElementById('stats-container').style.display = 'block';

            const loader = document.getElementById('stats-loader');
            loader.style.display = 'flex';

            let watchedShows = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            let showsToProcess = watchedShows.filter(s => s.watch_status === 'completed' || s.watch_status === 'watching' || (s.watched_seasons && s.watched_seasons.length > 0));

            let needsSave = false;
            
            const fetchPromises = showsToProcess.map(async (show, index) => {
                if (!show.episode_run_time || !show.genres || !show.networks || !show.number_of_episodes) {
                    try {
                        const res = await fetch(`https://api.themoviedb.org/3/tv/${show.id}?api_key=${TMDB_API_KEY}`);
                        const details = await res.json();
                        showsToProcess[index].episode_run_time = details.episode_run_time;
                        showsToProcess[index].genres = details.genres;
                        showsToProcess[index].networks = details.networks;
                        showsToProcess[index].number_of_episodes = details.number_of_episodes;
                        showsToProcess[index].number_of_seasons = details.number_of_seasons;
                        showsToProcess[index].seasons = details.seasons;
                        needsSave = true;
                    } catch (e) {
                        console.error("Failed to fetch details for stats:", e);
                    }
                }
            });

            await Promise.all(fetchPromises);

            if (needsSave) {
                let fullList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                showsToProcess.forEach(enriched => {
                    let idx = fullList.findIndex(s => s.id === enriched.id);
                    if(idx > -1) fullList[idx] = enriched;
                });
                localStorage.setItem('my_watched_shows', JSON.stringify(fullList));
            }

            calculateAndRenderStats(showsToProcess);
            loader.style.display = 'none';
        };

        let genresChartInstance = null;
        let networksChartInstance = null;
        let statusChartInstance = null;

        function calculateAndRenderStats(shows) {
            let totalMinutes = 0;
            let totalWatchedEpisodes = 0;
            let genreCounts = {};
            let networkCounts = {};
            let statusCounts = { 'watching': 0, 'downloaded': 0, 'plan': 0, 'completed': 0, 'dropped': 0 };
            let totalRatingSum = 0;
            let showsWithRating = 0;

            shows.forEach(show => {
                let avgRuntime = (show.episode_run_time && show.episode_run_time.length > 0) ? show.episode_run_time[0] : 45;
                let epsWatched = 0;

                if (show.watch_status === 'completed') {
                    epsWatched = show.number_of_episodes || 0;
                } else if (show.watched_seasons && show.watched_seasons.length > 0 && show.seasons) {
                    show.watched_seasons.forEach(seasonNum => {
                        let sData = show.seasons.find(s => s.season_number === seasonNum);
                        if (sData) epsWatched += sData.episode_count;
                    });
                }
                
                totalWatchedEpisodes += epsWatched;
                totalMinutes += epsWatched * avgRuntime;

                if (show.genres && epsWatched > 0) {
                    show.genres.forEach(g => {
                        genreCounts[g.name] = (genreCounts[g.name] || 0) + 1;
                    });
                }

                if (show.networks && epsWatched > 0) {
                    show.networks.forEach(n => {
                        networkCounts[n.name] = (networkCounts[n.name] || 0) + 1;
                    });
                }

                if (show.watch_status) {
                    statusCounts[show.watch_status] = (statusCounts[show.watch_status] || 0) + 1;
                }

                if (show.vote_average) {
                    totalRatingSum += show.vote_average;
                    showsWithRating++;
                }
            });

            const days = Math.floor(totalMinutes / (24 * 60));
            const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
            const mins = totalMinutes % 60;

            document.getElementById('stat-days').innerText = days;
            document.getElementById('stat-hours').innerText = hours;
            document.getElementById('stat-mins').innerText = mins;
            document.getElementById('stat-episodes').innerText = `Calculated from ${totalWatchedEpisodes} watched episodes`;
            
            document.getElementById('stat-total-eps').innerText = totalWatchedEpisodes;
            document.getElementById('stat-avg-rating').innerText = showsWithRating > 0 ? (totalRatingSum / showsWithRating).toFixed(1) : '0.0';
            document.getElementById('stat-total-shows').innerText = shows.length;

            const isDark = document.body.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#e2e8f0' : '#1e293b';
            const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

            const sortedGenres = Object.entries(genreCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
            const genreLabels = sortedGenres.map(g => g[0]);
            const genreData = sortedGenres.map(g => g[1]);
            const genreColors = ['#6366f1', '#ec4899', '#10b981', '#facc15', '#ef4444', '#8b5cf6'];

            if (genresChartInstance) genresChartInstance.destroy();
            const ctxGenres = document.getElementById('genresChart').getContext('2d');
            genresChartInstance = new Chart(ctxGenres, {
                type: 'doughnut',
                data: {
                    labels: genreLabels,
                    datasets: [{
                        data: genreData,
                        backgroundColor: genreColors,
                        borderWidth: 0,
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: textColor, font: { family: "'Inter', sans-serif", weight: '600' } } }
                    },
                    cutout: '70%'
                }
            });

            // Status Breakdown Chart
            const statusLabels = ['Watching', 'Downloaded', 'Watchlist', 'Completed', 'Dropped'];
            const statusData = [statusCounts.watching, statusCounts.downloaded, statusCounts.plan, statusCounts.completed, statusCounts.dropped];
            const statusColors = ['#facc15', '#0066FF', '#6366f1', '#10b981', '#ef4444'];

            if (statusChartInstance) statusChartInstance.destroy();
            const ctxStatus = document.getElementById('statusChart').getContext('2d');
            statusChartInstance = new Chart(ctxStatus, {
                type: 'pie',
                data: {
                    labels: statusLabels,
                    datasets: [{
                        data: statusData,
                        backgroundColor: statusColors,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: textColor, font: { family: "'Inter', sans-serif", weight: '600' } } }
                    }
                }
            });

            const sortedNetworks = Object.entries(networkCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
            const netLabels = sortedNetworks.map(n => n[0]);
            const netData = sortedNetworks.map(n => n[1]);
            
            if (networksChartInstance) networksChartInstance.destroy();
            const ctxNet = document.getElementById('networksChart').getContext('2d');
            networksChartInstance = new Chart(ctxNet, {
                type: 'bar',
                data: {
                    labels: netLabels,
                    datasets: [{
                        label: 'Watched Shows',
                        data: netData,
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0, color: textColor }, grid: { color: gridColor } },
                        x: { ticks: { color: textColor, font: { family: "'Inter', sans-serif", weight: '600' } }, grid: { display: false } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        const originalOnClick = window.onclick;
        window.onclick = function(event) { 
            if (originalOnClick) originalOnClick(event);
            if (!event.target.matches('.card-options-btn')) {
                document.querySelectorAll('.card-options-menu').forEach(m => m.classList.remove('show'));
            }
        };
