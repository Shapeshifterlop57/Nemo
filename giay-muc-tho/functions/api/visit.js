
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: "Server configuration missing" },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const body = await request.json();
    const cf = request.cf || {};

    const pagePath =
      typeof body.page_path === "string"
        ? body.page_path.slice(0, 500)
        : "/";

    const ip =
      request.headers.get("CF-Connecting-IP") || null;

    const record = {
      user_id: null,
      email: null,
      page_path: pagePath,
      event_type: "page_view",
      ip_address: ip,
      country_code: cf.country || null,
      country_name: cf.country === "VN" ? "Việt Nam" : (cf.country || null),
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
      return Response.json(
        { error: "Could not save visit" },
        { status: 502, headers: corsHeaders }
      );
    }

    return Response.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch {
    return Response.json(
      { error: "Invalid request" },
      { status: 400, headers: corsHeaders }
    );
  }
}

