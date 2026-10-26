
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = env.SUPABASE_URL;
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  const key = env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !secret || !key) {
    return json({ error: "Missing server configuration" }, 500);
  }

  try {
    const body = await request.json();
    const auth = request.headers.get("Authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);

    let user_id = null;
    let email = null;

    if (match) {
      const res = await fetch(`${url}/auth/v1/user`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${match[1]}`,
        },
      });

      if (res.ok) {
        const user = await res.json();
        user_id = user.id || null;
        email = user.email || null;
      }
    }

    const cf = request.cf || {};

    const response = await fetch(`${url}/rest/v1/access_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id,
        email,
        page_path: typeof body.page_path === "string"
          ? body.page_path.slice(0, 500)
          : "/",
        event_type: "page_view",
        ip_address: request.headers.get("CF-Connecting-IP") || null,
        country_code: cf.country || null,
        country_name: cf.country === "VN" ? "Việt Nam" : cf.country || null,
        region_name: cf.region || null,
        city_name: cf.city || null,
        district_name: null,
      }),
    });

    if (!response.ok) {
      console.error("Log insert failed:", response.status);
      return json({ error: "Could not save visit" }, 502);
    }

    return json({ success: true });
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
}
