export const PRODUCTS = [
    { id: 1, name: "KaranArjun Power Plus (1L)", mrp: 1200, ptr: 850, margin: "29%" },
    { id: 2, name: "KaranArjun Power Plus (500ml)", mrp: 650, ptr: 450, margin: "30%" },
    { id: 3, name: "KaranArjun Power Plus (250ml)", mrp: 350, ptr: 240, margin: "31%" },
    { id: 4, name: "KaranArjun Sample Kit", mrp: 0, ptr: 0, margin: "N/A" }
];

// Agri-input product categories for a Krishi Seva Kendra / agri shop. Stored on
// each product's `type` field, which the POS already filters on. Used by the
// Inventory and POS add/edit forms as the category options.
export const AGRI_CATEGORIES = [
    'Insecticide',
    'Fungicide',
    'Herbicide',
    'Fertilizer',
    'Micronutrient',
    'PGR',
    'Seeds',
    'Bio Product',
    'Others',
];
