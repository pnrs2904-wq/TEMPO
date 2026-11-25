// The server handlers are plain ES modules so `node --test` runs them without a build step.
// Their behaviour is covered by test/routes.test.mjs and test/db-rls.test.mjs.
declare module "*.mjs";
