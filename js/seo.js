/* ============================================
   WISHRITE — SEO & STRUCTURED DATA
   Dynamic OpenGraph, meta tags, schema.org/Product & Breadcrumbs
   ============================================ */

function updateSEO(config) {
    // Title
    if (config.title) {
        document.title = config.title;
    }

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
    }
    if (config.description) {
        metaDesc.content = config.description;
    }

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
    }
    if (config.canonical) {
        canonical.href = config.canonical;
    }

    // Meta keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.name = 'keywords';
        document.head.appendChild(metaKeywords);
    }
    if (config.keywords) {
        metaKeywords.content = Array.isArray(config.keywords) ? config.keywords.join(', ') : config.keywords;
    }

    // Remove old structured data
    document.querySelectorAll('script[data-wr-schema]').forEach(s => {
        if (typeof s.remove === 'function') s.remove();
        else if (s.parentNode) s.parentNode.removeChild(s);
    });

    // Add structured data
    if (config.schema) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-wr-schema', 'true');
        script.textContent = JSON.stringify(config.schema);
        document.head.appendChild(script);
    }
}

function setHomeSEO() {
    updateSEO({
        title: 'WishRite | Premium 925 Sterling Silver Jewellery',
        description: 'Discover thoughtfully designed 925 sterling silver jewellery at WishRite. Earrings, necklaces, rings, bracelets and chains — crafted for everyday elegance.',
        keywords: ['925 sterling silver jewellery', 'silver earrings', 'silver necklaces', 'silver rings', 'silver chains', 'WishRite jewellery'],
        canonical: window.location.origin + '/',
        schema: {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "WishRite",
            "description": "Premium 925 Sterling Silver Jewellery",
            "url": window.location.origin,
            "logo": window.location.origin + "/logo.png"
        }
    });
}

function setProductSEO(product) {
    if (!product) return;

    const images = Array.isArray(product.images) && product.images.length > 0 
        ? product.images.map(img => img.url).filter(Boolean)
        : [product.image || ''];

    const canonicalUrl = `${window.location.origin}/product/${product.slug || product.id}`;
    const isInStock = (product.stockQuantity || 0) > 0;

    const schema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "description": product.shortDescription || product.description || `${product.name} in 925 sterling silver`,
        "image": images,
        "sku": product.sku || product.code || '',
        "brand": {
            "@type": "Brand",
            "name": "WishRite"
        },
        "offers": {
            "@type": "Offer",
            "price": product.sellingPrice,
            "priceCurrency": "INR",
            "availability": isInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "url": canonicalUrl
        }
    };

    if (product.mrp > product.sellingPrice) {
        schema.offers.priceSpecification = {
            "@type": "PriceSpecification",
            "price": product.sellingPrice,
            "priceCurrency": "INR"
        };
    }

    const pageTitle = product.seoTitle || `${product.name} | 925 Sterling Silver | WishRite`;
    const pageDescription = product.seoDescription || `Buy ${product.name} at WishRite. 925 Sterling Silver, ${product.silverPurity || '92.5%'} purity, hallmarked jewellery. Price: ₹${product.sellingPrice}. Complimentary insured express delivery.`;

    updateSEO({
        title: pageTitle,
        description: pageDescription,
        keywords: [product.category, '925 sterling silver', product.name, 'WishRite silver'],
        canonical: canonicalUrl,
        schema: schema
    });

    // Add BreadcrumbList schema
    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": window.location.origin + '/' },
            { "@type": "ListItem", "position": 2, "name": product.category || 'Jewellery', "item": window.location.origin + '/shop' },
            { "@type": "ListItem", "position": 3, "name": product.name, "item": canonicalUrl }
        ]
    };

    const bcScript = document.createElement('script');
    bcScript.type = 'application/ld+json';
    bcScript.setAttribute('data-wr-schema', 'true');
    bcScript.textContent = JSON.stringify(breadcrumbSchema);
    document.head.appendChild(bcScript);
}

function getSiteOrigin() {
    return (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'https://www.wishrite.in';
}

function setShopSEO(category) {
    const title = category && category !== 'All'
        ? `${category} | 925 Sterling Silver | WishRite`
        : 'Shop All Jewellery | 925 Sterling Silver | WishRite';

    updateSEO({
        title: title,
        description: `Browse our collection of ${category && category !== 'All' ? category.toLowerCase() : 'premium jewellery'} in 925 sterling silver. Thoughtfully designed for everyday elegance.`,
        keywords: ['925 sterling silver', 'silver jewellery', category || ''].filter(Boolean),
        canonical: getSiteOrigin() + '/shop'
    });
}

function setAboutSEO() {
    updateSEO({
        title: 'About WishRite | Our Story | Premium Silver Jewellery',
        description: 'Discover WishRite — a premium jewellery brand specialising in thoughtfully designed 925 sterling silver pieces for everyday elegance and meaningful moments.',
        keywords: ['about WishRite', 'silver jewellery brand', '925 sterling silver', 'premium Indian jewellery'],
        canonical: getSiteOrigin() + '/about'
    });
}

function setCollectionsSEO() {
    updateSEO({
        title: 'Curated Silver Collections | WishRite 925 Sterling Silver',
        description: 'Explore WishRite curated silver jewellery collections: 925 Silver Signature Collection, Daily Elegance, The Occasion & Evening Edit, and Modern Solitaires.',
        keywords: ['silver collections', '925 sterling silver collections', 'curated silver jewellery', 'WishRite collections'],
        canonical: getSiteOrigin() + '/collections'
    });
}

function setCollectionDetailSEO(collection) {
    if (!collection) return;
    updateSEO({
        title: `${collection.name} | Curated Silver Jewellery | WishRite`,
        description: collection.description || `Discover the ${collection.name} at WishRite. Handcrafted in hallmarked 925 sterling silver with luminous elegance.`,
        keywords: [collection.name, '925 sterling silver collection', 'WishRite collection', 'silver jewellery India'],
        canonical: `${getSiteOrigin()}/collections/${collection.slug}`
    });
}

function setNewArrivalsSEO() {
    updateSEO({
        title: 'New Arrivals | Latest 925 Sterling Silver Jewellery | WishRite',
        description: 'Discover the latest additions to WishRite. Freshly designed 925 hallmarked sterling silver earrings, rings, necklaces, and bracelets.',
        keywords: ['new arrivals silver jewellery', 'latest silver designs', 'new 925 sterling silver', 'WishRite new arrivals'],
        canonical: getSiteOrigin() + '/new-arrivals'
    });
}

function setBestSellersSEO() {
    updateSEO({
        title: 'Best Sellers | Most Loved 925 Sterling Silver Jewellery | WishRite',
        description: 'Discover the pieces our customers love. WishRite most popular 925 sterling silver jewellery, crafted for timeless elegance.',
        keywords: ['best sellers silver jewellery', 'popular silver jewellery', 'top selling 925 silver', 'WishRite bestsellers'],
        canonical: getSiteOrigin() + '/best-sellers'
    });
}

function setOccasionSEO() {
    const activeOccasion = typeof window.getActiveOccasion === 'function' ? window.getActiveOccasion() : null;
    const title = activeOccasion?.seoTitle || `${activeOccasion?.name || 'Festive'} Collection | Sarees & Silver Jewellery | WishRite`;
    const description = activeOccasion?.seoDescription || `Discover WishRite's ${activeOccasion?.name || 'Festive'} collection featuring sarees, artificial jewellery and 925 sterling silver pairings.`;
    const keywords = activeOccasion?.seoKeywords || ['festive collection', 'sarees', 'silver jewellery', 'WishRite'];

    updateSEO({
        title: title,
        description: description,
        keywords: keywords,
        canonical: getSiteOrigin() + '/occasion',
        schema: {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": title,
            "description": description,
            "url": getSiteOrigin() + '/occasion',
            "brand": {
                "@type": "Brand",
                "name": "WishRite"
            }
        }
    });
}

window.setCollectionsSEO = setCollectionsSEO;
window.setCollectionDetailSEO = setCollectionDetailSEO;
window.setNewArrivalsSEO = setNewArrivalsSEO;
window.setBestSellersSEO = setBestSellersSEO;
window.setOccasionSEO = setOccasionSEO;


