export const ADMIN_PUSH_PROMPT_DISMISSED_KEY = "smellme-admin-push-prompt-dismissed";

export type AdminPushPromptKind =
  | "activate"
  | "blocked"
  | "repair"
  | "unsupported";

export function getAdminPushPromptKind(input: {
  loaded: boolean;
  pushSupported: boolean;
  permission: NotificationPermission | "unsupported";
  subscriptionActive: boolean;
}): AdminPushPromptKind | null {
  if (!input.loaded) return null;
  if (!input.pushSupported || input.permission === "unsupported") return "unsupported";
  if (input.permission === "denied") return "blocked";
  if (input.permission === "granted" && input.subscriptionActive) return null;
  if (input.permission === "granted") return "repair";
  return "activate";
}

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export function isAdminPushPromptDismissed(storage: SessionStorageLike | null) {
  return storage?.getItem(ADMIN_PUSH_PROMPT_DISMISSED_KEY) === "1";
}

export function dismissAdminPushPrompt(storage: SessionStorageLike | null) {
  storage?.setItem(ADMIN_PUSH_PROMPT_DISMISSED_KEY, "1");
}

export function shouldRequestNotificationPermission(
  permission: NotificationPermission | "unsupported"
) {
  return permission === "default";
}
