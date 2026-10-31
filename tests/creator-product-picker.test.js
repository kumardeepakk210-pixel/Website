const test = require('node:test');
const assert = require('node:assert/strict');

// Simulated environment for testing product selection & validation logic
function createMockElement(initial = {}) {
    return {
        value: initial.value || '',
        selectedIndex: initial.selectedIndex ?? -1,
        selectedOptions: initial.selectedOptions || [],
        options: initial.options || [],
        getAttribute(attr) {
            return this[`data-${attr.replace('data-', '')}`] || null;
        },
        style: {},
        innerText: '',
        disabled: false
    };
}

function getSelectedProductOption(selectEl) {
    if (!selectEl) return null;
    if (selectEl.selectedOptions && selectEl.selectedOptions.length > 0) {
        const opt = selectEl.selectedOptions[0];
        if (opt && (opt.value || (typeof opt.getAttribute === 'function' && opt.getAttribute('data-name')))) return opt;
    }
    if (typeof selectEl.selectedIndex === 'number' && selectEl.selectedIndex >= 0 && selectEl.options) {
        const opt = selectEl.options[selectEl.selectedIndex];
        if (opt && (opt.value || (typeof opt.getAttribute === 'function' && opt.getAttribute('data-name')))) return opt;
    }
    const val = (selectEl.value || '').trim();
    if (val && selectEl.options) {
        for (let i = 0; i < selectEl.options.length; i++) {
            if (selectEl.options[i].value === val) return selectEl.options[i];
        }
    }
    return null;
}

test('Creator Product Picker - Validation fails when no product is selected', () => {
    const errorEl = { innerText: '', style: {} };
    const productSelect = createMockElement({
        value: '',
        selectedIndex: 0,
        options: [{ value: '', innerText: 'Select Product ▼' }],
        selectedOptions: [{ value: '', innerText: 'Select Product ▼' }]
    });

    const selectedOption = getSelectedProductOption(productSelect);
    let productCode = (selectedOption?.value || productSelect?.value || '').trim();

    if (!productCode) {
        errorEl.innerText = 'Please select a Featured WishRite Product.';
        errorEl.style.display = 'block';
    }

    assert.equal(productCode, '');
    assert.equal(errorEl.innerText, 'Please select a Featured WishRite Product.');
    assert.equal(errorEl.style.display, 'block');
});

test('Creator Product Picker - Correctly resolves product when selectedOptions works', () => {
    const liveProductsCache = [
        {
            id: '1608721a-c1ca-4a55-b9ed-c55fba34cd2d',
            product_code: 'NKC-0005',
            product_name: 'Royal Gemstone Silver Bengali Choker Necklace',
            image_url: 'https://images.wishrite.in/products/nkc-0005.jpg',
            category: 'Necklace'
        }
    ];

    const option = {
        value: 'NKC-0005',
        'data-name': 'Royal Gemstone Silver Bengali Choker Necklace',
        'data-img': 'https://images.wishrite.in/products/nkc-0005.jpg',
        getAttribute(attr) { return this[attr]; }
    };

    const productSelect = createMockElement({
        value: 'NKC-0005',
        selectedIndex: 1,
        options: [{ value: '' }, option],
        selectedOptions: [option]
    });

    const selectedOption = getSelectedProductOption(productSelect);
    let productCode = (selectedOption?.value || productSelect?.value || '').trim();
    let productName = selectedOption?.getAttribute('data-name') || '';
    let productImg = selectedOption?.getAttribute('data-img') || '';

    assert.equal(productCode, 'NKC-0005');
    assert.equal(productName, 'Royal Gemstone Silver Bengali Choker Necklace');
    assert.equal(productImg, 'https://images.wishrite.in/products/nkc-0005.jpg');
});

test('Creator Product Picker - Gracefully handles missing/broken selectedOptions via selectedIndex', () => {
    const option = {
        value: 'NKC-0005',
        'data-name': 'Royal Gemstone Silver Bengali Choker Necklace',
        'data-img': 'https://images.wishrite.in/products/nkc-0005.jpg',
        getAttribute(attr) { return this[attr]; }
    };

    // selectedOptions is empty or undefined as happens in some webviews
    const productSelect = createMockElement({
        value: 'NKC-0005',
        selectedIndex: 1,
        options: [{ value: '' }, option],
        selectedOptions: []
    });

    const selectedOption = getSelectedProductOption(productSelect);
    let productCode = (selectedOption?.value || productSelect?.value || '').trim();
    let productName = selectedOption?.getAttribute('data-name') || '';
    let productImg = selectedOption?.getAttribute('data-img') || '';

    assert.equal(productCode, 'NKC-0005');
    assert.equal(productName, 'Royal Gemstone Silver Bengali Choker Necklace');
    assert.equal(productImg, 'https://images.wishrite.in/products/nkc-0005.jpg');
});

test('Creator Product Picker - Falls back to liveProductsCache if data attributes are missing', () => {
    const liveProductsCache = [
        {
            id: '1608721a-c1ca-4a55-b9ed-c55fba34cd2d',
            product_code: 'NKC-0005',
            product_name: 'Royal Gemstone Silver Bengali Choker Necklace',
            image_url: 'https://images.wishrite.in/products/nkc-0005.jpg',
            category: 'Necklace'
        }
    ];

    const option = {
        value: 'NKC-0005',
        getAttribute(attr) { return null; }
    };

    const productSelect = createMockElement({
        value: 'NKC-0005',
        selectedIndex: 1,
        options: [{ value: '' }, option],
        selectedOptions: [option]
    });

    const selectedOption = getSelectedProductOption(productSelect);
    let productCode = (selectedOption?.value || productSelect?.value || '').trim();
    let productName = selectedOption?.getAttribute('data-name') || '';
    let productImg = selectedOption?.getAttribute('data-img') || '';

    if (productCode && (!productName || !productImg) && Array.isArray(liveProductsCache)) {
        const cached = liveProductsCache.find(p => (p.product_code || '').trim() === productCode || (p.id || '').trim() === productCode);
        if (cached) {
            if (!productName) productName = cached.product_name || cached.title || '';
            if (!productImg) productImg = cached.image_url || (Array.isArray(cached.images) ? cached.images[0] : '') || '';
        }
    }

    assert.equal(productCode, 'NKC-0005');
    assert.equal(productName, 'Royal Gemstone Silver Bengali Choker Necklace');
    assert.equal(productImg, 'https://images.wishrite.in/products/nkc-0005.jpg');

    const payload = {
        content_type: 'reel',
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/C123456789/',
        caption: 'Loving this choker',
        product_category: 'Necklaces',
        product_code: productCode,
        product_name: productName,
        product_image: productImg,
        thumbnail_url: productImg,
        tags: 'silver, choker'
    };

    assert.equal(payload.product_code, 'NKC-0005');
    assert.equal(payload.product_name, 'Royal Gemstone Silver Bengali Choker Necklace');
    assert.equal(payload.content_type, 'reel');
});
