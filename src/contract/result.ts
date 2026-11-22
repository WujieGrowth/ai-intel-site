export type Failure = { ok: false; errors: string[] };

export type Success<T> = { ok: true; value: T };

export type Result<T> = Success<T> | Failure;

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function fail(...errors: string[]): Failure {
  return { ok: false, errors };
}
