export type Device = "android" | "ios" | "mac" | "windows" | "other";

export function deviceFrom(userAgent: string, maxTouchPoints: number): Device {
  if (userAgent.includes("Android")) {
    return "android";
  }
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return "ios";
  }
  if (userAgent.includes("Mac")) {
    return maxTouchPoints > 1 ? "ios" : "mac";
  }
  return userAgent.includes("Windows") ? "windows" : "other";
}

export const deviceLabels: Record<Device, string> = {
  android: "Android",
  ios: "iOS",
  mac: "macOS Universal",
  windows: "Windows x64",
  other: "Linux",
};
