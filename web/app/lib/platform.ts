export type Platform = "mac" | "windows";

const KEY = "clumsy.platform";

export const PLATFORM_SCRIPT = `try{var p=localStorage.getItem("${KEY}");if(p!=="mac"&&p!=="windows")p=/Windows/.test(navigator.userAgent)?"windows":"mac";document.documentElement.dataset.platform=p}catch(e){}`;

const listeners = new Set<() => void>();

export function subscribePlatform(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const currentPlatform = (): Platform => (document.documentElement.dataset.platform === "windows" ? "windows" : "mac");

export const serverPlatform = (): Platform => "mac";

export function choosePlatform(platform: Platform) {
  document.documentElement.dataset.platform = platform;
  try {
    localStorage.setItem(KEY, platform);
  } catch {}
  listeners.forEach((listener) => listener());
}
