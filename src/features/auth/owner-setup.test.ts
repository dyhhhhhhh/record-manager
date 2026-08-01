import { describe, expect, it, vi } from "vitest";

import { provisionOwnerPassword } from "@/features/auth/owner-setup";

const ownerInput = {
  email: " Owner@Example.com ",
  password: "a-secure-password"
};

function createAdmin(options?: {
  users?: Array<{ id: string; email?: string }>;
  listError?: unknown;
  authError?: unknown;
  bindingError?: unknown;
}) {
  const listUsers = vi.fn().mockResolvedValue({
    data: { users: options?.users ?? [] },
    error: options?.listError ?? null
  });
  const createUser = vi.fn().mockResolvedValue({
    data: { user: options?.authError ? null : { id: "new-owner-id", email: "owner@example.com" } },
    error: options?.authError ?? null
  });
  const updateUserById = vi.fn().mockResolvedValue({
    data: { user: options?.authError ? null : { id: "owner-id", email: "owner@example.com" } },
    error: options?.authError ?? null
  });
  const upsert = vi.fn().mockResolvedValue({ error: options?.bindingError ?? null });

  return {
    admin: {
      auth: { admin: { listUsers, createUser, updateUserById } },
      from: vi.fn().mockReturnValue({ upsert })
    },
    createUser,
    listUsers,
    updateUserById,
    upsert
  };
}

describe("owner password provisioning", () => {
  it("updates an existing matching owner and binds app_owner", async () => {
    const setup = createAdmin({ users: [{ id: "owner-id", email: "owner@example.com" }] });

    await expect(provisionOwnerPassword(ownerInput, setup.admin)).resolves.toEqual({
      ok: true,
      created: false
    });
    expect(setup.updateUserById).toHaveBeenCalledWith("owner-id", {
      password: "a-secure-password",
      email_confirm: true
    });
    expect(setup.createUser).not.toHaveBeenCalled();
    expect(setup.upsert).toHaveBeenCalledWith(
      { singleton: true, user_id: "owner-id", email: "owner@example.com" },
      { onConflict: "singleton" }
    );
  });

  it("creates and binds the owner when no matching user exists", async () => {
    const setup = createAdmin();

    await expect(provisionOwnerPassword(ownerInput, setup.admin)).resolves.toEqual({
      ok: true,
      created: true
    });
    expect(setup.createUser).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "a-secure-password",
      email_confirm: true
    });
    expect(setup.updateUserById).not.toHaveBeenCalled();
    expect(setup.upsert).toHaveBeenCalledWith(
      { singleton: true, user_id: "new-owner-id", email: "owner@example.com" },
      { onConflict: "singleton" }
    );
  });

  it("returns an auth-admin error when listing users fails", async () => {
    const setup = createAdmin({ listError: new Error("unavailable") });

    await expect(provisionOwnerPassword(ownerInput, setup.admin)).resolves.toEqual({
      ok: false,
      reason: "auth-admin"
    });
    expect(setup.createUser).not.toHaveBeenCalled();
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  it("returns an auth-admin error when the auth write fails", async () => {
    const setup = createAdmin({
      users: [{ id: "owner-id", email: "OWNER@example.com" }],
      authError: new Error("unavailable")
    });

    await expect(provisionOwnerPassword(ownerInput, setup.admin)).resolves.toEqual({
      ok: false,
      reason: "auth-admin"
    });
    expect(setup.upsert).not.toHaveBeenCalled();
  });

  it("returns an owner-binding error when app_owner cannot be written", async () => {
    const setup = createAdmin({ bindingError: new Error("unavailable") });

    await expect(provisionOwnerPassword(ownerInput, setup.admin)).resolves.toEqual({
      ok: false,
      reason: "owner-binding"
    });
  });
});
