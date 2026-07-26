import { statSync } from "node:fs";

const patterns: Array<{ name: string; regex: RegExp }> = [
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "openai-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "telegram-token", regex: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ },
  { name: "aws-access-key", regex: /\bAKIA[A-Z0-9]{16}\b/ },
  { name: "personal-path", regex: /\/home\/artem|\/srv\/task|task\.artemmarketolog\.kz/ },
];

const excluded = [
  ".git/",
  "node_modules/",
  "data/",
  "scripts/secret-scan.ts",
];

const findings: string[] = [];
const glob = new Bun.Glob("**/*");
for await (const path of glob.scan({ cwd: ".", onlyFiles: true, dot: true })) {
  if (excluded.some((prefix) => path === prefix || path.startsWith(prefix))) continue;
  if (statSync(path).size > 2_000_000) continue;
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  if (bytes.includes(0)) continue;
  const text = new TextDecoder().decode(bytes);
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) findings.push(`${path}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log("Secret scan: clean");
