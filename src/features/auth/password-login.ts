import { isOwnerEmail, isOwnerUsername } from "@/features/auth/owner";

type PasswordAuthClient = {
  auth: {
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{
      data: { user: { id: string; email?: string } | null };
      error: unknown;
    }>;
    signOut(): Promise<unknown>;
  };
};

type OwnerBindingClient = {
  from(table: "app_owner"): {
    upsert(
      values: { singleton: true; user_id: string; email: string },
      options: { onConflict: "singleton" }
    ): PromiseLike<{ error: unknown }>;
  };
};

type PasswordLoginInput = {
  username: string;
  password: string;
  ownerUsername: string;
  ownerEmail: string;
};

type PasswordLoginDependencies = {
  authClient: PasswordAuthClient;
  adminClient: OwnerBindingClient;
};

async function signOutQuietly(authClient: PasswordAuthClient) {
  try {
    await authClient.auth.signOut();
  } catch {
    // The primary login result must not be replaced by a cleanup error.
  }
}

export async function authenticateOwnerPassword(
  input: PasswordLoginInput,
  { authClient, adminClient }: PasswordLoginDependencies
): Promise<"success" | "invalid-credentials" | "system-error"> {
  if (!input.password || !isOwnerUsername(input.username, input.ownerUsername)) {
    return "invalid-credentials";
  }

  let authResult: Awaited<ReturnType<PasswordAuthClient["auth"]["signInWithPassword"]>>;

  try {
    authResult = await authClient.auth.signInWithPassword({
      email: input.ownerEmail,
      password: input.password
    });
  } catch {
    await signOutQuietly(authClient);
    return "system-error";
  }

  const email = authResult.data.user?.email;

  if (
    authResult.error ||
    !authResult.data.user ||
    !email ||
    !isOwnerEmail(email, input.ownerEmail)
  ) {
    await signOutQuietly(authClient);
    return "invalid-credentials";
  }

  try {
    const { error: bindingError } = await adminClient.from("app_owner").upsert(
      {
        singleton: true,
        user_id: authResult.data.user.id,
        email: email.trim().toLocaleLowerCase()
      },
      { onConflict: "singleton" }
    );

    if (bindingError) {
      await signOutQuietly(authClient);
      return "system-error";
    }
  } catch {
    await signOutQuietly(authClient);
    return "system-error";
  }

  return "success";
}
