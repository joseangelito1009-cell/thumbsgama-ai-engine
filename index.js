import { THUMBSGAMA_BRAIN } from './brain.js';

const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  }
});

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map(x => x.trim()).filter(Boolean);
  if (allowed.includes('*')) return '*';
  return allowed.includes(origin) ? origin : allowed[0] || 'null';
}

function dateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function validDeviceId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{12,100}$/.test(value);
}

async function getUsage(env, deviceId) {
  const row = await env.DB.prepare('SELECT used FROM daily_usage WHERE device_id = ? AND usage_date = ?')
    .bind(deviceId, dateKey()).first();
  const used = Math.min(2, Number(row?.used || 0));
  return { used, remaining: Math.max(0, 2 - used), limit: 2, date: dateKey() };
}

async function reserveCredit(env, deviceId) {
  const result = await env.DB.prepare(`
    INSERT INTO daily_usage (device_id, usage_date, used)
    VALUES (?, ?, 1)
    ON CONFLICT(device_id, usage_date) DO UPDATE SET used = used + 1
    WHERE daily_usage.used < 2
    RETURNING used
  `).bind(deviceId, dateKey()).first();
  if (!result) return null;
  return Number(result.used);
}

async function refundCredit(env, deviceId) {
  await env.DB.prepare(`UPDATE daily_usage SET used = CASE WHEN used > 0 THEN used - 1 ELSE 0 END
    WHERE device_id = ? AND usage_date = ?`).bind(deviceId, dateKey()).run();
}

function buildInput(prompt, reference) {
  const text = `${THUMBSGAMA_BRAIN}\n\nUSER'S CREATIVE BRIEF:\n${prompt}\n\nCreate the image now. If there is an input reference image, use it as visual context according to the user's instructions.`;
  const content = [{ type: 'input_text', text }];
  if (reference) content.push({ type: 'input_image', image_url: reference, detail: 'high' });
  return [{ role: 'user', content }];
}

async function generate(request, env, origin) {
  if (!env.OPENAI_API_KEY) return json({ error: 'El backend todavía no tiene configurada la clave privada del generador.' }, 503, origin);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'La solicitud no contiene JSON válido.' }, 400, origin); }
  const { deviceId, prompt, previousResponseId, reference, size, quality } = body || {};
  if (!validDeviceId(deviceId)) return json({ error: 'Identificador del dispositivo no válido. Recarga la página e inténtalo de nuevo.' }, 400, origin);
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000) return json({ error: 'La idea está vacía o es demasiado larga.' }, 400, origin);
  if (reference && (typeof reference !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(reference) || reference.length > 7_000_000)) {
    return json({ error: 'La referencia debe ser PNG, JPG o WEBP y pesar como máximo 5 MB.' }, 400, origin);
  }
  if (previousResponseId && (typeof previousResponseId !== 'string' || !/^resp_[a-zA-Z0-9_-]+$/.test(previousResponseId))) {
    return json({ error: 'La sesión de edición no es válida. Pulsa Nueva creación y comienza otra vez.' }, 400, origin);
  }
  const outputSize = size === '1024x1024' ? '1024x1024' : '1536x864';
  const outputQuality = ['low','medium','high','xhigh','max'].includes(quality) ? quality : 'max';

  let reserved;
  try { reserved = await reserveCredit(env, deviceId); }
  catch { return json({ error: 'No se pudo consultar el contador diario. Revisa la base de datos D1 del backend.' }, 503, origin); }
  if (!reserved) {
    const usage = await getUsage(env, deviceId);
    return json({ error: 'Ya utilizaste tus 2 generaciones de hoy. Tus usos se renovarán mañana.', ...usage }, 429, origin);
  }

  try {
    const requestBody = {
      model: env.REASONING_MODEL || 'gpt-6-astra',
      tools: [{ type: 'image_generation', model: env.IMAGE_MODEL || 'gpt-image-2.5-sunburst', size: outputSize, quality: outputQuality, partial_images: 0 }],
      input: previousResponseId ? prompt.trim() : buildInput(prompt.trim(), reference || null),
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {})
    };
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const apiData = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const detail = apiData?.error?.message || `El proveedor de IA respondió con estado ${apiResponse.status}.`;
      throw new Error(detail);
    }
    const imageCall = (apiData.output || []).find(item => item.type === 'image_generation_call' && item.result);
    if (!imageCall) throw new Error('El modelo terminó, pero no devolvió una imagen. Prueba describiendo la escena de otra manera.');
    const usage = await getUsage(env, deviceId);
    return json({ image: imageCall.result, responseId: apiData.id || previousResponseId || null, remaining: usage.remaining, used: usage.used }, 200, origin);
  } catch (error) {
    await refundCredit(env, deviceId).catch(() => {});
    const msg = String(error?.message || 'Error desconocido');
    const safeMessage = msg.length > 450 ? msg.slice(0, 450) + '…' : msg;
    return json({ error: `No se pudo terminar la imagen: ${safeMessage}. El uso se devolvió al contador.` }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    }});
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'Thumbsgama API', imageModel: env.IMAGE_MODEL || 'gpt-image-2.5-sunburst' }, 200, origin);
    if (url.pathname === '/api/usage' && request.method === 'GET') {
      const deviceId = url.searchParams.get('deviceId');
      if (!validDeviceId(deviceId)) return json({ error: 'Identificador no válido.' }, 400, origin);
      try { return json(await getUsage(env, deviceId), 200, origin); }
      catch { return json({ error: 'No se pudo leer el contador diario.' }, 503, origin); }
    }
    if (url.pathname === '/api/generate' && request.method === 'POST') return generate(request, env, origin);
    return json({ error: 'Ruta no encontrada.' }, 404, origin);
  }
};
