/* ============================================
   WISHRITE — SEO
   Dynamic meta tags, structured data
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
        description: 'Discover thoughtfully designed 925 sterling silver jewellery at WishRite. Earrings, necklaces, rings, bracelets and more — crafted for everyday elegance.',
        keywords: ['925 sterling silver jewellery', 'silver earrings', 'silver necklaces', 'silver rings', 'premium silver jewellery', 'WishRite'],
        schema: {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "WishRite",
            "description": "Premium 925 Sterling Silver Jewellery and Fashion Jewellery",
            "url": window.location.origin,
            "logo": window.location.origin + "/logo.png"
        }
    });
}

function setProductSEO(product) {
    if (!product) return;

    const schema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "description": product.shortDescription || product.description,
        "image": product.images.map(img => img.url),
        "sku": product.sku,
        "brand": {
            "@type": "Brand",
            "name": "WishRite"
        },
        "offers": {
            "@type": "Offer",
            "price": product.sellingPrice,
            "priceCurrency": "INR",
            "availability": product.availability === 'In Stock' ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "url": window.location.href
        }
    };

    if (product.mrp > product.sellingPrice) {
        schema.offers.priceSpecification = {
            "@type": "PriceSpecification",
            "price": product.sellingPrice,
            "priceCurrency": "INR"
        };
    }

    updateSEO({
        title: product.seoTitle || `${product.name} | WishRite`,
        description: product.metaDescription || product.shortDescription,
        keywords: product.seoKeywords || [],
        schema: schema
    });

    // Add breadcrumb schema
    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": window.location.origin },
            { "@type": "ListItem", "position": 2, "name": product.category, "item": window.location.origin + '/shop' },
            { "@type": "ListItem", "position": 3, "name": product.name }
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
        keywords: ['925 sterling silver', 'silver jewellery', category || ''].filter(Boolean)
    });
}

function setAboutSEO() {
    updateSEO({
        title: 'About WishRite | Our Story | Premium Silver Jewellery',
        description: 'Discover WishRite — a premium jewellery brand specialising in thoughtfully designed 925 sterling silver pieces for everyday elegance and meaningful moments.',
        keywords: ['about WishRite', 'silver jewellery brand', '925 sterling silver', 'premium Indian jewellery']
    });
}
