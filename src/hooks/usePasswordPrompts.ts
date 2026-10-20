import { useCallback, useState } from "react";

type PasswordPrompt = { fileName: string; incorrect: boolean; resolve: (password: string | null) => void };

export function usePasswordPrompts() {
  const [prompts, setPrompts] = useState<PasswordPrompt[]>([]);

  const requestPassword = useCallback(
    (fileName: string, incorrect: boolean) =>
      new Promise<string | null>((resolve) => {
        setPrompts((queue) => [...queue, { fileName, incorrect, resolve }]);
      }),
    [],
  );

  const resolvePassword = (password: string | null) => {
    const [prompt, ...rest] = prompts;
    setPrompts(rest);
    prompt?.resolve(password);
  };

  const current = prompts[0] ? { fileName: prompts[0].fileName, incorrect: prompts[0].incorrect } : null;

  return { current, requestPassword, resolvePassword };
}
