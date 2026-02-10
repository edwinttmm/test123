import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, sans-serif", margin: 24 }}>
        <h1>Digital Employees Platform</h1>
        {children}
      </body>
    </html>
  );
}
