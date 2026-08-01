import { createClient } from "@supabase/supabase-js";
import { stderr, stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";
import { z } from "zod";

import { provisionOwnerPassword } from "../src/features/auth/owner-setup.ts";
import { validateOwnerPassword } from "../src/features/auth/password-policy.ts";

const setupEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  OWNER_USERNAME: z.string().trim().min(1),
  OWNER_EMAIL: z.email()
});

type Keypress = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
};

async function promptHidden(label: string) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("interactive-terminal-required");
  }

  emitKeypressEvents(stdin);
  const previousRawMode = stdin.isRaw;
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";

  try {
    return await new Promise<string>((resolve, reject) => {
      const onKeypress = (text: string, key: Keypress) => {
        if (key.ctrl && key.name === "c") {
          stdin.off("keypress", onKeypress);
          reject(new Error("cancelled"));
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          stdin.off("keypress", onKeypress);
          resolve(value);
          return;
        }

        if (key.name === "backspace") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          return;
        }

        if (!key.ctrl && !key.meta && text) {
          value += text;
          stdout.write("*");
        }
      };

      stdin.on("keypress", onKeypress);
    });
  } finally {
    stdin.setRawMode(previousRawMode);
    stdin.pause();
    stdout.write("\n");
  }
}

async function main() {
  const parsedEnv = setupEnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error("invalid-configuration");
  }

  const password = await promptHidden("请输入新密码（至少 12 个字符）：");
  const confirmation = await promptHidden("请再次输入新密码：");
  const validation = validateOwnerPassword(password, confirmation);

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const admin = createClient(
    parsedEnv.data.NEXT_PUBLIC_SUPABASE_URL,
    parsedEnv.data.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const result = await provisionOwnerPassword(
    { email: parsedEnv.data.OWNER_EMAIL, password },
    admin
  );

  if (!result.ok) {
    throw new Error(result.reason);
  }

  stdout.write("所有者账号初始化成功。\n");
}

const safeMessages: Record<string, string> = {
  "interactive-terminal-required": "请在本地交互式终端运行此命令。",
  "invalid-configuration": "所有者配置不完整，请检查 .env.local。",
  "too-short": "密码至少需要 12 个字符。",
  mismatch: "两次输入的密码不一致。",
  cancelled: "操作已取消。",
  "auth-admin": "无法初始化 Supabase Auth 所有者账号。",
  "owner-binding": "账号已更新，但无法绑定应用所有者。"
};

main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : "unknown";
  stderr.write(`${safeMessages[reason] ?? "初始化失败，请检查服务配置后重试。"}\n`);
  process.exitCode = 1;
});
