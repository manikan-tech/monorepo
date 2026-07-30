import "./load-env";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../app/lib/prisma";
import Stripe from "stripe";

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Load environment variables directly
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_PAYMENT_WEBHOOK_SECRET;
const adminSecret = process.env.ADMIN_SECRET;

if (!stripeSecretKey || !webhookSecret || !adminSecret) {
    console.error("❌ Missing required environment variables. Please check that your .env file defines:");
    console.error("   - STRIPE_SECRET_KEY");
    console.error("   - STRIPE_PAYMENT_WEBHOOK_SECRET");
    console.error("   - ADMIN_SECRET = supersecretadminpass");
    process.exit(1);
}


const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-06-24.dahlia",
});

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helper: Generate Stripe Signature Header ─────────────────────────────────
function generateStripeSignature(rawBody: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}.${rawBody}`;
    const hmac = crypto
        .createHmac("sha256", secret)
        .update(signaturePayload)
        .digest("hex");
    return `t=${timestamp},v1=${hmac}`;
}

// ─── Main Test Runner ─────────────────────────────────────────────────────────
async function runE2ETests() {
    console.log("🚀 Starting E2E Automation Test Suite for Order Return Saga...");

    let testRetailerId = "";
    let testCustomerId = "";
    let testProductId = "";
    let testVariantId = "";
    let happyPathOrderId = "";
    let concurrencyOrderId = "";
    let rollbackOrderId = "";
    let stripePaymentIntentId = "";

    try {
        // ── Pre-flight check: Seed a Test Product & Variant ───────────────────────
        console.log("🕒 Preparing database state...");

        // 1. Ensure Retailer exists
        const retailer = await prisma.retailer.upsert({
            where: { email: "qa-tester@manikan.com" },
            update: {},
            create: {
                authId: "qa-retailer-auth-id",
                email: "qa-tester@manikan.com",
                storeName: "QA Test Store",
                isActivated: true,
            },
        });
        testRetailerId = retailer.id;

        // 2. Ensure Category exists
        const category = await prisma.category.upsert({
            where: { slug: "qa-goods" },
            update: {},
            create: {
                name: "QA Goods",
                slug: "qa-goods",
            },
        });

        // 3. Ensure Product & Variant exist
        const product = await prisma.product.create({
            data: {
                retailerId: testRetailerId,
                categoryId: category.id,
                productCode: `QA-PROD-${Date.now()}`,
                name: "QA Automated Testing Tee",
                slug: `qa-automated-testing-tee-${Date.now()}`,
                category: "Garments",
                gender: "unisex",
                brand: "QA-Brand",
                fabric: "Cotton",
                priceEgp: 100,
                imageUrl: "https://example.com/test-garment.jpg",
                variants: {
                    create: {
                        sku: `QA-SKU-${Date.now()}`,
                        sizeLabel: "L",
                        stock: 10,
                    },
                },
            },
            include: { variants: true },
        });
        if (!product.variants || product.variants.length === 0) {
            throw new Error("Created product does not have any variants.");
        }
        testProductId = product.id;
        testVariantId = product.variants[0]!.id;

        // 4. Ensure Customer exists
        const customer = await prisma.customer.upsert({
            where: { email: "qa-customer@manikan.com" },
            update: {},
            create: {
                authId: "qa-customer-auth-id",
                email: "qa-customer@manikan.com",
                firstName: "Audrey",
                lastName: "QA-Tester",
            },
        });
        testCustomerId = customer.id;

        console.log("✅ Database test entities successfully created.");

        // ── TEST 1: Webhook Mocking & Database Payment Confirmation ──────────────────
        console.log("\n🧪 TEST 1: Simulating payment_intent.succeeded Webhook...");

        // Create a physical test order in PENDING status in the DB
        const order = await prisma.order.create({
            data: {
                customerId: testCustomerId,
                status: "DELIVERED", // We set it to DELIVERED so it can be eligible for returns later
                paymentStatus: "PENDING",
                subtotalEgp: 100,
                shippingEgp: 50,
                totalEgp: 150,
                items: {
                    create: {
                        productId: testProductId,
                        variantId: testVariantId,
                        quantity: 1,
                        unitPriceEgp: 100,
                        sizeLabel: "L",
                    },
                },
            },
        });
        happyPathOrderId = order.id;

        // Since we need to E2E test the Stripe refund, we MUST verify with a REAL test PaymentIntent.
        // We create a test PaymentIntent using Stripe's API with our test metadata orderId.
        console.log("🕒 Generating a real test PaymentIntent via Stripe API...");
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 15000, // 150 EGP in cents
            currency: "egp",
            payment_method: "pm_card_visa", // Automatic test-mode card payment
            confirm: true,
            metadata: { orderId: happyPathOrderId },
            return_url: "https://example.com/return",
        });
        stripePaymentIntentId = paymentIntent.id;

        // Build the mock webhook payload structure
        const webhookPayload = JSON.stringify({
            id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
            type: "payment_intent.succeeded",
            data: {
                object: {
                    id: stripePaymentIntentId,
                    object: "payment_intent",
                    amount: 15000,
                    currency: "egp",
                    status: "succeeded",
                    metadata: { orderId: happyPathOrderId },
                },
            },
        });

        const signatureHeader = generateStripeSignature(webhookPayload, webhookSecret!);

        console.log("🕒 POSTing webhook payload to /api/webhooks/payment...");
        const webhookResponse = await fetch(`${BASE_URL}/api/webhooks/payment`, {
            method: "POST",
            headers: {
                "stripe-signature": signatureHeader,
                "content-type": "application/json",
            },
            body: webhookPayload,
        });

        console.log(`Response Status: ${webhookResponse.status}`);
        const webhookBody = await webhookResponse.json();
        console.log("Response Body:", webhookBody);

        if (webhookResponse.status !== 200) {
            throw new Error(`Webhook endpoint failed with status ${webhookResponse.status}`);
        }

        // Verify DB update
        const updatedOrder = await prisma.order.findUnique({
            where: { id: happyPathOrderId },
        });

        if (!updatedOrder || updatedOrder.paymentStatus !== "PAID" || updatedOrder.stripePaymentIntentId !== stripePaymentIntentId) {
            throw new Error("❌ DB state verification failed. Order was not updated to PAID, or stripePaymentIntentId is missing.");
        }
        console.log("✅ Webhook processed successfully. Order status in DB: PAID.");

        // ── TEST 2: Happy Path Return & Refund (Phases 1, 2, & 3) ──────────────────
        console.log("\n🧪 TEST 2: Invoking patch order return and refund (Happy Path)...");

        // Before refund, record stock
        const variantBefore = await prisma.productVariant.findUniqueOrThrow({
            where: { id: testVariantId },
        });
        console.log(`Stock before return: ${variantBefore.stock}`);

        // Call PATCH endpoint on our local server
        const returnResponse = await fetch(`${BASE_URL}/api/dashboard/orders/${happyPathOrderId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Cookie: `manikan_admin=${adminSecret}`, // Authenticates as administrator
            },
            body: JSON.stringify({ status: "RETURNED" }),
        });

        console.log(`Response Status: ${returnResponse.status}`);
        const returnBody = await returnResponse.json();
        console.log("Response Body:", returnBody);

        if (returnResponse.status !== 200) {
            throw new Error(`PATCH return endpoint failed with status ${returnResponse.status}`);
        }

        // Verify DB final state
        const finalizedOrder = await prisma.order.findUniqueOrThrow({
            where: { id: happyPathOrderId },
        });
        const variantAfter = await prisma.productVariant.findUniqueOrThrow({
            where: { id: testVariantId },
        });

        console.log(`Stock after return: ${variantAfter.stock}`);

        if (
            finalizedOrder.status !== "RETURNED" ||
            finalizedOrder.paymentStatus !== "REFUNDED" ||
            !finalizedOrder.refundReferenceId
        ) {
            throw new Error("❌ Happy-path validation failed. Order status could not transition to RETURNED/REFUNDED.");
        }

        if (variantAfter.stock !== variantBefore.stock + 1) {
            throw new Error("❌ Happy-path validation failed. Inventory variant stock was not incremented.");
        }

        console.log(`✅ Happy Path completed. Refund reference created: ${finalizedOrder.refundReferenceId}`);

        // ── TEST 3: Concurrency / Race Condition Guard ────────────────────────────
        console.log("\n🧪 TEST 3: Simulating concurrent return requests for the same order...");

        // Create a new order eligible for return
        const concurrentOrder = await prisma.order.create({
            data: {
                customerId: testCustomerId,
                status: "DELIVERED",
                paymentStatus: "PENDING",
                stripePaymentIntentId: null, // to be updated via webhook or directly populated
                subtotalEgp: 100,
                shippingEgp: 50,
                totalEgp: 150,
                items: {
                    create: {
                        productId: testProductId,
                        variantId: testVariantId,
                        quantity: 1,
                        unitPriceEgp: 100,
                        sizeLabel: "L",
                    },
                },
            },
        });
        concurrencyOrderId = concurrentOrder.id;

        // Generate a real new test PaymentIntent for this order
        console.log("🕒 Generating a real test PaymentIntent for the concurrent order...");
        const concurrentPi = await stripe.paymentIntents.create({
            amount: 15000,
            currency: "egp",
            payment_method: "pm_card_visa",
            confirm: true,
            metadata: { orderId: concurrencyOrderId },
            return_url: "https://example.com/return",
        });

        // Directly update the order to set its PaymentIntent ID and PAID status
        await prisma.order.update({
            where: { id: concurrencyOrderId },
            data: {
                stripePaymentIntentId: concurrentPi.id,
                paymentStatus: "PAID",
            },
        });

        // Send two PATCH requests concurrently to the same order
        console.log(`🕒 Sending two parallel requests to return order: ${concurrencyOrderId}...`);
        const [request1, request2] = await Promise.all([
            fetch(`${BASE_URL}/api/dashboard/orders/${concurrencyOrderId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `manikan_admin=${adminSecret}`,
                },
                body: JSON.stringify({ status: "RETURNED" }),
            }),
            fetch(`${BASE_URL}/api/dashboard/orders/${concurrencyOrderId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `manikan_admin=${adminSecret}`,
                },
                body: JSON.stringify({ status: "RETURNED" }),
            }),
        ]);

        const status1 = request1.status;
        const status2 = request2.status;
        console.log(`Concurrent request outcomes: Status A = ${status1}, Status B = ${status2}`);

        const body1 = await request1.json();
        const body2 = await request2.json();
        console.log("Response A:", body1);
        console.log("Response B:", body2);

        // One of them must succeed (200) and the other must be rejected (409)
        const has200 = status1 === 200 || status2 === 200;
        const has409 = status1 === 409 || status2 === 409;
        const code409 = body1.code === "RETURN_ALREADY_IN_PROGRESS" || body2.code === "RETURN_ALREADY_IN_PROGRESS" || body1.code === "SERIALIZATION_FAILURE" || body2.code === "SERIALIZATION_FAILURE" || body1.code === "ORDER_ALREADY_RETURNED" || body2.code === "ORDER_ALREADY_RETURNED";

        if (!has200 || !has409 || !code409) {
            throw new Error("❌ Concurrency test failed. One request should have returned 200 and the other 409.");
        }
        console.log("✅ Concurrency locks and status guards successfully verified.");

        // ── TEST 4: Phase 2 Rollback Test ──────────────────────────────────────────
        console.log("\n🧪 TEST 4: Verifying rollback after Stripe refund fails...");

        // Create a new order with a non-existent/invalid but UNIQUE Stripe payment intent ID
        const testInvalidPi = `pi_invalid_${crypto.randomBytes(8).toString("hex")}`;
        const invalidPiOrder = await prisma.order.create({
            data: {
                customerId: testCustomerId,
                status: "DELIVERED",
                paymentStatus: "PAID",
                stripePaymentIntentId: testInvalidPi,
                subtotalEgp: 100,
                shippingEgp: 50,
                totalEgp: 150,
                items: {
                    create: {
                        productId: testProductId,
                        variantId: testVariantId,
                        quantity: 1,
                        unitPriceEgp: 100,
                        sizeLabel: "L",
                    },
                },
            },
        });
        rollbackOrderId = invalidPiOrder.id;

        const rollbackResponse = await fetch(`${BASE_URL}/api/dashboard/orders/${rollbackOrderId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Cookie: `manikan_admin=${adminSecret}`,
            },
            body: JSON.stringify({ status: "RETURNED" }),
        });

        console.log(`Response Status (Stripe Fails): ${rollbackResponse.status}`);
        const rollbackBody = await rollbackResponse.json();
        console.log("Response Body:", rollbackBody);

        if (rollbackResponse.status !== 502) {
            throw new Error(`Expected a 502 error status, got ${rollbackResponse.status}`);
        }

        // Verify DB rolled back from RETURN_PENDING to DELIVERED
        const rolledBackOrder = await prisma.order.findUniqueOrThrow({
            where: { id: rollbackOrderId },
        });

        if (rolledBackOrder.status !== "DELIVERED") {
            throw new Error(`❌ Rollback verification failed. Order status is stranded in ${rolledBackOrder.status} instead of DELIVERED.`);
        }

        console.log("✅ Rollback successful. Order status returned to DELIVERED.");

        console.log("\n🎉 ALL LIFE CYCLE TEST CASES COMPLETED SUCCESSFULLY! 🎉\n");
        process.exit(0);
    } catch (err) {
        console.error("\n❌ E2E verification suite failed:", err instanceof Error ? err.message : err);
        process.exit(1);
    } finally {
        // ── Cleanup ───────────────────────────────────────────────────────────────
        console.log("🧹 Cleaning up database test entities...");
        try {
            if (happyPathOrderId) await prisma.orderItem.deleteMany({ where: { orderId: happyPathOrderId } }).catch(() => { });
            if (concurrencyOrderId) await prisma.orderItem.deleteMany({ where: { orderId: concurrencyOrderId } }).catch(() => { });
            if (rollbackOrderId) await prisma.orderItem.deleteMany({ where: { orderId: rollbackOrderId } }).catch(() => { });

            if (happyPathOrderId) await prisma.order.delete({ where: { id: happyPathOrderId } }).catch(() => { });
            if (concurrencyOrderId) await prisma.order.delete({ where: { id: concurrencyOrderId } }).catch(() => { });
            if (rollbackOrderId) await prisma.order.delete({ where: { id: rollbackOrderId } }).catch(() => { });

            if (testProductId) {
                await prisma.productVariant.deleteMany({ where: { productId: testProductId } }).catch(() => { });
                await prisma.product.delete({ where: { id: testProductId } }).catch(() => { });
            }
            if (testCustomerId) await prisma.customer.delete({ where: { id: testCustomerId } }).catch(() => { });
            if (testRetailerId) await prisma.retailer.delete({ where: { id: testRetailerId } }).catch(() => { });
        } catch (cleanupError) {
            console.warn("⚠️ Cleanup encountered errors:", cleanupError);
        }
        await prisma.$disconnect();
    }
}

runE2ETests();
