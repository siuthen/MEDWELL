import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "부자재 관리 | 메드웰",
  description: "발주, 입고, 생산 및 월 마감 관리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
