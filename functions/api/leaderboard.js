const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { env } = context;
  const data = await env.LEADERBOARD.get('jumping_leaderboard', 'json');
  const leaderboard = data || [];
  return new Response(JSON.stringify(leaderboard.slice(0, 5)), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const { name, time } = await request.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 20) {
    return new Response(JSON.stringify({ error: 'Invalid name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  if (typeof time !== 'number' || time <= 0 || time > 3600000) {
    return new Response(JSON.stringify({ error: 'Invalid time' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const data = await env.LEADERBOARD.get('jumping_leaderboard', 'json');
  const leaderboard = data || [];

  leaderboard.push({ name: name.trim().slice(0, 20), time, date: Date.now() });
  leaderboard.sort((a, b) => a.time - b.time);
  const top5 = leaderboard.slice(0, 5);

  await env.LEADERBOARD.put('jumping_leaderboard', JSON.stringify(top5));

  return new Response(JSON.stringify(top5), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
