import { sdk, isMedusaConfigured } from './medusa';

// Helper interface matching your local JSON structure
export interface ProductData {
    id: string;
    name: string;
    slug: string;
    category: string;
    type: string;
    shortDescription: string;
    description: string;
    features: string[];
    specs: {
        minPages?: number;
        maxPages?: number;
        paperStocks?: string[];
        sizes?: string[];
    };
    relevantConventions: string[];
}

/**
 * Maps a Medusa Product object to your frontend ProductData interface.
 * Assumes metadata contains 'features' (JSON string or array) and other spec fields.
 */
function mapMedusaProduct(product: any): ProductData {
    const metadata = product.metadata || {};

    // Parse features from metadata
    let features: string[] = [];
    if (metadata && metadata.features) {
        if (Array.isArray(metadata.features)) {
            features = metadata.features;
        } else if (typeof metadata.features === 'string') {
            // Priority 1: Try straightforward JSON parse (Most likely for simple stringified arrays)
            try {
                const parsed = JSON.parse(metadata.features);
                if (Array.isArray(parsed)) {
                    features = parsed;
                } else {
                    // If parsed but not an array (e.g. string), treat as single item? Or re-parse?
                    // If it parses to a string, it might be double-encoded.
                    throw new Error("Not an array");
                }
            } catch (e) {
                // Priority 2: Handle Double-Encoded JSON (e.g. "[\"A\", \"B\"]")
                // This happens if the admin UI wraps the JSON string in quotes.
                let cleanStr = metadata.features.trim();

                // If it starts with a quote, strip outer quotes
                if (cleanStr.startsWith('"') && cleanStr.endsWith('"')) {
                    cleanStr = cleanStr.slice(1, -1);
                }

                // Unescape inner quotes
                cleanStr = cleanStr.replace(/\\"/g, '"');

                try {
                    const parsed2 = JSON.parse(cleanStr);
                    if (Array.isArray(parsed2)) features = parsed2;
                    else {
                        // Priority 3: Fallback to Comma-Separated Values
                        features = metadata.features.split(',').map((s: string) => s.trim());
                    }
                } catch (e2) {
                    // Priority 3: Fallback to Comma-Separated Values
                    features = metadata.features.split(',').map((s: string) => s.trim());
                }
            }
        }
    }

    // Map Categories
    // Medusa products have a 'categories' array. We take the first one or default.
    const category = product.categories && product.categories.length > 0
        ? product.categories[0].name
        : 'Uncategorized';

    // Map Type
    const type = product.type ? product.type.value : 'print_builder';

    // Map Specs from Options or Metadata
    // For now, we look for 'specs' in metadata, or try to infer from variants/options if implemented later.
    // Assuming metadata.specs is a JSON object similar to your local data.
    let specs = {
        minPages: 0,
        maxPages: 0,
        paperStocks: [],
        sizes: []
    };

    if (metadata.specs) {
        // If specs is stored as a nested object in metadata (Medusa supports this via JSON type in newer versions, or stringified)
        if (typeof metadata.specs === 'string') {
             try { specs = JSON.parse(metadata.specs); } catch(e) {}
        } else {
             specs = { ...specs, ...metadata.specs };
        }
    } else {
        // Fallback: Try to find Options named "Size" or "Paper"
        if (product.options) {
            const sizeOpt = product.options.find((o: any) => o?.title?.toLowerCase() === 'size');
            if (sizeOpt && sizeOpt.values) {
                // @ts-ignore
                specs.sizes = sizeOpt.values.map(v => v.value);
            }
            const paperOpt = product.options.find((o: any) => o?.title?.toLowerCase().includes('paper'));
            if (paperOpt && paperOpt.values) {
                // @ts-ignore
                specs.paperStocks = paperOpt.values.map(v => v.value);
            }
        }
    }

    // Map Conventions from Collections or Tags
    // If using Collections for "Popular at X", we map collection handles/titles.
    const relevantConventions = product.collection
        ? [product.collection.handle] // Single collection per product in standard Medusa, or use tags
        : [];

    // If you use tags for multiple conventions:
    if (product.tags) {
        product.tags.forEach((t: any) => relevantConventions.push(t.value));
    }

    return {
        id: product.id,
        name: product.title,
        slug: product.handle,
        category: category,
        type: type,
        shortDescription: product.subtitle || product.description?.substring(0, 100) + '...',
        description: product.description || '',
        features: features,
        specs: specs as any,
        relevantConventions: relevantConventions
    };
}

/**
 * Fetches all product handles for static generation.
 */
export async function getAllProductHandles(): Promise<{ slug: string }[]> {
    const handles = new Set<string>();

    if (isMedusaConfigured()) {
        try {
            const { products } = await sdk.store.product.list({ limit: 100 });
            products.forEach((p: any) => {
                if (p.handle) handles.add(p.handle);
            });
        } catch (e) {
            console.warn("Failed to fetch Medusa products for static params:", e);
        }
    }

    return Array.from(handles).map(slug => ({ slug }));
}

/**
 * Fetches all products with full details (for index page).
 */
export async function getAllProducts(): Promise<ProductData[]> {
    if (!isMedusaConfigured()) return [];

    try {
        const { products } = await sdk.store.product.list({
            limit: 100,
            fields: "id,title,handle,description,subtitle,metadata,*categories,*tags,*collection,*type,*options,*options.values"
        });
        return products.map(mapMedusaProduct);
    } catch (e) {
        console.warn("Failed to fetch all products from Medusa:", e);
        return [];
    }
}

/**
 * Fetches a single product by handle.
 */
export async function getProductByHandle(handle: string): Promise<ProductData | null> {
    if (isMedusaConfigured()) {
        try {
            // Use Store API (public)
            const { products } = await sdk.store.product.list({
                handle: handle,
                limit: 1,
                fields: "id,title,handle,description,subtitle,metadata,*categories,*tags,*collection,*type,*options,*options.values"
            });

            if (products.length > 0) {
                return mapMedusaProduct(products[0]);
            }
        } catch (e) {
            console.warn(`Failed to fetch product ${handle} from Medusa:`, e);
        }
    }

    return null;
}
