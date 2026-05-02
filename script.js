const TMDB_API_KEY = 'e7be99b2666a862f16f0a6b5441c150b';
        const OMDB_API_KEY = '75583472'; // هذا المفتاح حده 1000 طلب يومياً (سيتجدد غداً)
        const TRAKT_CLIENT_ID = '7357626e48140b10327a133e653fda5d2c73fd27ab8af345c3c9a18584c171ad';  
        const BASE_URL = 'https://api.themoviedb.org/3';
        const IMG_URL = 'https://image.tmdb.org/t/p/w500';

        const themeToggleBtn = document.getElementById('theme-toggle');
        const currentTheme = localStorage.getItem('theme') || 'light';
        
        if (currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggleBtn.innerHTML = '☀️ Light Mode';
        }

        themeToggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeToggleBtn.innerHTML = '🌙 Dark Mode';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggleBtn.innerHTML = '☀️ Light Mode';
            }
        });

        const grid = document.getElementById('shows-grid');
        const modal = document.getElementById('show-modal');

        let currentPage = 1;
        let currentMode = 'network';
        let currentNetwork = '213';
        let currentSearchQuery = '';
        let isLoading = false;
        let hasMorePages = true;
        let imdbCache = JSON.parse(sessionStorage.getItem('imdbCache')) || {};

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
                data.genres.forEach(genre => {
                    const option = document.createElement('option');
                    option.value = genre.id;
                    option.textContent = genre.name;
                    genreSelect.appendChild(option);
                });
            } catch (error) { console.error("Error loading genres", error); }
        }
        fetchGenres();

        function applyFilters() {
            if (currentMode === 'network') fetchShows(currentNetwork, document.querySelector('.filters button.active'), 1);
            else if (currentMode === 'search') performSearch(1);
            else if (currentMode === 'favorites') showFavorites(document.querySelector('.fav-filter-btn'));
            else if (currentMode === 'watched') showWatched(document.querySelector('.watched-filter-btn'));
            else if (currentMode === 'upcoming') showUpcoming(document.querySelector('.filters button.active'), 1);
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
            currentMode = 'favorites';
            document.getElementById('search-input').value = '';
            hasMorePages = false; 
            
            if (btnElement) {
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
            }

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

        function showWatched(btnElement) {
            currentMode = 'watched';
            document.getElementById('search-input').value = '';
            hasMorePages = false; 
            
            if (btnElement) {
                document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                btnElement.classList.add('active');
            }

            grid.innerHTML = '';
            let watched = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
            
            const genreValue = document.getElementById('genre-select').value;
            if (genreValue) watched = watched.filter(show => show.genre_ids && show.genre_ids.includes(parseInt(genreValue)));

            if (watched.length === 0) {
                grid.innerHTML = '<div class="loading-message">You haven\'t tracked any shows yet. ✔️</div>';
                return;
            }

            const sortValue = document.getElementById('sort-select').value;
            if (sortValue === 'first_air_date.desc') watched.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
            else if (sortValue === 'vote_average.desc') watched.sort((a, b) => b.vote_average - a.vote_average);
            else watched.sort((a, b) => b.popularity - a.popularity);

            displayShows(watched);
        }

        async function showUpcoming(btnElement, page = 1) {
            if (isLoading) return;
            isLoading = true;
            currentMode = 'upcoming';
            currentPage = page;

            if (page === 1) {
                document.getElementById('search-input').value = '';
                hasMorePages = true;
                showSkeletons(20, true);
                if (btnElement) {
                    document.querySelectorAll('.filters button').forEach(btn => btn.classList.remove('active'));
                    btnElement.classList.add('active');
                }
            } else {
                showSkeletons(8, false);
            }

            const sortValue = document.getElementById('sort-select').value;
            const genreValue = document.getElementById('genre-select').value;
            
            let extraParams = '';
            if (genreValue) extraParams += `&with_genres=${genreValue}`;

            let sortBy = 'popularity.desc';
            if (sortValue === 'first_air_date.desc') sortBy = 'first_air_date.desc';
            else if (sortValue === 'vote_average.desc') sortBy = 'vote_average.desc';

            const today = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setMonth(futureDate.getMonth() + 3);
            const maxDate = futureDate.toISOString().split('T')[0];

            try {
                const response = await fetch(`${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&sort_by=${sortBy}&first_air_date.gte=${today}&first_air_date.lte=${maxDate}${extraParams}&page=${page}`);
                if (!response.ok) throw new Error('Connection error.');
                const data = await response.json();
                
                removeSkeletons();
                displayShows(data.results);
                
                hasMorePages = data.page < data.total_pages;
                if (data.results.length === 0 && page === 1) grid.innerHTML = '<div class="loading-message">No upcoming shows found.</div>';
            } catch (error) {
                removeSkeletons();
                if (page === 1) grid.innerHTML = `<div class="loading-message" style="color: var(--accent-red);">${error.message}</div>`;
            }
            isLoading = false;
        }

        window.addEventListener('scroll', () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                if (!isLoading && hasMorePages) {
                    if (currentMode === 'network') fetchShows(currentNetwork, null, currentPage + 1);
                    else if (currentMode === 'search') performSearch(currentPage + 1);
                    else if (currentMode === 'upcoming') showUpcoming(null, currentPage + 1);
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
                let badgeHTML = '';
                
                if (savedWatched && savedWatched.watched_seasons && savedWatched.watched_seasons.length > 0) {
                    badgeHTML = `<div class="watched-badge" style="background-color: #8b5cf6;">✔️ S: ${savedWatched.watched_seasons.length}</div>`;
                } else if (savedWatched && savedWatched.watched_episodes > 0) {
                    badgeHTML = `<div class="watched-badge" style="background-color: #3b82f6;">📺 Tracked</div>`;
                } else if (savedWatched && (savedWatched.watch_status === 'completed' || savedWatched.watched_progress === 'all' || savedWatched.watched_progress === '0')) {
                    badgeHTML = `<div class="watched-badge" style="background-color: #10b981;">✔️ Watched</div>`;
                }

                card.innerHTML = `
                    ${badgeHTML}
                    <img src="${posterPath}" alt="${show.name}" class="show-image" loading="lazy">
                    <div class="show-info">
                        <h3 class="show-title">${show.name}</h3>
                        <div class="card-meta-footer">
                            <div class="rating-pill">
                                <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg" alt="TMDB" class="icon-tmdb">
                                <span>${tmdbRating}</span>
                            </div>
                            <div class="rating-pill">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" alt="IMDb" class="icon-imdb">
                                <span id="card-imdb-${show.id}">${imdbCache[show.id] || '⏳'}</span>
                            </div>
                            <div class="rating-pill">📅 ${releaseYear}</div>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
                
                if (!imdbCache[show.id]) fetchIMDbForCard(show.id);
            });
        }

        async function openModal(show) {
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
                    }).catch(err => document.getElementById('modal-imdb-rating').innerText = 'Error');

                } else {
                    document.getElementById('modal-trakt-rating').innerText = 'N/A';
                    document.getElementById('modal-imdb-rating').innerText = 'N/A';
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
                modalContentBox.style.backgroundImage = `linear-gradient(to bottom, var(--modal-overlay-top), var(--modal-overlay-bottom)), url('${backdropUrl}')`;
            } else {
                modalContentBox.style.backgroundImage = 'none';
            }

            let favorites = JSON.parse(localStorage.getItem('my_favorite_shows')) || [];
            let favBtn = document.getElementById('favorite-btn');
            let newFavBtn = favBtn.cloneNode(true);
            favBtn.parentNode.replaceChild(newFavBtn, favBtn);
            
            const isFav = favorites.some(f => f.id === show.id);
            newFavBtn.innerHTML = isFav ? '❌ Remove Favorite' : '❤️ Add to Favorites';
            newFavBtn.onclick = (e) => {
                e.preventDefault();
                favorites = JSON.parse(localStorage.getItem('my_favorite_shows')) || [];
                const index = favorites.findIndex(f => f.id === show.id);
                if (index !== -1) {
                    favorites.splice(index, 1);
                    newFavBtn.innerHTML = '❤️ Add to Favorites';
                    const card = document.getElementById(`card-${show.id}`);
                    if (currentMode === 'favorites' && card) card.style.display = 'none';
                } else {
                    favorites.push(show);
                    newFavBtn.innerHTML = '❌ Remove Favorite';
                }
                localStorage.setItem('my_favorite_shows', JSON.stringify(favorites));
            };

            const siteUrl = encodeURIComponent("https://ahmad2681a1.github.io/shows-tracker/");
            const shareText = encodeURIComponent(`📺 I just discovered "${show.name}"!\n⭐ Rating: ${show.vote_average ? show.vote_average.toFixed(1) : 'N/A'}\nCheck it out here:\n`);
            document.getElementById('share-wa').href = `https://api.whatsapp.com/send?text=${shareText}%20${siteUrl}`;
            document.getElementById('share-tw').href = `https://twitter.com/intent/tweet?text=${shareText}&url=${siteUrl}`;

            modal.style.display = 'flex';
            document.querySelector('.modal-content').scrollTop = 0;
            
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
                    let validSeasons = details.seasons ? details.seasons.filter(s => s.episode_count > 0) : [];
                    if (validSeasons.length > 0) {
                        seasonsTrackerContainer.style.display = 'block';
                        let list = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                        let existingShow = list.find(w => w.id === show.id);
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
                                }
                                
                                let currentList = JSON.parse(localStorage.getItem('my_watched_shows')) || [];
                                let idx = currentList.findIndex(w => w.id === show.id);
                                show.watched_seasons = watchedSeasons;
                                if (watchedSeasons.length > 0) {
                                    if (idx > -1) currentList[idx] = show;
                                    else currentList.push(show);
                                } else {
                                    currentList = currentList.filter(w => w.id !== show.id);
                                }
                                localStorage.setItem('my_watched_shows', JSON.stringify(currentList));
                                const card = document.getElementById(`card-${show.id}`);
                                if (card) {
                                    let oldBadge = card.querySelector('.watched-badge');
                                    if (oldBadge) oldBadge.remove();
                                    if (watchedSeasons.length > 0) {
                                        let badge = document.createElement('div');
                                        badge.className = 'watched-badge';
                                        badge.style.backgroundColor = '#8b5cf6';
                                        badge.innerText = `✔️ S: ${watchedSeasons.length}`;
                                        card.insertBefore(badge, card.firstChild);
                                    } else if (currentMode === 'watched') {
                                        card.style.display = 'none';
                                    }
                                }
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
                            trailerBtn.href = `https://www.youtube.com/watch?v=${trailer.key}`;
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
        }

        function closeModal() { modal.style.display = 'none'; }
        window.onclick = function(event) { if (event.target == modal) closeModal(); }

        fetchShows('213', document.querySelector('.filters button.active'), 1);
