/* ============================================
   WISHRITE — PRODUCTS
   Enhanced product database + rendering
   ============================================ */

// Enhanced product data with full jewellery fields
const productsDB = [
    {
        id: 1,
        name: "Petal Drop Earrings",
        slug: "petal-drop-earrings",
        code: "WR-ED-001",
        sku: "WRED001",
        category: "Earrings",
        subcategory: "Drop Earrings",
        collection: "Floral Edit",
        shortDescription: "Delicate petal-inspired drop earrings crafted in 925 sterling silver with a soft polished finish.",
        description: "These Petal Drop Earrings capture the grace of nature in 925 sterling silver. The design draws inspiration from softly unfurling petals, creating a refined silhouette that moves beautifully. Lightweight and comfortable for all-day wear, these earrings transition effortlessly from daytime to evening. A thoughtful choice for those who appreciate understated elegance.",
        mrp: 2999,
        sellingPrice: 2499,
        salePrice: null,
        discount: 17,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Earrings",
        gender: "Women",
        occasion: ["Everyday", "Office", "Gifting"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Floral",
        stockQuantity: 15,
        availability: "In Stock",
        lowStock: false,
        whatsIncluded: "1 pair of earrings, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Petal Drop Earrings | 925 Sterling Silver | WishRite",
        metaDescription: "Shop the Petal Drop Earrings in 925 sterling silver. Delicate floral-inspired design perfect for everyday elegance. Free shipping above ₹2,999.",
        seoKeywords: ["925 sterling silver earrings", "silver drop earrings", "floral earrings", "premium silver jewellery"],
        images: [
            { url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=85", alt: "WishRite petal drop earrings in 925 sterling silver", type: "main" },
            { url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=80", alt: "Petal drop earrings close-up detail", type: "detail" }
        ],
        tag: "BESTSELLER",
        isBestseller: true,
        isNew: false,
        image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 2,
        name: "Luna Pendant Necklace",
        slug: "luna-pendant-necklace",
        code: "WR-NP-002",
        sku: "WRNP002",
        category: "Necklaces",
        subcategory: "Pendant Necklaces",
        collection: "Celestial",
        shortDescription: "A crescent moon pendant in 925 sterling silver on a delicate chain — celestial elegance for everyday.",
        description: "The Luna Pendant Necklace is a celebration of celestial beauty. Crafted in 925 sterling silver, its crescent design catches the light at every angle, making it a versatile piece that complements both casual and dressed-up looks. The adjustable chain ensures a comfortable fit, while the polished finish adds a refined glow.",
        mrp: 3499,
        sellingPrice: 2999,
        salePrice: null,
        discount: 14,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Necklace",
        gender: "Women",
        occasion: ["Everyday", "Date Night", "Gifting"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Celestial",
        stockQuantity: 20,
        availability: "In Stock",
        lowStock: false,
        whatsIncluded: "1 pendant necklace, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Luna Pendant Necklace | 925 Sterling Silver | WishRite",
        metaDescription: "Discover the Luna Pendant Necklace in 925 sterling silver. Celestial crescent design for timeless everyday elegance.",
        seoKeywords: ["silver pendant necklace", "moon pendant", "925 sterling silver necklace", "celestial jewellery"],
        images: [
            { url: "https://images.unsplash.com/photo-1599643478514-4a4e0f6c2dc1?auto=format&fit=crop&w=800&q=85", alt: "WishRite Luna pendant necklace in 925 sterling silver", type: "main" },
            { url: "https://images.unsplash.com/photo-1599643478514-4a4e0f6c2dc1?auto=format&fit=crop&w=600&q=80", alt: "Luna pendant necklace detail view", type: "detail" }
        ],
        tag: "NEW",
        isBestseller: true,
        isNew: true,
        image: "https://images.unsplash.com/photo-1599643478514-4a4e0f6c2dc1?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 3,
        name: "Eternal Band Ring",
        slug: "eternal-band-ring",
        code: "WR-RG-003",
        sku: "WRRG003",
        category: "Rings",
        subcategory: "Band Rings",
        collection: "Everyday Essentials",
        shortDescription: "A sleek minimalist band ring in 925 sterling silver, designed for effortless everyday styling.",
        description: "The Eternal Band Ring is a timeless essential. Its clean, minimalist design in 925 sterling silver makes it perfect for stacking or wearing on its own. The smooth polished finish and comfortable fit make this ring an everyday favourite that complements any style.",
        mrp: 2299,
        sellingPrice: 1999,
        salePrice: null,
        discount: 13,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Ring",
        gender: "Unisex",
        occasion: ["Everyday", "Office"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Minimalist",
        stockQuantity: 30,
        availability: "In Stock",
        lowStock: false,
        whatsIncluded: "1 ring, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Eternal Band Ring | 925 Sterling Silver | WishRite",
        metaDescription: "Shop the Eternal Band Ring in 925 sterling silver. A minimalist design perfect for everyday elegance.",
        seoKeywords: ["silver band ring", "925 sterling silver ring", "minimalist ring", "everyday silver ring"],
        images: [
            { url: "https://images.unsplash.com/photo-1605100804763-247f67b2548e?auto=format&fit=crop&w=800&q=85", alt: "WishRite eternal band ring in 925 sterling silver", type: "main" }
        ],
        tag: "",
        isBestseller: true,
        isNew: false,
        image: "https://images.unsplash.com/photo-1605100804763-247f67b2548e?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 4,
        name: "Bloom Chain Bracelet",
        slug: "bloom-chain-bracelet",
        code: "WR-BR-004",
        sku: "WRBR004",
        category: "Bracelets",
        subcategory: "Chain Bracelets",
        collection: "Floral Edit",
        shortDescription: "A delicate chain bracelet in 925 sterling silver with a floral charm detail.",
        description: "The Bloom Chain Bracelet brings together the softness of floral design with the strength of 925 sterling silver. A fine chain links to a beautifully crafted bloom charm, creating a piece that feels both delicate and considered. Wear it alone for understated elegance or layer with other bracelets for a curated look.",
        mrp: 2699,
        sellingPrice: 2299,
        salePrice: null,
        discount: 15,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Bracelet",
        gender: "Women",
        occasion: ["Everyday", "Date Night", "Gifting"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Floral",
        stockQuantity: 12,
        availability: "In Stock",
        lowStock: false,
        whatsIncluded: "1 bracelet, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Bloom Chain Bracelet | 925 Sterling Silver | WishRite",
        metaDescription: "Discover the Bloom Chain Bracelet in 925 sterling silver. A delicate floral chain bracelet for modern everyday wear.",
        seoKeywords: ["silver bracelet", "925 sterling silver bracelet", "chain bracelet", "floral bracelet"],
        images: [
            { url: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=85", alt: "WishRite bloom chain bracelet in 925 sterling silver", type: "main" }
        ],
        tag: "",
        isBestseller: true,
        isNew: false,
        image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 5,
        name: "Radiance Silver Anklet",
        slug: "radiance-silver-anklet",
        code: "WR-AK-005",
        sku: "WRAK005",
        category: "Anklets",
        subcategory: "Chain Anklets",
        collection: "Everyday Essentials",
        shortDescription: "A fine 925 sterling silver anklet with a polished chain that catches the light beautifully.",
        description: "The Radiance Silver Anklet is crafted for those who appreciate the finer details. This 925 sterling silver anklet features a fine chain that sits gracefully on the ankle, catching the light with every step. A subtle yet striking addition to your everyday jewellery collection.",
        mrp: 2199,
        sellingPrice: 1899,
        salePrice: null,
        discount: 14,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Anklet",
        gender: "Women",
        occasion: ["Everyday", "Festive"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Minimalist",
        stockQuantity: 8,
        availability: "In Stock",
        lowStock: true,
        whatsIncluded: "1 anklet, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Radiance Silver Anklet | 925 Sterling Silver | WishRite",
        metaDescription: "Shop the Radiance Silver Anklet in 925 sterling silver. A fine chain anklet designed for everyday radiance.",
        seoKeywords: ["silver anklet", "925 sterling silver anklet", "fine chain anklet", "women's silver anklet"],
        images: [
            { url: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=85", alt: "WishRite radiance silver anklet in 925 sterling silver", type: "main" }
        ],
        tag: "",
        isBestseller: false,
        isNew: true,
        image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 6,
        name: "Onyx Signet Ring",
        slug: "onyx-signet-ring",
        code: "WR-RG-006",
        sku: "WRRG006",
        category: "Rings",
        subcategory: "Signet Rings",
        collection: "Heritage",
        shortDescription: "A bold signet ring in 925 sterling silver with a matte-polished finish. Designed for everyday wear.",
        description: "The Onyx Signet Ring combines heritage design sensibility with modern craftsmanship. Crafted in 925 sterling silver with a distinctive matte-polished finish, this ring is designed for those who appreciate bold, considered jewellery. Wear it as a statement piece or pair it with other rings from the collection.",
        mrp: 3199,
        sellingPrice: 2799,
        salePrice: null,
        discount: 13,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Ring",
        gender: "Men",
        occasion: ["Everyday", "Office"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Matte-Polished",
        plating: "",
        designStyle: "Heritage",
        stockQuantity: 10,
        availability: "In Stock",
        lowStock: false,
        whatsIncluded: "1 ring, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Onyx Signet Ring | 925 Sterling Silver | WishRite",
        metaDescription: "Discover the Onyx Signet Ring in 925 sterling silver. A bold signet design with matte-polished finish for men.",
        seoKeywords: ["men's silver ring", "925 sterling silver signet ring", "silver ring for men", "premium men's ring"],
        images: [
            { url: "https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?auto=format&fit=crop&w=800&q=85", alt: "WishRite onyx signet ring in 925 sterling silver", type: "main" }
        ],
        tag: "",
        isBestseller: false,
        isNew: false,
        image: "https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 7,
        name: "Heritage Silver Gift Set",
        slug: "heritage-silver-gift-set",
        code: "WR-GS-007",
        sku: "WRGS007",
        category: "Gift Sets",
        subcategory: "Jewellery Sets",
        collection: "Heritage",
        shortDescription: "A curated gift set featuring complementary 925 sterling silver pieces in premium branded packaging.",
        description: "The Heritage Silver Gift Set is designed for those moments that call for something truly special. This thoughtfully curated set features complementary pieces in 925 sterling silver, presented in premium branded packaging. Whether for a birthday, anniversary, or any occasion worth celebrating, this set makes gifting effortless and memorable.",
        mrp: 6499,
        sellingPrice: 5499,
        salePrice: null,
        discount: 15,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Gift Set",
        gender: "Women",
        occasion: ["Gifting", "Special Occasions", "Festive"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Heritage",
        stockQuantity: 5,
        availability: "In Stock",
        lowStock: true,
        whatsIncluded: "Jewellery set, premium branded gift box",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Heritage Silver Gift Set | 925 Sterling Silver | WishRite",
        metaDescription: "Shop the Heritage Silver Gift Set. Curated 925 sterling silver pieces in premium gift packaging for special occasions.",
        seoKeywords: ["silver gift set", "925 sterling silver set", "jewellery gift", "premium silver gift"],
        images: [
            { url: "https://images.unsplash.com/photo-1549439602-43ebca2327af?auto=format&fit=crop&w=800&q=85", alt: "WishRite heritage silver gift set in premium packaging", type: "main" }
        ],
        tag: "GIFT SET",
        isBestseller: false,
        isNew: false,
        image: "https://images.unsplash.com/photo-1549439602-43ebca2327af?auto=format&fit=crop&w=800&q=85"
    },
    {
        id: 8,
        name: "Solitaire Stacking Ring",
        slug: "solitaire-stacking-ring",
        code: "WR-RG-008",
        sku: "WRRG008",
        category: "Rings",
        subcategory: "Stacking Rings",
        collection: "Everyday Essentials",
        shortDescription: "A fine 925 sterling silver stacking ring with a delicate solitaire-style setting.",
        description: "The Solitaire Stacking Ring is designed for those who love to layer. This fine 925 sterling silver ring features a delicate solitaire-style setting that adds just the right amount of sparkle. Stack multiples for a curated look, or wear it alone as a subtle everyday accent.",
        mrp: 1799,
        sellingPrice: 1499,
        salePrice: null,
        discount: 17,
        tax: 3,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Ring",
        gender: "Women",
        occasion: ["Everyday", "Office", "Gifting"],
        weight: "",
        dimensions: "",
        size: "",
        stoneType: "",
        stoneColour: "",
        finish: "Polished",
        plating: "",
        designStyle: "Minimalist",
        stockQuantity: 25,
        availability: "In Stock",
        lowStock: false,
        whatsIncluded: "1 ring, branded packaging",
        care: "Store in a dry place. Avoid contact with perfumes and chemicals. Clean gently with a soft cloth.",
        shippingInfo: "Standard delivery within 5-7 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        seoTitle: "Solitaire Stacking Ring | 925 Sterling Silver | WishRite",
        metaDescription: "Discover the Solitaire Stacking Ring in 925 sterling silver. Perfect for layering or wearing solo for everyday elegance.",
        seoKeywords: ["silver stacking ring", "925 sterling silver ring", "solitaire ring", "stackable ring"],
        images: [
            { url: "https://images.unsplash.com/photo-1605100804763-247f67b2548e?auto=format&fit=crop&w=800&q=85", alt: "WishRite solitaire stacking ring in 925 sterling silver", type: "main" }
        ],
        tag: "",
        isBestseller: false,
        isNew: true,
        image: "https://images.unsplash.com/photo-1605100804763-247f67b2548e?auto=format&fit=crop&w=800&q=85"
    }
];

// SVG icons used in product cards
const ICONS = {
    heart: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    x: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/></svg>`,
    search: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round"/></svg>`,
    user: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg>`,
    bag: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    truck: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    gift: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
    diamond: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h12l4 6-10 13L2 9z" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 9h20" stroke-linecap="round"/><path d="M10 3l-4 6 6 13 6-13-4-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sparkle: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    rotate: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    package: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="6" x2="21" y2="6" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke-linecap="round"/></svg>`,
    filter: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    minus: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/></svg>`,
    arrowLeft: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><line x1="19" y1="12" x2="5" y2="12" stroke-linecap="round"/><polyline points="12 19 5 12 12 5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// Format price to INR
function formatPrice(price) {
    return '₹' + price.toLocaleString('en-IN');
}

// Create a product card HTML
function createProductCardHTML(product) {
    const isWishlisted = wishlist.has(product.id);
    const badgeClass = product.tag === 'NEW' ? 'badge-new' : (product.tag === 'SALE' ? 'badge-sale' : '');
    const badgeHTML = product.tag ? `<span class="product-card-badge ${badgeClass}">${product.tag}</span>` : '';
    const discountHTML = product.discount ? `<span class="price-discount">${product.discount}% OFF</span>` : '';
    const mrpHTML = product.mrp > product.sellingPrice ? `<span class="price-original">${formatPrice(product.mrp)}</span>` : '';

    return `
        <div class="product-card" onclick="navigateTo('product', '${product.slug}')">
            <div class="product-card-image">
                <img src="${product.image}" alt="${product.images?.[0]?.alt || product.name}" loading="lazy" width="400" height="500">
                ${badgeHTML}
                <button class="product-card-wishlist ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(${product.id}, event)" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">
                    ${ICONS.heart}
                </button>
                <button class="product-card-quick" onclick="addToCart(${product.id}, event)">Quick Add</button>
            </div>
            <div class="product-card-info">
                <h3 class="product-card-name">${product.name}</h3>
                <span class="product-card-material">${product.material || ''}</span>
                <div class="product-card-price">
                    <span class="price-current">${formatPrice(product.sellingPrice)}</span>
                    ${mrpHTML}
                    ${discountHTML}
                </div>
            </div>
        </div>
    `;
}

// Render products to a container
function renderProductsToContainer(products, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!products.length) {
        container.innerHTML = '<p class="cart-empty" style="grid-column:1/-1;">No products found.</p>';
        return;
    }
    container.innerHTML = products.map(createProductCardHTML).join('');
}

// Get a product by slug
function getProductBySlug(slug) {
    return productsDB.find(p => p.slug === slug);
}

// Get products by category
function getProductsByCategory(category) {
    if (!category || category === 'All') return productsDB;
    return productsDB.filter(p => p.category === category);
}

// Get unique categories
function getCategories() {
    return [...new Set(productsDB.map(p => p.category))];
}

// Get unique collections
function getCollections() {
    return [...new Set(productsDB.map(p => p.collection))];
}

// Render PDP
function renderProductDetail(product) {
    if (!product) return '';

    const imagesHTML = product.images.map((img, i) =>
        `<div class="pdp-thumbnail ${i === 0 ? 'active' : ''}" onclick="switchPdpImage(${i})" role="button" aria-label="View image ${i+1}">
            <img src="${img.url}" alt="${img.alt}" loading="lazy" width="72" height="72">
        </div>`
    ).join('');

    const mainImage = product.images[0];
    const features = [];
    if (product.material) features.push(product.material);
    if (product.finish) features.push(`${product.finish} Finish`);
    if (product.designStyle) features.push(`${product.designStyle} Design`);
    features.push('Gift Ready');

    const featuresHTML = features.map(f =>
        `<div class="feature-item">${ICONS.check}<span>${f}</span></div>`
    ).join('');

    const isWishlisted = wishlist.has(product.id);
    const mrpHTML = product.mrp > product.sellingPrice ? `<span class="pdp-price-original">${formatPrice(product.mrp)}</span>` : '';
    const discountHTML = product.discount ? `<span class="pdp-price-discount">${product.discount}% OFF</span>` : '';

    // Build accordion sections
    const accordionSections = [];
    if (product.description) {
        accordionSections.push({ title: 'Description', content: `<p>${product.description}</p>` });
    }
    const specsArr = [];
    if (product.material) specsArr.push(`<tr><td>Material</td><td>${product.material}</td></tr>`);
    if (product.silverPurity) specsArr.push(`<tr><td>Silver Purity</td><td>${product.silverPurity}</td></tr>`);
    if (product.jewelleryType) specsArr.push(`<tr><td>Type</td><td>${product.jewelleryType}</td></tr>`);
    if (product.gender) specsArr.push(`<tr><td>Gender</td><td>${product.gender}</td></tr>`);
    if (product.finish) specsArr.push(`<tr><td>Finish</td><td>${product.finish}</td></tr>`);
    if (product.designStyle) specsArr.push(`<tr><td>Design Style</td><td>${product.designStyle}</td></tr>`);
    if (product.weight) specsArr.push(`<tr><td>Weight</td><td>${product.weight}</td></tr>`);
    if (product.dimensions) specsArr.push(`<tr><td>Dimensions</td><td>${product.dimensions}</td></tr>`);
    if (product.size) specsArr.push(`<tr><td>Size</td><td>${product.size}</td></tr>`);
    if (product.stoneType) specsArr.push(`<tr><td>Stone Type</td><td>${product.stoneType}</td></tr>`);
    if (product.stoneColour) specsArr.push(`<tr><td>Stone Colour</td><td>${product.stoneColour}</td></tr>`);
    if (product.plating) specsArr.push(`<tr><td>Plating</td><td>${product.plating}</td></tr>`);
    if (specsArr.length) {
        accordionSections.push({ title: 'Specifications', content: `<table style="width:100%;font-size:var(--text-sm);border-collapse:collapse;">${specsArr.map(r => r).join('')}</table><style>.pdp-accordions table td{padding:8px 0;border-bottom:1px solid var(--wr-border-light);color:var(--wr-text-muted)}.pdp-accordions table td:first-child{font-weight:500;color:var(--wr-text);width:140px}</style>` });
    }
    if (product.care) {
        accordionSections.push({ title: 'Jewellery Care', content: `<p>${product.care}</p>` });
    }
    if (product.shippingInfo || product.returnInfo) {
        let shippingContent = '';
        if (product.shippingInfo) shippingContent += `<p>${product.shippingInfo}</p>`;
        if (product.returnInfo) shippingContent += `<p style="margin-top:var(--space-2)">${product.returnInfo}</p>`;
        accordionSections.push({ title: 'Shipping & Returns', content: shippingContent });
    }
    if (product.whatsIncluded) {
        accordionSections.push({ title: "What's Included", content: `<p>${product.whatsIncluded}</p>` });
    }

    const accordionsHTML = accordionSections.map(s =>
        `<div class="accordion-item">
            <button class="accordion-trigger" onclick="toggleAccordion(this)" aria-expanded="false">
                ${s.title}
                ${ICONS.chevronDown}
            </button>
            <div class="accordion-content">
                <div class="accordion-content-inner">${s.content}</div>
            </div>
        </div>`
    ).join('');

    // Related products
    const related = productsDB.filter(p => p.id !== product.id && p.category === product.category).slice(0, 4);
    const relatedAlt = related.length < 4 ? productsDB.filter(p => p.id !== product.id).slice(0, 4) : related;

    return `
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a onclick="navigateTo('home')">Home</a>
            <span class="separator">›</span>
            <a onclick="navigateTo('shop')">${product.category}</a>
            <span class="separator">›</span>
            <span class="current">${product.name}</span>
        </nav>

        <div class="pdp-layout">
            <div class="pdp-gallery" id="pdp-gallery">
                <div class="pdp-main-image" onclick="openImageViewer()" role="button" aria-label="Zoom image">
                    <img id="pdp-main-img" src="${mainImage.url}" alt="${mainImage.alt}" width="700" height="875">
                    <span class="image-counter" id="pdp-image-counter">1 / ${product.images.length}</span>
                </div>
                <div class="pdp-thumbnails" id="pdp-thumbnails">
                    ${imagesHTML}
                </div>
            </div>

            <div class="pdp-info">
                <h1 class="pdp-name">${product.name}</h1>
                <p class="pdp-material">${product.material}</p>
                <div class="pdp-price-block">
                    <span class="pdp-price">${formatPrice(product.sellingPrice)}</span>
                    ${mrpHTML}
                    ${discountHTML}
                </div>
                <p class="pdp-short-desc">${product.shortDescription}</p>
                <div class="pdp-features">
                    ${featuresHTML}
                </div>

                <div class="pdp-quantity">
                    <label>Quantity</label>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="updateQty(-1)" aria-label="Decrease quantity">−</button>
                        <span class="qty-value" id="pdp-qty">1</span>
                        <button class="qty-btn" onclick="updateQty(1)" aria-label="Increase quantity">+</button>
                    </div>
                </div>

                <div class="pdp-actions">
                    <button class="btn btn-primary btn-lg" onclick="addToCartFromPDP(${product.id})">Add to Cart</button>
                    <button class="pdp-wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(${product.id}, event)" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">
                        ${ICONS.heart}
                    </button>
                </div>

                <div class="pdp-trust">
                    <div class="pdp-trust-item">${ICONS.diamond}<span>925 Sterling Silver</span></div>
                    <div class="pdp-trust-item">${ICONS.shield}<span>Quality Assured</span></div>
                    <div class="pdp-trust-item">${ICONS.lock}<span>Secure Payment</span></div>
                    <div class="pdp-trust-item">${ICONS.gift}<span>Gift Ready</span></div>
                </div>

                <div class="pdp-accordions">
                    ${accordionsHTML}
                </div>
            </div>
        </div>

        ${relatedAlt.length ? `
        <section class="related-section">
            <div class="section-header">
                <span class="sub-label">You May Also Like</span>
                <h2>Complete the Look</h2>
            </div>
            <div class="product-grid">${relatedAlt.map(createProductCardHTML).join('')}</div>
        </section>
        ` : ''}
    `;
}

// PDP interactions
let currentPdpImageIndex = 0;
let currentPdpProduct = null;

function switchPdpImage(index) {
    if (!currentPdpProduct) return;
    currentPdpImageIndex = index;
    const mainImg = document.getElementById('pdp-main-img');
    const counter = document.getElementById('pdp-image-counter');
    const thumbs = document.querySelectorAll('.pdp-thumbnail');

    if (mainImg && currentPdpProduct.images[index]) {
        mainImg.src = currentPdpProduct.images[index].url;
        mainImg.alt = currentPdpProduct.images[index].alt;
    }
    if (counter) counter.textContent = `${index + 1} / ${currentPdpProduct.images.length}`;
    thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
}

let pdpQty = 1;
function updateQty(delta) {
    pdpQty = Math.max(1, pdpQty + delta);
    const el = document.getElementById('pdp-qty');
    if (el) el.textContent = pdpQty;
}

function addToCartFromPDP(id) {
    for (let i = 0; i < pdpQty; i++) {
        addToCart(id);
    }
    pdpQty = 1;
    const el = document.getElementById('pdp-qty');
    if (el) el.textContent = '1';
}

function openImageViewer() {
    if (!currentPdpProduct) return;
    const viewer = document.getElementById('image-viewer');
    const img = document.getElementById('viewer-img');
    if (viewer && img) {
        img.src = currentPdpProduct.images[currentPdpImageIndex].url;
        img.alt = currentPdpProduct.images[currentPdpImageIndex].alt;
        viewer.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeImageViewer() {
    const viewer = document.getElementById('image-viewer');
    if (viewer) {
        viewer.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function toggleAccordion(trigger) {
    const item = trigger.parentElement;
    const isOpen = item.classList.contains('open');
    item.classList.toggle('open');
    trigger.setAttribute('aria-expanded', !isOpen);
}
