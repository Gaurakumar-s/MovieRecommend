# MovieRecommend - Chanachur Talkies

## Project Overview
A web-based movie search platform that leverages Google's Gemini AI to provide intelligent search capabilities. Users can search for movies using natural language queries, including movie titles, actor names, genres, and languages. The platform provides comprehensive movie information, including cast details, trailers, and ratings.

## Project Objectives
1. Create an intuitive movie search platform using HTML, CSS, and JavaScript
2. Integrate Two APIs (TMDB and Google Gemini) for enhanced functionality
3. Implement AI-powered natural language processing for search
4. Display real-time movie data with interactive visualizations

## Technologies Used
- **Frontend**:HTML, CSS, JavaScript
- **API Integration**: 
  - TMDB API for movie data
  - Google Gemini API for natural language processing and data sorting
- **Additional**: 
  - Custom CSS animations
  - Responsive design principles
  - Modal-based interactions

## Key Features
1. **AI-Powered Search**
   - Natural language query processing
   - Multi-category search (titles, actors, genres, languages)
   - Real-time search suggestions
   - Language detection for regional Cinema

2. **Movie Information Display**
   - Interactive movie cards
   - Detailed modal views
   - Cast information with photos
   - Trailer integration with YouTube

3. **User Interface**
   - Dark theme design
   - Responsive grid layout
   - Hover effects and animations
   - Mobile-friendly interface

## Implementation Details
### AI Search Integration
```javascript
async function getAIMovieSuggestions(query) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `Analyze this search query: "${query}"...`
                }]
            }]
        })
    });
    // Process and categorize search results
}
```

### Movie Data Display
```javascript
function displayMovies(movies, container, personName = '') {
    container.innerHTML = '';
    const sortedMovies = movies
        .filter(movie => movie.poster_path)
        .sort((a, b) => b.popularity - a.popularity);
    
    sortedMovies.forEach(movie => {
        const movieElement = document.createElement('div');
        movieElement.classList.add('movie');
        // Create and populate movie cards
    });
}
```

## Learning Outcomes
1. **API Integration**: Learned to integrate and handle responses from AI APIs
2. **Web Development**: Implemented responsive design principles and modern CSS features
3. **AI Implementation**: Learned to integrate AI services for natural language processing
4.  **Error Handling**: Developed robust error handling for API failures and edge cases
5.  **Performance Optimization**: Managed efficient loading and display of movie data
6.  **User Experience**: Created intuitive interfaces with smooth transitions and animations


## Future Enhancements
1. User reviews and ratings system
2. Advanced filtering options

## Challenges Faced
1. **API Coordination**: 
   - Managing multiple API calls efficiently
   - Handling rate limits and API failures
   - Synchronizing data from different sources
   - Responsive Design: Making the dashboard work across different screen sizes

2. **Search Intelligence**:
   - Implementing accurate language detection
   - Handling ambiguous search queries
   - Optimizing search response time

3. **User Interface**:
   - Implementing smooth transitions
   - Handling modal interactions effectively

## Screenshots
<img width="1440" alt="image" src="https://github.com/user-attachments/assets/957d2b3a-eb1d-43a3-bc40-a9f547fb93c3" />
<img width="1437" alt="image" src="https://github.com/user-attachments/assets/d6873c5d-36d8-47fd-aabf-98365f5ab6b1" />
<img width="1439" alt="image" src="https://github.com/user-attachments/assets/b6b1bcf6-27d9-48ff-9e5b-2d1ee5fca69a" />
<img width="1436" alt="image" src="https://github.com/user-attachments/assets/2b7b7148-6f59-4839-baa1-7e7df9f051e5" />
<img width="1437" alt="image" src="https://github.com/user-attachments/assets/e6f7186f-e7c6-48c0-8b54-77e55b5f1e1c" />





