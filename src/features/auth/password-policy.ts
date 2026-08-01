export function validateOwnerPassword(password: string, confirmation: string) {
  if (password.length < 12) {
    return { ok: false, reason: "too-short" } as const;
  }

  if (password !== confirmation) {
    return { ok: false, reason: "mismatch" } as const;
  }

  return { ok: true } as const;
}
