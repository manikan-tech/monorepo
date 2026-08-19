import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const connectionString = process.env.DATABASE_URL;
const shopperEmail = process.env.SHOPPER_TEST_EMAIL || "shopper@manikan.com";
const shopperPassword = process.env.SHOPPER_TEST_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !connectionString || !shopperPassword) {
    console.error(
        "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, DATABASE_URL, or SHOPPER_TEST_PASSWORD",
    );
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const email = shopperEmail;
    const password = shopperPassword;

    console.log(`Checking if user ${email} exists in Supabase Auth...`);
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existingAuthUser = users.find((u) => u.email === email);
    let authUserId = "";

    if (existingAuthUser) {
        console.log(`User ${email} already exists in Supabase Auth with ID: ${existingAuthUser.id}`);
        authUserId = existingAuthUser.id;
        const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
            password,
            email_confirm: true,
        });
        if (updateError) console.warn(`Warning: Could not update password: ${updateError.message}`);
    } else {
        console.log(`Creating user ${email} in Supabase Auth...`);
        const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { role: "customer", full_name: "Manikan Test Shopper" },
        });
        if (createError) throw createError;
        if (!user) throw new Error("Failed to create user in Supabase Auth.");
        console.log(`User created in Supabase Auth with ID: ${user.id}`);
        authUserId = user.id;
    }

    const customer = await prisma.customer.findUnique({ where: { email } });

    if (!customer) {
        console.log(`Customer record for ${email} does not exist yet. Creating...`);
        await prisma.customer.create({
            data: {
                authId: authUserId,
                email,
                firstName: "Manikan",
                lastName: "Shopper",
            },
        });
        console.log("Customer record created in Prisma DB.");
    } else {
        console.log("Customer record exists. Updating authId...");
        await prisma.customer.update({
            where: { id: customer.id },
            data: { authId: authUserId },
        });
        console.log("Customer record updated in Prisma DB.");
    }

    console.log("Shopper auth setup completed successfully!");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
