// Runs at the start of EVERY test file, before the file imports any src/ module.
import { afterAll } from "vitest";
import { closeDbConnections } from "../helpers/db";
import { loadTestEnv } from "./test-env";

loadTestEnv();

// Close the cached database pools so each test file ends cleanly.
afterAll(async () => {
  await closeDbConnections();
});
