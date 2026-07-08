import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

export async function GET(request: NextRequest) {
    try {
        // Fetch all categories
        const categories = await prisma.category.findMany({
            orderBy: { name: "asc" }
        });

        // Structure categories into a tree (roots with children nested under children property)
        const categoryMap = new Map<string, any>();

        // Initialize map
        categories.forEach((cat) => {
            categoryMap.set(cat.id, {
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                description: cat.description,
                imageUrl: cat.imageUrl,
                parentId: cat.parentId,
                children: []
            });
        });

        const rootCategories: any[] = [];

        // Build the tree hierarchy
        categoryMap.forEach((node) => {
            if (node.parentId) {
                const parent = categoryMap.get(node.parentId);
                if (parent) {
                    parent.children.push(node);
                } else {
                    // If parent not found, fallback to root
                    rootCategories.push(node);
                }
            } else {
                rootCategories.push(node);
            }
        });

        return NextResponse.json({ categories: rootCategories }, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch categories:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
