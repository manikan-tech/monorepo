import { NextRequest, NextResponse } from "next/server";
import { ChartType, Prisma } from "@prisma/client";
import { getAuthFromCookies } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { processIngestionJob } from "../../../lib/ingestion/process-job";
import { parseCsv } from "../../../lib/ingestion/parse-chart";
import {
  LIMIT_MESSAGES,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
} from "../../../lib/ingestion/limits";

// ─── /api/retailer/size-charts ──────────────────────────────────────────
// Bulk ingestion of measurement charts. Two chart types share one pipeline,
// parameterised by chartType -- BODY_FIT (the retailer's published size guide)
// and GARMENT_TECHPACK (flat garment measurements for 3D try-on).
//
// Auth: retailer SESSION COOKIE, same as every other dashboard route. Tenant
// isolation is enforced twice over: jobs are always filtered by retailerId,
// and product resolution during ingestion is scoped by (retailerId,
// productCode), so a CSV naming another tenant's product simply does not
// resolve.
//
// No quota is consumed. Every quota-reservation call site is shopper-facing; this
// is catalog management, like the product routes beside it.

const BUCKET = process.env.SIZE_CHART_BUCKET || "size-charts";

function isChartType(value: unknown): value is ChartType {
  return value === "BODY_FIT" || value === "GARMENT_TECHPACK";
}

// ─── GET: the retailer's own jobs, newest first ───
// Deliberately does not select `rows`/`errors` -- a job can carry thousands of
// rows and the list never needs them. `hasWarnings` is a stored column for
// exactly this reason: it lets the list flag a COMPLETE-but-imperfect job
// without pulling the row payload back to compute it.
export async function GET() {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.sizeChartIngestion.findMany({
    where: { retailerId: user.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      chartType: true,
      status: true,
      fileName: true,
      rowCount: true,
      committedRows: true,
      hasWarnings: true,
      failureReason: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}

// ─── POST: upload a CSV and run it ───
export async function POST(request: NextRequest) {
  const user = await getAuthFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const chartType = form.get("chartType");
  if (!isChartType(chartType)) {
    return NextResponse.json(
      { error: "chartType must be BODY_FIT or GARMENT_TECHPACK" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // ── Limits, before anything else ──
  // Step 1 runs the pipeline inline with no queue to absorb a large file, so
  // these are the guard rather than a formality. Size is checked off the File
  // handle so an oversized body is never read into memory.
  const isCsv =
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.toLowerCase().endsWith(".csv");
  if (!isCsv) {
    return NextResponse.json({ error: LIMIT_MESSAGES.notCsv }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { error: LIMIT_MESSAGES.tooLarge(file.size) },
      { status: 413 }
    );
  }

  const text = await file.text();
  const { data, fatal } = parseCsv(text);
  if (fatal) {
    return NextResponse.json(
      { error: `Invalid CSV format: ${fatal}` },
      { status: 400 }
    );
  }
  if (data.length > MAX_CSV_ROWS) {
    return NextResponse.json(
      { error: LIMIT_MESSAGES.tooManyRows(data.length) },
      { status: 400 }
    );
  }
  if (data.length === 0) {
    return NextResponse.json(
      { error: "CSV contains no data rows" },
      { status: 400 }
    );
  }

  // ── Create the job, carrying the raw rows so the handler needs only an id ──
  const job = await prisma.sizeChartIngestion.create({
    data: {
      retailerId: user.sub,
      chartType,
      fileName: file.name,
      rowCount: data.length,
      rows: data as unknown as Prisma.InputJsonValue,
    },
  });

  // ── Archive the original upload ──
  // Object key is {retailerId}/{jobId}/{fileName}: the bucket name already
  // supplies the outer namespace, so repeating it here would nest
  // size-charts/size-charts/... Storage is best-effort -- the parsed rows are
  // what the fix screen actually needs, so a Storage outage must not cost the
  // retailer their upload.
  const storagePath = `${user.sub}/${job.id}/${file.name}`;
  try {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: "text/csv",
        upsert: true,
      });
    if (error) throw new Error(error.message);
    await prisma.sizeChartIngestion.update({
      where: { id: job.id },
      data: { storagePath },
    });
  } catch (error) {
    console.error(
      "Size chart archive upload failed (continuing without it):",
      error instanceof Error ? error.message : error
    );
  }

  await processIngestionJob(job.id);

  const finished = await prisma.sizeChartIngestion.findUnique({
    where: { id: job.id },
  });
  return NextResponse.json({ job: finished }, { status: 202 });
}
