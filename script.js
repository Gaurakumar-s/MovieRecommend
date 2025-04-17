// API Keys
const TMDB_KEY = '3fd2be6f0c70a2a598f084ddfb75487c';
const GEMINI_KEY = 'AIzaSyAtsN7DlHplSbEZCqND1HkWAAkd_MpNZeU';

// DOM Elements
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

//  mapping objects for genre IDs and language codes
const genres = {
    action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
    documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
    horror: 27, music: 10402, mystery: 9648, romance: 10749,
    'sci-fi': 878, 'science fiction': 878, scifi: 878, thriller: 53,
    war: 10752, western: 37, musical: 10402, 'action adventure': 28,
    'romantic comedy': 10749, romcom: 10749, 'rom-com': 10749,
    'rom com': 10749, 'horror thriller': 27
};
// Language code mappings
const languages = {
    'hindi': 'hi',
    'english': 'en',
    'tamil': 'ta',
    'telugu': 'te',
    'malayalam': 'ml',
    'bengali': 'bn',
    'kannada': 'kn',
    'marathi': 'mr',
    'punjabi': 'pa',
    'gujarati': 'gu',
    'bhojpuri': 'bj',
    'south': ['ta', 'te', 'ml', 'kn'],
    'indian': ['hi', 'ta', 'te', 'ml', 'bn', 'kn', 'mr', 'pa', 'gu']
};

// AI Search Function(Using Gemini to extarct what data user want to get and then send it to Tmdb api)
// Categories: PERSON, MOVIES, GENRE, or LANGUAGE
async function getAIMovieSuggestions(query) {
    try {
        // Sending query to Gemini AI for analysis
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Analyze this search query: "${query}"
                        Rules:
                        1. If it's clearly a genre (e.g., "action", "comedy"), only return GENRE
                        2. If it's clearly a person's name or nickname, only return PERSON
                        3. If it's clearly a movie title (even misspelled), only return MOVIES
                        4. If it's clearly a language (e.g., "Hindi", "English", "Tamil"), only return LANGUAGE
                        5. If uncertain, try to guess the most likely category
                        Format your response exactly like this, including only the relevant category:
                        PERSON: [full name if detected]
                        or
                        MOVIES: [up to 3 likely movie titles separated by |]
                        or
                        GENRE: [single most likely genre]
                        or
                        LANGUAGE: [language name]`
                    }]
                }]
            })
        });
          // Processing AI response and categorizing the search
        const data = await response.json();
        const result = data.candidates[0].content.parts[0].text;
        // Extract category and value using regex
        const personMatch = result.match(/PERSON: (.*)/);
        const moviesMatch = result.match(/MOVIES: (.*)/);
        const genreMatch = result.match(/GENRE: (.*)/);
        const languageMatch = result.match(/LANGUAGE: (.*)/);
        // Return appropriate category and value
        if (languageMatch) {
            return { type: 'language', value: languageMatch[1].trim().toLowerCase() };
        } else if (personMatch) {
            return { type: 'person', value: personMatch[1].trim() };
        } else if (genreMatch) {
            return { type: 'genre', value: genreMatch[1].trim().toLowerCase() };
        } else if (moviesMatch) {
            return { type: 'movies', value: moviesMatch[1].split('|').map(m => m.trim()).filter(m => m) };
        }
        return { type: 'unknown', value: query };
    } catch (error) {
        console.error('Gemini API Error:', error);
        return { type: 'unknown', value: query };
    }
}

// Search Functions (Search Movie on basis of language)
async function searchByLanguage(language) {
    const languageCodes = languages[language.toLowerCase()] || [language.toLowerCase()];
    const codes = Array.isArray(languageCodes) ? languageCodes : [languageCodes];
    try {
        const allResults = await Promise.all(codes.map(async (code) => {
            const response = await fetch(
                `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_original_language=${code}&sort_by=popularity.desc`
            );
            const data = await response.json();
            return data.results;
        }));
        return allResults.flat();
    } catch (error) {
        console.error('Language Search Error:', error);
        return [];
    }
}
// Search movie on basis of Genre using TMDB
async function searchByGenre(genreName) {
    const genreId = genres[genreName.toLowerCase()];
    if (!genreId) return [];
    try {
        const response = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=${genreId}&sort_by=popularity.desc`);
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('Genre Search Error:', error);
        return [];
    }
}
// Search Movie using  Actor/Actress Name
async function searchPerson(query) {
    const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('TMDB Person Search Error:', error);
        return [];
    }
}
// Get detailed information about a actor including their movies
async function getPersonDetails(personId) {
    try {
        const [details, credits] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${TMDB_KEY}`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${TMDB_KEY}`).then(r => r.json())
        ]);
        return {
            ...details,
            movies: credits.cast.concat(credits.crew || [])
        };
    } catch (error) {
        console.error('Person Details Error:', error);
        return null;
    }
}
// Search movies by title using TMDB API
async function searchMovies(query) {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        return data.results;
    } catch (error) {
        console.error('TMDB Search Error:', error);
        return [];
    }
}
//Get trending movies for the week
async function getTrendingMovies() {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}`);
        const data = await response.json();
        return data.results.slice(0, 10);
    } catch (error) {
        console.error('Trending Movies Error:', error);
        return [];
    }
}
//Get Oscar and other award-winning movies
async function getOscarWinningMovies() {
    try {
        const requests = [
            fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&sort_by=vote_average.desc&vote_count.gte=1000&with_keywords=156064&page=1`),
            fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&sort_by=vote_average.desc&vote_count.gte=1000&with_keywords=156064&page=2`),
            fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&sort_by=vote_average.desc&vote_count.gte=1000&with_keywords=156066&page=1`),
            fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&sort_by=popularity.desc&with_keywords=209704&page=1`) // National Awards
        ];
        // Wait for all requests to complete
        const responses = await Promise.all(requests);
        const data = await Promise.all(responses.map(response => response.json()));
        
        // Combine all results and remove duplicates
        const allMovies = data.flatMap(d => d.results);
        const uniqueMovies = Array.from(new Map(allMovies.map(movie => [movie.id, movie])).values());
        // Filter and sort results
        return uniqueMovies
            .filter(movie => movie.poster_path) // Only include movies with posters
            .sort((a, b) => b.vote_average - a.vote_average)
            .slice(0, 20);
    } catch (error) {
        console.error('Award Movies Error:', error);
        return [];
    }
}
// Get detailed information about a specific movie
// Including cast, crew, and trailer information
async function getMovieDetails(movieId) {
    try {
        const [movieDetails, credits, videos] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_KEY}`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${TMDB_KEY}`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${TMDB_KEY}`).then(r => r.json())
        ]);
        // Find trailer and director
        const trailer = videos.results.find(v => v.type === 'Trailer');
        const director = credits.crew.find(c => c.job === 'Director');
        // Return both  data
        return {
            ...movieDetails,
            director: director?.name || 'Unknown',
            cast: credits.cast.slice(0, 8),
            trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null
        };
    } catch (error) {
        console.error('Movie Details Error:', error);
        return null;
    }
}

function displayMovies(movies, container, personName = '') {
    container.innerHTML = '';
    
    if (personName && container === moviesContainer) {
        personInfo.innerHTML = `<h2>Showing movies featuring ${personName}</h2>`;
        personInfo.classList.add('active');
    } else if (container === moviesContainer) {
        personInfo.classList.remove('active');
    }
    
    const sortedMovies = movies
        .filter(movie => movie.poster_path)
        .sort((a, b) => b.popularity - a.popularity);
    
    sortedMovies.forEach(movie => {
        const movieElement = document.createElement('div');
        movieElement.classList.add('movie');
        movieElement.innerHTML = `
            <img src="https://image.tmdb.org/t/p/w500${movie.poster_path}"
                alt="${movie.title}"
                onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22><rect width=%22200%22 height=%22300%22 fill=%22%23373b69%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22white%22>No Image</text></svg>'">
            <h3>${movie.title}</h3>
            <div class="movie-rating">${movie.vote_average?.toFixed(1) || 'N/A'} ⭐</div>
            <div class="movie-overview">
                <h4>Overview</h4>
                <p>${movie.overview || 'No overview available'}</p>
                <p><strong>Release Date:</strong> ${movie.release_date || 'N/A'}</p>
            </div>
        `;
        // On click Show movie Details
        movieElement.addEventListener('click', async () => {
            const details = await getMovieDetails(movie.id);
            if (details) {
                const castHTML = details.cast
                    .filter(actor => actor.profile_path)
                    .map(actor => `
                        <div class="cast-member">
                            <img class="cast-image"
                                src="https://image.tmdb.org/t/p/w185${actor.profile_path}"
                                alt="${actor.name}"
                                onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23373b69%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22white%22>No Image</text></svg>'">
                            <div class="cast-name">${actor.name}</div>
                            <div class="cast-character">${actor.character}</div>
                        </div>
                    `).join('');
                
                movieDetails.innerHTML = `
                    <h2>${details.title}</h2>
                    <p><strong>Release Date:</strong> ${details.release_date}</p>
                    <p><strong>Director:</strong> ${details.director}</p>
                    <p><strong>Rating:</strong> ${details.vote_average?.toFixed(1) || 'N/A'} ⭐</p>
                    <p><strong>Overview:</strong></p>
                    <p>${details.overview}</p>
                    <h3>Cast</h3>
                    <div class="cast-container">
                        ${castHTML}
                    </div>
                    <div style="text-align: center; margin-top: 20px;">
                        ${details.trailer ?
                            `<a href="${details.trailer}" target="_blank" class="trailer-link">Watch Trailer</a>`
                            : '<p>No trailer available</p>'}
                    </div>
                `;
                movieDetails.classList.add('active');
                overlay.classList.add('active');
            }
        });
        
        container.appendChild(movieElement);
    });
}

async function handleSearch(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) {
        defaultContent.style.display = 'block';
        searchResults.style.display = 'none';
        searchResultsTitle.style.display = 'none';
        return;
    }
    
    const aiResult = await getAIMovieSuggestions(searchTerm);
    let results = [];
    
    switch (aiResult.type) {
        case 'language':
            if (languages[aiResult.value] || aiResult.value === 'south' || aiResult.value === 'indian') {
                results = await searchByLanguage(aiResult.value);
                searchResultsTitle.textContent = `${aiResult.value.charAt(0).toUpperCase() + aiResult.value.slice(1)} Movies`;
            }
            break;
        case 'genre':
            if (genres[aiResult.value]) {
                results = await searchByGenre(aiResult.value);
                searchResultsTitle.textContent = `${aiResult.value.charAt(0).toUpperCase() + aiResult.value.slice(1)} Movies`;
            }
            break;
        case 'person':
            const persons = await searchPerson(aiResult.value);
            if (persons.length > 0) {
                const details = await getPersonDetails(persons[0].id);
                if (details && details.movies) {
                    results = details.movies;
                    searchResultsTitle.textContent = `Movies featuring ${details.name}`;
                }
            }
            break;
        case 'movies':
            for (let movieTitle of aiResult.value) {
                const movieResults = await searchMovies(movieTitle);
                results = results.concat(movieResults);
            }
            searchResultsTitle.textContent = 'Search Results';
            break;
        default:
            const guessedLanguage = await guessLanguage(searchTerm);
            if (guessedLanguage) {
                results = await searchByLanguage(guessedLanguage);
                searchResultsTitle.textContent = `${guessedLanguage.charAt(0).toUpperCase() + guessedLanguage.slice(1)} Movies`;
            } else {
                results = await searchMovies(searchTerm);
                searchResultsTitle.textContent = 'Search Results';
            }
    }
    
    defaultContent.style.display = 'none';
    searchResults.style.display = 'block';
    searchResultsTitle.style.display = 'block';
    
    if (results.length === 0) {
        moviesContainer.innerHTML = '<p>No movies found. We are working on adding more movies. Please try searching for something else!</p>';
    } else {
        displayMovies(results, moviesContainer);
    }
}
// Handle Lanugae Search(Guessing Language using Gemini )
async function guessLanguage(query) {
    const languageGuesses = Object.keys(languages);
    for (const lang of languageGuesses) {
        if (query.toLowerCase().includes(lang)) {
            return lang;
        }
    }
    return null;
}
// Home Page Initialize the page with trending and award-winning movies
 
async function initializePage() {
    try {
        const [trending, awardWinning] = await Promise.all([
            getTrendingMovies(),
            getOscarWinningMovies()
        ]);
        displayMovies(trending, trendingMovies);
        displayMovies(awardWinning, oscarMovies);
        searchResults.style.display = 'none';
        searchResultsTitle.style.display = 'none';
    } catch (error) {
        console.error('Initialization Error:', error);
    }
}

// Event Listeners for user interactions
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        handleSearch(e.target.value.trim());
    }, 500);
});

searchInput.addEventListener('keyup', (e) => {
    if (e.target.value === '') {
        defaultContent.style.display = 'block';
        searchResults.style.display = 'none';
        searchResultsTitle.style.display = 'none';
    }
});

overlay.addEventListener('click', () => {
    movieDetails.classList.remove('active');
    overlay.classList.remove('active');
});

// Initialize the page
document.addEventListener('DOMContentLoaded', initializePage);
