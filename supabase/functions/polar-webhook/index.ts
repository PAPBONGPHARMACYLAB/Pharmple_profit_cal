// supabase/functions/polar-webhook/index.ts
// Polar 결제 완료 Webhook 처리 → 사용자 토큰 지급 / 구독 활성화

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── 상품 ID → 토큰/구독 매핑 ──────────────────────────
const PRODUCT_MAP: Record<string, { tokens: number; subType: string; subDays: number }> = {
  "4155d1da-c200-4205-9724-c6b90761a4ba": { tokens: 5,   subType: "none",      subDays: 0 },   // 알약 5개
  "853935c6-9253-460c-b06f-f32b5cfc34c1": { tokens: 10,  subType: "none",      subDays: 0 },   // 알약 10개
  "b8750c72-2d4d-4e50-b139-2117ad2aa808": { tokens: 100, subType: "none",      subDays: 0 },   // 알약 100개
  "4f9feec4-36cd-41dc-bf31-7975dde9dc5c": { tokens: 0,   subType: "weekly",    subDays: 7 },   // 1주일 구독
  "f6ef5473-6978-49f5-b5d2-730cc9f83c05": { tokens: 0,   subType: "monthly",   subDays: 30 },  // 1달 구독
  "4aa54712-2102-4448-b76b-888767f4813b": { tokens: 0,   subType: "unlimited", subDays: 36500 }, // 무제한 평생
};

const POLAR_WEBHOOK_SECRET = Deno.env.get("POLAR_WEBHOOK_SECRET") ?? "";

// ── 웹훅 서명 검증 (Standard Webhooks spec) ──────────
async function verifySignature(body: string, headers: Headers): Promise<boolean> {
  const msgId = headers.get("webhook-id") ?? "";
  const msgTimestamp = headers.get("webhook-timestamp") ?? "";
  const msgSignature = headers.get("webhook-signature") ?? "";

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // 타임스탬프 범위 확인 (±5분)
  const ts = parseInt(msgTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const toSign = `${msgId}.${msgTimestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(POLAR_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const computed = "v1," + btoa(String.fromCharCode(...new Uint8Array(signature)));

  // 여러 서명 중 하나라도 일치하면 OK
  return msgSignature.split(" ").some((s) => s === computed);
}

// ── 메인 핸들러 ───────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await req.text();

  // 서명 검증
  const valid = await verifySignature(body, req.headers);
  if (!valid) {
    console.error("[polar-webhook] 서명 검증 실패");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log("[polar-webhook] 이벤트 수신:", event.type);

  // Supabase 클라이언트 (Service Role — RLS 우회)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── order.created: 일회성 구매(알약 팩) ─────────────
  if (event.type === "order.created") {
    const order = event.data;
    const orderId = order.id as string;
    const productId = order.product_id as string;
    const externalCustomerId = order.customer?.external_id as string | undefined;

    if (!externalCustomerId) {
      console.warn("[polar-webhook] external_id 없음, 스킵");
      return new Response("OK", { status: 200 });
    }

    const mapping = PRODUCT_MAP[productId];
    if (!mapping) {
      console.warn("[polar-webhook] 알 수 없는 상품 ID:", productId);
      return new Response("OK", { status: 200 });
    }

    // 중복 처리 방지
    const { data: existing } = await supabase
      .from("polar_orders")
      .select("id")
      .eq("polar_order_id", orderId)
      .single();

    if (existing) {
      console.log("[polar-webhook] 이미 처리된 주문:", orderId);
      return new Response("OK", { status: 200 });
    }

    // 토큰 지급 or 구독 활성화
    if (mapping.tokens > 0) {
      // 토큰 추가
      const { error } = await supabase.rpc("increment_tokens", {
        user_id: externalCustomerId,
        amount: mapping.tokens,
      });
      if (error) console.error("[polar-webhook] 토큰 지급 오류:", error);
    } else if (mapping.subType !== "none") {
      // 구독 활성화
      const expiresAt = mapping.subType === "unlimited"
        ? null
        : new Date(Date.now() + mapping.subDays * 86400000).toISOString();

      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_type: mapping.subType,
          subscription_expires_at: expiresAt,
          is_unlimited: mapping.subType === "unlimited",
        })
        .eq("id", externalCustomerId);

      if (error) console.error("[polar-webhook] 구독 활성화 오류:", error);
    }

    // 주문 기록 저장 (idempotency)
    await supabase.from("polar_orders").insert({
      polar_order_id: orderId,
      user_id: externalCustomerId,
      product_id: productId,
      tokens_granted: mapping.tokens,
    });

    console.log("[polar-webhook] 처리 완료:", orderId);
  }

  // ── subscription.updated / cancelled ────────────────
  if (event.type === "subscription.updated" || event.type === "subscription.cancelled") {
    const sub = event.data;
    const externalCustomerId = sub.customer?.external_id as string | undefined;
    if (!externalCustomerId) return new Response("OK", { status: 200 });

    const status = sub.status; // "active" | "canceled" | "past_due" etc.
    if (status === "canceled" || status === "past_due") {
      await supabase
        .from("profiles")
        .update({ subscription_type: "none", is_unlimited: false })
        .eq("id", externalCustomerId);
      console.log("[polar-webhook] 구독 취소 처리:", externalCustomerId);
    }
  }

  return new Response("OK", { status: 200 });
});
