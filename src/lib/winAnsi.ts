const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

const encodable = (char: string) => /^[\x20-\x7e\xa0-\xff]$/.test(char) || WIN_ANSI_EXTRAS.has(char);

export const winAnsiSafe = (text: string) => Array.from(text, (char) => (encodable(char) ? char : "?")).join("");
