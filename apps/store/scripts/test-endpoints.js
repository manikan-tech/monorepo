import http from "http";
import { spawn } from "child_process";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: JSON.parse(data),
                    });
                } catch (e) {
                    reject(
                        new Error(
                            `Failed to parse response from ${url}: ${e.message}\nResponse was: ${data}`
                        )
                    );
                }
            });
        }).on("error", reject);
    });
}

async function runTests() {
    console.log("🚀 Starting verification tests for Product Catalog API...");

    // 1. Start dev server
    const devServer = spawn("npm", ["run", "dev"], {
        stdio: "ignore",
        shell: true,
    });

    // Ensure we kill the dev server on exit
    const cleanup = () => {
        console.log("🧹 Killing dev server...");
        devServer.kill("SIGINT");
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);

    try {
        // Wait for dev server to start
        console.log("🕒 Waiting 4 seconds for Next.js server to start...");
        await wait(4000);

        // Test 1: GET /api/categories
        console.log("\n🧪 Test 1: GET /api/categories");
        const categoriesUrl = `${BASE_URL}/api/categories`;
        const getCategories = await fetchJson(categoriesUrl);
        console.log(`Response Status: ${getCategories.status}`);
        if (getCategories.status !== 200)
            throw new Error("GET /api/categories failed");
        if (!Array.isArray(getCategories.body.categories))
            throw new Error("categories is not an array");
        console.log(
            `✅ Passed. Found ${getCategories.body.categories.length} root categories.`
        );

        // Test 2: GET /api/products
        console.log("\n🧪 Test 2: GET /api/products");
        const productsUrl = `${BASE_URL}/api/products`;
        const getProducts = await fetchJson(productsUrl);
        console.log(`Response Status: ${getProducts.status}`);
        if (getProducts.status !== 200)
            throw new Error("GET /api/products failed");
        if (!Array.isArray(getProducts.body.products))
            throw new Error("products is not an array");
        if (typeof getProducts.body.pagination !== "object")
            throw new Error("pagination is missing");
        console.log(
            `✅ Passed. Found ${getProducts.body.products.length} products. Total in DB: ${getProducts.body.pagination.total}`
        );

        // If there is at least one product, we test detailed retrieval and category retrieval
        if (getProducts.body.products.length > 0) {
            const sampleProduct = getProducts.body.products[0];
            const sampleSlug = sampleProduct.slug;

            // Test 3: GET /api/products/[slug]
            console.log(`\n🧪 Test 3: GET /api/products/${sampleSlug}`);
            const slugUrl = `${BASE_URL}/api/products/${sampleSlug}`;
            const getProductDetail = await fetchJson(slugUrl);
            console.log(`Response Status: ${getProductDetail.status}`);
            if (getProductDetail.status !== 200)
                throw new Error("GET /api/products/[slug] failed");
            if (getProductDetail.body.product.slug !== sampleSlug)
                throw new Error("mismatched slug returned");
            if (!Array.isArray(getProductDetail.body.product.variants))
                throw new Error("variants is missing in detailed view");
            console.log(`✅ Passed. Successfully retrieved detailed product object.`);

            // Test 4: GET /api/categories/[slug]/products
            const categorySlug = sampleProduct.categoryRef?.slug || "men";
            console.log(`\n🧪 Test 4: GET /api/categories/${categorySlug}/products`);
            const catProductsUrl = `${BASE_URL}/api/categories/${categorySlug}/products`;
            const getCatProducts = await fetchJson(catProductsUrl);
            console.log(`Response Status: ${getCatProducts.status}`);
            if (getCatProducts.status !== 200)
                throw new Error("GET /api/categories/[slug]/products failed");
            if (!Array.isArray(getCatProducts.body.products))
                throw new Error("products list by category is not an array");
            console.log(
                `✅ Passed. Found ${getCatProducts.body.products.length} products in category ${categorySlug}.`
            );
        } else {
            console.warn(
                "⚠️ No products found in database. Skipping single product and category-products tests."
            );
            console.warn("💡 Try running 'npx prisma db seed' first.");
        }

        // Test 5: GET /api/products/search?q=...
        console.log("\n🧪 Test 5: GET /api/products/search?q=suit");
        const searchUrl = `${BASE_URL}/api/products/search?q=suit`;
        const searchProducts = await fetchJson(searchUrl);
        console.log(`Response Status: ${searchProducts.status}`);
        if (searchProducts.status !== 200)
            throw new Error("GET /api/products/search failed");
        if (!Array.isArray(searchProducts.body.products))
            throw new Error("search did not return products array");
        console.log(
            `✅ Passed. Search returned ${searchProducts.body.products.length} matching products.`
        );

        console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n");
        process.exit(0);
    } catch (error) {
        console.error(`\n❌ Test suite failed: ${error.message}`);
        process.exit(1);
    } finally {
        cleanup();
    }
}

runTests();
