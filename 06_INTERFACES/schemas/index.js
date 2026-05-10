// Authoritative imports for the AuthorityDecision schema lock.
//
// 06_INTERFACES is the only outward-facing translation layer. This module is
// the single source-of-truth handle for the AuthorityRequest / AuthorityDecision
// packet shape — backend, frontend, and tests must import from here rather than
// inlining their own type definitions.
//
// The validator below is a hand-rolled, zero-dependency walker over the subset
// of JSON Schema features the contract uses (type, required, properties,
// additionalProperties, enum, const, pattern, minLength, maxLength, minItems,
// maxItems, uniqueItems, items, $ref into #/definitions). We do this rather
// than pulling in `ajv` so 06_INTERFACES has no runtime deps and the contract
// stays bootable from any room.
//
// Drop-in extension path: when we add a new schema (e.g. evidence-stamp.v1)
// publish it as a sibling .json file and add a matching loader here.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadSchema(name) {
  const file = path.join(HERE, name);
  const raw = fs.readFileSync(file, "utf8");
  return Object.freeze(JSON.parse(raw));
}

export const AUTHORITY_DECISION_SCHEMA = loadSchema("authority-decision.v1.json");
export const SCHEMA_VERSION = AUTHORITY_DECISION_SCHEMA.version;

const definitions = AUTHORITY_DECISION_SCHEMA.definitions;

function resolveRef(ref) {
  // Only support "#/definitions/<Name>" — the only ref shape this contract uses.
  const m = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!m) {
    throw new Error(`unsupported $ref: ${ref}`);
  }
  const target = definitions[m[1]];
  if (!target) {
    throw new Error(`unknown $ref target: ${ref}`);
  }
  return target;
}

function pushError(errors, pathStack, message) {
  errors.push({ path: pathStack.join("."), message });
}

function validateNode(node, schema, pathStack, errors) {
  if (schema.$ref) {
    return validateNode(node, resolveRef(schema.$ref), pathStack, errors);
  }

  if (schema.const !== undefined) {
    if (node !== schema.const) {
      pushError(errors, pathStack, `expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(node)}`);
    }
    return;
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(node)) {
      pushError(errors, pathStack, `must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(node)}`);
      return;
    }
  }

  switch (schema.type) {
    case "string":
      if (typeof node !== "string") {
        pushError(errors, pathStack, `expected string, got ${typeof node}`);
        return;
      }
      if (typeof schema.minLength === "number" && node.length < schema.minLength) {
        pushError(errors, pathStack, `string shorter than minLength=${schema.minLength}`);
      }
      if (typeof schema.maxLength === "number" && node.length > schema.maxLength) {
        pushError(errors, pathStack, `string longer than maxLength=${schema.maxLength}`);
      }
      if (typeof schema.pattern === "string") {
        const re = new RegExp(schema.pattern);
        if (!re.test(node)) {
          pushError(errors, pathStack, `string does not match pattern ${schema.pattern}`);
        }
      }
      return;

    case "object": {
      if (node === null || typeof node !== "object" || Array.isArray(node)) {
        pushError(errors, pathStack, `expected object, got ${Array.isArray(node) ? "array" : typeof node}`);
        return;
      }
      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const field of required) {
        if (!Object.prototype.hasOwnProperty.call(node, field)) {
          pushError(errors, pathStack.concat(field), `missing required field`);
        }
      }
      const properties = schema.properties || {};
      const additionalProperties = schema.additionalProperties;
      for (const [key, value] of Object.entries(node)) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) {
          validateNode(value, properties[key], pathStack.concat(key), errors);
        } else if (additionalProperties === false) {
          pushError(errors, pathStack.concat(key), `additional property not allowed`);
        } else if (additionalProperties && typeof additionalProperties === "object") {
          validateNode(value, additionalProperties, pathStack.concat(key), errors);
        }
      }
      return;
    }

    case "array": {
      if (!Array.isArray(node)) {
        pushError(errors, pathStack, `expected array, got ${typeof node}`);
        return;
      }
      if (typeof schema.minItems === "number" && node.length < schema.minItems) {
        pushError(errors, pathStack, `array shorter than minItems=${schema.minItems}`);
      }
      if (typeof schema.maxItems === "number" && node.length > schema.maxItems) {
        pushError(errors, pathStack, `array longer than maxItems=${schema.maxItems}`);
      }
      if (schema.uniqueItems === true) {
        const seen = new Set();
        for (const item of node) {
          const k = typeof item === "string" ? `s:${item}` : JSON.stringify(item);
          if (seen.has(k)) {
            pushError(errors, pathStack, `array items must be unique`);
            break;
          }
          seen.add(k);
        }
      }
      if (schema.items) {
        for (let i = 0; i < node.length; i++) {
          validateNode(node[i], schema.items, pathStack.concat(String(i)), errors);
        }
      }
      return;
    }

    case "number":
    case "integer":
      if (typeof node !== "number" || (schema.type === "integer" && !Number.isInteger(node))) {
        pushError(errors, pathStack, `expected ${schema.type}, got ${typeof node}`);
      }
      return;

    case "boolean":
      if (typeof node !== "boolean") {
        pushError(errors, pathStack, `expected boolean, got ${typeof node}`);
      }
      return;

    default:
      // Schema with no `type` (e.g. only $ref/enum/const) is fine; nothing more to assert.
      return;
  }
}

function validateAgainst(definitionName, packet) {
  const schema = definitions[definitionName];
  if (!schema) {
    throw new Error(`unknown definition: ${definitionName}`);
  }
  const errors = [];
  validateNode(packet, schema, [definitionName], errors);

  // Conditional rule: AuthorityDecision requires `reason` whenever decision != APPROVED.
  if (definitionName === "AuthorityDecision" && packet && typeof packet === "object") {
    if (packet.decision && packet.decision !== "APPROVED" && !packet.reason) {
      errors.push({
        path: `${definitionName}.reason`,
        message: `reason is required when decision != APPROVED`
      });
    }
    if (packet.decision === "APPROVED" && Object.prototype.hasOwnProperty.call(packet, "reason")) {
      errors.push({
        path: `${definitionName}.reason`,
        message: `reason must be absent when decision == APPROVED`
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateAuthorityRequest(packet) {
  return validateAgainst("AuthorityRequest", packet);
}

export function validateAuthorityDecision(packet) {
  return validateAgainst("AuthorityDecision", packet);
}
