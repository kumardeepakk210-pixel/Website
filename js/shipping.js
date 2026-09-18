/* ============================================
   WISHRITE — SHIPPING & PINCODE SERVICEABILITY
   Integrates with Shiprocket API and Indian Postal Matrix
   ============================================ */

const PINCODE_STORAGE_KEY = 'wishrite_delivery_pincode';

// Indian Postal Circle Fallback Matrix (Prefix -> Region Info)
const CLIENT_POSTAL_ZONES = {
    '11': { state: 'Delhi', days: '2–3' },
    '12': { state: 'Haryana', days: '3–4' },
    '13': { state: 'Haryana', days: '3–4' },
    '14': { state: 'Punjab', days: '3–5' },
    '15': { state: 'Punjab', days: '3–5' },
    '16': { state: 'Chandigarh', days: '2–4' },
    '17': { state: 'Himachal Pradesh', days: '4–6' },
    '18': { state: 'Jammu & Kashmir', days: '4–7' },
    '19': { state: 'Jammu & Kashmir', days: '4–7' },
    '20': { state: 'Uttar Pradesh', days: '3–5' },
    '21': { state: 'Uttar Pradesh', days: '3–5' },
    '22': { state: 'Uttar Pradesh', days: '3–5' },
    '23': { state: 'Uttar Pradesh', days: '3–5' },
    '24': { state: 'Uttarakhand', days: '4–5' },
    '25': { state: 'Uttar Pradesh', days: '3–5' },
    '26': { state: 'Uttarakhand', days: '4–6' },
    '27': { state: 'Uttar Pradesh', days: '3–5' },
    '28': { state: 'Uttar Pradesh', days: '3–5' },
    '30': { state: 'Rajasthan', days: '3–5' },
    '31': { state: 'Rajasthan', days: '3–5' },
    '32': { state: 'Rajasthan', days: '3–5' },
    '33': { state: 'Rajasthan', days: '3–5' },
    '34': { state: 'Rajasthan', days: '3–5' },
    '36': { state: 'Gujarat', days: '3–5' },
    '37': { state: 'Gujarat', days: '3–5' },
    '38': { state: 'Gujarat (Ahmedabad)', days: '2–4' },
    '39': { state: 'Gujarat (Surat)', days: '3–4' },
    '40': { state: 'Maharashtra (Mumbai)', days: '2–3' },
    '41': { state: 'Maharashtra (Pune)', days: '3–4' },
    '42': { state: 'Maharashtra', days: '3–5' },
    '43': { state: 'Maharashtra', days: '3–5' },
    '44': { state: 'Maharashtra (Nagpur)', days: '3–5' },
    '45': { state: 'Madhya Pradesh (Indore)', days: '3–5' },
    '46': { state: 'Madhya Pradesh (Bhopal)', days: '3–5' },
    '47': { state: 'Madhya Pradesh', days: '4–6' },
    '48': { state: 'Madhya Pradesh', days: '4–6' },
    '49': { state: 'Chhattisgarh', days: '4–6' },
    '50': { state: 'Telangana (Hyderabad)', days: '2–4' },
    '51': { state: 'Andhra Pradesh', days: '3–5' },
    '52': { state: 'Andhra Pradesh', days: '3–5' },
    '53': { state: 'Andhra Pradesh', days: '3–5' },
    '56': { state: 'Karnataka (Bangalore)', days: '2–3' },
    '57': { state: 'Karnataka', days: '3–5' },
    '58': { state: 'Karnataka', days: '3–5' },
    '59': { state: 'Karnataka', days: '3–5' },
    '60': { state: 'Tamil Nadu (Chennai)', days: '2–3' },
    '61': { state: 'Tamil Nadu', days: '3–5' },
    '62': { state: 'Tamil Nadu', days: '3–5' },
    '63': { state: 'Tamil Nadu', days: '3–5' },
    '64': { state: 'Tamil Nadu (Coimbatore)', days: '3–5' },
    '67': { state: 'Kerala', days: '3–5' },
    '68': { state: 'Kerala (Kochi)', days: '3–5' },
    '69': { state: 'Kerala', days: '3–5' },
    '70': { state: 'West Bengal (Kolkata)', days: '1–2' },
    '71': { state: 'West Bengal', days: '2–4' },
    '72': { state: 'West Bengal', days: '2–4' },
    '73': { state: 'West Bengal', days: '3–5' },
    '74': { state: 'West Bengal', days: '3–5' },
    '75': { state: 'Odisha (Bhubaneswar)', days: '3–4' },
    '76': { state: 'Odisha', days: '3–5' },
    '77': { state: 'Odisha', days: '4–6' },
    '78': { state: 'Assam (Guwahati)', days: '4–6' },
    '79': { state: 'North East States', days: '5–7' },
    '80': { state: 'Bihar (Patna)', days: '3–4' },
    '81': { state: 'Bihar', days: '3–5' },
    '82': { state: 'Bihar', days: '3–5' },
    '83': { state: 'Jharkhand (Ranchi)', days: '3–5' },
    '84': { state: 'Bihar', days: '3–5' },
    '85': { state: 'Bihar', days: '4–6' }
};

/**
 * Validate PIN code format
 * Exactly 6 numeric digits, cannot start with 0
 */
function isValidIndianPincode(pin) {
    const raw = String(pin || '').trim();
    return /^[1-9][0-9]{5}$/.test(raw);
}

/**
 * Get customer's saved pincode from localStorage
 */
function getSavedPincode() {
    try {
        const pin = localStorage.getItem(PINCODE_STORAGE_KEY);
        return isValidIndianPincode(pin) ? pin : null;
    } catch (e) {
        return null;
    }
}

/**
 * Save validated pincode to localStorage
 */
function savePincode(pin) {
    try {
        const raw = String(pin || '').trim();
        if (isValidIndianPincode(raw)) {
            localStorage.setItem(PINCODE_STORAGE_KEY, raw);
        }
    } catch (e) {
        console.warn('Unable to save delivery pincode to storage:', e);
    }
}

/**
 * Check PIN code serviceability via backend API with offline fallback
 */
async function checkPincodeServiceability(pincode) {
    const raw = String(pincode || '').trim();

    if (!isValidIndianPincode(raw)) {
        return {
            success: false,
            serviceable: false,
            pincode: raw,
            error: 'Please enter a valid 6-digit Indian PIN code.'
        };
    }

    const cleaned = raw;

    try {
        // Call backend API (supports live Shiprocket & server-side verification)
        const response = await fetch(`/api/pincode?pincode=${cleaned}`);
        if (response.ok) {
            const data = await response.json();
            if (data.serviceable) {
                savePincode(cleaned);
            }
            return data;
        }
    } catch (networkErr) {
        // Fallback to client-side postal circle verification
        console.info('Pincode service using client verification:', networkErr.message);
    }

    // Client fallback verification
    const prefix = cleaned.substring(0, 2);
    const zone = CLIENT_POSTAL_ZONES[prefix];

    if (!zone) {
        return {
            success: true,
            serviceable: false,
            pincode: cleaned,
            message: `Sorry, delivery is currently unavailable to PIN code ${cleaned}.`
        };
    }

    savePincode(cleaned);

    const today = new Date();
    const parts = zone.days.split('–').map(p => parseInt(p, 10));
    const minDays = parts[0] || 2;
    const maxDays = parts[1] || 4;

    const minDate = new Date(today);
    minDate.setDate(today.getDate() + minDays);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + maxDays);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateRangeStr = `${minDate.getDate()}–${maxDate.getDate()} ${monthNames[maxDate.getMonth()]}`;

    return {
        success: true,
        serviceable: true,
        pincode: cleaned,
        state: zone.state,
        estimatedDays: `${zone.days} business days`,
        estimatedDeliveryDate: dateRangeStr,
        codAvailable: true,
        shippingCharge: 0,
        message: `Delivery available to ${cleaned} (${zone.state})`
    };
}

// Session cache to prevent repeated lookups for the same PIN in a checkout session
const pincodeLocationCache = new Map();

/**
 * Look up City & State from an Indian 6-digit PIN code
 * Primary source: Indian Postal API (api.postalpincode.in)
 * Secondary fallback: Zippopotam API
 * Offline fallback: Local Postal Matrix (CLIENT_POSTAL_ZONES)
 * 
 * Reuses existing isValidIndianPincode() and CLIENT_POSTAL_ZONES from shipping.js
 */
async function lookupPincodeLocation(pincode) {
    const raw = String(pincode || '').replace(/\s+/g, '').trim();

    if (!isValidIndianPincode(raw)) {
        return {
            success: false,
            valid: false,
            invalid: true,
            error: 'Please enter a valid PIN code.'
        };
    }

    if (pincodeLocationCache.has(raw)) {
        return pincodeLocationCache.get(raw);
    }

    let primaryFailed = false;

    // 1. Primary Lookup via official Indian Postal data
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://api.postalpincode.in/pincode/${raw}`, {
            signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const entry = data[0];
                if (entry.Status === 'Success' && Array.isArray(entry.PostOffice) && entry.PostOffice.length > 0) {
                    const po = entry.PostOffice[0];
                    const rawDistrict = (po.District || po.Division || po.Block || '').trim();
                    const rawState = (po.State || '').trim();
                    if (rawDistrict || rawState) {
                        const result = {
                            success: true,
                            valid: true,
                            city: rawDistrict,
                            state: rawState,
                            source: 'postal-api'
                        };
                        pincodeLocationCache.set(raw, result);
                        return result;
                    }
                } else if (entry.Status === 'Error' || (entry.Message && /no records found/i.test(entry.Message))) {
                    const result = {
                        success: false,
                        valid: false,
                        invalid: true,
                        error: 'Please enter a valid PIN code.'
                    };
                    pincodeLocationCache.set(raw, result);
                    return result;
                }
            }
        }
        primaryFailed = true;
    } catch (e) {
        primaryFailed = true;
    }

    // 2. Secondary Lookup via Zippopotam fallback
    if (primaryFailed) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`https://api.zippopotam.us/in/${raw}`, {
                signal: controller.signal
            });
            clearTimeout(timer);

            if (res.ok) {
                const zipData = await res.json();
                if (zipData && Array.isArray(zipData.places) && zipData.places.length > 0) {
                    const place = zipData.places[0];
                    const placeCity = (place['place name'] || '').trim();
                    const placeState = (place['state'] || '').trim();
                    if (placeCity || placeState) {
                        const result = {
                            success: true,
                            valid: true,
                            city: placeCity,
                            state: placeState,
                            source: 'zippopotam'
                        };
                        pincodeLocationCache.set(raw, result);
                        return result;
                    }
                }
            } else if (res.status === 404) {
                const result = {
                    success: false,
                    valid: false,
                    invalid: true,
                    error: 'Please enter a valid PIN code.'
                };
                pincodeLocationCache.set(raw, result);
                return result;
            }
        } catch (e) {
            // Secondary network lookup failed
        }
    }

    // 3. Offline matrix fallback using CLIENT_POSTAL_ZONES
    const prefix = raw.substring(0, 2);
    const zone = CLIENT_POSTAL_ZONES[prefix];
    if (zone && zone.state) {
        const cleanState = zone.state.replace(/\s*\([^)]*\)/, '').trim();
        return {
            success: true,
            valid: true,
            city: '',
            state: cleanState,
            source: 'offline-zone',
            partial: true
        };
    }

    // 4. Non-blocking error when service is completely unreachable
    return {
        success: false,
        serviceUnavailable: true,
        error: "We couldn't verify this PIN code. Please check your City and State."
    };
}

if (typeof window !== 'undefined') {
    window.lookupPincodeLocation = lookupPincodeLocation;
}


/**
 * Generate PDP Pincode Checker Component HTML
 */
function renderPincodeCheckerHTML() {
    const savedPin = getSavedPincode();

    return `
        <div class="pdp-pincode-checker" id="pdp-pincode-checker">
            <div class="pincode-header">
                <span class="pincode-label">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                    Check Delivery & Serviceability
                </span>
            </div>

            <div class="pincode-input-group" id="pincode-input-container" style="${savedPin ? 'display:none;' : 'display:flex;'}">
                <input 
                    type="text" 
                    id="pdp-pincode-input" 
                    class="pincode-input" 
                    placeholder="Enter 6-digit PIN code" 
                    maxlength="6" 
                    inputmode="numeric"
                    value="${savedPin || ''}"
                    onkeydown="if(event.key==='Enter'){handlePdpPincodeCheck();}"
                />
                <button type="button" class="pincode-check-btn" onclick="handlePdpPincodeCheck()" id="pdp-pincode-submit-btn">
                    Check
                </button>
            </div>

            <div id="pincode-status-display" class="pincode-status-box" style="${savedPin ? 'display:block;' : 'display:none;'}">
                ${savedPin ? renderServiceableStateHTML(savedPin, null) : ''}
            </div>
        </div>
    `;
}

function renderServiceableStateHTML(pin, details) {
    const estDate = details?.estimatedDeliveryDate || '3–5 business days';
    const stateName = details?.state ? ` (${details.state})` : '';

    return `
        <div class="pincode-result serviceable">
            <div class="pincode-result-top">
                <span class="pincode-result-icon">✓</span>
                <span class="pincode-result-text">Delivering to <strong>${pin}</strong>${stateName}</span>
                <button type="button" class="pincode-change-link" onclick="changePdpPincode()">Change</button>
            </div>
            <div class="pincode-delivery-estimate">
                <span>Estimated Delivery: <strong>${estDate}</strong></span>
                <span class="pincode-free-delivery">· Free Shipping on all silver orders</span>
            </div>
        </div>
    `;
}

function renderUnserviceableStateHTML(pin) {
    return `
        <div class="pincode-result unserviceable">
            <div class="pincode-result-top">
                <span class="pincode-result-icon">✕</span>
                <span class="pincode-result-text">Sorry, delivery is currently unavailable to <strong>${pin}</strong></span>
                <button type="button" class="pincode-change-link" onclick="changePdpPincode()">Try another</button>
            </div>
        </div>
    `;
}

/**
 * Handle user clicking Check on the PDP
 */
async function handlePdpPincodeCheck() {
    const input = document.getElementById('pdp-pincode-input');
    const submitBtn = document.getElementById('pdp-pincode-submit-btn');
    const statusBox = document.getElementById('pincode-status-display');
    const inputContainer = document.getElementById('pincode-input-container');

    if (!input) return;
    const pin = input.value.trim();

    if (!isValidIndianPincode(pin)) {
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerHTML = `<div class="pincode-result error">Please enter a valid 6-digit Indian PIN code.</div>`;
        }
        input.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking...';
    }

    try {
        const result = await checkPincodeServiceability(pin);
        if (statusBox) {
            statusBox.style.display = 'block';
            if (result.serviceable) {
                statusBox.innerHTML = renderServiceableStateHTML(result.pincode, result);
                if (inputContainer) inputContainer.style.display = 'none';
            } else {
                statusBox.innerHTML = renderUnserviceableStateHTML(result.pincode);
            }
        }
    } catch (err) {
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerHTML = `<div class="pincode-result error">Delivery availability could not be checked right now. Please try again.</div>`;
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Check';
        }
    }
}

/**
 * Allow user to switch or re-enter PIN code
 */
function changePdpPincode() {
    const inputContainer = document.getElementById('pincode-input-container');
    const statusBox = document.getElementById('pincode-status-display');
    const input = document.getElementById('pdp-pincode-input');

    if (inputContainer) inputContainer.style.display = 'flex';
    if (statusBox) statusBox.style.display = 'none';
    if (input) {
        input.value = '';
        input.focus();
    }
}
