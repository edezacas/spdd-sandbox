import { randomUUID } from "node:crypto";
import { addUser, getUserByUsername, hashPassword } from "../domain/user";

// Cuenta única sembrada al arrancar el servidor (shared-contracts.md):
// literales hardcodeados, sin variable de entorno ni otro mecanismo que
// los sobrescriba.
const SEED_USERNAME = "bibliotecario";
const SEED_PASSWORD = "biblioteca123";

/**
 * Siembra la única cuenta de bibliotecario si todavía no existe. Se ejecuta
 * al arrancar el servidor (Background del sub-spec 2), no en el dominio.
 * Idempotente: aunque se invoque más de una vez en el mismo proceso,
 * garantiza "exactamente una" cuenta sembrada.
 */
export function seedLibrarianAccount(): void {
  if (getUserByUsername(SEED_USERNAME)) {
    return;
  }
  addUser({
    id: randomUUID(),
    username: SEED_USERNAME,
    passwordHash: hashPassword(SEED_PASSWORD),
  });
}
