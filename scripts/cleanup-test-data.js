// ==============================================================================
// WISHRITE — PRODUCTION TEST DATA CLEANUP
// Ensures influencers_store.json contains only clean, genuine production schema
// and 0 test/dummy/simulated records after test runs.
// ==============================================================================

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'influencers_store.json');

const CLEAN_STORE = {
  "influencers": [],
  "accounts": [],
  "links": [],
  "stats": [],
  "clicks": [],
  "attributions": [],
  "order_attributions": [],
  "wallets": [],
  "wallet_transactions": [],
  "payout_methods": [],
  "withdrawals": [],
  "points_accounts": [],
  "points_transactions": [],
  "rewards": [
    {
      "id": "rwd_001_earrings",
      "reward_code": "WR-RWD-01",
      "name": "WishRite Silver Stud Earrings",
      "description": "Handcrafted 925 Sterling Silver classic solitaire studs.",
      "image_url": "https://wishrite.in/images/rewards/silver-studs.jpg",
      "points_cost": 250,
      "reward_type": "product",
      "inventory_quantity": 50,
      "is_active": true,
      "sort_order": 1,
      "terms": "Complimentary shipping across India.",
      "created_at": "2026-10-26T08:19:29.936Z",
      "updated_at": "2026-10-26T08:19:29.936Z"
    },
    {
      "id": "rwd_002_voucher",
      "reward_code": "WR-RWD-02",
      "name": "₹1,000 WishRite Shopping Voucher",
      "description": "Instant discount code applicable on any fine jewelry order.",
      "image_url": "https://wishrite.in/images/rewards/voucher-1000.jpg",
      "points_cost": 500,
      "reward_type": "voucher",
      "inventory_quantity": 100,
      "is_active": true,
      "sort_order": 2,
      "terms": "Valid for 12 months from redemption date.",
      "created_at": "2026-10-26T08:19:29.936Z",
      "updated_at": "2026-10-26T08:19:29.936Z"
    },
    {
      "id": "rwd_003_pendant",
      "reward_code": "WR-RWD-03",
      "name": "Custom Engraved Gold-Plated Pendant",
      "description": "18K Gold Vermeil initial pendant with signature WishRite gift box.",
      "image_url": "https://wishrite.in/images/rewards/gold-pendant.jpg",
      "points_cost": 1000,
      "reward_type": "product",
      "inventory_quantity": 25,
      "is_active": true,
      "sort_order": 3,
      "terms": "Custom initial confirmation required upon dispatch.",
      "created_at": "2026-10-26T08:19:29.936Z",
      "updated_at": "2026-10-26T08:19:29.936Z"
    },
    {
      "id": "rwd_004_styling",
      "reward_code": "WR-RWD-04",
      "name": "VIP Salon & Jewelry Styling Session",
      "description": "Exclusive 1-on-1 virtual or in-person styling consultation.",
      "image_url": "https://wishrite.in/images/rewards/vip-styling.jpg",
      "points_cost": 2500,
      "reward_type": "experience",
      "inventory_quantity": 10,
      "is_active": true,
      "sort_order": 4,
      "terms": "Booking slot confirmation within 7 working days.",
      "created_at": "2026-10-26T08:19:29.936Z",
      "updated_at": "2026-10-26T08:19:29.936Z"
    }
  ],
  "reward_redemptions": [],
  "payout_webhooks": [],
  "creator_content": [],
  "contests": [
    {
      "id": "contest-festive-2026",
      "name": "Festive Sparkle Creator Challenge 2026",
      "description": "Create standout posts and reels featuring WishRite pure 925 sterling silver jewellery and inspire style lovers across India.",
      "start_date": "2026-10-15T00:00:00.000Z",
      "end_date": "2026-11-26T23:59:59.000Z",
      "status": "active",
      "scoring_rules": {
        "post_points": 50,
        "reel_points": 100,
        "order_points_multiplier": 10,
        "click_points_multiplier": 1
      },
      "created_at": "2026-10-15T00:00:00.000Z",
      "updated_at": "2026-10-15T00:00:00.000Z"
    }
  ],
  "contest_participants": [],
  "contest_scores": []
};

fs.writeFileSync(STORE_PATH, JSON.stringify(CLEAN_STORE, null, 2), 'utf8');
console.log('✓ Cleaned influencers_store.json: all test fixtures and dummy records purged.');
