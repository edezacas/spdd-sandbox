## Overview

Sandbox sin propósito de producto real, usado para probar manualmente el flujo de las skills open-spdd (`spdd-agent`, `spdd-canvas`, `spdd-design`, `spdd-implement`, `spdd-verify`, `spdd-sync`, `spdd-migrate`) contra un dominio de biblioteca real y minimalista.

## Stack

- TypeScript 5.5 (`strict: true`), target ES2020, módulos CommonJS
- Node.js + `ts-node` para ejecución en desarrollo, sin framework ni base de datos
- Entidades en memoria (arrays), sin persistencia

## Commands

- `npm install` — instalar dependencias
- `npm run dev` — ejecutar `src/index.ts` directamente con ts-node
- `npm run build` — compilar a `dist/` con `tsc`
- `npm start` — ejecutar el build compilado (`dist/index.js`)
- No hay linter ni test runner configurados

## Structure

- `src/index.ts` — punto de entrada, ejemplo de uso end-to-end del dominio
- `src/domain/author.ts` — entidad `Author` y su repositorio en memoria
- `src/domain/book.ts` — entidad `Book` (referencia a `authorId`) y su repositorio en memoria
- `src/domain/loan.ts` — entidad `Loan` (préstamo de un `Book`), reglas de negocio (no prestar un libro ya prestado) y su repositorio en memoria

## Gotchas

- Todo el estado vive en arrays module-level (`authors`, `books`, `loans`); no hay reinicio entre ejecuciones salvo reiniciar el proceso — no asumir persistencia real ni concurrencia segura.
- No hay validación de integridad referencial entre módulos (p. ej. `addBook` no comprueba que `authorId` exista); solo `loan.ts` valida contra `book.ts`.
- El propósito del repo es servir de banco de pruebas para las skills SPDD: los cambios de feature normalmente deben pasar por el flujo canvas → design → implement → verify en vez de editarse directamente.

## Claude Code Integration

- Al describir una feature nueva sobre este dominio, usar `spdd-agent` (o el comando específico `/spdd-canvas`, `/spdd-design`, `/spdd-implement`, `/spdd-verify` según la fase) en vez de implementar directamente.
