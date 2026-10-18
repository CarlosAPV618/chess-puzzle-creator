// Usage: pnpm reset-password <email>
// Sets a random temporary password via Better Auth internals and revokes all the user's sessions (D11).
import { randomBytes } from "node:crypto";

import { auth } from "~/server/better-auth";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: pnpm reset-password <email>");
  process.exit(1);
}

const ctx = await auth.$context;
const found = await ctx.internalAdapter.findUserByEmail(email);
if (!found) {
  console.error(`No existe un usuario con el correo ${email}`);
  process.exit(1);
}
const temp = randomBytes(12).toString("base64url");
await ctx.internalAdapter.updatePassword(found.user.id, await ctx.password.hash(temp));
await ctx.internalAdapter.deleteUserSessions(found.user.id);
console.log(`Contraseña temporal de ${email}: ${temp}`);
console.log("Se cerraron todas sus sesiones.");
process.exit(0);
