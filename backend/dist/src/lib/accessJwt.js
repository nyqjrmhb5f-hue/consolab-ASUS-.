import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

export function createAccessVerifier({ teamDomain, aud }) {
  if (!teamDomain) {
    throw new Error("CF_ACCESS_TEAM_DOMAIN not configured");
  }

  const jwksUri = `https://${teamDomain}/cdn-cgi/access/certs`;
  const client = jwksRsa({
    jwksUri,
    cache: true,
    cacheMaxEntries: 10,
    cacheMaxAge: 10 * 60 * 1000
  });

  return function verifyAccessJwt(token) {
    return new Promise((resolve, reject) => {
      const getKey = (header, cb) => {
        client.getSigningKey(header.kid, (err, key) => {
          if (err) return cb(err);
          const signingKey = key.getPublicKey();
          cb(null, signingKey);
        });
      };

      const options = {};
      if (aud) {
        options.audience = aud.split(",").map((item) => item.trim()).filter(Boolean);
      }

      jwt.verify(token, getKey, options, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      });
    });
  };
}
