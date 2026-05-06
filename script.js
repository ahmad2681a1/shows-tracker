const TMDB_API_KEY = 'e7be99b2666a862f16f0a6b5441c150b';
        const OMDB_API_KEY = 'f01e964'; 
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
        let currentImdbId = null;
        let isLoading = false;

        function formatLargeNumber(num) {
            if (!num) return '0';
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }
        let hasMorePages = true;
        let imdbCache = JSON.parse(localStorage.getItem('imdbCache')) || {};
        let traktCache = JSON.parse(localStorage.getItem('traktCache')) || {};
        let rtCache = JSON.parse(localStorage.getItem('rtCache')) || {};

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

        window.applyFilters = function() {
            if (currentMode === 'network') fetchShows(currentNetwork, document.querySelector('.filters button.active'), 1);
            else if (currentMode === 'search') performSearch(1);
            else if (currentMode === 'favorites') showFavorites(document.querySelector('.fav-filter-btn'));
            else if (currentMode === 'watched') window.showWatched(document.querySelector('.watched-filter-btn'));
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
            const cwSection = document.getElementById('continue-watching-section');
            if (cwSection) cwSection.style.display = 'none';
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
            const cwSection = document.getElementById('continue-watching-section');
            if (cwSection) cwSection.style.display = 'none';
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
            const cwSection = document.getElementById('continue-watching-section');
            if (cwSection) cwSection.style.display = 'none';
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

        window.filterTracker = function(status, btnElement) {
            currentTrackerStatus = status;
            document.querySelectorAll('.sub-filter-btn').forEach(btn => btn.classList.remove('active'));
            if (btnElement) btnElement.classList.add('active');
            
            const sortWrapper = document.getElementById('tracker-sort-wrapper');
            if (sortWrapper) {
                sortWrapper.style.display = (status === 'downloaded') ? 'flex' : 'none';
            }

            document.getElementById('stats-container').style.display = 'none';
            document.getElementById('shows-grid').style.display = 'grid';

            // Show Continue Watching ONLY when in 'Watching' status
            const cwSection = document.getElementById('continue-watching-section');
            if (cwSection) {
                cwSection.style.display = (status === 'watching') ? 'block' : 'none';
            }
            
            window.applyFilters();
        };

        window.toggleTrackerSortMenu = function() {
            const menu = document.getElementById('tracker-sort-menu');
            menu.classList.toggle('show');
        };

        window.applyTrackerSort = function(type) {
            const menu = document.getElementById('tracker-sort-menu');
            if (menu) menu.classList.remove('show');
            
            // Re-use currentTrackerSort logic
            window.currentTrackerSortValue = type;
            window.showWatched();
        };

        window.toggleCustomDropdown = function(menuId, event) {
            event.stopPropagation();
            const menus = document.querySelectorAll('.custom-dropdown-menu');
            const wrappers = document.querySelectorAll('.custom-dropdown');
            
            menus.forEach(menu => {
                if (menu.id !== menuId) {
                    menu.classList.remove('show');
                    menu.parentElement.classList.remove('active');
                }
            });
            
            const menu = document.getElementById(menuId);
            menu.classList.toggle('show');
            menu.parentElement.classList.toggle('active');
        };

        window.selectCustomOption = function(type, value, label) {
            const select = document.getElementById(type + '-select');
            const labelSpan = document.getElementById(type + '-label');
            const menu = document.getElementById(type + '-menu');
            
            select.value = value;
            labelSpan.innerText = label;
            menu.classList.remove('show');
            menu.parentElement.classList.remove('active');
            
            // Trigger the original filter logic
            applyFilters();
        };

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-dropdown-menu').forEach(menu => {
                menu.classList.remove('show');
                menu.parentElement.classList.remove('active');
            });
        });

        window.showWatched = function(btnElement, shouldScroll = true) {
            document.getElementById('tracker-sub-nav').style.display = 'flex';
            currentMode = 'watched';
            document.getElementById('search-input').value = '';
            hasMorePages = false; 

            if (btnElement) {
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
            }

            if (shouldScroll) grid.scrollIntoView({ behavior: 'smooth' });
            
            renderContinueWatching();
            const cwSection = document.getElementById('continue-watching-section');
            if (cwSection) {
                cwSection.style.display = (currentTrackerStatus === 'watching') ? 'block' : 'none';
            }

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
                watched.sort((a, b) => {
                    if (trackerSort === 'size') {
                        const sizeA = parseFloat(a.fileSize) || 0;
                        const sizeB = parseFloat(b.fileSize) || 0;
                        return sizeB - sizeA; // Largest first
                    }
                    const timeA = a.updatedAt || a.addedAt || a.id || 0;
                    const timeB = b.updatedAt || b.addedAt || b.id || 0;
                    return trackerSort === 'newest' ? timeB - timeA : timeA - timeB;
                });
            } else {
                const sortValue = document.getElementById('sort-select').value;
                if (sortValue === 'first_air_date.desc') watched.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
                else if (sortValue === 'vote_average.desc') watched.sort((a, b) => b.vote_average - a.vote_average);
                else watched.sort((a, b) => b.popularity - a.popularity);
            }

            displayShows(watched);
        };

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
                let rtRating = "N/A";
                if (omdbData.Response === "True") {
                    if (omdbData.imdbRating && omdbData.imdbRating !== "N/A") rating = omdbData.imdbRating;
                    
                    const ratings = omdbData.Ratings || [];
                    const rtObj = ratings.find(r => r.Source === "Rotten Tomatoes");
                    if (rtObj) rtRating = rtObj.Value;
                }
                
                imdbCache[tmdbId] = rating;
                rtCache[tmdbId] = rtRating;
                localStorage.setItem('imdbCache', JSON.stringify(imdbCache));
                localStorage.setItem('rtCache', JSON.stringify(rtCache));
                
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
                localStorage.setItem('traktCache', JSON.stringify(traktCache));
                
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
                
                // إضافة حالة المشاهدة إذا كان المسلسل قيد المتابعة
                if (localStorage.getItem(`isWatching_${show.id}`) === 'true') {
                    card.classList.add('watching-glow');
                }
                
                const posterPath = show.poster_path ? IMG_URL + show.poster_path : 'https://via.placeholder.com/500x750?text=No+Image';
                const releaseYear = show.first_air_date ? show.first_air_date.substring(0,4) : 'N/A';
                const tmdbRating = show.vote_average ? show.vote_average.toFixed(1) : 'NR';
                
                const savedWatched = watchedShows.find(w => w.id === show.id);
                let statusBarHTML = '';
                
                // التحقق من وجود أي نوع من التقدم (حلقات فردية أو مواسم أو حالات خاصة)
                const hasEpisodeProgress = localStorage.getItem(`isWatching_${show.id}`) === 'true';
                const hasSeasonProgress = savedWatched && (savedWatched.watched_seasons && savedWatched.watched_seasons.length > 0);
                const isCompleted = savedWatched && savedWatched.watch_status === 'completed';
                const isSpecialStatus = savedWatched && (savedWatched.watch_status === 'downloaded' || savedWatched.watch_status === 'dropped');

                if (savedWatched && (hasEpisodeProgress || hasSeasonProgress || isCompleted || isSpecialStatus)) {
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

                let sizeBadgeHTML = '';
                if (currentMode === 'watched' && currentTrackerStatus === 'downloaded') {
                    const showSize = (savedWatched && savedWatched.fileSize) ? `${savedWatched.fileSize} GB` : '+ Size';
                    sizeBadgeHTML = `
                        <div class="size-badge" onclick="updateShowSize(${show.id}, event)" title="Update File Size">
                            <span class="material-symbols-outlined">save</span>
                            ${showSize}
                        </div>
                    `;
                }

                let watchlistBadgeHTML = '';
                if ((currentMode === 'network' || currentMode === 'search') && savedWatched && savedWatched.watch_status === 'plan') {
                    watchlistBadgeHTML = `
                        <div class="watchlist-home-badge" title="In Watchlist">
                            <span class="material-symbols-outlined">bookmark</span>
                        </div>
                    `;
                }

                card.innerHTML = `
                    ${statusBarHTML}
                    ${sizeBadgeHTML}
                    ${watchlistBadgeHTML}
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
                                <img src="trakt-icon.png" alt="Trakt" style="height: 14px; width: auto;">
                                <span id="card-trakt-${show.id}">${traktCache[show.id] || '⏳'}</span>
                            </div>
                            ${rtCache[show.id] && rtCache[show.id] !== 'N/A' ? `
                            <div class="rating-pill" style="color: #fa320a;">
                                <img src="rt-icon.png" alt="RT" style="height: 11px; width: auto; margin-right: 2px;">
                                <span id="card-rt-${show.id}">${rtCache[show.id]}</span>
                            </div>` : ''}
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

        // دالة استخراج اللون السائد من الصورة
        async function getDominantColor(imgUrl) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = imgUrl;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 1;
                    canvas.height = 1;
                    ctx.drawImage(img, 0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                    resolve({r, g, b});
                };
                img.onerror = () => resolve({r: 240, g: 242, b: 245}); // لون افتراضي هادئ
            });
        }

        async function openModal(show) {
            currentOpenedShow = show;
            const posterPath = show.poster_path ? IMG_URL + show.poster_path : 'https://via.placeholder.com/500x750?text=No+Image';
            const modalContentBox = document.getElementById('modal-content-box');
            
            // Reset Trakt details panel
            const traktPanel = document.getElementById('trakt-details-panel');
            if (traktPanel) {
                traktPanel.classList.add('hidden');
                traktPanel.innerHTML = '';
            }
            currentImdbId = null;
            
            // ميزة الخلفية المتكيفة (Adaptive Background)
            const dominantColor = await getDominantColor(posterPath);
            const adaptiveBg = `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.08)`;
            const adaptiveBorder = `rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.15)`;
            
            modalContentBox.style.backgroundColor = '#ffffff'; // الأساس أبيض نظيف
            modalContentBox.style.backgroundImage = `linear-gradient(135deg, #ffffff 0%, ${adaptiveBg} 100%)`;
            modalContentBox.style.borderColor = adaptiveBorder;
            
            document.getElementById('modal-title').innerText = show.name;
            document.getElementById('modal-date').innerText = `📅 ${show.first_air_date || 'N/A'}`;
            document.getElementById('modal-overview').innerText = show.overview ? show.overview : 'Overview not available.';
            
            // جلب تفاصيل إضافية
            fetch(`${BASE_URL}/tv/${show.id}?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(details => {
                const actualSeasons = details.seasons ? details.seasons.filter(s => s.season_number > 0 && s.episode_count > 0) : [];
                document.getElementById('modal-status').innerText = `✨ ${details.status || 'N/A'}`;
                document.getElementById('modal-seasons').innerText = `🎬 ${actualSeasons.length || '0'} Seasons`;
                
                const dropdownMenu = document.getElementById('dropdown-menu');
                const label = document.getElementById('current-season-label');
                dropdownMenu.innerHTML = '';
                
                if (actualSeasons.length > 0) {
                    actualSeasons.forEach(s => {
                        const item = document.createElement('div');
                        item.className = 'custom-option';
                        item.innerText = `Season ${s.season_number}`;
                        item.onclick = () => selectSeason(details.id, s.season_number, item.innerText);
                        dropdownMenu.appendChild(item);
                    });
                    
                    const firstSeason = actualSeasons[0];
                    if (firstSeason) {
                        label.innerText = `Season ${firstSeason.season_number}`;
                        fetchSeasonEpisodes(show.id, firstSeason.season_number);
                    }
                    document.getElementById('seasons-tracker-container').style.display = 'block';
                }

                const countryCode = (details.origin_country && details.origin_country.length > 0) ? details.origin_country[0] : null;
                if (countryCode) {
                    const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode);
                    document.getElementById('modal-country').innerHTML = `<img src="https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png" alt="${countryCode}" style="border-radius: 4px; margin-right: 2px;"> ${countryName}`;
                }

                // إضافة التصنيفات (Genres)
                const genresContainer = document.getElementById('modal-genres');
                genresContainer.innerHTML = '';
                if (details.genres) {
                    details.genres.forEach(genre => {
                        const pill = document.createElement('span');
                        pill.className = 'genre-pill';
                        pill.innerText = genre.name;
                        genresContainer.appendChild(pill);
                    });
                }

                // Update local storage with season counts if it's already in the tracker
                let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                let showIndex = watchedList.findIndex(s => s.id === show.id);
                if (showIndex > -1) {
                    watchedList[showIndex].seasons_meta = actualSeasons.map(s => ({
                        season_number: s.season_number,
                        episode_count: s.episode_count
                    }));
                    localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                }
            });
            
            // التقييمات
            document.getElementById('modal-tmdb-rating').innerText = show.vote_average ? show.vote_average.toFixed(1) + ' / 10' : 'N/A';
            document.getElementById('modal-tmdb-votes').innerText = show.vote_count ? formatVotes(show.vote_count) : '';
            
            fetch(`${BASE_URL}/tv/${show.id}/external_ids?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(extData => {
                const imdbId = extData.imdb_id;
                currentImdbId = imdbId;
                if (imdbId) {
                    const stremioBtn = document.getElementById('stremio-btn');
                    stremioBtn.href = `stremio:///detail/series/${imdbId}/${imdbId}`;
                    stremioBtn.style.display = 'inline-flex';

                    fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`)
                    .then(res => res.json())
                    .then(omdbData => {
                        if (omdbData.Response === "True") {
                            document.getElementById('modal-imdb-rating').innerText = omdbData.imdbRating + ' / 10';
                            document.getElementById('modal-imdb-votes').innerText = omdbData.imdbVotes ? formatVotes(omdbData.imdbVotes) : '';
                        }
                    });

                    // Fetch Trakt Rating
                    fetch(`https://api.trakt.tv/search/imdb/${imdbId}?type=show`, {
                        headers: {
                            'Content-Type': 'application/json',
                            'trakt-api-version': '2',
                            'trakt-api-key': TRAKT_CLIENT_ID
                        }
                    })
                    .then(res => res.json())
                    .then(traktData => {
                        if (traktData && traktData.length > 0) {
                            const traktId = traktData[0].show.ids.slug;
                            fetch(`https://api.trakt.tv/shows/${traktId}/ratings`, {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'trakt-api-version': '2',
                                    'trakt-api-key': TRAKT_CLIENT_ID
                                }
                            })
                            .then(res => res.json())
                            .then(ratingData => {
                                if (ratingData && ratingData.rating) {
                                    document.getElementById('modal-trakt-rating').innerText = ratingData.rating.toFixed(1) + ' / 10';
                                    document.getElementById('modal-trakt-votes').innerText = ratingData.votes ? formatVotes(ratingData.votes) : '';
                                    document.getElementById('trakt-rating-item').style.display = 'flex';
                                }
                            });
                        } else {
                            document.getElementById('trakt-rating-item').style.display = 'none';
                        }
                    })
                    .catch(() => {
                        document.getElementById('trakt-rating-item').style.display = 'none';
                    });
                }
            });
            
            document.getElementById('modal-img').src = posterPath;
            document.getElementById('show-modal').style.display = 'flex';
            document.querySelector('.modal-content').scrollTop = 0;
            document.body.style.overflow = 'hidden';

            // جلب الملحقات
            fetch(`${BASE_URL}/tv/${show.id}/videos?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(data => {
                const trailerBtn = document.getElementById('trailer-btn');
                trailerBtn.style.display = 'none';
                if (data.results && data.results.length > 0) {
                    const trailer = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                    if (trailer) {
                        trailerBtn.onclick = () => openTrailerModal(trailer.key);
                        trailerBtn.style.display = 'inline-flex';
                    }
                }
            });

            fetch(`${BASE_URL}/tv/${show.id}/recommendations?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(data => {
                const recSection = document.getElementById('rec-section');
                const recContainer = document.getElementById('rec-container');
                recContainer.innerHTML = '';
                if (data.results && data.results.length > 0) {
                    recSection.style.display = 'block';
                    data.results.slice(0, 10).forEach(rs => {
                        const div = document.createElement('div');
                        div.className = 'rec-card';
                        div.onclick = () => { closeModal(); openModal(rs); };
                        div.innerHTML = `<img class="rec-img" src="${IMG_URL + rs.poster_path}"><div class="rec-title">${rs.name}</div>`;
                        recContainer.appendChild(div);
                    });
                } else recSection.style.display = 'none';
            });

            fetch(`${BASE_URL}/tv/${show.id}/credits?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(data => {
                const castSection = document.getElementById('cast-section');
                const castContainer = document.getElementById('cast-container');
                castContainer.innerHTML = '';
                if (data.cast && data.cast.length > 0) {
                    castSection.style.display = 'block';
                    data.cast.slice(0, 15).forEach(p => {
                        const div = document.createElement('div');
                        div.className = 'cast-card';
                        div.onclick = () => { closeModal(); fetchShowsByActor(p.id, p.name); };
                        div.innerHTML = `<img src="${p.profile_path ? IMG_URL + p.profile_path : 'https://via.placeholder.com/80'}" class="cast-img"><div class="cast-name">${p.name}</div><div class="cast-character">${p.character}</div>`;
                        castContainer.appendChild(div);
                    });
                } else castSection.style.display = 'none';
            });
        }

        async function fetchShowsByActor(personId, personName) {
            if (isLoading) return;
            isLoading = true;
            currentMode = 'actor';
            grid.innerHTML = '';
            document.getElementById('tracker-sub-nav').style.display = 'none';
            const cwSection = document.getElementById('continue-watching-section');
            if (cwSection) cwSection.style.display = 'none';
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
            
            // Instantly update the DOM of the card on the home page
            const card = document.getElementById(`card-${currentOpenedShow.id}`);
            if (card) {
                // Handle Watchlist Badge
                const oldBadge = card.querySelector('.watchlist-home-badge');
                if (oldBadge) oldBadge.remove();

                if (status === 'plan' && (currentMode === 'network' || currentMode === 'search')) {
                    const badge = document.createElement('div');
                    badge.className = 'watchlist-home-badge';
                    badge.title = 'In Watchlist';
                    badge.innerHTML = '<span class="material-symbols-outlined">bookmark</span>';
                    card.insertBefore(badge, card.firstChild);
                }

                if (currentMode === 'watched') {
                    if (currentTrackerStatus !== status) card.style.display = 'none';
                }
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

        window.toggleCardMenu = function(e, show, isCW = false) {
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
                    ${isCW ? `<button id="btn-del-${show.id}" class="btn-delete-show"><span class="material-symbols-outlined" style="color:var(--accent-red)">delete_forever</span> Remove this Show</button>` : ''}
                `;
                
                document.getElementById(`btn-comp-${show.id}`).onclick = (ev) => quickAction(ev, compAction, show);
                document.getElementById(`btn-down-${show.id}`).onclick = (ev) => quickAction(ev, downAction, show);
                document.getElementById(`btn-drop-${show.id}`).onclick = (ev) => quickAction(ev, dropAction, show);
                document.getElementById(`btn-fav-${show.id}`).onclick = (ev) => quickAction(ev, favAction, show);
                document.getElementById(`btn-plan-${show.id}`).onclick = (ev) => quickAction(ev, planAction, show);
                if (isCW) document.getElementById(`btn-del-${show.id}`).onclick = (ev) => quickAction(ev, 'delete_show', show);
                
                menu.classList.add('show');
            }
        };

        window.quickAction = function(e, action, show) {
            e.stopPropagation();
            document.querySelectorAll('.card-options-menu').forEach(m => m.classList.remove('show'));
            
            if (action === 'delete_show') {
                if (confirm(`Are you sure you want to remove "${show.name}" from your tracker? This will also clear your episode progress.`)) {
                    // Remove from watched list
                    let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                    watchedList = watchedList.filter(s => s.id !== show.id);
                    localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                    
                    // Remove from favorites if exists
                    let favorites = JSON.parse(localStorage.getItem('my_favorite_shows')) || [];
                    favorites = favorites.filter(f => f.id !== show.id);
                    localStorage.setItem('my_favorite_shows', JSON.stringify(favorites));

                    // Remove all episode keys
                    const keys = Object.keys(localStorage);
                    keys.forEach(k => {
                        if (k.startsWith(`watched_${show.id}_`)) {
                            localStorage.removeItem(k);
                        }
                    });

                    showToast('<span class="material-symbols-outlined">delete_forever</span> Show removed completely');
                    
                    // Refresh UI
                    if (currentMode === 'watched') window.showWatched(document.querySelector('.sub-filter-btn.active'), false);
                    if (currentMode === 'favorites') showFavorites(document.querySelector('.fav-filter-btn'));
                    if (window.renderContinueWatching) window.renderContinueWatching();
                }
                return;
            }

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
                                updateShowWatchingStatus(show.id);
                                
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
                        // Ensure addedAt exists even for older entries
                        if (!watchedList[showIndex].addedAt) watchedList[showIndex].addedAt = Date.now();
                    } else {
                        show.watch_status = action;
                        show.addedAt = Date.now();
                        show.updatedAt = Date.now();
                        watchedList.push(show);
                    }
                    localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                    updateShowWatchingStatus(show.id);
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

                    // Remove existing watchlist badge if any
                    const oldBadge = card.querySelector('.watchlist-home-badge');
                    if (oldBadge) oldBadge.remove();

                    // If it's a home page search/network result, add the badge if action is 'plan'
                    if (action === 'plan' && (currentMode === 'network' || currentMode === 'search')) {
                        const badge = document.createElement('div');
                        badge.className = 'watchlist-home-badge';
                        badge.title = 'In Watchlist';
                        badge.innerHTML = '<span class="material-symbols-outlined">bookmark</span>';
                        card.insertBefore(badge, card.firstChild);
                    }

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
            let showsToProcess = watchedShows.filter(s => s.watch_status === 'completed' || s.watch_status === 'watching' || s.watch_status === 'downloaded' || (s.watched_seasons && s.watched_seasons.length > 0));

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

            let downloadedCount = 0;
            let totalDownloadedSize = 0;

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
                    if (show.watch_status === 'downloaded') {
                        downloadedCount++;
                        totalDownloadedSize += parseFloat(show.fileSize) || 0;
                    }
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
            document.getElementById('stat-episodes').innerHTML = `Calculated from <b>${totalWatchedEpisodes}</b> watched episodes`;
            
            document.getElementById('stat-total-eps').innerText = totalWatchedEpisodes;
            document.getElementById('stat-avg-rating').innerText = showsWithRating > 0 ? (totalRatingSum / showsWithRating).toFixed(1) : '0.0';
            document.getElementById('stat-total-shows').innerText = shows.length;
            
            // New Downloaded Stats (Convert to TB)
            document.getElementById('stat-downloaded-count').innerText = downloadedCount;
            const sizeInTB = totalDownloadedSize / 1024;
            document.getElementById('stat-total-size').innerText = sizeInTB.toFixed(2) + ' TB';

            const isDark = document.body.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#e2e8f0' : '#1e293b';
            const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

            const APPLE_PALETTE = ['#8B5CF6', '#A78BFA', '#60A5FA', '#38BDF8', '#F472B6', '#FB7185', '#6366F1'];

            const sortedGenres = Object.entries(genreCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
            const genreLabels = sortedGenres.map(g => g[0]);
            const genreData = sortedGenres.map(g => g[1]);

            if (genresChartInstance) genresChartInstance.destroy();
            const ctxGenres = document.getElementById('genresChart').getContext('2d');
            genresChartInstance = new Chart(ctxGenres, {
                type: 'doughnut',
                data: {
                    labels: genreLabels,
                    datasets: [{
                        data: genreData,
                        backgroundColor: APPLE_PALETTE,
                        borderWidth: 0,
                        hoverOffset: 15
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor, padding: 20, font: { family: "'Inter', sans-serif", size: 11, weight: '500' } } }
                    },
                    cutout: '75%'
                }
            });

            // Status Breakdown Chart
            const statusLabels = ['Watching', 'Downloaded', 'Watchlist', 'Completed', 'Dropped'];
            const statusData = [statusCounts.watching, statusCounts.downloaded, statusCounts.plan, statusCounts.completed, statusCounts.dropped];

            if (statusChartInstance) statusChartInstance.destroy();
            const ctxStatus = document.getElementById('statusChart').getContext('2d');
            statusChartInstance = new Chart(ctxStatus, {
                type: 'pie',
                data: {
                    labels: statusLabels,
                    datasets: [{
                        data: statusData,
                        backgroundColor: APPLE_PALETTE,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor, padding: 20, font: { family: "'Inter', sans-serif", size: 11, weight: '500' } } }
                    }
                }
            });

            const sortedNetworks = Object.entries(networkCounts).sort((a,b) => b[1] - a[1]).slice(0, 7);
            const netLabels = sortedNetworks.map(n => n[0]);
            const netData = sortedNetworks.map(n => n[1]);
            
            if (networksChartInstance) networksChartInstance.destroy();
            const ctxNet = document.getElementById('networksChart').getContext('2d');
            networksChartInstance = new Chart(ctxNet, {
                type: 'bar',
                data: {
                    labels: netLabels,
                    datasets: [{
                        data: netData,
                        backgroundColor: APPLE_PALETTE,
                        borderRadius: 12,
                        barThickness: 24
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0, color: textColor, font: { size: 10 } }, grid: { color: gridColor, drawBorder: false } },
                        x: { ticks: { color: textColor, font: { family: "'Inter', sans-serif", weight: '500', size: 10 } }, grid: { display: false } }
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

        function selectSeason(showId, seasonNumber, seasonText) {
            document.getElementById('current-season-label').innerText = seasonText;
            const menu = document.getElementById('dropdown-menu');
            menu.classList.remove('show');
            menu.parentElement.classList.remove('active');
            
            // تحديث الشكل (Selected)
            document.querySelectorAll('.custom-option').forEach(item => {
                item.classList.remove('selected');
                if (item.innerText === seasonText) item.classList.add('selected');
            });

            fetchSeasonEpisodes(showId, seasonNumber);
        }


        // جلب حلقات الموسم المختار
        function fetchSeasonEpisodes(showId, seasonNumber) {
            const list = document.getElementById('episodes-list');
            list.innerHTML = '<div style="color: white; padding: 20px;">Loading episodes...</div>';

            fetch(`${BASE_URL}/tv/${showId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.episodes) {
                    displaySeasonEpisodes(data.episodes, seasonNumber);
                }
            }).catch(err => console.error("Error fetching episodes:", err));
        }

        // عرض الحلقات في الحاوية الأفقية
        function displaySeasonEpisodes(episodes, seasonNumber) {
            const list = document.getElementById('episodes-list');
            list.innerHTML = '';

            episodes.forEach(ep => {
                const epCard = document.createElement('div');
                
                // التحقق من حالة المشاهدة من الكاش الفردي
                const episodeId = `watched_${currentOpenedShow.id}_s${seasonNumber}_e${ep.episode_number}`;
                let isWatched = localStorage.getItem(episodeId) === 'true';

                // التحقق من حالة المشاهدة العامة للمسلسل أو الموسم
                const watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                const savedShow = watchedList.find(s => s.id === currentOpenedShow.id);
                if (savedShow) {
                    if (savedShow.watch_status === 'completed') {
                        isWatched = true;
                    } else if (savedShow.watched_seasons && savedShow.watched_seasons.includes(seasonNumber)) {
                        isWatched = true;
                    }
                }

                epCard.className = `episode-card ${isWatched ? 'is-watched' : ''}`;
                
                const stillPath = ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : (currentOpenedShow.backdrop_path ? `https://image.tmdb.org/t/p/w500${currentOpenedShow.backdrop_path}` : 'https://via.placeholder.com/500x281?text=No+Image');
                const runtime = ep.runtime ? ep.runtime + 'm' : 'N/A';

                epCard.innerHTML = `
                    <div class="episode-img-wrapper">
                        <img src="${stillPath}" alt="${ep.name}" loading="lazy">
                        <div class="episode-duration">${runtime}</div>
                        <div class="episode-watched-badge ${isWatched ? 'watched' : ''}" onclick="toggleEpisodeWatched(this, '${episodeId}'); event.stopPropagation();">
                            <span class="material-symbols-outlined">check</span>
                        </div>
                    </div>
                    <div class="episode-info">
                        <div class="episode-title-new">${ep.name}</div>
                        <div class="episode-meta-new">S${seasonNumber} • E${ep.episode_number}</div>
                    </div>
                `;
                list.appendChild(epCard);
            });
        }
        

        // تبديل حالة مشاهدة الحلقة
        function toggleEpisodeWatched(element, storageKey) {
            const isCurrentlyWatched = element.classList.contains('watched');
            const showId = currentOpenedShow.id;
            const card = element.closest('.episode-card');
            
            // استخراج رقم الموسم من مفتاح التخزين (بصيغة watched_ID_s#_e#)
            const parts = storageKey.split('_');
            const seasonNum = parseInt(parts[2].replace('s', ''));

            let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            let showIndex = watchedList.findIndex(s => s.id === showId);

            if (isCurrentlyWatched) {
                element.classList.remove('watched');
                if (card) card.classList.remove('is-watched');
                localStorage.setItem(storageKey, 'false');

                // إذا كانت الحلقة ضمن مسلسل أو موسم مكتمل، نحتاج لتحديث حالته العامة
                if (showIndex > -1) {
                    let savedShow = watchedList[showIndex];
                    // إزالة الموسم من قائمة المواسم المشاهدة لأنه لم يعد مكتملاً
                    if (savedShow.watched_seasons) {
                        savedShow.watched_seasons = savedShow.watched_seasons.filter(s => s !== seasonNum);
                    }
                    // إذا كان المسلسل كاملاً، نرجعه لحالة "Watching"
                    if (savedShow.watch_status === 'completed') {
                        savedShow.watch_status = 'watching';
                    }
                    localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                }
            } else {
                element.classList.add('watched');
                if (card) card.classList.add('is-watched');
                localStorage.setItem(storageKey, 'true');

                // ميزة ذكية: إضافة المسلسل للمتعقب تلقائياً إذا لم يكن موجوداً
                if (showIndex === -1 && currentOpenedShow) {
                    const newShow = { ...currentOpenedShow, watch_status: 'watching', addedAt: Date.now(), updatedAt: Date.now() };
                    watchedList.push(newShow);
                    localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                }

                // ميزة ذكية: تعليم جميع الحلقات السابقة في نفس الموسم كمشاهدة
                const currentEpNum = parseInt(parts[3].replace('e', ''));
                if (currentEpNum > 1) {
                    for (let i = 1; i < currentEpNum; i++) {
                        const prevEpKey = `watched_${showId}_s${seasonNum}_e${i}`;
                        localStorage.setItem(prevEpKey, 'true');
                    }
                    
                    // تحديث الواجهة فوراً لجميع الكروت الظاهرة
                    const allCards = document.querySelectorAll('.episode-card');
                    allCards.forEach(c => {
                        const subInfo = c.querySelector('.episode-sub-info').innerText; // e.g. "S1 • E3"
                        const epMatch = subInfo.match(/E(\d+)/);
                        if (epMatch) {
                            const epNum = parseInt(epMatch[1]);
                            if (epNum < currentEpNum) {
                                c.classList.add('is-watched');
                                const icon = c.querySelector('.check-icon-wrapper');
                                if (icon) icon.classList.add('watched');
                            }
                        }
                    });
                }
            }

            // تحديث حالة "Watching" (اللون الأصفر) للمسلسل بالكامل في الصفحة الرئيسية
            updateShowWatchingStatus(showId);
            
            // Refresh Continue Watching list
            if (window.renderContinueWatching) window.renderContinueWatching();
        }

        function updateShowWatchingStatus(showId) {
            let hasAnyWatched = false;
            // فحص جميع الحلقات المخزنة لهذا المسلسل
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(`watched_${showId}_`) && localStorage.getItem(key) === 'true') {
                    hasAnyWatched = true;
                    break;
                }
            }

            let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            let savedShow = watchedList.find(s => s.id === showId);
            
            // The glow/badge should ONLY appear if the status is 'watching'
            // and we have some progress.
            if (savedShow && savedShow.watch_status !== 'watching') {
                hasAnyWatched = false;
            } else if (savedShow && (savedShow.watch_status === 'completed' || (savedShow.watched_seasons && savedShow.watched_seasons.length > 0))) {
                hasAnyWatched = true;
            }

            const card = document.getElementById(`card-${showId}`);
            
            if (hasAnyWatched) {
                localStorage.setItem(`isWatching_${showId}`, 'true');
                if (card) {
                    card.classList.add('watching-glow');
                    
                    // تحديث شريط التقدم
                    let oldBar = card.querySelector('.card-status-bar');
                    let oldTrack = card.querySelector('.card-status-track');
                    if (oldBar) oldBar.remove();
                    if (oldTrack) oldTrack.remove();

                    let statusClass = 'status-in-progress';
                    let width = '50%';

                    if (savedShow) {
                        if (savedShow.watch_status === 'completed') {
                            statusClass = 'status-ended';
                            width = '100%';
                        } else if (savedShow.watched_seasons && savedShow.number_of_seasons) {
                            width = ((savedShow.watched_seasons.length / savedShow.number_of_seasons) * 100) + '%';
                        }
                    }

                    let track = document.createElement('div');
                    track.className = 'card-status-track';
                    let bar = document.createElement('div');
                    bar.className = `card-status-bar ${statusClass}`;
                    bar.style.width = width;
                    card.insertBefore(bar, card.firstChild);
                    card.insertBefore(track, card.firstChild);
                }
            } else {
                localStorage.setItem(`isWatching_${showId}`, 'false');
                if (card) {
                    card.classList.remove('watching-glow');
                    let oldBar = card.querySelector('.card-status-bar');
                    let oldTrack = card.querySelector('.card-status-track');
                    if (oldBar) oldBar.remove();
                    if (oldTrack) oldTrack.remove();
                }
            }
        }

        async function toggleTraktDetails() {
            const panel = document.getElementById('trakt-details-panel');
            const isHidden = panel.classList.contains('hidden');
            
            if (isHidden) {
                panel.classList.remove('hidden');
                if (panel.innerHTML.trim() === '' && currentImdbId) {
                    await fetchTraktDetails(currentImdbId);
                }
            } else {
                panel.classList.add('hidden');
            }
        }

        async function fetchTraktDetails(imdbId) {
            const panel = document.getElementById('trakt-details-panel');
            panel.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-weight:700; font-size:0.9rem;">Fetching Trakt Intelligence...</div>';
            
            try {
                const searchRes = await fetch(`https://api.trakt.tv/search/imdb/${imdbId}?type=show`, {
                    headers: { 'trakt-api-version': '2', 'trakt-api-key': TRAKT_CLIENT_ID }
                });
                const searchData = await searchRes.json();
                if (!searchData || searchData.length === 0) throw new Error("Show not found on Trakt");
                
                const slug = searchData[0].show.ids.slug;
                
                const [statsRes, infoRes] = await Promise.all([
                    fetch(`https://api.trakt.tv/shows/${slug}/stats`, {
                        headers: { 'trakt-api-version': '2', 'trakt-api-key': TRAKT_CLIENT_ID }
                    }),
                    fetch(`https://api.trakt.tv/shows/${slug}?extended=full`, {
                        headers: { 'trakt-api-version': '2', 'trakt-api-key': TRAKT_CLIENT_ID }
                    })
                ]);
                
                const stats = await statsRes.json();
                const info = await infoRes.json();
                
                const countryName = info.country ? new Intl.DisplayNames(['en'], { type: 'region' }).of(info.country.toUpperCase()) : 'N/A';
                const languageName = info.language ? new Intl.DisplayNames(['en'], { type: 'language' }).of(info.language.toLowerCase()) : 'N/A';

                panel.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <span class="stat-value">${formatLargeNumber(stats.plays)}</span>
                            <span class="stat-label">Plays</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-value">${formatLargeNumber(stats.watchers)}</span>
                            <span class="stat-label">Watchers</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-value">${formatLargeNumber(stats.lists)}</span>
                            <span class="stat-label">Lists</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-value">${formatLargeNumber(stats.votes)}</span>
                            <span class="stat-label">Votes</span>
                        </div>
                    </div>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Premiered</span>
                            <span class="info-value">${info.first_aired ? new Date(info.first_aired).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Status</span>
                            <span class="info-value">${info.status || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Runtime</span>
                            <span class="info-value">${info.runtime || 'N/A'}m</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Network</span>
                            <span class="info-value">${info.network || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Country</span>
                            <span class="info-value">${countryName}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Language</span>
                            <span class="info-value">${languageName}</span>
                        </div>
                    </div>
                `;
            } catch (err) {
                panel.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444; font-weight:700;">${err.message}</div>`;
            }
        }

        window.updateShowSize = function(showId, event) {
            if (event) event.stopPropagation();
            
            let watchedList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            let showIndex = watchedList.findIndex(s => s.id === showId);
            
            if (showIndex === -1) return;
            
            const currentSize = watchedList[showIndex].fileSize || "";
            const newSize = prompt("Enter total show size in GB:", currentSize);
            
            if (newSize !== null) {
                watchedList[showIndex].fileSize = newSize;
                localStorage.setItem('my_watched_shows', JSON.stringify(watchedList));
                
                // Re-render to show update without scrolling to top
                window.showWatched(document.querySelector('.sub-filter-btn.active'), false);
                
                showToast(`<span class="material-symbols-outlined" style="color:#0066FF">save</span> Size updated: ${newSize} GB`);
            }
        };

        window.renderContinueWatching = function() {
            const section = document.getElementById('continue-watching-section');
            const list = document.getElementById('continue-watching-list');
            
            // Show in any sub-tab of My Tracker
            if (currentMode !== 'watched') {
                section.style.display = 'none';
                return;
            }

            const watchedShows = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            const continueWatchingList = [];

            watchedShows.forEach(show => {
                if (!show.id) return;
                
                const showId = String(show.id);
                const seasonsMap = {};
                
                // Optimized way to find watched episodes for this show
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith(`watched_${showId}_s`)) {
                        if (localStorage.getItem(key) === 'true') {
                            const parts = key.split('_');
                            // watched_ID_s#_e#
                            if (parts.length >= 4) {
                                const sNum = parseInt(parts[2].replace('s', ''));
                                if (!isNaN(sNum)) {
                                    seasonsMap[sNum] = (seasonsMap[sNum] || 0) + 1;
                                }
                            }
                        }
                    }
                }

                // Check if any season is in "Mid-Season" state
                let midSeason = null;
                // Get all seasons we have some progress in, plus any in seasons_meta
                const allSeasonNums = new Set([
                    ...Object.keys(seasonsMap).map(Number),
                    ...(show.seasons_meta ? show.seasons_meta.map(m => m.season_number) : [])
                ]);

                // Sort seasons to show the most recent ones first
                const sortedSeasons = Array.from(allSeasonNums).sort((a, b) => b - a);

                for (let sNum of sortedSeasons) {
                    const watchedCount = seasonsMap[sNum] || 0;
                    let totalInSeason = 20; // Default if unknown

                    if (show.seasons_meta) {
                        const meta = show.seasons_meta.find(m => m.season_number == sNum);
                        if (meta) totalInSeason = meta.episode_count;
                    }

                    // Strict Mid-Season Filter:
                    // 1. Must have watched at least 1 episode in this season.
                    // 2. Must NOT have watched all episodes.
                    // 3. The season must NOT be in the show's "watched_seasons" list (if that exists).
                    
                    const isSeasonExplicitlyCompleted = show.watched_seasons && show.watched_seasons.includes(sNum);
                    const isAllEpisodesWatched = watchedCount >= totalInSeason;

                    if (watchedCount > 0 && !isSeasonExplicitlyCompleted && !isAllEpisodesWatched) {
                        midSeason = {
                            season_number: sNum,
                            watched: watchedCount,
                            total: totalInSeason
                        };
                        break;
                    }
                }

                if (midSeason && show.watch_status !== 'completed') {
                    continueWatchingList.push({
                        ...show,
                        midSeason: midSeason
                    });
                }
            });



            if (continueWatchingList.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = 'block';
            list.innerHTML = '';

            continueWatchingList.forEach(show => {
                const card = document.createElement('div');
                card.className = 'cw-card';
                card.onclick = () => openModal(show);
                
                const progress = (show.midSeason.watched / show.midSeason.total) * 100;
                const backdrop = show.backdrop_path ? `https://image.tmdb.org/t/p/w500${show.backdrop_path}` : 'https://via.placeholder.com/500x281?text=No+Image';

                card.innerHTML = `
                    <div class="cw-img-wrapper">
                        <img src="${backdrop}" alt="${show.name}" loading="lazy">
                        <div class="cw-options-btn" onclick="event.stopPropagation(); window.toggleCardMenu(event, ${JSON.stringify(show).replace(/"/g, '&quot;')}, true)">
                            <span class="material-symbols-outlined">more_vert</span>
                        </div>
                        <div id="menu-${show.id}" class="card-options-menu"></div>
                    </div>
                    <div class="cw-details">
                        <div class="cw-info">
                            <div class="cw-title">${show.name}</div>
                            <div class="cw-meta">Season ${show.midSeason.season_number} • Episode ${show.midSeason.watched}</div>
                        </div>
                        <div class="cw-play-btn">
                            <span class="material-symbols-outlined">play_arrow</span>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });
        };

        // Initial Load
        fetchShows('213', document.querySelector('.filters button.active'), 1);
