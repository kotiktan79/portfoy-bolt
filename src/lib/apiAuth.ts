/** Saf başlık birleştirme — testler supabase istemcisini yüklemeden bunu kullanır. */
export function headersWithToken(
  token: string | null | undefined,
  init: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...init };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Giriş oturumunun access token'ını API isteklerine ekler. */
export async function authorizedHeaders(
  init: Record<string, string> = {},
): Promise<Record<string, string>> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase.auth.getSession();
  return headersWithToken(data.session?.access_token, init);
}
