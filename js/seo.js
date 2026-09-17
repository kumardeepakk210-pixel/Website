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
    document.querySelectorAll('script[data-wr-schema]').forEach(s => s.remove());

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

function setShopSEO(category) {
    const title = category && category !== 'All'
        ? `${category} | 925 Sterling Silver | WishRite`
        : 'Shop All Jewellery | 925 Sterling Silver | WishRite';

    updateSEO({
        title: title,
        description: `Browse our collection of ${category && category !== 'All' ? category.toLowerCase() : 'premium jewellery'} in 925 sterling silver. Thoughtfully designed for everyday elegance.`,
        keywords: ['925 sterling silver', 'silver jewellery', category || ''].filter(Boolean),
        canonical: window.location.origin + '/shop'
    });
}

function setAboutSEO() {
    updateSEO({
        title: 'About WishRite | Our Story | Premium Silver Jewellery',
        description: 'Discover WishRite — a premium jewellery brand specialising in thoughtfully designed 925 sterling silver pieces for everyday elegance and meaningful moments.',
        keywords: ['about WishRite', 'silver jewellery brand', '925 sterling silver', 'premium Indian jewellery'],
        canonical: window.location.origin + '/about'
    });
}

function setCollectionsSEO() {
    updateSEO({
        title: 'Curated Silver Collections | WishRite 925 Sterling Silver',
        description: 'Explore WishRite curated silver jewellery collections: 925 Silver Signature Collection, Daily Elegance, The Occasion & Evening Edit, and Modern Solitaires.',
        keywords: ['silver collections', '925 sterling silver collections', 'curated silver jewellery', 'WishRite collections'],
        canonical: window.location.origin + '/collections'
    });
}

