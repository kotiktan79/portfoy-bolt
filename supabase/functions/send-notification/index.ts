import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationRequest {
  type: 'telegram' | 'discord';
  message: string;
  config: {
    botToken?: string;
    chatId?: string;
    webhookUrl?: string;
  };
}

async function sendTelegramMessage(botToken: string, chatId: string, message: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }

  return await response.json();
}

async function sendDiscordMessage(webhookUrl: string, message: string) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: message,
      embeds: [{
        title: '📊 Portfolio Bildirimi',
        description: message,
        color: 3447003,
        timestamp: new Date().toISOString(),
      }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord webhook error: ${error}`);
  }

  return { success: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const requestData: NotificationRequest = await req.json();
    const { type, message, config } = requestData;

    let result;

    if (type === 'telegram') {
      if (!config.botToken || !config.chatId) {
        throw new Error('Bot token and chat ID are required for Telegram');
      }
      result = await sendTelegramMessage(config.botToken, config.chatId, message);
    } else if (type === 'discord') {
      if (!config.webhookUrl) {
        throw new Error('Webhook URL is required for Discord');
      }
      result = await sendDiscordMessage(config.webhookUrl, message);
    } else {
      throw new Error('Invalid notification type');
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});