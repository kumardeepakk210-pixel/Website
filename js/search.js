/* ============================================
   WISHRITE — SEARCH
   Enhanced search with predictive results
   ============================================ */

let searchTimeout = null;

function openSearch() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => input && input.focus(), 100);
    }
}

function closeSearch() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function handleSearchInput(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        renderSearchResults(query);
    }, 200);
}

function renderSearchResults(query) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!query || query.length < 2) {
        container.innerHTML = renderPopularSearches();
        return;
    }

    const lowerQuery = query.toLowerCase();

    // Search across multiple fields
    const productResults = productsDB.filter(p =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.category.toLowerCase().includes(lowerQuery) ||
        p.jewelleryType.toLowerCase().includes(lowerQuery) ||
        (p.collection && p.collection.toLowerCase().includes(lowerQuery)) ||
        (p.sku && p.sku.toLowerCase().includes(lowerQuery)) ||
        (p.seoKeywords && p.seoKeywords.some(k => k.toLowerCase().includes(lowerQuery)))
    );

    // Category matches
    const categoryMatches = getCategories().filter(c => c.toLowerCase().includes(lowerQuery));

    // Collection matches
    const collectionMatches = getCollections().filter(c => c.toLowerCase().includes(lowerQuery));

    let html = '';

    if (categoryMatches.length) {
        html += `
            <div class="search-results-section">
                <h3 class="search-results-title">Categories</h3>
                ${categoryMatches.map(c => `
                    <div class="search-result-item" onclick="searchByCategory('${c}')">
                        <div class="search-result-info">
                            <h4>${c}</h4>
                            <span>Browse all ${c.toLowerCase()}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (collectionMatches.length) {
        html += `
            <div class="search-results-section">
                <h3 class="search-results-title">Collections</h3>
                ${collectionMatches.map(c => `
                    <div class="search-result-item" onclick="searchByCollection('${c}')">
                        <div class="search-result-info">
                            <h4>${c}</h4>
                            <span>Explore collection</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (productResults.length) {
        html += `
            <div class="search-results-section">
                <h3 class="search-results-title">Products</h3>
                ${productResults.map(p => `
                    <div class="search-result-item" onclick="closeSearch(); navigateTo('product', '${p.slug}')">
                        <img class="search-result-image" src="${p.image}" alt="${p.name}" loading="lazy" width="56" height="56">
                        <div class="search-result-info">
                            <h4>${p.name}</h4>
                            <span>${formatPrice(p.sellingPrice)} · ${p.material}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (!html) {
        html = `<p style="color:var(--wr-text-muted);text-align:center;padding:var(--space-8) 0;">No results found for "${query}"</p>`;
    }

    container.innerHTML = html;
}

function renderPopularSearches() {
    const popular = ['Earrings', 'Rings', 'Necklaces', 'Bracelets', 'Gift Sets', 'Sterling Silver'];
    return `
        <div class="search-results-section">
            <h3 class="search-results-title">Popular Searches</h3>
            ${popular.map(term => `
                <div class="search-result-item" onclick="document.getElementById('search-input').value='${term}'; handleSearchInput('${term}')">
                    <div class="search-result-info">
                        <h4>${term}</h4>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function searchByCategory(category) {
    closeSearch();
    navigateTo('shop');
    setTimeout(() => {
        currentFilters.category = category;
        applyFiltersAndSort();
        document.getElementById('shop-title').textContent = category;
    }, 50);
}

function searchByCollection(collection) {
    closeSearch();
    navigateTo('shop');
    setTimeout(() => {
        currentFilters.collection = collection;
        applyFiltersAndSort();
        document.getElementById('shop-title').textContent = collection + ' Collection';
    }, 50);
}

// Close search on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSearch();
        closeImageViewer();
        closeMobileMenu();
    }
});
