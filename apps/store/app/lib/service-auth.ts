import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export type ServiceName = "VTON_2D";

export type ServiceAuthResult =
    | { ok: true }
    | { ok: false; response: NextResponse };

function matchesSecret(candidate: string, secret: string): boolean {
    const candidateBytes = Buffer.from(candidate);
    const secretBytes = Buffer.from(secret);

    return (
        candidateBytes.length === secretBytes.length &&
        timingSafeEqual(candidateBytes, secretBytes)
    );
}

/**
 * Authorizes server-to-server service calls. These credentials are deliberately
 * separate from ServiceApiKey: the latter is a public per-service widget
 * identifier and must never authorize billable backend workloads.
 *
 * VTON_2D_SERVICE_KEY is server-only (do not prefix it with NEXT_PUBLIC_).
 * VTON_2D_SERVICE_KEY_PREVIOUS permits a zero-downtime credential rotation.
 */
export async function authorizeServiceRequest(
    request: NextRequest,
    service: ServiceName
): Promise<ServiceAuthResult> {
    const suppliedKey = request.headers.get("x-manikan-key");
    const activeKey = process.env[`${service}_SERVICE_KEY`];
    const previousKey = process.env[`${service}_SERVICE_KEY_PREVIOUS`];

    // Fail closed when the credential has not been configured. Do not reveal
    // whether the missing/invalid component was the caller or deployment.
    const authorized = Boolean(
        suppliedKey &&
            activeKey &&
            (matchesSecret(suppliedKey, activeKey) ||
                (previousKey && matchesSecret(suppliedKey, previousKey)))
    );

    if (!authorized) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    return { ok: true };
}
