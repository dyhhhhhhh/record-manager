type OwnerUser = {
  id: string;
  email?: string;
};

type OwnerAdminClient = {
  auth: {
    admin: {
      listUsers(options: { page: number; perPage: number }): Promise<{
        data: { users: OwnerUser[] };
        error: unknown;
      }>;
      createUser(attributes: {
        email: string;
        password: string;
        email_confirm: boolean;
      }): Promise<{ data: { user: OwnerUser | null }; error: unknown }>;
      updateUserById(
        userId: string,
        attributes: { password: string; email_confirm: boolean }
      ): Promise<{ data: { user: OwnerUser | null }; error: unknown }>;
    };
  };
  from(table: "app_owner"): {
    upsert(
      values: { singleton: true; user_id: string; email: string },
      options: { onConflict: "singleton" }
    ): PromiseLike<{ error: unknown }>;
  };
};

type ProvisionOwnerResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "auth-admin" | "owner-binding" };

export async function provisionOwnerPassword(
  input: { email: string; password: string },
  admin: OwnerAdminClient
): Promise<ProvisionOwnerResult> {
  const normalizedEmail = input.email.trim().toLocaleLowerCase();
  let user: OwnerUser | null;
  let created: boolean;

  try {
    const { data: listedUsers, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    if (listError) {
      return { ok: false, reason: "auth-admin" };
    }

    const existing = listedUsers.users.find(
      (candidate) => candidate.email?.trim().toLocaleLowerCase() === normalizedEmail
    );
    const authResult = existing
      ? await admin.auth.admin.updateUserById(existing.id, {
          password: input.password,
          email_confirm: true
        })
      : await admin.auth.admin.createUser({
          email: normalizedEmail,
          password: input.password,
          email_confirm: true
        });

    if (authResult.error || !authResult.data.user) {
      return { ok: false, reason: "auth-admin" };
    }

    user = authResult.data.user;
    created = !existing;
  } catch {
    return { ok: false, reason: "auth-admin" };
  }

  try {
    const { error: bindingError } = await admin.from("app_owner").upsert(
      { singleton: true, user_id: user.id, email: normalizedEmail },
      { onConflict: "singleton" }
    );

    if (bindingError) {
      return { ok: false, reason: "owner-binding" };
    }
  } catch {
    return { ok: false, reason: "owner-binding" };
  }

  return { ok: true, created };
}
