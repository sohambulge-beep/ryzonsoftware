import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Max photo payload size (Base64 string for ~5MB binary file is approx 7MB)
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN") || "*";
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Sarf POST request allowed hai." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 }
    );
  }

  try {
    // 1. JWT Authentication Verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Pehle login karein." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Aapka session expire ho gaya hai. Dobara login karein." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // 2. Simple Daily Rate Limiting per User (Max 50 scans per day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: scanCount, error: countError } = await supabase
      .from("stock_photos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString());

    if (!countError && scanCount !== null && scanCount >= 50) {
      return new Response(
        JSON.stringify({ error: "Aaj ki photo scan limit (50) poori ho gayi hai." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
      );
    }

    // 3. Request Payload Processing & Validation
    const body = await req.json();
    const { image_base64, photo_hash, product_list } = body;

    if (!image_base64 || typeof image_base64 !== "string") {
      return new Response(
        JSON.stringify({ error: "Photo saaf nahi hai, dobara lo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (image_base64.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Photo ka size 5 MB se kam hona chahiye." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Remove base64 data prefix if present
    const cleanBase64 = image_base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    // 4. Check Duplicate Photo Hash
    if (photo_hash && typeof photo_hash === "string") {
      const { data: existingPhoto } = await supabase
        .from("stock_photos")
        .select("id")
        .eq("user_id", user.id)
        .eq("photo_hash", photo_hash)
        .maybeSingle();

      if (existingPhoto) {
        return new Response(
          JSON.stringify({ error: "Yeh photo pehle se scan aur process ho chuki hai." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }
    }

    // 5. Configurable AI Environment Secrets
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Server system setup incomplete hai. Admin se baat karein." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 6. Gemini Structured Output Request Construction
    const promptText = `You are an AI assistant for TapTrack ("Prime Terminal"), a bar management SaaS in India.
Your job is to read delivery challans, bills, or photo stacks of liquor bottles and cartons.

Product Catalog:
${JSON.stringify(product_list || [])}

Rules:
1. Extract brand name, volume size in ml (180, 375, 500, 650, 750, 1000), and bottle/case quantity.
2. Match extracted items to existing catalog products where possible. Correct misspellings (e.g. "Rl Stg" -> "Royal Stag").
3. NEVER GUESS. Only extract what is clearly legible or visible.
4. Set "needs_review": true if photo is blurry, items are obscured, or size/quantity is questionable.
5. Set "confidence": number between 0.0 and 1.0.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  brand: { type: "STRING" },
                  size_ml: { type: "NUMBER" },
                  quantity: { type: "NUMBER" },
                  product_id: { type: "STRING", nullable: true },
                  confidence: { type: "NUMBER" },
                  needs_review: { type: "BOOLEAN" },
                },
                required: ["brand", "size_ml", "quantity", "confidence", "needs_review"],
              },
            },
            notes: { type: "STRING" },
          },
          required: ["items", "notes"],
        },
        temperature: 0.1,
      },
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Photo saaf nahi hai, dobara lo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 422 }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "Photo saaf nahi hai, dobara lo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 422 }
      );
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Photo saaf nahi hai, dobara lo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 422 }
      );
    }

    return new Response(JSON.stringify(parsedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Photo process nahi ho saki, dobara try karein." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
