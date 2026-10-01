import { auth } from "../firebase";

/**
 * JSON headers carrying the signed-in user's Firebase ID token.
 *
 * The transactional email routes take their RECIPIENT from the request body, so
 * while they were unauthenticated anyone could make the platform's SMTP
 * identity send mail to any address — the kind of thing that gets a sending
 * domain blocklisted. They now verify a token, and every browser caller reaches
 * them through this helper.
 *
 * The token is omitted rather than faked when there is no signed-in user: the
 * server answers 401, which is the correct outcome and a legible one, instead
 * of a request that looks authenticated and is not.
 */
export async function authedJsonHeaders(): Promise<Record<string, string>> {
  let idToken: string | undefined;
  try {
    idToken = await auth.currentUser?.getIdToken();
  } catch {
    // A refresh failure is not worth failing the caller over — let the server
    // reject it and let the caller's existing error handling report that.
  }
  return {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
}
