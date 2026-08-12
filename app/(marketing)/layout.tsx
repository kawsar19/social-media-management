import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";

// Layout for the public, unauthenticated pages: the landing page and the legal
// documents. Kept apart from the (poc) group because that one wraps everything
// in AuthProvider and redirects signed-out visitors to /login — which would
// make the privacy policy unreachable to a platform reviewer who isn't a user.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
