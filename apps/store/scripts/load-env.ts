import fs from "fs";
import path from "path";

// Load .env relative to process.cwd() BEFORE any other module (like Prisma Client) is imported
try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, "utf-8");
        for (const line of envConfig.split("\n")) {
            const match = line.trim().match(/^([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match && match[1]) {
                const key = match[1];
                let value = match[2] || "";
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
                process.env[key] = value;
            }
        }
    }
} catch (e) {
    console.warn("⚠️ Failed to parse .env file:", e);
}
