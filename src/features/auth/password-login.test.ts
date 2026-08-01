import { describe, expect, it, vi } from "vitest";

import { authenticateOwnerPassword } from "@/features/auth/password-login";

const validInput = {
  username: " DaiYingHeng ",
  password: "a-secure-password",
  ownerUsername: "daiyingheng",
  ownerEmail: "owner@example.com"
};

function createDependencies(options?: {
  authError?: unknown;
  returnedEmail?: string;
  bindingError?: unknown;
}) {
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: {
      user: options?.authError
        ? null
        : { id: "owner-id", email: options?.returnedEmail ?? "owner@example.com" }
    },
    error: options?.authError ?? null
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const upsert = vi.fn().mockResolvedValue({ error: options?.bindingError ?? null });

  return {
    dependencies: {
      authClient: { auth: { signInWithPassword, signOut } },
      adminClient: { from: vi.fn().mockReturnValue({ upsert }) }
    },
    signInWithPassword,
    signOut,
    upsert
  };
}

describe("owner password login", () => {
  it("authenticates with OWNER_EMAIL and binds the returned owner", async () => {
    const setup = createDependencies();

    await expect(authenticateOwnerPassword(validInput, setup.dependencies)).resolves.toBe("success");
    expect(setup.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "a-secure-password"
    });
    expect(setup.upsert).toHaveBeenCalledWith(
      { singleton: true, user_id: "owner-id", email: "owner@example.com" },
      { onConflict: "singleton" }
    );
    expect(setup.signOut).not.toHaveBeenCalled();
  });

  it("rejects a wrong username without contacting Supabase", async () => {
    const setup = createDependencies();

    await expect(
      authenticateOwnerPassword({ ...validInput, username: "visitor" }, setup.dependencies)
    ).resolves.toBe("invalid-credentials");
    expect(setup.signInWithPassword).not.toHaveBeenCalled();
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  it("maps an authentication failure to invalid credentials", async () => {
    const setup = createDependencies({ authError: new Error("invalid login") });

    await expect(authenticateOwnerPassword(validInput, setup.dependencies)).resolves.toBe(
      "invalid-credentials"
    );
    expect(setup.signOut).toHaveBeenCalledOnce();
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  it("rejects and signs out a returned user with a different email", async () => {
    const setup = createDependencies({ returnedEmail: "visitor@example.com" });

    await expect(authenticateOwnerPassword(validInput, setup.dependencies)).resolves.toBe(
      "invalid-credentials"
    );
    expect(setup.signOut).toHaveBeenCalledOnce();
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  it("signs out and returns a system error when owner binding fails", async () => {
    const setup = createDependencies({ bindingError: new Error("unavailable") });

    await expect(authenticateOwnerPassword(validInput, setup.dependencies)).resolves.toBe(
      "system-error"
    );
    expect(setup.signOut).toHaveBeenCalledOnce();
  });
});
