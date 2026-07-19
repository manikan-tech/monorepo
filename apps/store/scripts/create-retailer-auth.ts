import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const connectionString = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseServiceKey || !connectionString) {
    console.error("Missing environment variables in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const email = "retailer@manikan.com";
    const password = "ManikanPassword123";

    console.log(`Checking if user ${email} exists in Supabase Auth...`);

    // Try to find the user in Supabase Auth via admin API
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
        throw listError;
    }

    const existingAuthUser = users.find(u => u.email === email);
    let authUserId = "";

    if (existingAuthUser) {
        console.log(`User ${email} already exists in Supabase Auth with ID: ${existingAuthUser.id}`);
        authUserId = existingAuthUser.id;

        // Update password just in case it was created without ManikanPassword123
        console.log(`Updating password for ${email} in Supabase Auth...`);
        const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
            password: password,
            email_confirm: true
        });
        if (updateError) {
            console.warn(`Warning: Could not update password: ${updateError.message}`);
        }
    } else {
        console.log(`Creating user ${email} in Supabase Auth...`);
        const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                role: "retailer",
                full_name: "Manikan Official Retailer"
            }
        });

        if (createError) {
            throw createError;
        }

        if (!user) {
            throw new Error("Failed to create user in Supabase Auth.");
        }

        console.log(`User created in Supabase Auth with ID: ${user.id}`);
        authUserId = user.id;
    }

    // Now, find the Retailer record in our Prisma Database and update its authId
    const retailer = await prisma.retailer.findUnique({
        where: { email }
    });

    if (!retailer) {
        console.log(`Retailer record for ${email} does not exist in Prisma DB yet. Creating new Retailer record...`);
        await prisma.retailer.create({
            data: {
                authId: authUserId,
                email,
                storeName: "Manikan Official Store",
                plan: "premium",
                isActivated: true
            }
        });
        console.log(`Retailer record created in Prisma DB.`);
    } else {
        console.log(`Retailer record exists. Updating authId to ${authUserId}...`);
        await prisma.retailer.update({
            where: { id: retailer.id },
            data: {
                authId: authUserId,
                isActivated: true
            }
        });
        console.log(`Retailer record updated in Prisma DB.`);
    }

    console.log("Retailer auth setup completed successfully! 🎉");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
