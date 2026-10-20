import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const NEXT_DIR = path.join(ROOT_DIR, ".next");
const NEXT_SERVER_DIR = path.join(NEXT_DIR, "server");
const CONFIG_TARGET = path.join(ROOT_DIR, "src", "config", "static-csp-hashes.ts");
const PLACEHOLDER_TOKEN = "__NEXT_STATIC_CSP_HASHES_PLACEHOLDER__";

function walkFiles(dirPath, predicate, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, out);
    } else if (entry.isFile() && predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function extractInlineScriptSha256Hashes(htmlContent) {
  const hashes = [];
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const scriptBody = match[1] ?? "";
    if (scriptBody.length > 0) {
      const base64 = crypto
        .createHash("sha256")
        .update(scriptBody, "utf8")
        .digest("base64");
      hashes.push(`'sha256-${base64}'`);
    }
  }
  return hashes;
}

function main() {
  const htmlFiles = walkFiles(NEXT_SERVER_DIR, (f) => f.endsWith(".html"));
  const hashSet = new Set([
    "'sha256-4RS22DYeB7U14dra4KcQYxmwt5HkOInieXK1NUMBmQI='",
    "'sha256-2G+HL+OS8W2brr1hDaTZ3OuaRf94CD3pvSoY+TL7gqM='",
  ]);

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, "utf8");
    for (const hash of extractInlineScriptSha256Hashes(html)) {
      hashSet.add(hash);
    }
  }

  const allHashes = Array.from(hashSet).sort();
  const joinedHashes = allHashes.join(" ");

  const tsFileContent = [
    "/**",
    " * Auto-populated at build time by `scripts/extract-static-csp-hashes.mjs`",
    " * with the SHA-256 hashes of all inline hydration `<script>` tags emitted",
    " * by `next build` across static pages (`/`, `/legal/*`, `/cart`, `/_not-found`).",
    " */",
    "export const STATIC_BUILD_SCRIPT_SHA256_HASHES: readonly string[] = [",
    ...allHashes.map((h) => `  "${h}",`),
    "];",
    "",
  ].join("\n");

  fs.writeFileSync(CONFIG_TARGET, tsFileContent, "utf8");

  // Also inject the extracted hashes into compiled .next server/middleware bundles
  const compiledFiles = walkFiles(
    NEXT_DIR,
    (f) => f.endsWith(".js") || f.endsWith(".mjs")
  );
  let patchedBundleCount = 0;
  for (const filePath of compiledFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes(PLACEHOLDER_TOKEN)) {
      const updated = content.split(PLACEHOLDER_TOKEN).join(joinedHashes);
      fs.writeFileSync(filePath, updated, "utf8");
      patchedBundleCount += 1;
    }
  }

  console.log(
    `[CSP Static Hashes] Extracted ${allHashes.length} SHA-256 inline script hashes from ${htmlFiles.length} pre-rendered HTML files (patched ${patchedBundleCount} build bundle(s)).`
  );
}

main();
