import type { Project } from "./TeamWorkspace";

export type User = {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
};
let csrf = "";
export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api(
  action: string,
  body?: unknown,
  params: Record<string, string> = {},
) {
  const url = new URL("./api/index.php", window.location.href);
  url.search = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Shared backend is unavailable. Deploy the PHP package to enable online projects.",
    );
  }
  if (!response.ok)
    throw new RequestError(result.error || "Request failed.", response.status);
  if (result.csrf) csrf = result.csrf;
  return result;
}

export async function loadShared(
  id: string,
  revision?: number,
): Promise<Project> {
  const [data, history] = await Promise.all([
    api("load", undefined, {
      id,
      ...(revision ? { revision: String(revision) } : {}),
    }),
    api("history", undefined, { id }),
  ]);
  const saved = history.revisions.find(
    (r: any) => Number(r.revision) === data.project.remote.revision,
  );
  return {
    ...data.project,
    remote: {
      ...data.project.remote,
      dirty: false,
      savedBy: saved?.display_name,
      savedAt: saved?.created_at,
      latestRevision: Number(
        history.revisions[0]?.revision || data.project.remote.revision,
      ),
    },
  };
}
