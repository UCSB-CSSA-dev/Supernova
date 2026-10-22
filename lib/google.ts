export const ALLOWED_DOMAIN = "ucsb.edu";

type CredentialResponse = { credential?: string };

export type GoogleIdentity = {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    hd?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; shape?: string; text?: string; width?: number; logo_alignment?: string },
  ): void;
  disableAutoSelect(): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<GoogleIdentity> | null = null;

export function googleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("Google sign-in did not load."));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Google sign-in could not load. Check your connection and refresh."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function forgetGoogleAccount(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}
