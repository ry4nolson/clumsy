import { useSyncExternalStore } from "react";

import { choosePlatform, currentPlatform, serverPlatform, subscribePlatform, type Platform } from "~/lib/platform";

const PLATFORMS: Array<[Platform, string]> = [
  ["mac", "Mac"],
  ["windows", "Windows"],
];

export function PlatformChooser() {
  const platform = useSyncExternalStore(subscribePlatform, currentPlatform, serverPlatform);

  return (
    <div className="platform" role="group" aria-label="Show this guide for">
      {PLATFORMS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`platform__option platform__option--${id}`}
          aria-pressed={platform === id}
          onClick={() => choosePlatform(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
