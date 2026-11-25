/** The single-file build has no server: accounts, sync, payments and AI are absent. */
export interface ApiError { status: number; code: string; error: string }
export const supabase = () => null;
export const accessToken = async () => null;
export async function api<T>(): Promise<T> {
  throw { status: 503, code: "NOT_AVAILABLE", error: "Not available in the single-file version." } satisfies ApiError;
}
