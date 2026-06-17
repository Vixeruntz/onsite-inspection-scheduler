import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "现场检查调度系统",
  description: "规则透明的现场尽调检查调度工作台"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
