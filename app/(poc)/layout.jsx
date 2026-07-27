"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import Navbar from "./components/Navbar";

const PUBLIC_ROUTES = ["/login", "/signup"];

function AuthRedirect({ children }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!user && !isPublic) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
    if (user && isPublic) {
      router.replace("/post");
    }
  }, [user, pathname, router]);

  return <>{children}</>;
}

export default function PocLayout({ children }) {
  return (
    <AuthProvider>
      <div className="app-shell flex flex-1 flex-col">
        <Navbar />
        <AuthRedirect>
          <main className="flex-1">{children}</main>
        </AuthRedirect>
      </div>
    </AuthProvider>
  );
}
