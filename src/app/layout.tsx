import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pressed · 唱片订单",
  description: "从受支持商家的订单邮件整理你的唱片收藏"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
