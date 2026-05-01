import { createHash } from 'crypto';

export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function hashSpec(spec) {
  return hashContent(JSON.stringify(spec, null, 2));
}
