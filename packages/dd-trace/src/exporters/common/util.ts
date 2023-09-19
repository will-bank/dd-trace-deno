function safeJSONStringify(value) {
  return JSON.stringify(
    value,
    (key, value) => key !== 'dd-api-key' ? value : undefined,
    Deno.env.get('DD_TRACE_BEAUTIFUL_LOGS') ? 2 : undefined,
  );
}

export { safeJSONStringify };
