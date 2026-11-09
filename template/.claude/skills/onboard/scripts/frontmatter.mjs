// Minimal frontmatter reader for SKILL.md and agent files: top-level keys only, which is all the kit needs.
// Nested values (lists, hooks) are kept as raw lines so they can be copied through unchanged.

export function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return { fields: [], body: text };
  const fields = [];
  for (const line of m[1].split(/\r?\n/)) {
    const k = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
    if (k) fields.push({ key: k[1], inline: k[2].trim(), lines: [line] });
    else if (fields.length) fields.at(-1).lines.push(line);
  }
  return { fields, body: text.slice(m[0].length) };
}

export function field(fm, key) {
  return fm.fields.find((f) => f.key === key);
}

// The value of a top-level key: quoted and plain scalars, booleans, numbers, folded (>) and literal (|) blocks.
export function value(fm, key) {
  const f = field(fm, key);
  if (!f) return undefined;
  const v = f.inline;
  if (/^[>|][+-]?$/.test(v)) {
    const rest = f.lines.slice(1).map((l) => l.replace(/^\s+/, ''));
    return (v.startsWith('>') ? rest.join(' ') : rest.join('\n')).trim();
  }
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === '' && f.lines.length > 1) return f.lines.slice(1).join('\n');
  return v;
}

// A list value: `[a, b]`, one scalar, or "- item" lines under the key. Quotes are stripped.
export function list(fm, key) {
  const f = field(fm, key);
  if (!f) return [];
  const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');
  if (f.inline.startsWith('[')) return f.inline.slice(1, -1).split(',').map(unquote).filter(Boolean);
  if (f.inline) return [unquote(f.inline)];
  return f.lines.slice(1).map((l) => l.match(/^\s*-\s+(.+)$/)?.[1]).filter(Boolean).map(unquote);
}
