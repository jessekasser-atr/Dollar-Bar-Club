const seedVenues = [
  {
    id: "austin-pilot-venue-1",
    name: "The Roosevelt Room",
    city: "Austin",
    state: "TX",
    address: "307 W 5th St, Austin, TX 78701",
    neighborhood: "West 6th / Warehouse District",
    type: "Cocktail Bar",
    imageUrl: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&q=80",
    website: "https://therooseveltroomatx.com",
    phone: "(512) 494-4094",
    instagram: "rooseveltroomATX",
    lat: 30.2672,
    lng: -97.7472
  },
  {
    id: "austin-pilot-venue-2",
    name: "Whisler's",
    city: "Austin",
    state: "TX",
    address: "1816 E 6th St, Austin, TX 78702",
    neighborhood: "East 6th",
    type: "Cocktail Bar & Mezcaleria",
    imageUrl: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80",
    website: "https://whislersatx.com",
    phone: "(512) 480-0781",
    instagram: "whislersatx",
    lat: 30.2638,
    lng: -97.7225
  }
];

const seedOffers = [
  {
    id: "offer-house-cocktail",
    venueId: "austin-pilot-venue-1",
    title: "$1 House Cocktail",
    description: "One-time pilot special for verified members. Choose from a curated selection of house cocktails crafted by our award-winning bar team.",
    imageUrl: null,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    isActive: true
  },
  {
    id: "offer-mocktail",
    venueId: "austin-pilot-venue-2",
    title: "Complimentary Mocktail",
    description: "NA option available for one-time pilot redemption. Enjoy a handcrafted zero-proof cocktail on us.",
    imageUrl: null,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    isActive: true
  }
];

function getCatalogSource() {
  return process.env.BAR_DATA_SOURCE || "seed";
}

function getCatalogSnapshot() {
  const source = getCatalogSource();

  if (source === "barglance") {
    return {
      source: "barglance",
      venues: [],
      offers: []
    };
  }

  return {
    source: "seed",
    venues: seedVenues,
    offers: seedOffers
  };
}

export { getCatalogSnapshot, getCatalogSource };
