
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Server configuration missing" }, 500);
  }

  try {
    const body = await request.json();
    const cf = request.cf || {};

    const pagePath =
      typeof body.page_path === "string"
        ? body.page_path.slice(0, 500)
        : "/";

    // Chỉ chấp nhận token phiên đăng nhập do Supabase xác minh.
    const authHeader = request.headers.get("Authorization") || "";
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);

    let userId = null;
    let email = null;

    if (tokenMatch) {
      const userResponse = await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${tokenMatch[1]}`,
          },
        }
      );

      if (userResponse.ok) {
        const user = await userResponse.json();
        userId = user.id || null;
        email = user.email || null;
      }
    }

    const record = {
      user_id: userId,
      email,
      page_path: pagePath,
      event_type: "page_view",
      ip_address: request.headers.get("CF-Connecting-IP") || null,
      country_code: cf.country || null,
      country_name:
        cf.country === "VN" ? "Việt Nam" : (cf.country || null),
      region_name: cf.region || null,
      city_name: cf.city || null,
      district_name: null,
    };

    const response = await fetch(
      `${supabaseUrl}/rest/v1/access_logs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(record),
      }
    );

    if (!response.ok) {
      console.error("Supabase insert failed:", response.status);
      return json({ error: "Could not save visit" }, 502);
    }

    return json({ success: true });
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
}
