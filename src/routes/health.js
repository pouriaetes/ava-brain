// Health check endpoint — lightweight, no secrets
export async function handleHealth(request, env, config) {
  const status = {
    ok: true,
    timestamp: new Date().toISOString(),
    environment: config.ENVIRONMENT,
    database: false,
  };

  try {
    if (config.DB) {
      await config.DB.prepare("SELECT 1").first();
      status.database = true;
    }
  } catch (error) {
    status.database = false;
    status.error = error.message;
    status.ok = false;
  }

  return new Response(JSON.stringify(status, null, 2), {
    status: status.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}