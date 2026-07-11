import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin client — uses the service role key.
 * ONLY use server-side. Never expose to the client.
 */
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);
