import { getKalshiCredentialStatus } from "@/lib/kalshi/credentials";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    credentials: getKalshiCredentialStatus(),
    paperOnly: true,
  });
}
