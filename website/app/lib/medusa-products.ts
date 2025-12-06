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
        // Sizes are now managed via Firestore
    };
    relevantConventions: string[];
}

/**
 * Maps a Medusa Product object to your frontend ProductData interface.
 * Assumes metadata contains 'features' (JSON string or array) and other spec fields.
 */
function mapMedusaProduct(product: any): ProductData {
    const metadata = product.metadata || {};

    console.log(`[mapMedusaProduct] Processing product: ${product.title} (${product.handle})`);
    console.log(`[mapMedusaProduct] Raw metadata:`, JSON.stringify(metadata, null, 2));

    // Parse features from metadata
    let features: string[] = [];
    if (metadata && metadata.features) {
        if (Array.isArray(metadata.features)) {
            features = metadata.features;
        } else if (typeof metadata.features === 'string') {
            try {
                const parsed = JSON.parse(metadata.features);
                if (Array.isArray(parsed)) {
                    features = parsed;
                } else {
                    throw new Error("Not an array");
                }
            } catch (e) {
                let cleanStr = metadata.features.trim();
                if (cleanStr.startsWith('"') && cleanStr.endsWith('"')) {
                    cleanStr = cleanStr.slice(1, -1);
                }
                cleanStr = cleanStr.replace(/\\"/g, '"');
                try {
                    const parsed2 = JSON.parse(cleanStr);
                    if (Array.isArray(parsed2)) features = parsed2;
                    else {
                        features = metadata.features.split(',').map((s: string) => s.trim());
                    }
                } catch (e2) {
                    features = metadata.features.split(',').map((s: string) => s.trim());
                }
            }
        }
    }

    // Map Categories
    const category = product.categories && product.categories.length > 0
        ? product.categories[0].name
        : 'Uncategorized';

    // Map Type
    const type = product.type ? product.type.value : 'print_builder';

    // Map Specs
    let specs: {
        minPages: number;
        maxPages: number;
        paperStocks: string[];
    } = {
        minPages: 0,
        maxPages: 0,
        paperStocks: [],
    };

    if (metadata.specs) {
        if (typeof metadata.specs === 'string') {
             try {
                const parsedSpecs = JSON.parse(metadata.specs);
                specs = { ...specs, ...parsedSpecs };
             } catch(e) {
                console.error(`[mapMedusaProduct] Failed to parse specs JSON for ${product.handle}`, e);
             }
        } else {
             specs = { ...specs, ...metadata.specs };
        }
    }

    // Note: Sizes are no longer parsed from Medusa metadata.
    // They are managed in the website Admin Dashboard -> Paper Ledger.

    if (!metadata.specs) {
        // Fallback: Try to find Options named "Paper"
        if (product.options) {
            const paperOpt = product.options.find((o: any) => o?.title?.toLowerCase().includes('paper'));
            if (paperOpt && paperOpt.values) {
                // @ts-ignore
                specs.paperStocks = paperOpt.values.map(v => v.value);
            }
        }
    }

    // Map Conventions from Collections or Tags
    const relevantConventions = product.collection
        ? [product.collection.handle]
        : [];

    if (product.tags) {
        product.tags.forEach((t: any) => relevantConventions.push(t.value));
    }

    console.log(`[mapMedusaProduct] Final specs for ${product.handle}:`, JSON.stringify(specs, null, 2));

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
            fields: "id,title,handle,description,subtitle,metadata,categories.id,categories.name,type.id,type.value,collection.id,collection.handle,tags.id,tags.value,options.id,options.title,options.values.id,options.values.value"
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
                fields: "id,title,handle,description,subtitle,metadata,categories.id,categories.name,type.id,type.value,collection.id,collection.handle,tags.id,tags.value,options.id,options.title,options.values.id,options.values.value"
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
