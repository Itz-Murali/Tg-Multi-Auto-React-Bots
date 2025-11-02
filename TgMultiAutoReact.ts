const EMOJIS = [
   '👍','❤️','🔥','🥰','👏','🤯','🎉','🙏','👌','🕊️','😍','🐳',
  '❤️‍🔥','💯','⚡️','🍾','👀','🙈','😇',
  '🤝','🤗','🎄','🗿','🆒','😘'
];
export default {
  async fetch(request: Request, env: any, ctx: any) {
    const origin = new URL(request.url).origin;

    const tokensRaw: string = env.BOT_TOKENS ?? env.BOT_TOKEN ?? '';
    const tokens: string[] = parseTokens(tokensRaw);

    const tokenMap: Record<string, string> = {};
    for (const t of tokens) {
      const prefix = t.split(':')[0];
      if (prefix) tokenMap[prefix] = t;
    }

    // added auto-register webhooks 
    if (Object.keys(tokenMap).length > 0) {
      ctx.waitUntil(registerAllWebhooks(origin, tokenMap));
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('Telegram Reaction Bot is running!', { status: 200 });
    }

    // only for optional 
    if (request.method === 'GET' && url.pathname === '/setwebhooks') {
      const results = await registerAllWebhooks(origin, tokenMap);
      return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const pathMatch = url.pathname.match(/^\/bot([0-9A-Za-z_-]+)/);
      if (!pathMatch) return new Response('', { status: 200 });

      const prefix = pathMatch[1];
      const botToken = tokenMap[prefix];
      if (!botToken) return new Response('', { status: 200 });

      let update: any = null;
      try {
        update = await request.json();
      } catch (e) {
        return new Response('', { status: 200 });
      }

      ctx.waitUntil(handleUpdate(botToken, update));
      return new Response('', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }
};

function parseTokens(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean);
    } catch (e) {
       // ignore errors
    }
  }
  
  return trimmed.split(/[,]+/).map(s => s.trim()).filter(Boolean);
}

async function registerAllWebhooks(origin: string, tokenMap: Record<string, string>) {
  const results: Record<string, { ok: boolean; status: number; body: string } | { ok: false; error: string }> = {};
  const promises: Promise<void>[] = [];

  for (const prefix of Object.keys(tokenMap)) {
    const token = tokenMap[prefix];
    const webhookUrl = `${origin.replace(/\/$/, '')}/bot${prefix}`;
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook`;
    const p = fetch(`${url}?url=${encodeURIComponent(webhookUrl)}`, { method: 'GET' })
      .then(async (res) => {
        const text = await res.text();
        results[prefix] = { ok: res.ok, status: res.status, body: text };
      })
      .catch((err) => {
        results[prefix] = { ok: false, error: String(err) };
      });
    promises.push(p);
  }

  await Promise.all(promises);
  return results;
}

async function handleUpdate(botToken: string, update: any) {
  try {
    if (!update) return;

    if (update.message) {
      const chat_id = update.message.chat?.id;
      const message_id = update.message.message_id;

      if (update.message.text && update.message.text === '/stiart') {
        await sendMessage(botToken, chat_id, 'Hello! I will react to every message you send 📌');
      } else {
        await reactWithRandomEmoji(botToken, chat_id, message_id);
      }
    } else if (update.channel_post) {
      const chat_id = update.channel_post.chat?.id;
      const message_id = update.channel_post.message_id;
      await reactWithRandomEmoji(botToken, chat_id, message_id);
    }
  } catch (e) {
    // ignore errors
  }
}

async function sendMessage(botToken: string, chat_id: number | string, text: string) {
  if (!chat_id) return;
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text })
    });
  } catch (e) {
    // ignore errorrs
  }
}

async function reactWithRandomEmoji(botToken: string, chat_id: number | string, message_id: number) {
  if (!chat_id || !message_id) return;
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/setMessageReaction`;
  const payload = {
    chat_id,
    message_id,
    reaction: [{ type: 'emoji', emoji }],
    is_big: true
  };
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // ignore errors again
  }
}


