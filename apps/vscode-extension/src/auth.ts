import * as vscode from "vscode";

const TOKEN_KEY = "rtl.jwt";
const BACKEND = process.env.BACKEND_URL || "http://localhost:7070";

export async function loginWithGitHub(context: vscode.ExtensionContext) {
  try {
    // 1) ask backend for auth URL + state
    const r = await fetch(`${BACKEND}/auth/github/url`);
    if (!r.ok) throw new Error(`Auth URL failed: ${r.status}`);
    const { authUrl, state } = (await r.json()) as {
      authUrl: string;
      state: string;
    };

    // 2) open browser for user to login
    await vscode.env.openExternal(vscode.Uri.parse(authUrl));

    // 3) poll for token
    const token = await pollForToken(state);

    // 4) store token securely
    await context.secrets.store(TOKEN_KEY, token);
    vscode.window.showInformationMessage("GitHub login successful ✔");
  } catch (e: any) {
    vscode.window.showErrorMessage(`GitHub login failed: ${e?.message ?? e}`);
  }
}

export async function logout(context: vscode.ExtensionContext) {
  await context.secrets.delete(TOKEN_KEY);
  vscode.window.showInformationMessage("Logged out.");
}

export async function getToken(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  return context.secrets.get(TOKEN_KEY);
}

export async function ensureAuth(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  let token = await getToken(context);
  if (token) return token;

  const choice = await vscode.window.showInformationMessage(
    "Login with GitHub to use the RTL generator.",
    "Login",
    "Cancel",
  );
  if (choice !== "Login") return;

  await loginWithGitHub(context);
  token = await getToken(context);
  return token;
}

async function pollForToken(
  state: string,
  timeoutMs = 120000,
): Promise<string> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) throw new Error("Login timed out");
    await delay(1500);

    const res = await fetch(
      `${BACKEND}/auth/github/token?state=${encodeURIComponent(state)}`,
    );
    if (res.status === 202) continue; // pending
    if (!res.ok) throw new Error(`Auth error ${res.status}`);
    const j = (await res.json()) as { token?: string };
    if (j.token) return j.token;
  }
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
