import { getMarkets } from "@/lib/kalshi/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? "80");

  try {
    const data = await getMarkets({
      query,
      limit: Number.isFinite(limit) ? limit : 80,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        markets: [],
        source: "mock",
        fetchedAt: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : "Failed to load markets",
      },
      { status: 200 },
    );
  }
}
