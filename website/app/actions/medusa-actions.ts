
import { getAllProducts } from '../lib/medusa-products';

export interface AdminProductSummary {
    id: string;
    title: string;
    handle: string;
}

export async function fetchAdminProducts(): Promise<AdminProductSummary[]> {
    try {
        const products = await getAllProducts();
        // Sort by title for easier dropdown navigation
        return products
            .map(p => ({
                id: p.id,
                title: p.name,
                handle: p.slug
            }))
            .sort((a, b) => a.title.localeCompare(b.title));
    } catch (error) {
        console.error("Failed to fetch admin products:", error);
        return [];
    }
}
