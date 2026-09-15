import { Dialect } from "../core";
import { pcE500Dialect } from "./pcE500";

const dialects: ReadonlyMap<string, Dialect> = new Map([
  [pcE500Dialect.id, pcE500Dialect]
]);

export function getDialect(id: string): Dialect {
  return dialects.get(id) ?? pcE500Dialect;
}

export { pcE500Dialect };
