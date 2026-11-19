import { useCallback, useEffect, useRef } from "react";

const FOLLOW_DELAY = 500;

export function useRenderFollow(following: boolean, render: () => void) {
  const timer = useRef(0);
  const followingRef = useRef(following);
  followingRef.current = following;
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (following) {
      renderRef.current();
    }
  }, [following]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useCallback(() => {
    window.clearTimeout(timer.current);
    if (followingRef.current) {
      timer.current = window.setTimeout(() => renderRef.current(), FOLLOW_DELAY);
    }
  }, []);
}
