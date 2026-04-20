export function errorResult(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `${label}: ${msg}` }],
    isError: true as const,
  };
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
