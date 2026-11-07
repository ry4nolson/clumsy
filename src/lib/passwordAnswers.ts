import type { Protection } from "./protection";

export function passwordAnswers(known: Array<Protection | undefined>, prompt: (incorrect: boolean) => Promise<string | null>) {
  const candidates = known.filter((protection): protection is Protection => !!protection?.password);
  const queue = candidates.filter((protection, index) => candidates.findIndex((other) => other.password === protection.password) === index);
  const tried = [...queue];
  let prompted = false;
  let typed: string | null = null;

  const ask = async (incorrect: boolean) => {
    const next = queue.shift();
    if (next) {
      return next.password;
    }
    const shownIncorrect = prompted && incorrect;
    prompted = true;
    typed = await prompt(shownIncorrect);
    return typed;
  };

  const accepted = (password: string | undefined): { protection?: Protection; typed: boolean } => {
    if (!password) {
      return { typed: false };
    }
    if (password === typed) {
      return { protection: { password }, typed: true };
    }
    return { protection: tried.find((protection) => protection.password === password) ?? { password }, typed: false };
  };

  return { ask, accepted };
}
