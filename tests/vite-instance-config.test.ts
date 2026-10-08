import { readFileSync } from "node:fs";
import { afterAll, expect, test } from "bun:test";
import config from "../vite.config";

const previous = process.env.VITE_INSTANCE_CONFIG;
afterAll(() => {
  if (previous === undefined) delete process.env.VITE_INSTANCE_CONFIG;
  else process.env.VITE_INSTANCE_CONFIG = previous;
});

test("Vite loads the instance profile selected by path", () => {
  process.env.VITE_INSTANCE_CONFIG = "instances/dev.json";
  config({ mode: "development", command: "serve", isSsrBuild: false, isPreview: false });
  expect(JSON.parse(process.env.VITE_INSTANCE_CONFIG!)).toEqual(JSON.parse(readFileSync("instances/dev.json", "utf8")));
});
