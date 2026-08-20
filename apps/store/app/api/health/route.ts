import { NextResponse } from "next/server";

// Deliberately dependency-free liveness endpoint for the container runtime.
// Database and upstream-service checks belong to their respective request
// paths; making this endpoint depend on them would turn a transient external
// outage into an unnecessary Store restart.
export async function GET() {
    return NextResponse.json({ service: "store", status: "ok" });
}
