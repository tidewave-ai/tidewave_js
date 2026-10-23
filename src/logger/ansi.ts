// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripAnsiCodes(text: string): string {
  return text.replace(ANSI_REGEX, "");
}
