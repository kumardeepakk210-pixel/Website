/* ==============================================================================
   WISHRITE — FESTIVE OCCASION CONTROLLER & MATCHING ENGINE
   Handles /occasion page rendering, category tabs, product filtering,
   dynamic live countdown timer, festive live offers, and metadata-driven
   Saree-to-Silver pairing recommendations.
   Strictly follows single active festival architecture.
   ============================================================================== */

(function () {
    'use strict';

    let currentOccasionFilter = 'all';
    let countdownTimerId = null;

    /**
     * Curated sample/showcase catalog for active occasions.
     * Ensures the festive experience is immediately rich, beautiful and testable
     * even before new inventory rows are inserted in Supabase.
     */
    const SHOWCASE_OCCASION_PRODUCTS = {
        'durga-puja': [
            {
                id: 'saree-dp-001',
                productCode: 'SRE-DP01',
                sku: 'SRE-DP01',
                code: 'SRE-DP01',
                name: 'Crimson Red Banarasi Katan Silk Saree',
                slug: 'crimson-red-banarasi-katan-silk-saree',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 5899,
                price: 5899,
                mrp: 7999,
                discount: 26,
                stockQuantity: 5,
                isAvailable: true,
                color: 'Crimson Red',
                fabric: 'Pure Katan Silk',
                design: 'Banarasi Zari Kadwa Weave',
                pattern: 'Floral Jaal with Regal Meenakari',
                border_style: 'Intricate Gold Zari Temple Border',
                occasion: 'Durga Puja',
                occasion_slug: 'durga-puja',
                matching_tags: 'traditional, festive, red, gold, banarasi, puja, bridal, luxury',
                is_occasion_featured: true,
                description: 'A masterpiece crafted for Nabami evening. Lustrous crimson red pure Katan silk embellished with intricate antique gold zari kadwa motifs and opulent pallu.',
                shortDescription: 'Pure Katan silk Banarasi saree with rich antique gold zari weave.',
                images: [{ url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80', alt: 'Crimson Red Banarasi Silk Saree' }],
                image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80',
                material: 'Pure Silk & Zari',
                tag: 'FESTIVE'
            },
            {
                id: 'saree-dp-002',
                productCode: 'SRE-DP02',
                sku: 'SRE-DP02',
                code: 'SRE-DP02',
                name: 'Vintage Ivory & Red Lal-Par Garad Silk Saree',
                slug: 'vintage-ivory-red-lal-par-garad-silk-saree',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 4699,
                price: 4699,
                mrp: 5999,
                discount: 21,
                stockQuantity: 4,
                isAvailable: true,
                color: 'Ivory & Crimson Red',
                fabric: 'Tussar Garad Silk',
                design: 'Traditional Lal-Par Motif',
                pattern: 'Subtle Paisley Body with Zari Butis',
                border_style: 'Signature Bengali Vermilion Red Border',
                occasion: 'Durga Puja',
                occasion_slug: 'durga-puja',
                matching_tags: 'traditional, puja, ashtami, ivory, red, garad, silver-match, classic',
                is_occasion_featured: true,
                description: 'The quintessential Ashtami morning classic. Handwoven natural undyed tussar garad silk with a bold red vermilion border, woven for divine celebrations.',
                shortDescription: 'Classic Ashtami morning Lal-Par silk saree with fine gold accents.',
                images: [{ url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=700&q=80', alt: 'Ivory & Red Lal-Par Saree' }],
                image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=700&q=80',
                material: 'Garad Silk',
                tag: 'BESTSELLER'
            },
            {
                id: 'saree-dp-003',
                productCode: 'SRE-DP03',
                sku: 'SRE-DP03',
                code: 'SRE-DP03',
                name: 'Royal Emerald Green Jamdani Dhakai Saree',
                slug: 'royal-emerald-green-jamdani-dhakai-saree',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 3999,
                price: 3999,
                mrp: 5299,
                discount: 24,
                stockQuantity: 6,
                isAvailable: true,
                color: 'Emerald Green',
                fabric: 'Fine Cotton Silk Jamdani',
                design: 'Handcrafted Dhakai Weave',
                pattern: 'Panna Floral Jaal with Resham Flora',
                border_style: 'Scalloped Silver-Gold Resham Border',
                occasion: 'Durga Puja',
                occasion_slug: 'durga-puja',
                matching_tags: 'festive, green, jamdani, saptami, resham, traditional',
                is_occasion_featured: false,
                description: 'Loom-woven sheer cotton-silk Dhakai Jamdani in deep emerald green, enriched with delicate silver and golden resham geometric patterns.',
                shortDescription: 'Handwoven deep emerald Jamdani saree with fine resham florals.',
                images: [{ url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=700&q=80', alt: 'Emerald Green Jamdani Saree' }],
                image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=700&q=80',
                material: 'Cotton Silk',
                tag: 'NEW'
            },
            {
                id: 'art-dp-001',
                productCode: 'ART-DP01',
                sku: 'ART-DP01',
                code: 'ART-DP01',
                name: 'Kundan & Pearl Heritage Hasli Choker Set',
                slug: 'kundan-pearl-heritage-hasli-choker-set',
                catalog_type: 'artificial_jewellery',
                category: 'Artificial Jewellery',
                rawCategory: 'Artificial Jewellery',
                sellingPrice: 2499,
                price: 2499,
                mrp: 3499,
                discount: 28,
                stockQuantity: 8,
                isAvailable: true,
                color: 'Gold & Pearl',
                design: 'Antique Hasli Choker with Jhumkis',
                occasion: 'Durga Puja',
                occasion_slug: 'durga-puja',
                matching_tags: 'festive, kundan, choker, red, gold, puja, traditional',
                is_occasion_featured: true,
                description: 'Majestic festive hasli necklace adorned with hand-cut kundan stones, crimson hydro beads, and dangling freshwater pearl clusters.',
                shortDescription: 'Handcrafted festive kundan choker with matching statement earrings.',
                images: [{ url: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80', alt: 'Kundan Hasli Choker Set' }],
                image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80',
                material: 'Brass with 24K Micron Gold Polish',
                tag: 'FESTIVE'
            },
            {
                id: 'art-dp-002',
                productCode: 'ART-DP02',
                sku: 'ART-DP02',
                code: 'ART-DP02',
                name: 'Temple Goddess Lakshmi Kasu Mala Necklace',
                slug: 'temple-goddess-lakshmi-kasu-mala-necklace',
                catalog_type: 'artificial_jewellery',
                category: 'Artificial Jewellery',
                rawCategory: 'Artificial Jewellery',
                sellingPrice: 2199,
                price: 2199,
                mrp: 2999,
                discount: 26,
                stockQuantity: 7,
                isAvailable: true,
                color: 'Antique Matte Gold',
                design: 'Temple Motif Coin Chain',
                occasion: 'Durga Puja',
                occasion_slug: 'durga-puja',
                matching_tags: 'temple, antique, gold, red, saree-match, puja, festive',
                is_occasion_featured: false,
                description: 'Traditional temple jewellery long necklace featuring auspicious coin motifs embossed with divine craftsmanship in antique matte polish.',
                shortDescription: 'Regal antique gold finish temple kasu mala for festive draping.',
                images: [{ url: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80', alt: 'Temple Kasu Mala' }],
                image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80',
                material: 'Copper alloy in Antique Temple Gold Polish',
                tag: 'ANTIQUE'
            }
        ],

        'diwali': [
            {
                id: 'saree-dw-001',
                productCode: 'SRE-DW01',
                sku: 'SRE-DW01',
                code: 'SRE-DW01',
                name: 'Luminous Mustard Gold Zari Tissue Saree',
                slug: 'luminous-mustard-gold-zari-tissue-saree',
                catalog_type: 'saree',
                category: 'Sarees',
                sellingPrice: 4999,
                price: 4999,
                mrp: 6999,
                discount: 28,
                stockQuantity: 5,
                isAvailable: true,
                color: 'Mustard Gold',
                fabric: 'Metallic Tissue Silk',
                occasion_slug: 'diwali',
                matching_tags: 'diwali, gold, festive, tissue, light, luminous',
                is_occasion_featured: true,
                description: 'Gleaming metallic tissue silk saree woven for radiant Diwali nights and celebratory pujas.',
                images: [{ url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80', alt: 'Gold Tissue Saree' }],
                image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80',
                tag: 'DIWALI EDIT'
            }
        ],
        'kali-puja': [
            {
                id: 'saree-kp-001',
                productCode: 'SRE-KP01',
                sku: 'SRE-KP01',
                code: 'SRE-KP01',
                name: 'Midnight Blue Banarasi Katan Silk Saree',
                slug: 'midnight-blue-banarasi-katan-silk-saree',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 5999,
                price: 5999,
                mrp: 8499,
                discount: 29,
                stockQuantity: 5,
                isAvailable: true,
                color: 'Midnight Blue',
                fabric: 'Pure Katan Silk',
                design: 'Auspicious Silver & Gold Zari Weave',
                pattern: 'Floral Jaal with Regal Chandramukhi Motifs',
                border_style: 'Intricate Silver Zari Temple Border',
                occasion: 'Kali Puja',
                occasion_slug: 'kali-puja',
                matching_tags: 'traditional, festive, blue, silver, banarasi, puja, midnight, sacred',
                is_occasion_featured: true,
                description: 'Exquisite midnight blue pure Katan silk saree woven with fine silver and antique gold zari kadwa motifs for Kali Puja night celebrations.',
                shortDescription: 'Pure Katan silk Banarasi saree in divine midnight blue with silver zari weave.',
                images: [{ url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80', alt: 'Midnight Blue Banarasi Silk Saree' }],
                image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80',
                material: 'Pure Silk & Zari',
                tag: 'KALI PUJA EDIT'
            },
            {
                id: 'saree-kp-002',
                productCode: 'SRE-KP02',
                sku: 'SRE-KP02',
                code: 'SRE-KP02',
                name: 'Crimson Vermilion Tussar Silk Saree with Temple Border',
                slug: 'crimson-vermilion-tussar-silk-saree-temple-border',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 4899,
                price: 4899,
                mrp: 6499,
                discount: 24,
                stockQuantity: 4,
                isAvailable: true,
                color: 'Vermilion Red',
                fabric: 'Pure Tussar Silk',
                design: 'Traditional Bengali Temple Motif',
                pattern: 'Auspicious Kalash & Floral Boota',
                border_style: 'Signature Gold Zari Border',
                occasion: 'Kali Puja',
                occasion_slug: 'kali-puja',
                matching_tags: 'traditional, puja, red, vermilion, tussar, silver-match, classic',
                is_occasion_featured: true,
                description: 'Sacred vermilion crimson tussar silk draped for Maa Kali’s midnight rituals and devotional celebrations.',
                shortDescription: 'Rich vermilion red tussar silk saree with temple zari borders.',
                images: [{ url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=700&q=80', alt: 'Vermilion Red Tussar Silk Saree' }],
                image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=700&q=80',
                material: 'Tussar Silk',
                tag: 'SACRED EDIT'
            },
            {
                id: 'art-kp-001',
                productCode: 'ART-KP01',
                sku: 'ART-KP01',
                code: 'ART-KP01',
                name: 'Imperial Kundan & Polki Choker with Ruby Drops',
                slug: 'imperial-kundan-polki-choker-ruby-drops',
                catalog_type: 'artificial_jewellery',
                category: 'Necklaces',
                rawCategory: 'Necklace Set',
                sellingPrice: 2899,
                price: 2899,
                mrp: 3999,
                discount: 27,
                stockQuantity: 7,
                isAvailable: true,
                color: 'Gold & Ruby Red',
                material: 'Brass with 22K Gold Micron Plating',
                design: 'Jadau Kundan with Meenakari Backing',
                occasion: 'Kali Puja',
                occasion_slug: 'kali-puja',
                matching_tags: 'kundan, choker, ruby, festive, set, earrings, traditional',
                is_occasion_featured: true,
                description: 'Magnificent statement Kundan choker set adorned with deep red ruby droplets and matching jhumkas, crafted for evening festivities.',
                shortDescription: 'Regal Kundan and ruby bead choker set with matching earrings.',
                images: [{ url: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80', alt: 'Imperial Kundan Choker' }],
                image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80',
                tag: 'FESTIVE SET'
            }
        ],

        'wedding': [
            {
                id: 'saree-wd-001',
                productCode: 'SRE-WD01',
                sku: 'SRE-WD01',
                code: 'SRE-WD01',
                name: 'Royal Crimson Red Regal Bridal Banarasi Silk Saree',
                slug: 'royal-crimson-red-regal-bridal-banarasi-silk-saree',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 6999,
                price: 6999,
                mrp: 9999,
                discount: 30,
                stockQuantity: 6,
                isAvailable: true,
                color: 'Crimson Red & Antique Gold',
                fabric: 'Pure Katan Silk',
                design: 'Regal Zari Jaal Weave',
                occasion: 'Wedding Season',
                occasion_slug: 'wedding',
                matching_tags: 'wedding, bridal, saree, red, gold, silk, banarasi',
                is_occasion_featured: true,
                description: 'Magnificent bridal Banarasi silk saree crafted with rich gold zari motifs and ornate pallu for grand wedding ceremonies.',
                shortDescription: 'Pure bridal Banarasi silk saree with opulent antique gold zari craftsmanship.',
                images: [{ url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80', alt: 'Royal Bridal Banarasi Saree' }],
                image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=700&q=80',
                material: 'Pure Katan Silk',
                tag: 'BRIDAL'
            },
            {
                id: 'art-wd-001',
                productCode: 'ART-WD01',
                sku: 'ART-WD01',
                code: 'ART-WD01',
                name: 'Imperial Polki Kundan Bridal Choker & Matha Patti Set',
                slug: 'imperial-polki-kundan-bridal-choker-matha-patti-set',
                catalog_type: 'artificial_jewellery',
                category: 'Necklaces',
                rawCategory: 'Bridal Set',
                sellingPrice: 3999,
                price: 3999,
                mrp: 5499,
                discount: 27,
                stockQuantity: 5,
                isAvailable: true,
                color: 'Antique Gold & Pearl',
                material: 'Handcrafted Kundan Polki with 22K Gold Finish',
                occasion: 'Wedding Season',
                occasion_slug: 'wedding',
                matching_tags: 'wedding, bridal, choker, kundan, polki, jewelry, set',
                is_occasion_featured: true,
                description: 'Regal bridal jewellery set featuring a lavish Kundan polki choker, matching chandelier earrings, and maang tikka.',
                shortDescription: 'Opulent bridal Kundan polki choker set with earrings and maang tikka.',
                images: [{ url: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80', alt: 'Imperial Bridal Set' }],
                image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80',
                tag: 'BRIDAL EDIT'
            }
        ],

        'valentines-day': [
            {
                id: 'saree-vl-001',
                productCode: 'SRE-VL01',
                sku: 'SRE-VL01',
                code: 'SRE-VL01',
                name: 'Blush Rose Organza Saree with Delicate Zari Border',
                slug: 'blush-rose-organza-saree-delicate-zari-border',
                catalog_type: 'saree',
                category: 'Sarees',
                rawCategory: 'Saree',
                sellingPrice: 3899,
                price: 3899,
                mrp: 4999,
                discount: 22,
                stockQuantity: 5,
                isAvailable: true,
                color: 'Blush Rose',
                fabric: 'Pure Organza',
                occasion: 'Valentine’s Day',
                occasion_slug: 'valentines-day',
                matching_tags: 'valentine, romantic, pink, rose, organza, saree',
                is_occasion_featured: true,
                description: 'Ethereal blush rose organza saree with delicate scalloped gold zari embroidery, tailored for romantic evenings.',
                shortDescription: 'Pure blush rose organza saree with gold zari scalloped borders.',
                images: [{ url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=700&q=80', alt: 'Blush Rose Organza Saree' }],
                image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=700&q=80',
                material: 'Pure Organza',
                tag: 'ROMANTIC EDIT'
            }
        ]
    };

    // Alias valentine to valentines-day
    SHOWCASE_OCCASION_PRODUCTS['valentine'] = SHOWCASE_OCCASION_PRODUCTS['valentines-day'];

    /**
     * Fallback 925 sterling silver pairing items
     */
    const DEFAULT_SILVER_PAIRINGS = [
        {
            id: 'slv-festive-01',
            productCode: 'WR-SLV-01',
            sku: 'WR-SLV-01',
            code: 'WR-SLV-01',
            name: '925 Sterling Silver Royal Heritage Jhumkas',
            slug: '925-sterling-silver-royal-heritage-jhumkas',
            catalog_type: 'silver_jewellery',
            category: 'Earrings',
            sellingPrice: 3499,
            mrp: 4499,
            discount: 22,
            stockQuantity: 10,
            isAvailable: true,
            material: '925 Sterling Silver',
            matching_tags: 'traditional, festive, earrings, puja, red, gold, silk-saree',
            images: [{ url: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80', alt: '925 Silver Heritage Jhumkas' }],
            image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=700&q=80',
            shortDescription: 'Exquisite 925 hallmarked sterling silver jhumkas handcrafted for grand festive celebrations.'
        },
        {
            id: 'slv-festive-02',
            productCode: 'WR-SLV-02',
            sku: 'WR-SLV-02',
            code: 'WR-SLV-02',
            name: '925 Sterling Silver Intricate Filigree Hasli Choker',
            slug: '925-sterling-silver-intricate-filigree-hasli-choker',
            catalog_type: 'silver_jewellery',
            category: 'Necklaces',
            sellingPrice: 5999,
            mrp: 7999,
            discount: 25,
            stockQuantity: 6,
            isAvailable: true,
            material: '925 Sterling Silver',
            matching_tags: 'festive, choker, traditional, banarasi, puja, temple',
            images: [{ url: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80', alt: '925 Silver Filigree Choker' }],
            image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=700&q=80',
            shortDescription: 'Stunning 925 silver filigree choker designed to pair effortlessly with festive silk sarees.'
        },
        {
            id: 'slv-festive-03',
            productCode: 'WR-SLV-03',
            sku: 'WR-SLV-03',
            code: 'WR-SLV-03',
            name: '925 Sterling Silver Carved Floral Kada Pair',
            slug: '925-sterling-silver-carved-floral-kada-pair',
            catalog_type: 'silver_jewellery',
            category: 'Bracelets',
            sellingPrice: 4899,
            mrp: 6299,
            discount: 22,
            stockQuantity: 8,
            isAvailable: true,
            material: '925 Sterling Silver',
            matching_tags: 'bangles, kada, traditional, festive, silver, floral',
            images: [{ url: 'https://images.unsplash.com/photo-1611591475819-79b8b4a727ab?auto=format&fit=crop&w=700&q=80', alt: '925 Silver Floral Kada' }],
            image: 'https://images.unsplash.com/photo-1611591475819-79b8b4a727ab?auto=format&fit=crop&w=700&q=80',
            shortDescription: 'Pair of hallmarked 925 sterling silver antique floral kadas with screw lock.'
        },
        {
            id: 'slv-festive-04',
            productCode: 'WR-SLV-04',
            sku: 'WR-SLV-04',
            code: 'WR-SLV-04',
            name: '925 Sterling Silver Ruby Teardrop Solitaire Pendant',
            slug: '925-sterling-silver-ruby-teardrop-solitaire-pendant',
            catalog_type: 'silver_jewellery',
            category: 'Pendants',
            sellingPrice: 2499,
            mrp: 3299,
            discount: 24,
            stockQuantity: 12,
            isAvailable: true,
            material: '925 Sterling Silver',
            matching_tags: 'ruby, red, pendant, festive, solitaire, puja',
            images: [{ url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=700&q=80', alt: '925 Silver Ruby Teardrop Pendant' }],
            image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=700&q=80',
            shortDescription: 'Radiant ruby red solitaire stone set in 925 sterling silver hallmarked frame.'
        }
    ];

    /**
     * Retrieve all products applicable to the active occasion.
     * Merges live Supabase items with occasion metadata + showcase items.
     */
    function getOccasionProducts(activeOccasion) {
        const occ = (typeof activeOccasion === 'object' && activeOccasion)
            ? activeOccasion
            : (typeof activeOccasion === 'string'
                ? ((typeof OCCASIONS !== 'undefined' && OCCASIONS[activeOccasion]) || (typeof window.OCCASIONS !== 'undefined' && window.OCCASIONS[activeOccasion]) || { slug: activeOccasion })
                : (typeof getActiveOccasion === 'function' ? getActiveOccasion() : null));

        if (!occ) return [];

        const slug = (occ.slug || occ.activeOccasion || '').toLowerCase();
        if (!slug) return [];
        const baseProducts = Array.isArray(window.productsDB) ? window.productsDB : [];

        // 1. Filter Supabase products flagged with this occasion
        const liveOccasionItems = baseProducts.filter(p => {
            const pSlug = (p.occasion_slug || '').toLowerCase();
            const pOccasion = (p.occasion || '').toLowerCase();
            const pTags = (p.matching_tags || '').toLowerCase();
            const pCol = (p.collection || '').toLowerCase();

            const isValentine = (slug === 'valentines-day' || slug === 'valentine');
            const isWedding = (slug === 'wedding');

            return (
                pSlug === slug ||
                pOccasion.includes(slug) ||
                pTags.includes(slug) ||
                (isValentine && (pSlug === 'valentine' || pSlug === 'valentines-day' || pTags.includes('valentine') || pOccasion.includes('valentine'))) ||
                (isWedding && (pSlug === 'wedding' || pTags.includes('wedding') || pTags.includes('bridal') || pOccasion.includes('wedding'))) ||
                (slug === 'durga-puja' && (pCol.includes('occasion') || pTags.includes('festive') || pTags.includes('puja')))
            );
        });

        // 2. Showcase / seed items for the active occasion to guarantee rich experience
        const seedItems = SHOWCASE_OCCASION_PRODUCTS[slug] ||
            (slug === 'valentines-day' ? SHOWCASE_OCCASION_PRODUCTS['valentine'] : null) ||
            (slug === 'valentine' ? SHOWCASE_OCCASION_PRODUCTS['valentines-day'] : null) || [];

        // Combine, ensuring no duplicate IDs
        const seenIds = new Set();
        const combined = [];

        // Prioritize live database items
        liveOccasionItems.forEach(item => {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                combined.push(item);
            }
        });

        // Add seed items if not already present
        seedItems.forEach(item => {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                combined.push(item);
            }
        });

        // 3. Ensure silver pairings are represented
        const hasSilver = combined.some(p => (p.catalog_type || 'silver_jewellery') === 'silver_jewellery');
        if (!hasSilver) {
            const topSilver = baseProducts
                .filter(p => (p.catalog_type || 'silver_jewellery') === 'silver_jewellery')
                .slice(0, 4)
                .map(p => ({
                    ...p,
                    catalog_type: 'silver_jewellery',
                    occasion_slug: slug,
                    matching_tags: `${p.matching_tags || ''}, festive, traditional, silver-pair`
                }));

            topSilver.forEach(s => {
                if (!seenIds.has(s.id)) {
                    seenIds.add(s.id);
                    combined.push(s);
                }
            });
        }

        return combined.filter(p => p && Number(p.stockQuantity || 0) > 0);
    }

    /**
     * Saree -> Silver Jewellery Relevance Matching Algorithm
     * Scores silver jewellery items based on color, occasion, design, and tags.
     */
    function getSareeSilverMatches(sareeProduct, count = 4) {
        if (!sareeProduct) return [];

        const baseProducts = Array.isArray(window.productsDB) && window.productsDB.length > 0 
            ? window.productsDB 
            : DEFAULT_SILVER_PAIRINGS;
        let silverItems = baseProducts.filter(p =>
            p && Number(p.stockQuantity || 0) > 0 &&
            p.id !== sareeProduct.id &&
            (p.catalog_type || 'silver_jewellery') === 'silver_jewellery'
        );

        if (!silverItems.length) {
            silverItems = DEFAULT_SILVER_PAIRINGS;
        }

        // Extract saree metadata tokens
        const sareeOccasion = String(sareeProduct.occasion_slug || sareeProduct.occasion || '').toLowerCase();
        const sareeColor = String(sareeProduct.color || '').toLowerCase();
        const sareeDesign = String(sareeProduct.design || '').toLowerCase();
        const sareeTags = String(sareeProduct.matching_tags || '')
            .toLowerCase()
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);

        // Scoring
        const scored = silverItems.map(item => {
            let score = 0;
            const itemOccasion = String(item.occasion_slug || item.occasion || '').toLowerCase();
            const itemTags = String(item.matching_tags || '')
                .toLowerCase()
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);
            const itemName = String(item.name || '').toLowerCase();
            const itemCategory = String(item.category || '').toLowerCase();

            // 1. Same occasion match (+5)
            if (sareeOccasion && itemOccasion && (sareeOccasion === itemOccasion || itemOccasion.includes(sareeOccasion))) {
                score += 5;
            }

            // 2. Color harmony (+5)
            if (sareeColor) {
                if (sareeColor.includes('red') && (itemName.includes('ruby') || itemName.includes('red') || itemTags.includes('red'))) {
                    score += 5;
                } else if (sareeColor.includes('green') && (itemName.includes('emerald') || itemName.includes('green') || itemTags.includes('green'))) {
                    score += 5;
                } else if (sareeColor.includes('ivory') || sareeColor.includes('white')) {
                    // Pure silver shines extraordinarily on ivory/white
                    score += 5;
                }
            }

            // 3. Design / Motif synergy (+5)
            if (sareeDesign) {
                if ((sareeDesign.includes('banarasi') || sareeDesign.includes('temple')) &&
                    (itemName.includes('heritage') || itemName.includes('traditional') || itemCategory.includes('set') || itemCategory.includes('necklace'))) {
                    score += 5;
                }
            }

            // 4. Matching tag overlap (+3 each)
            sareeTags.forEach(st => {
                if (itemTags.includes(st) || itemName.includes(st)) {
                    score += 3;
                }
            });

            // 5. Traditional / Festive styling bonus (+2)
            if (itemTags.includes('traditional') || itemName.includes('traditional') || itemName.includes('choker') || itemName.includes('jhumka')) {
                score += 2;
            }
            if (itemTags.includes('festive') || itemOccasion.includes('festive')) {
                score += 2;
            }

            // 6. In-stock priority
            if (item.stockQuantity > 0) {
                score += 1;
            }

            return { product: item, score };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Return top unique matches
        return scored.slice(0, count).map(s => s.product);
    }

    /**
     * Start live dynamic countdown timer
     * Updates every 1000ms. Stops at 00 and displays expiry message.
     */
    function initCountdownTimer(targetDateStr, expiryMessage) {
        stopCountdownTimer();
        if (!targetDateStr) return;

        const targetTime = new Date(targetDateStr).getTime();
        if (isNaN(targetTime)) return;

        function update() {
            const now = new Date().getTime();
            const diff = targetTime - now;

            const daysEl = document.getElementById('timer-days');
            const hoursEl = document.getElementById('timer-hours');
            const minutesEl = document.getElementById('timer-minutes');
            const secondsEl = document.getElementById('timer-seconds');
            const expiryEl = document.getElementById('countdown-expiry-msg');

            if (diff <= 0) {
                if (daysEl) daysEl.textContent = '00';
                if (hoursEl) hoursEl.textContent = '00';
                if (minutesEl) minutesEl.textContent = '00';
                if (secondsEl) secondsEl.textContent = '00';
                if (expiryEl) expiryEl.style.display = 'block';
                stopCountdownTimer();
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
            if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
            if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
            if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
        }

        update();
        countdownTimerId = setInterval(update, 1000);
    }

    function stopCountdownTimer() {
        if (countdownTimerId) {
            clearInterval(countdownTimerId);
            countdownTimerId = null;
        }
    }

    /**
     * Copy coupon code to clipboard with visual feedback
     */
    function copyFestiveCoupon(code, btn) {
        if (!code) return;
        navigator.clipboard.writeText(code).then(() => {
            if (btn) {
                const originalText = btn.textContent;
                btn.classList.add('copied');
                btn.textContent = 'COPIED!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.textContent = originalText;
                }, 2200);
            }
            if (typeof showToast === 'function') {
                showToast(`Coupon code ${code} copied to clipboard!`);
            }
        }).catch(err => {
            console.warn('Coupon copy failed:', err);
        });
    }

    /**
     * Render the /occasion view into #occasion-view
     * Sequence matches Section 10 & 41 requirements:
     * 1. Dynamic WishRite Subtitle (at header)
     * 2. Trust Bar
     * 3. Festive Hero
     * 4. Live Countdown Timer
     * 5. Festive Live Offers
     * 6. Category Filter Tabs
     * 7. Featured Festive Products (if any)
     * 8. Festive Sarees
     * 9. Artificial Jewellery
     * 10. Complete Your Look / Matching Silver Jewellery
     * 11. Explore Silver Jewellery CTA
     */
    function renderOccasionPage() {
        const container = document.getElementById('occasion-view');
        if (!container) return;

        const activeOccasion = typeof window.getActiveOccasion === 'function'
            ? window.getActiveOccasion()
            : null;

        // If festive mode is disabled, redirect gracefully to standard shop
        if (!activeOccasion || !activeOccasion.enabled) {
            stopCountdownTimer();
            container.innerHTML = `
                <div class="container" style="padding:100px 20px;text-align:center;">
                    <h2 style="font-family:var(--wr-font-heading);color:var(--wr-primary);">Festive Collection</h2>
                    <p style="color:var(--wr-text-muted);margin:12px 0 24px;">Our festive curation is currently being updated with new arrivals.</p>
                    <button class="btn btn-primary" onclick="navigateTo('shop')">Explore All Silver Jewellery</button>
                </div>
            `;
            return;
        }

        const theme = activeOccasion.theme || {};
        container.style.setProperty('--festive-primary', theme.primary || '#8B1E2D');
        container.style.setProperty('--festive-secondary', theme.secondary || '#D4AF37');
        container.style.setProperty('--festive-accent', theme.accent || '#C6281C');
        container.style.setProperty('--festive-bg', theme.pageBackground || '#F8F3EC');

        const allOccasionProducts = getOccasionProducts(activeOccasion);

        // Categorize products
        const sarees = allOccasionProducts.filter(p => (p.catalog_type || '').toLowerCase() === 'saree');
        const artificial = allOccasionProducts.filter(p => (p.catalog_type || '').toLowerCase() === 'artificial_jewellery');
        const silver = allOccasionProducts.filter(p => {
            const type = (p.catalog_type || 'silver_jewellery').toLowerCase();
            return type === 'silver_jewellery' || (!type.includes('saree') && !type.includes('artificial'));
        });

        // Featured products: Only products explicitly marked is_occasion_featured (Section 27)
        const featured = allOccasionProducts.filter(p => Boolean(p.is_occasion_featured));

        // Filter products according to active filter tab
        let filteredList = allOccasionProducts;
        if (currentOccasionFilter === 'sarees') {
            filteredList = sarees;
        } else if (currentOccasionFilter === 'artificial') {
            filteredList = artificial;
        } else if (currentOccasionFilter === 'silver') {
            filteredList = silver;
        }

        // Render Product Card helper
        const renderCard = typeof window.createProductCardHTML === 'function'
            ? window.createProductCardHTML
            : (p) => `<div>${p.name}</div>`;

        const trust = activeOccasion.trust || {};
        const countdown = activeOccasion.countdown || {};
        const offers = activeOccasion.offers || { enabled: false, items: [] };
        const bgConfig = activeOccasion.background || {};

        container.innerHTML = `
            <!-- ═══ 0. OCCASION BACKGROUND ARTWORK LAYER (Sections 2-9) ═══ -->
            ${bgConfig.artwork ? `
            <div class="festive-background-artwork" aria-hidden="true" style="
                background-image: url('${bgConfig.artwork}');
                --festive-bg-opacity: ${bgConfig.opacity !== undefined ? bgConfig.opacity : 0.08};
                --festive-bg-pos: ${bgConfig.position || 'right center'};
                --festive-bg-size: ${bgConfig.size || 'contain'};
                --festive-bg-repeat: ${bgConfig.repeat || 'no-repeat'};
            "></div>
            ` : ''}

            <!-- ═══ 1. TRUST BAR (Section 11) ═══ -->
            ${trust.enabled ? `
            <section class="festive-trust-bar" aria-label="Festive Shopping Guarantees">
                <div class="container">
                    <div class="festive-trust-grid">
                        <div class="festive-trust-item">
                            <span class="festive-trust-icon">🚚</span>
                            <span class="festive-trust-text">${trust.shipping || 'Free shipping ₹199+'}</span>
                        </div>
                        <div class="festive-trust-item">
                            <span class="festive-trust-icon">💳</span>
                            <span class="festive-trust-text">${trust.cod || 'Cash on Delivery'}</span>
                        </div>
                        <div class="festive-trust-item">
                            <span class="festive-trust-icon">♡</span>
                            <span class="festive-trust-text">${trust.design || 'Original Bengali designs'}</span>
                        </div>
                    </div>
                </div>
            </section>
            ` : ''}

            <!-- ═══ 2. FESTIVE HERO (Section 7, 8) ═══ -->
            <section class="festive-hero" aria-label="${activeOccasion.name} Hero">
                <div class="festive-hero-bg" style="background-image: url('${activeOccasion.heroImage}');"></div>
                <div class="festive-hero-overlay"></div>
                
                <div class="festive-hero-container">
                    <div class="festive-hero-badge">
                        <span class="festive-badge-sparkle">✦</span>
                        <span>${activeOccasion.eyebrow}</span>
                        <span class="festive-badge-sparkle">✦</span>
                    </div>

                    <h1 class="festive-hero-title festive-bengali-title">${activeOccasion.title}</h1>
                    ${activeOccasion.englishTitle ? `
                        <div class="festive-hero-english">${activeOccasion.englishTitle}</div>
                    ` : ''}
                    <div class="festive-hero-divider"></div>
                    <p class="festive-hero-subtitle">${activeOccasion.description || activeOccasion.subtitle}</p>

                    <div class="festive-hero-actions">
                        <a class="btn btn-festive-primary" onclick="scrollPastFestiveHero()">
                            ${activeOccasion.ctaText || 'Shop the Pujo collection →'}
                            <svg class="hero-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </a>
                        <a class="btn btn-festive-secondary" onclick="navigateTo('shop')">
                            EXPLORE SILVER JEWELLERY
                        </a>
                    </div>
                </div>
            </section>

            <!-- ═══ 3. LIVE COUNTDOWN TIMER (Section 12, 13) ═══ -->
            ${countdown.enabled && countdown.targetDate ? `
            <section class="festive-countdown-section" aria-label="Festive Countdown">
                <div class="container">
                    <div class="festive-countdown-card">
                        <span class="countdown-eyebrow">COUNTDOWN TO CELEBRATION</span>
                        <div class="countdown-boxes" id="festive-countdown-boxes">
                            <div class="countdown-box">
                                <span class="countdown-val" id="timer-days">00</span>
                                <span class="countdown-lbl">DAYS</span>
                            </div>
                            <div class="countdown-box">
                                <span class="countdown-val" id="timer-hours">00</span>
                                <span class="countdown-lbl">HOURS</span>
                            </div>
                            <div class="countdown-box">
                                <span class="countdown-val" id="timer-minutes">00</span>
                                <span class="countdown-lbl">MINUTES</span>
                            </div>
                            <div class="countdown-box">
                                <span class="countdown-val" id="timer-seconds">00</span>
                                <span class="countdown-lbl">SECONDS</span>
                            </div>
                        </div>
                        <div class="countdown-expiry-msg" id="countdown-expiry-msg" style="display:none;">
                            ${countdown.expiryMessage || 'THE FESTIVE CELEBRATION HAS BEGUN'}
                        </div>
                    </div>
                </div>
            </section>
            ` : ''}

            <!-- ═══ 4. FESTIVE LIVE OFFERS (Section 14-22) ═══ -->
            ${offers.enabled ? `
            <section class="festive-offers-section" aria-label="Festive Offers">
                <div class="container">
                    <div class="festive-offers-container">
                        <div class="festive-offers-left">
                            <div class="festive-offers-badge">
                                <span>✦</span>
                                <span>${offers.badge || 'DURGA PUJO OFFERS'}</span>
                            </div>
                            <h2 class="festive-offers-heading">${offers.title || 'Pujor Shopping, Ghare Boshe'}</h2>
                            <button class="btn btn-offers-cta" onclick="scrollPastFestiveHero()">
                                ${offers.buttonText || 'See all Pujo offers →'}
                            </button>
                        </div>
                        <div class="festive-offers-right">
                            ${offers.items && offers.items.length > 0 ? `
                                <div class="live-offers-grid">
                                    ${offers.items.map(offer => `
                                        <div class="live-offer-card">
                                            <span class="live-offer-badge">${offer.badge || 'OFFER'}</span>
                                            <h3 class="live-offer-title">${offer.title}</h3>
                                            <div class="live-offer-text">${offer.offerText}</div>
                                            ${offer.validity ? `<div class="live-offer-validity">${offer.validity}</div>` : ''}
                                            ${offer.coupon ? `
                                                <div class="live-offer-coupon-box">
                                                    <span class="coupon-code">${offer.coupon}</span>
                                                    <button class="btn-copy-coupon" onclick="copyFestiveCoupon('${offer.coupon}', this)">
                                                        Tap to copy
                                                    </button>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="live-offers-empty-state">
                                    <div class="empty-sparkle">✦ ✦ ✦</div>
                                    <p class="empty-text">${offers.emptyMessage || 'Festive offers coming soon.'}</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </section>
            ` : ''}

            <!-- ═══ 5. CATEGORY FILTER TABS ═══ -->
            <section class="festive-nav-bar" id="festive-shop-anchor">
                <div class="container">
                    <div class="festive-filter-pills" role="tablist" aria-label="Festive categories">
                        <button class="festive-pill ${currentOccasionFilter === 'all' ? 'active' : ''}" 
                                onclick="switchOccasionCategory('all')">
                            All Festive (${allOccasionProducts.length})
                        </button>
                        ${sarees.length > 0 ? `
                        <button class="festive-pill ${currentOccasionFilter === 'sarees' ? 'active' : ''}" 
                                onclick="switchOccasionCategory('sarees')">
                            Festive Sarees (${sarees.length})
                        </button>` : ''}
                        ${artificial.length > 0 ? `
                        <button class="festive-pill ${currentOccasionFilter === 'artificial' ? 'active' : ''}" 
                                onclick="switchOccasionCategory('artificial')">
                            Statement Jewellery (${artificial.length})
                        </button>` : ''}
                        ${silver.length > 0 ? `
                        <button class="festive-pill ${currentOccasionFilter === 'silver' ? 'active' : ''}" 
                                onclick="switchOccasionCategory('silver')">
                            Silver Pairings (${silver.length})
                        </button>` : ''}
                    </div>
                </div>
            </section>

            <!-- ═══ 6. FILTERED VIEW OR STRUCTURED SECTIONS ═══ -->
            <div class="festive-content-wrapper">
                ${currentOccasionFilter !== 'all' ? `
                    <!-- Filtered Specific Category Grid -->
                    <section class="festive-section">
                        <div class="container">
                            <div class="festive-section-header">
                                <span class="festive-sub-label">CURATED FOR ${activeOccasion.name.toUpperCase()}</span>
                                <h2 class="festive-section-title">
                                    ${currentOccasionFilter === 'sarees' ? 'Festive Sarees' : (currentOccasionFilter === 'artificial' ? 'Statement Jewellery' : 'Silver Jewellery Pairings')}
                                </h2>
                            </div>
                            <div class="product-grid">${filteredList.map(renderCard).join('')}</div>
                        </div>
                    </section>
                ` : `
                    <!-- ═══ SECTION 1: FEATURED OCCASION COLLECTION (Section 27: Hidden if no featured) ═══ -->
                    ${featured.length > 0 ? `
                    <section class="festive-section">
                        <div class="container">
                            <div class="festive-section-header">
                                <span class="festive-sub-label">HANDPICKED EDIT</span>
                                <h2 class="festive-section-title">Featured ${activeOccasion.name} Highlights</h2>
                                <p class="festive-section-desc">Exquisite festive essentials designed to celebrate with grace, vibrancy and luxury.</p>
                            </div>
                            <div class="product-grid">${featured.map(renderCard).join('')}</div>
                        </div>
                    </section>
                    ` : ''}

                    <!-- ═══ SECTION 2: FESTIVE SAREES (Section 24-26) ═══ -->
                    ${sarees.length > 0 ? `
                    <section class="festive-section festive-bg-tint">
                        <div class="container">
                            <div class="festive-section-header">
                                <span class="festive-sub-label">ELEGANT DRAPES</span>
                                <h2 class="festive-section-title">Festive Sarees</h2>
                                <p class="festive-section-desc">Rich silks and classic handloom weaves crafted for traditional celebrations and celebratory evenings.</p>
                            </div>
                            <div class="product-grid">${sarees.map(renderCard).join('')}</div>
                        </div>
                    </section>
                    ` : ''}

                    <!-- ═══ SECTION 3: STATEMENT JEWELLERY (Section 24-26) ═══ -->
                    ${artificial.length > 0 ? `
                    <section class="festive-section">
                        <div class="container">
                            <div class="festive-section-header">
                                <span class="festive-sub-label">GRAND ADORNMENTS</span>
                                <h2 class="festive-section-title">Statement Jewellery</h2>
                                <p class="festive-section-desc">Opulent kundan, heritage haslis and dramatic festive sets made to turn heads.</p>
                            </div>
                            <div class="product-grid">${artificial.map(renderCard).join('')}</div>
                        </div>
                    </section>
                    ` : ''}

                    <!-- ═══ SECTION 4: COMPLETE YOUR LOOK (SILVER RECOMMENDATIONS) (Section 28) ═══ -->
                    ${silver.length > 0 ? `
                    <section class="festive-section festive-bg-tint">
                        <div class="container">
                            <div class="festive-section-header">
                                <span class="festive-sub-label">TIMELESS 925 SILVER</span>
                                <h2 class="festive-section-title">Complete Your Look With Silver</h2>
                                <p class="festive-section-desc">Hallmarked sterling silver essentials designed to pair harmoniously with ethnic attire.</p>
                            </div>
                            <div class="product-grid">${silver.map(renderCard).join('')}</div>
                        </div>
                    </section>
                    ` : ''}
                `}

                <!-- ═══ 7. OCCASION POLICIES & CARE SECTION ═══ -->
                <section class="festive-section festive-info-section" style="background:#FFFFFF;border-top:1px solid rgba(0,0,0,0.06);padding:48px 0 20px;">
                    <div class="container">
                        <!-- Occasion Shipping -->
                        <div class="festive-section-header" style="text-align:center;margin-bottom:32px;">
                            <span class="festive-sub-label">CELEBRATION DISPATCH</span>
                            <h2 class="festive-section-title">Occasion Shipping &amp; Delivery</h2>
                            <p class="festive-section-desc">Priority handling and doorstep delivery for your festive celebrations.</p>
                        </div>
                        <div class="policy-cards-grid" style="margin-bottom:56px;">
                            <div class="policy-card festive-policy-accent">
                                <div class="policy-card-icon">🪔</div>
                                <h3>Festive &amp; Occasion Edit</h3>
                                <div class="policy-highlight">FREE Delivery above ₹199</div>
                                <p>Special festive doorstep delivery on our active Occasion Collection (Sarees &amp; Statement Jewellery). Orders below ₹199 incur a minimal ₹49 shipping charge.</p>
                                <div class="policy-subnote" style="color:#2E7D32;font-weight:600;">Cash on Delivery (COD): 100% FREE.</div>
                            </div>
                            <div class="policy-card">
                                <div class="policy-card-icon">🚚</div>
                                <h3>Priority Dispatch</h3>
                                <div class="policy-highlight">Dispatched within 24–48 Hours</div>
                                <p>All festive pieces are hand-inspected and dispatched from our primary fulfillment hub via Shiprocket (Blue Dart, Delhivery, DTDC, Xpressbees).</p>
                                <div class="policy-subnote">Transit Time: 3–5 days (Metros), 4–7 days (Rest of India).</div>
                            </div>
                        </div>

                        <!-- Occasion Care Guide -->
                        <div class="festive-section-header" style="text-align:center;margin-bottom:32px;">
                            <span class="festive-sub-label">PRESERVE THE RADIANCE</span>
                            <h2 class="festive-section-title">Festive Fabric &amp; Jewellery Care</h2>
                            <p class="festive-section-desc">Keep your handloom drapes and statement adornments pristine for generations.</p>
                        </div>
                        <div class="care-grid" style="margin-bottom:30px;">
                            <div class="care-card">
                                <h4>🥻 Festive Sarees &amp; Handloom Drapes</h4>
                                <ul>
                                    <li><strong>Dry Clean Only:</strong> Handcrafted silks, tussar, and organza sarees should always be professionally dry cleaned.</li>
                                    <li><strong>Breathable Storage:</strong> Fold and store draped sarees wrapped inside a soft muslin or pure cotton bag.</li>
                                    <li><strong>Careful Ironing:</strong> Iron on low-to-medium heat with a protective cotton cloth over delicate zari borders.</li>
                                    <li><strong>Aerate Periodically:</strong> Unfold and air dry your sarees in a shaded, well-ventilated area every few months.</li>
                                </ul>
                            </div>
                            <div class="care-card">
                                <h4>👑 Statement Festive Jewellery</h4>
                                <ul>
                                    <li><strong>Keep Dry:</strong> Wipe gently with a dry cotton swab after wearing to remove traces of sweat or cosmetics.</li>
                                    <li><strong>Store Separately:</strong> Keep intricate haslis, earrings, and bangles in separate compartments to avoid scratching.</li>
                                    <li><strong>Last On, First Off:</strong> Make statement jewellery the final addition to your outfit and the first thing you remove.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ═══ 8. BACK TO MAIN SILVER STORE BANNER (Section 30) ═══ -->
                <section class="festive-back-bar">
                    <div class="container">
                        <div class="festive-back-card">
                            <div class="festive-back-info">
                                <h3>Explore Full 925 Silver Store</h3>
                                <p>Discover our complete signature collection of hallmarked silver chains, rings, earrings, pendants and bracelets.</p>
                            </div>
                            <button class="btn btn-primary" onclick="navigateTo('shop')">
                                ← Back to Silver Jewellery
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        `;

        // Start countdown timer if enabled
        if (countdown.enabled && countdown.targetDate) {
            initCountdownTimer(countdown.targetDate, countdown.expiryMessage);
        }
    }

    /**
     * Switch category filter within /occasion view
     */
    function switchOccasionCategory(cat) {
        currentOccasionFilter = cat;
        renderOccasionPage();

        // Smooth scroll to product grid
        const anchor = document.getElementById('festive-shop-anchor');
        if (anchor) {
            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Smooth scroll past festive hero
     */
    function scrollPastFestiveHero() {
        const anchor = document.getElementById('festive-shop-anchor');
        if (anchor) {
            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Saree Product Detail Page Integration:
     * Generates the "PAIR IT WITH SILVER / COMPLETE YOUR LOOK" recommendation section HTML.
     */
    function renderSareeSilverPairingHTML(sareeProduct) {
        if (!sareeProduct || sareeProduct.catalog_type !== 'saree') return '';

        const matches = getSareeSilverMatches(sareeProduct, 4);
        if (!matches || !matches.length) return '';

        const renderCard = typeof window.createProductCardHTML === 'function'
            ? window.createProductCardHTML
            : (p) => `<div>${p.name}</div>`;

        return `
            <section class="related-section saree-pairing-section">
                <div class="section-header">
                    <span class="sub-label">PERFECT FESTIVE PAIRINGS</span>
                    <h2>Complete Your Look With Silver</h2>
                    <p style="color:var(--wr-text-muted);font-size:0.9rem;max-width:560px;margin:8px auto 0;">
                        Curated 925 sterling silver jewellery specially selected to complement this ${sareeProduct.name}.
                    </p>
                </div>
                <div class="product-grid">
                    ${matches.map(renderCard).join('')}
                </div>
            </section>
        `;
    }

    function getOccasionShowcaseProducts(slug) {
        const showcase = slug ? (SHOWCASE_OCCASION_PRODUCTS[slug] || []) : Object.values(SHOWCASE_OCCASION_PRODUCTS).flat();
        return [...showcase, ...DEFAULT_SILVER_PAIRINGS];
    }

    // Expose helpers globally
    window.renderOccasionPage = renderOccasionPage;
    window.switchOccasionCategory = switchOccasionCategory;
    window.scrollPastFestiveHero = scrollPastFestiveHero;
    window.getSareeSilverMatches = getSareeSilverMatches;
    window.renderSareeSilverPairingHTML = renderSareeSilverPairingHTML;
    window.getOccasionProducts = getOccasionProducts;
    window.getOccasionShowcaseProducts = getOccasionShowcaseProducts;
    window.copyFestiveCoupon = copyFestiveCoupon;
    window.stopCountdownTimer = stopCountdownTimer;

})();
