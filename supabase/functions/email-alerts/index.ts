import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailAlert {
  email: string;
  subject: string;
  message: string;
  type: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email, subject, message, type }: EmailAlert = await req.json();

    if (!email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Email Alert: ${type} to ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);

    const emailLog = {
      timestamp: new Date().toISOString(),
      email,
      subject,
      type,
      status: "simulated",
    };

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email alert logged (simulation mode)",
        data: emailLog,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Email alert error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process email alert" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
